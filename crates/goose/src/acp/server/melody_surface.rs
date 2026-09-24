//! Melody's own session tools on the bridge (task 207): `list_sessions`,
//! `start_session` and `session_status`.
//!
//! Unlike summon's tools — dispatched into the calling session's own `Agent`
//! (`agents/session_bridge.rs`'s `"tools/call"` arm) — these read and write
//! the server's shared session and agent state directly, so creating and
//! inspecting a session needs no client connection: a manager Melody starts
//! may never have a window open on it. Going through the ordinary
//! `session/new` path instead would need one (`new_session.rs:36-73` takes a
//! `ConnectionTo<Client>`; `get_session_agent` errors without `client_cx`).
//!
//! `start_session` never fills in a default for `mode`, `provider`, `model`
//! or `extensions` — a call missing any of them is refused, matching
//! `new_session.rs`'s own rule that a session's mode is chosen, never
//! defaulted to `Config::global().get_goose_mode()`.

use super::ACP_VISIBLE_SESSION_TYPES;
use crate::agents::session_bridge::SessionTools;
use crate::agents::{Agent, AgentConfig, GoosePlatform};
use crate::config::permission::PermissionManager;
use crate::config::{extensions::get_extension_by_name, GooseMode};
use crate::execution::manager::AgentManager;
use crate::execution::ActiveRunRegistry;
use crate::session::extension_data::ExtensionState;
use crate::session::session_manager::SessionRole;
use crate::session::{EnabledExtensionsState, SessionManager, SessionType};
use anyhow::Result;
use async_trait::async_trait;
use rmcp::model::{CallToolRequestParams, CallToolResult, ContentBlock, Tool};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

pub const LIST_SESSIONS_TOOL: &str = "list_sessions";
pub const START_SESSION_TOOL: &str = "start_session";
pub const SESSION_STATUS_TOOL: &str = "session_status";

/// One row of what Melody sees: enough to tell every session apart, including
/// a manager she has never sent a turn to yet (no messages, so it never shows
/// up in an ordinary `session/list`).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MelodySessionSummary {
    pub id: String,
    pub title: String,
    pub repository: String,
    pub role: SessionRole,
    pub parent: Option<String>,
    pub running: bool,
}

/// A `start_session` call missing any of `mode`, `provider`, `model` or
/// `extensions` is refused rather than silently defaulted — see the module
/// doc. Validated before touching storage, so a refused call never creates
/// or reconfigures a manager row.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartSessionArgs {
    pub repo: PathBuf,
    pub task: String,
    #[serde(default)]
    pub mode: Option<GooseMode>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    /// Extension names, resolved against the caller's configured extensions
    /// (`crate::config::extensions::get_extension_by_name`); an explicit
    /// empty list means "none", omitting the field means "refused".
    #[serde(default)]
    pub extensions: Option<Vec<String>>,
}

#[derive(Debug, thiserror::Error)]
pub enum StartSessionError {
    #[error("repo must be an absolute, existing directory")]
    InvalidRepo,
    #[error("start_session requires a mode; it is never defaulted")]
    MissingMode,
    #[error("start_session requires a provider")]
    MissingProvider,
    #[error("start_session requires a model")]
    MissingModel,
    #[error("start_session requires an extensions list, even if empty")]
    MissingExtensions,
    #[error("unknown extension: {0}")]
    UnknownExtension(String),
    #[error("Melody's own session has not been established yet")]
    NoMelodySession,
    #[error(
        "the manager session for this repository has a turn in progress; refusing to \
         reconfigure it — wait for it to finish or cancel it first"
    )]
    Busy,
    #[error(
        "the manager session for this repository is a {0:?} session, not User; refusing to \
         reconfigure or repurpose it"
    )]
    ManagerNotUser(SessionType),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

/// Backs the three tools above; constructed from the same `Arc<SessionManager>`
/// and `Arc<AgentManager>` a `GooseAcpAgent` already holds (`SharedAcpState::
/// build`, `acp/server_factory.rs`'s `shared()`), plus its `Arc<
/// ActiveRunRegistry>` (`GooseAcpAgentOptions::active_runs`, shared across a
/// server's connections by `acp/server_factory.rs`), so `running` reflects
/// the process's real run registry — the one `on_prompt` claims a turn
/// against — not a second, empty one.
pub struct MelodySurface {
    session_manager: Arc<SessionManager>,
    agent_manager: Arc<AgentManager>,
    active_runs: Arc<ActiveRunRegistry>,
}

impl MelodySurface {
    pub fn new(
        session_manager: Arc<SessionManager>,
        agent_manager: Arc<AgentManager>,
        active_runs: Arc<ActiveRunRegistry>,
    ) -> Self {
        Self {
            session_manager,
            agent_manager,
            active_runs,
        }
    }

    /// Every ACP-visible session (`ACP_VISIBLE_SESSION_TYPES`), including
    /// ones with no messages yet — unlike `session/list`, which hides those
    /// (`list_sessions.rs`'s `only_sessions_with_messages: true`).
    pub async fn list_sessions(&self) -> Result<Vec<MelodySessionSummary>> {
        let sessions = self
            .session_manager
            .list_sessions_by_types(&ACP_VISIBLE_SESSION_TYPES)
            .await?;
        let mut summaries = Vec::with_capacity(sessions.len());
        for session in sessions {
            summaries.push(self.summarize(session).await?);
        }
        Ok(summaries)
    }

    pub async fn session_status(&self, session_id: &str) -> Result<MelodySessionSummary> {
        let session = self.session_manager.get_session(session_id, false).await?;
        self.summarize(session).await
    }

    async fn summarize(&self, session: crate::session::Session) -> Result<MelodySessionSummary> {
        let (role, _repository) = self.session_manager.get_role(&session.id).await?;
        // Not `AgentManager::is_session_busy`: that reads a cancel-token map
        // only the orchestrator's sub-agent `send_message` tool populates.
        // `active_runs` is what `on_prompt` claims a real turn against.
        let running = self.active_runs.is_active(&session.id);
        Ok(MelodySessionSummary {
            id: session.id,
            title: session.name,
            repository: session.working_dir.to_string_lossy().into_owned(),
            role,
            parent: session.parent_session_id,
            running,
        })
    }

    /// Creates (or reconfigures) `repo`'s manager session — `User`, parent
    /// Melody, role `manager` (206's `get_or_create_manager` sets the role
    /// and repository; this sets the mode, provider, model, extensions and
    /// parent it creates with `Auto`/none). Runs nothing: 208 hands the
    /// manager its first turn.
    ///
    /// Refuses rather than mutates when the manager it would reconfigure has
    /// a turn in progress (`StartSessionError::Busy`) or is not a `User`
    /// session (`StartSessionError::ManagerNotUser`). Reconfiguring replaces
    /// only the enabled-extensions entry in `extension_data`, preserving any
    /// other extension state (e.g. `todo.v0`) already on the row.
    pub async fn start_session(&self, args: StartSessionArgs) -> Result<String, StartSessionError> {
        if !args.repo.is_absolute() || !args.repo.is_dir() {
            return Err(StartSessionError::InvalidRepo);
        }
        let mode = args.mode.ok_or(StartSessionError::MissingMode)?;
        let provider = args.provider.ok_or(StartSessionError::MissingProvider)?;
        let model_name = args.model.ok_or(StartSessionError::MissingModel)?;
        let extension_names = args
            .extensions
            .ok_or(StartSessionError::MissingExtensions)?;

        let mut extension_configs = Vec::with_capacity(extension_names.len());
        for name in &extension_names {
            let config = get_extension_by_name(name)
                .ok_or_else(|| StartSessionError::UnknownExtension(name.clone()))?;
            extension_configs.push(config);
        }

        let melody_session_id = self
            .session_manager
            .melody_session()
            .await?
            .ok_or(StartSessionError::NoMelodySession)?;

        let model_config =
            crate::model_config::model_config_from_user_config(&provider, &model_name)?;

        let session_id = self
            .session_manager
            .get_or_create_manager(&args.repo, args.task.clone())
            .await?;

        // `get_or_create_manager` always creates a fresh manager as `User`
        // (`SessionStorage::get_or_create_manager`), but it can also return
        // an existing row — one that a bad `_meta.role` on `session/new`
        // associated with this repository while it was `Acp` or `Hidden`.
        // Refusing (rather than silently flipping its type) never repurposes
        // a session some other, differently-typed connection may still be
        // attached to.
        let current_session = self.session_manager.get_session(&session_id, false).await?;
        if current_session.session_type != SessionType::User {
            return Err(StartSessionError::ManagerNotUser(
                current_session.session_type,
            ));
        }

        // Claim exclusivity through the same run registry `on_prompt` claims
        // a turn against (`ActiveRunRegistry::start_prompt_run`,
        // `acp/server.rs`'s `on_prompt`/`start_active_run`) — not
        // `AgentManager`'s cancel-token map, which only the orchestrator's
        // sub-agent `send_message` tool uses. So a real turn (or a Live
        // voice interaction) already in flight on this session is refused
        // here rather than raced, and none can start on it between this
        // check and the write below. The agent stored for the claim is a
        // scratch placeholder; a steer landing on it is discarded with it,
        // since the claim is released again right after the write.
        let run_id = format!("start_session_{}", uuid::Uuid::now_v7());
        let placeholder_agent = Arc::new(Agent::with_config(AgentConfig::new(
            Arc::clone(&self.session_manager),
            PermissionManager::instance(),
            None,
            GooseMode::default(),
            true,
            GoosePlatform::GooseCli,
        )));
        self.active_runs
            .start_prompt_run(
                &session_id,
                run_id.clone(),
                CancellationToken::new(),
                placeholder_agent,
            )
            .map_err(|_| StartSessionError::Busy)?;

        let mut extension_data = current_session.extension_data.clone();
        EnabledExtensionsState::new(extension_configs).to_extension_data(&mut extension_data)?;

        let apply_result = self
            .session_manager
            .update(&session_id)
            .system_generated_name(args.task)
            .goose_mode(mode)
            .provider_name(provider)
            .model_config(model_config)
            .extension_data(extension_data)
            .parent_session_id(Some(melody_session_id))
            .apply()
            .await;

        // The row may have been loaded (and cached) under its pre-existing
        // setup by an earlier activation; drop it so the next activation
        // rebuilds against what was just applied. Safe here: the busy claim
        // above guarantees no real turn is in flight to cancel — only our
        // own placeholder, released right below, is registered.
        let remove_result = if apply_result.is_ok() {
            self.agent_manager
                .remove_session_if_loaded(&session_id)
                .await
        } else {
            Ok(())
        };

        self.active_runs
            .remove_agent_run_and_then(&session_id, &run_id, |_| {});

        apply_result?;
        remove_result?;

        Ok(session_id)
    }
}

fn json_success(value: &impl Serialize) -> CallToolResult {
    let text = serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string());
    CallToolResult::success(vec![ContentBlock::text(text)])
}

fn tool_error(message: impl std::fmt::Display) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(message.to_string())])
}

fn list_sessions_tool() -> Tool {
    let schema = serde_json::json!({ "type": "object", "properties": {} });
    Tool::new(
        LIST_SESSIONS_TOOL,
        "List every session Melody knows about, including ones with no \
         messages yet (a manager she started but hasn't sent a turn to): id, \
         title, repository, role, parent session id, and whether it is \
         currently running."
            .to_string(),
        schema.as_object().unwrap().clone(),
    )
}

fn session_status_tool() -> Tool {
    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "sessionId": {
                "type": "string",
                "description": "The session id to inspect."
            }
        },
        "required": ["sessionId"]
    });
    Tool::new(
        SESSION_STATUS_TOOL,
        "Look up one session's id, title, repository, role, parent session \
         id and whether it is currently running."
            .to_string(),
        schema.as_object().unwrap().clone(),
    )
}

fn start_session_tool() -> Tool {
    let schema = serde_json::json!({
        "type": "object",
        "properties": {
            "repo": {
                "type": "string",
                "description": "Absolute path into the repository to work in."
            },
            "task": {
                "type": "string",
                "description": "What the manager should do; also becomes its title."
            },
            "mode": {
                "type": "string",
                "enum": ["auto", "approve", "smart_approve", "chat"],
                "description": "Required — never defaulted."
            },
            "provider": {
                "type": "string",
                "description": "Required — the LLM provider seat for this manager."
            },
            "model": {
                "type": "string",
                "description": "Required — the model name for that provider."
            },
            "extensions": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Required, even if empty — extension names to enable for this manager."
            }
        },
        "required": ["repo", "task", "mode", "provider", "model", "extensions"]
    });
    Tool::new(
        START_SESSION_TOOL,
        "Start (or reconfigure) the manager session for a repository, with \
         a mode, provider, model and extension list chosen on purpose. \
         Creates the session; does not run it — it starts with no turn in \
         flight."
            .to_string(),
        schema.as_object().unwrap().clone(),
    )
}

#[async_trait]
impl SessionTools for MelodySurface {
    fn tools(&self) -> Vec<Tool> {
        vec![
            list_sessions_tool(),
            session_status_tool(),
            start_session_tool(),
        ]
    }

    async fn call(&self, _caller_session_id: &str, call: CallToolRequestParams) -> CallToolResult {
        match call.name.as_ref() {
            LIST_SESSIONS_TOOL => match self.list_sessions().await {
                Ok(sessions) => json_success(&sessions),
                Err(error) => tool_error(error),
            },
            SESSION_STATUS_TOOL => {
                let session_id = call
                    .arguments
                    .as_ref()
                    .and_then(|args| args.get("sessionId"))
                    .and_then(|value| value.as_str());
                let Some(session_id) = session_id else {
                    return tool_error("session_status requires sessionId");
                };
                match self.session_status(session_id).await {
                    Ok(summary) => json_success(&summary),
                    Err(error) => tool_error(error),
                }
            }
            START_SESSION_TOOL => {
                let args: StartSessionArgs = match call
                    .arguments
                    .map(serde_json::Value::Object)
                    .map(serde_json::from_value)
                {
                    Some(Ok(args)) => args,
                    Some(Err(error)) => return tool_error(error),
                    None => return tool_error("start_session requires arguments"),
                };
                match self.start_session(args).await {
                    Ok(session_id) => json_success(&serde_json::json!({ "sessionId": session_id })),
                    Err(error) => tool_error(error),
                }
            }
            other => tool_error(format!("unknown tool: {other}")),
        }
    }
}
