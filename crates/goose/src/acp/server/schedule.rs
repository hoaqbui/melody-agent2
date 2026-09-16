use goose_sdk_types::custom_requests::{
    CreateScheduleRequest, CreateScheduleResponse, DeleteScheduleRequest, EmptyResponse,
    InspectRunningJobRequest, InspectRunningJobResponse, KillRunningJobRequest,
    KillRunningJobResponse, ListScheduleRunsRequest, ListScheduleRunsResponse,
    ListScheduleSessionsRequest, ListScheduleSessionsResponse, ListSchedulesRequest,
    ListSchedulesResponse, PauseScheduleRequest, RunScheduleNowRequest, RunScheduleNowResponse,
    RunScheduleNowStatus, ScheduleRunDto, ScheduleRunOutcomeDto, ScheduleRunStatus,
    ScheduleRunWorktreeDto, ScheduledJobDto, UnpauseScheduleRequest, UpdateScheduleRequest,
    UpdateScheduleResponse,
};
use tokio::fs;

use super::{build_session_info, GooseAcpAgent, ResultExt};
use crate::recipe::validate_recipe::validate_recipe_template_from_content;
use crate::recipe::Recipe;
use crate::scheduler::{
    get_default_scheduled_recipes_dir, RunOutcome, RunStatus, RunWorktree, ScheduledJob,
    SchedulerError,
};
use crate::scheduler_trait::SchedulerTrait;
use crate::session::extension_data::ExtensionState;
use crate::session::session_manager::{
    Session, SessionListFilters, SessionListPageQuery, SessionType,
};
use std::sync::Arc;

fn validate_schedule_id(id: &str) -> Result<(), agent_client_protocol::Error> {
    let is_valid = !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ' ');

    if !is_valid {
        return Err(agent_client_protocol::Error::invalid_params().data(
            "Schedule name must use only alphanumeric characters, hyphens, underscores, or spaces",
        ));
    }

    Ok(())
}

fn validate_schedule_recipe(recipe: &Recipe) -> Result<(), agent_client_protocol::Error> {
    let recipe_yaml = recipe
        .to_yaml()
        .map_err(|e| agent_client_protocol::Error::invalid_params().data(e.to_string()))?;

    validate_recipe_template_from_content(&recipe_yaml, None)
        .map_err(|e| agent_client_protocol::Error::invalid_params().data(e.to_string()))?;

    Ok(())
}

fn schedule_not_found_or_internal(error: SchedulerError) -> agent_client_protocol::Error {
    match error {
        SchedulerError::JobNotFound(id) => {
            agent_client_protocol::Error::resource_not_found(Some(id))
        }
        error => agent_client_protocol::Error::internal_error().data(error.to_string()),
    }
}

fn create_schedule_error(error: SchedulerError) -> agent_client_protocol::Error {
    match error {
        SchedulerError::CronParseError(message) => agent_client_protocol::Error::invalid_params()
            .data(format!("Invalid cron expression: {message}")),
        SchedulerError::RecipeLoadError(message) => agent_client_protocol::Error::invalid_params()
            .data(format!("Recipe load error: {message}")),
        SchedulerError::JobIdExists(id) => agent_client_protocol::Error::invalid_params()
            .data(format!("Job ID already exists: {id}")),
        error => agent_client_protocol::Error::internal_error()
            .data(format!("Error creating schedule: {error}")),
    }
}

fn schedule_state_error(error: SchedulerError) -> agent_client_protocol::Error {
    match error {
        SchedulerError::JobNotFound(id) => {
            agent_client_protocol::Error::resource_not_found(Some(id))
        }
        SchedulerError::AnyhowError(error) => {
            agent_client_protocol::Error::invalid_params().data(error.to_string())
        }
        error => agent_client_protocol::Error::internal_error().data(error.to_string()),
    }
}

fn update_schedule_error(error: SchedulerError) -> agent_client_protocol::Error {
    match error {
        SchedulerError::JobNotFound(id) => {
            agent_client_protocol::Error::resource_not_found(Some(id))
        }
        SchedulerError::AnyhowError(error) => {
            agent_client_protocol::Error::invalid_params().data(error.to_string())
        }
        SchedulerError::CronParseError(message) => agent_client_protocol::Error::invalid_params()
            .data(format!("Invalid cron expression: {message}")),
        error => agent_client_protocol::Error::internal_error().data(error.to_string()),
    }
}

fn run_schedule_now_error(
    error: SchedulerError,
) -> Result<RunScheduleNowResponse, agent_client_protocol::Error> {
    match error {
        SchedulerError::JobNotFound(id) => {
            Err(agent_client_protocol::Error::resource_not_found(Some(id)))
        }
        SchedulerError::AnyhowError(error)
            if error.to_string().contains("was successfully cancelled") =>
        {
            Ok(RunScheduleNowResponse {
                status: RunScheduleNowStatus::Cancelled,
                session_id: None,
            })
        }
        error => Err(agent_client_protocol::Error::internal_error()
            .data(format!("Error running schedule: {error}"))),
    }
}

fn run_outcome_to_dto(outcome: RunOutcome) -> ScheduleRunOutcomeDto {
    ScheduleRunOutcomeDto {
        status: match outcome.status {
            RunStatus::Done => ScheduleRunStatus::Done,
            RunStatus::Failed => ScheduleRunStatus::Failed,
            RunStatus::Killed => ScheduleRunStatus::Killed,
        },
        error: outcome.error,
    }
}

fn run_worktree_to_dto(worktree: RunWorktree) -> ScheduleRunWorktreeDto {
    ScheduleRunWorktreeDto {
        path: worktree.path.to_string_lossy().into_owned(),
        branch: worktree.branch,
    }
}

fn schedule_run_to_dto(session: Session) -> Option<ScheduleRunDto> {
    Some(ScheduleRunDto {
        schedule_id: session.schedule_id?,
        session_id: session.id,
        started_at: session.created_at.to_rfc3339(),
        outcome: RunOutcome::from_extension_data(&session.extension_data).map(run_outcome_to_dto),
        working_dir: session.working_dir.to_string_lossy().into_owned(),
        worktree: RunWorktree::from_extension_data(&session.extension_data)
            .map(run_worktree_to_dto),
        snippet: session.last_message_snippet,
        archived_at: session.archived_at.map(|value| value.to_rfc3339()),
    })
}

fn scheduled_job_to_dto(job: ScheduledJob) -> ScheduledJobDto {
    ScheduledJobDto {
        id: job.id,
        source: job.source,
        cron: job.cron,
        last_run: job.last_run.map(|value| value.to_rfc3339()),
        currently_running: job.currently_running,
        paused: job.paused,
        current_session_id: job.current_session_id,
        job_start_time: job.process_start_time.map(|value| value.to_rfc3339()),
    }
}

impl GooseAcpAgent {
    pub(super) fn require_scheduler(
        &self,
    ) -> Result<Arc<dyn SchedulerTrait>, agent_client_protocol::Error> {
        self.agent_manager.scheduler().ok_or_else(|| {
            agent_client_protocol::Error::method_not_found()
                .data("Scheduled recipe execution is not enabled")
        })
    }

    pub(super) async fn on_list_schedules(
        &self,
        _req: ListSchedulesRequest,
    ) -> Result<ListSchedulesResponse, agent_client_protocol::Error> {
        let jobs = self
            .require_scheduler()?
            .list_scheduled_jobs()
            .await
            .into_iter()
            .map(scheduled_job_to_dto)
            .collect();

        Ok(ListSchedulesResponse { jobs })
    }

    pub(super) async fn on_list_schedule_sessions(
        &self,
        req: ListScheduleSessionsRequest,
    ) -> Result<ListScheduleSessionsResponse, agent_client_protocol::Error> {
        let sessions = self
            .require_scheduler()?
            .sessions(&req.schedule_id, req.limit)
            .await
            .internal_err_ctx("Failed to fetch schedule sessions")?
            .into_iter()
            .map(|(_, session)| build_session_info(session))
            .collect();

        Ok(ListScheduleSessionsResponse { sessions })
    }

    // Runs are session records, so past runs stay readable even when this
    // launch has the scheduler off. The page is cut on last-message time and
    // re-sorted on start; the two only disagree when runs overlap.
    pub(super) async fn on_list_schedule_runs(
        &self,
        req: ListScheduleRunsRequest,
    ) -> Result<ListScheduleRunsResponse, agent_client_protocol::Error> {
        let mut sessions = self
            .session_manager
            .list_sessions_paged(SessionListPageQuery {
                filters: SessionListFilters {
                    types: Some(&[SessionType::Scheduled]),
                    ..Default::default()
                },
                cursor: None,
                page_size: req.limit,
                include_last_message_snippet: true,
            })
            .await
            .internal_err_ctx("Failed to fetch schedule runs")?
            .sessions;
        sessions.sort_by_key(|session| std::cmp::Reverse(session.created_at));

        Ok(ListScheduleRunsResponse {
            runs: sessions
                .into_iter()
                .filter_map(schedule_run_to_dto)
                .collect(),
        })
    }

    pub(super) async fn on_create_schedule(
        &self,
        req: CreateScheduleRequest,
    ) -> Result<CreateScheduleResponse, agent_client_protocol::Error> {
        let scheduler = self.require_scheduler()?;
        let id = req.id.trim().to_string();
        validate_schedule_id(&id)?;

        let recipe = Recipe::try_from(req.recipe).map_err(|e| {
            agent_client_protocol::Error::invalid_params().data(format!("recipe: {e}"))
        })?;

        if recipe.check_for_security_warnings() {
            return Err(agent_client_protocol::Error::invalid_params().data(
                "This recipe contains hidden characters that could be malicious. Please remove them before trying to save.",
            ));
        }
        validate_schedule_recipe(&recipe)?;

        let scheduled_recipes_dir = get_default_scheduled_recipes_dir().map_err(|e| {
            agent_client_protocol::Error::internal_error()
                .data(format!("Failed to get scheduled recipes directory: {e}"))
        })?;

        let recipe_path = scheduled_recipes_dir.join(format!("{id}.yaml"));
        let yaml_content = recipe.to_yaml().map_err(|e| {
            agent_client_protocol::Error::internal_error()
                .data(format!("Failed to convert recipe to YAML: {e}"))
        })?;
        fs::write(&recipe_path, yaml_content).await.map_err(|e| {
            agent_client_protocol::Error::internal_error()
                .data(format!("Failed to save recipe file: {e}"))
        })?;

        let job = ScheduledJob {
            id,
            source: recipe_path.to_string_lossy().into_owned(),
            cron: req.cron,
            last_run: None,
            currently_running: false,
            paused: false,
            current_session_id: None,
            process_start_time: None,
            parameters: vec![],
            recipe_base_dir: None,
        };

        scheduler
            .add_scheduled_job(job.clone(), false)
            .await
            .map_err(create_schedule_error)?;

        Ok(CreateScheduleResponse {
            job: scheduled_job_to_dto(job),
        })
    }

    pub(super) async fn on_delete_schedule(
        &self,
        req: DeleteScheduleRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        self.require_scheduler()?
            .remove_scheduled_job(&req.schedule_id, false)
            .await
            .map_err(schedule_not_found_or_internal)?;

        Ok(EmptyResponse {})
    }

    pub(super) async fn on_pause_schedule(
        &self,
        req: PauseScheduleRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        self.require_scheduler()?
            .pause_schedule(&req.schedule_id)
            .await
            .map_err(schedule_state_error)?;

        Ok(EmptyResponse {})
    }

    pub(super) async fn on_unpause_schedule(
        &self,
        req: UnpauseScheduleRequest,
    ) -> Result<EmptyResponse, agent_client_protocol::Error> {
        self.require_scheduler()?
            .unpause_schedule(&req.schedule_id)
            .await
            .map_err(schedule_not_found_or_internal)?;

        Ok(EmptyResponse {})
    }

    pub(super) async fn on_update_schedule(
        &self,
        req: UpdateScheduleRequest,
    ) -> Result<UpdateScheduleResponse, agent_client_protocol::Error> {
        let schedule_id = req.schedule_id;
        let cron = req.cron;
        let scheduler = self.require_scheduler()?;
        scheduler
            .update_schedule(&schedule_id, cron)
            .await
            .map_err(update_schedule_error)?;

        let job = scheduler
            .list_scheduled_jobs()
            .await
            .into_iter()
            .find(|job| job.id == schedule_id)
            .ok_or_else(|| {
                agent_client_protocol::Error::internal_error()
                    .data("Schedule not found after update")
            })?;

        Ok(UpdateScheduleResponse {
            job: scheduled_job_to_dto(job),
        })
    }

    pub(super) async fn on_run_schedule_now(
        &self,
        req: RunScheduleNowRequest,
    ) -> Result<RunScheduleNowResponse, agent_client_protocol::Error> {
        match self.require_scheduler()?.run_now(&req.schedule_id).await {
            Ok(session_id) => Ok(RunScheduleNowResponse {
                status: RunScheduleNowStatus::Completed,
                session_id: Some(session_id),
            }),
            Err(error) => run_schedule_now_error(error),
        }
    }

    pub(super) async fn on_kill_running_job(
        &self,
        req: KillRunningJobRequest,
    ) -> Result<KillRunningJobResponse, agent_client_protocol::Error> {
        self.require_scheduler()?
            .kill_running_job(&req.job_id)
            .await
            .map_err(schedule_state_error)?;

        Ok(KillRunningJobResponse {
            message: format!("Successfully killed running job '{}'", req.job_id),
        })
    }

    pub(super) async fn on_inspect_running_job(
        &self,
        req: InspectRunningJobRequest,
    ) -> Result<InspectRunningJobResponse, agent_client_protocol::Error> {
        let job = self
            .require_scheduler()?
            .list_scheduled_jobs()
            .await
            .into_iter()
            .find(|job| job.id == req.job_id)
            .ok_or_else(|| agent_client_protocol::Error::resource_not_found(Some(req.job_id)))?;

        if !job.currently_running {
            return Ok(InspectRunningJobResponse::default());
        }

        let running_duration_seconds = job.process_start_time.map(|start_time| {
            chrono::Utc::now()
                .signed_duration_since(start_time)
                .num_seconds()
        });

        Ok(InspectRunningJobResponse {
            running: true,
            session_id: job.current_session_id,
            job_start_time: job.process_start_time.map(|value| value.to_rfc3339()),
            running_duration_seconds,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::acp::server::AcpBuiltinSelection;
    use crate::acp::server_factory::{AcpServer, AcpServerFactoryConfig};
    use crate::agents::GoosePlatform;
    use crate::config::GooseMode;
    use crate::conversation::message::Message;
    use crate::session::session_manager::SessionManager;
    use goose_sdk_types::custom_requests::{ListRecipesRequest, ScheduleRecipeRequest};
    use serial_test::serial;
    use std::path::Path;

    fn scheduler_disabled_server(root: &Path) -> AcpServer {
        AcpServer::new(AcpServerFactoryConfig {
            builtins: AcpBuiltinSelection::default(),
            data_dir: root.join("data"),
            config_dir: root.join("config"),
            goose_platform: GoosePlatform::GooseCli,
            additional_source_roots: Vec::new(),
            session_cwd: None,
            enable_scheduler: false,
        })
    }

    async fn scheduled_run(
        session_manager: &SessionManager,
        root: &Path,
        schedule_id: &str,
        message: &str,
        message_at: i64,
    ) -> String {
        let session = session_manager
            .create_session(
                root.to_path_buf(),
                format!("Scheduled job: {schedule_id}"),
                SessionType::Scheduled,
                GooseMode::Auto,
            )
            .await
            .unwrap();
        session_manager
            .update(&session.id)
            .schedule_id(Some(schedule_id.to_string()))
            .apply()
            .await
            .unwrap();
        let mut user_message = Message::user().with_text(message);
        user_message.created = message_at;
        session_manager
            .add_message(&session.id, &user_message)
            .await
            .unwrap();
        session.id
    }

    fn assert_scheduler_disabled(error: agent_client_protocol::Error) {
        assert_eq!(
            error.code,
            agent_client_protocol::Error::method_not_found().code
        );
        assert_eq!(
            error.data.as_ref().and_then(serde_json::Value::as_str),
            Some("Scheduled recipe execution is not enabled")
        );
    }

    #[tokio::test]
    #[serial]
    async fn disabled_scheduler_rejects_schedule_operations_without_recipe_writes() {
        let root = tempfile::tempdir().unwrap();
        let _guard = env_lock::lock_env([
            ("GOOSE_DISABLE_KEYRING", Some("true")),
            ("GOOSE_PATH_ROOT", root.path().to_str()),
        ]);
        let server = scheduler_disabled_server(root.path());
        let agent = server.create_agent().await.unwrap();

        let list_error = agent
            .on_list_schedules(ListSchedulesRequest {})
            .await
            .expect_err("schedule listing must be unsupported");
        assert_scheduler_disabled(list_error);

        agent
            .on_list_recipes(ListRecipesRequest {})
            .await
            .expect("recipe listing must remain available");

        let create_error = agent
            .on_create_schedule(CreateScheduleRequest {
                id: "nightly".to_string(),
                recipe: Default::default(),
                cron: "0 0 0 * * *".to_string(),
            })
            .await
            .expect_err("schedule creation must be unsupported");
        assert_scheduler_disabled(create_error);
        assert!(!get_default_scheduled_recipes_dir()
            .unwrap()
            .join("nightly.yaml")
            .exists());

        let schedule_recipe_error = agent
            .on_schedule_recipe(ScheduleRecipeRequest {
                id: "missing-recipe".to_string(),
                cron_schedule: Some("0 0 0 * * *".to_string()),
            })
            .await
            .expect_err("recipe scheduling must be unsupported");
        assert_scheduler_disabled(schedule_recipe_error);
    }

    // created_at is SQLite CURRENT_TIMESTAMP (second resolution), so the two
    // runs are created a second apart; the older run then gets the newer
    // message so the storage order disagrees with the start order.
    #[tokio::test]
    #[serial]
    async fn schedule_runs_list_orders_newest_first() {
        let root = tempfile::tempdir().unwrap();
        let _guard = env_lock::lock_env([
            ("GOOSE_DISABLE_KEYRING", Some("true")),
            ("GOOSE_PATH_ROOT", root.path().to_str()),
        ]);
        let server = scheduler_disabled_server(root.path());
        let agent = server.create_agent().await.unwrap();
        let session_manager = &agent.session_manager;

        let older =
            scheduled_run(session_manager, root.path(), "nightly", "older run", 2_000).await;
        tokio::time::sleep(std::time::Duration::from_millis(1100)).await;
        let newer = scheduled_run(session_manager, root.path(), "hourly", "newer run", 1_000).await;
        session_manager
            .create_session(
                root.path().to_path_buf(),
                "not a run".to_string(),
                SessionType::User,
                GooseMode::Auto,
            )
            .await
            .unwrap();

        let mut extension_data = session_manager
            .get_session(&older, false)
            .await
            .unwrap()
            .extension_data;
        RunOutcome {
            status: RunStatus::Failed,
            error: Some("provider returned 500".to_string()),
        }
        .to_extension_data(&mut extension_data)
        .unwrap();
        RunWorktree {
            path: root.path().join(".worktrees/wt-20260916-0a1b"),
            branch: "wt/wt-20260916-0a1b".to_string(),
        }
        .to_extension_data(&mut extension_data)
        .unwrap();
        session_manager
            .update(&older)
            .extension_data(extension_data)
            .apply()
            .await
            .unwrap();

        let runs = agent
            .on_list_schedule_runs(ListScheduleRunsRequest { limit: 10 })
            .await
            .unwrap()
            .runs;

        let ids: Vec<&str> = runs.iter().map(|run| run.session_id.as_str()).collect();
        assert_eq!(ids, [newer.as_str(), older.as_str()]);
        assert!(runs[0].started_at > runs[1].started_at);
        assert_eq!(runs[0].schedule_id, "hourly");
        assert_eq!(runs[0].outcome, None);
        assert_eq!(runs[0].snippet.as_deref(), Some("newer run"));
        assert_eq!(runs[0].working_dir, root.path().to_string_lossy());
        assert_eq!(runs[0].archived_at, None);
        assert_eq!(runs[0].worktree, None);
        assert_eq!(
            runs[1].outcome,
            Some(ScheduleRunOutcomeDto {
                status: ScheduleRunStatus::Failed,
                error: Some("provider returned 500".to_string()),
            })
        );
        assert_eq!(runs[1].snippet.as_deref(), Some("older run"));
        assert_eq!(
            runs[1].worktree,
            Some(ScheduleRunWorktreeDto {
                path: root
                    .path()
                    .join(".worktrees/wt-20260916-0a1b")
                    .to_string_lossy()
                    .into_owned(),
                branch: "wt/wt-20260916-0a1b".to_string(),
            })
        );
    }
}
