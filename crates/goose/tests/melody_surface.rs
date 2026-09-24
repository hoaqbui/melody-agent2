#![recursion_limit = "256"]
#[allow(dead_code)]
#[path = "acp_common_tests/mod.rs"]
mod common_tests;

use agent_client_protocol::schema::v1::NewSessionRequest;
use common_tests::fixtures::server::AcpServerConnection;
use common_tests::fixtures::{run_test, Connection, OpenAiFixture, TestConnectionConfig};
use goose::acp::server::melody_surface::{MelodySurface, StartSessionArgs, StartSessionError};
use goose::agents::{Agent, AgentConfig, GoosePlatform};
use goose::config::permission::PermissionManager;
use goose::config::GooseMode;
use goose::execution::manager::AgentManager;
use goose::execution::ActiveRunRegistry;
use goose::session::{ExtensionState, SessionManager, SessionRole, SessionType, TodoState};
use std::path::Path;
use std::sync::Arc;
use tempfile::TempDir;
use tokio_util::sync::CancellationToken;

async fn test_surface(
    session_manager: &Arc<SessionManager>,
) -> (Arc<AgentManager>, Arc<ActiveRunRegistry>, MelodySurface) {
    let agent_config = AgentConfig::new(
        Arc::clone(session_manager),
        PermissionManager::instance(),
        None,
        GooseMode::default(),
        true,
        GoosePlatform::GooseCli,
    );
    let agent_manager = Arc::new(AgentManager::new(agent_config, None).await.unwrap());
    let active_runs = Arc::new(ActiveRunRegistry::default());
    let surface = MelodySurface::new(
        Arc::clone(session_manager),
        Arc::clone(&agent_manager),
        Arc::clone(&active_runs),
    );
    (agent_manager, active_runs, surface)
}

/// A cheap, unloaded `Agent` — enough to satisfy `ActiveRunRegistry`'s
/// bookkeeping when a test seeds a claim on it directly; it is never asked
/// to do anything.
fn placeholder_agent(session_manager: &Arc<SessionManager>) -> Arc<Agent> {
    Arc::new(Agent::with_config(AgentConfig::new(
        Arc::clone(session_manager),
        PermissionManager::instance(),
        None,
        GooseMode::default(),
        true,
        GoosePlatform::GooseCli,
    )))
}

async fn seed_melody(session_manager: &SessionManager, repo: &Path) -> String {
    let melody = session_manager
        .create_session(
            repo.to_path_buf(),
            "Melody".to_string(),
            SessionType::User,
            GooseMode::default(),
        )
        .await
        .unwrap();
    session_manager
        .set_role(&melody.id, SessionRole::Melody, None)
        .await
        .unwrap();
    melody.id
}

#[tokio::test]
async fn start_session_creates_user_manager_with_asked_settings() {
    let temp_dir = TempDir::new().unwrap();
    let repo_dir = temp_dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).unwrap();
    let data_dir = temp_dir.path().join("data");

    let session_manager = Arc::new(SessionManager::new(data_dir));
    let melody_id = seed_melody(&session_manager, &repo_dir).await;
    let (_agent_manager, _active_runs, surface) = test_surface(&session_manager).await;

    let session_id = surface
        .start_session(StartSessionArgs {
            repo: repo_dir.clone(),
            task: "fix the failing build".to_string(),
            mode: Some(GooseMode::Approve),
            provider: Some("openai".to_string()),
            model: Some("gpt-4.1".to_string()),
            extensions: Some(vec![]),
        })
        .await
        .expect("a fully specified start_session must succeed");

    let session = session_manager
        .get_session(&session_id, false)
        .await
        .unwrap();
    assert_eq!(session.session_type, SessionType::User);
    assert_eq!(
        session.parent_session_id.as_deref(),
        Some(melody_id.as_str())
    );
    assert_eq!(session.goose_mode, GooseMode::Approve);
    assert_eq!(session.provider_name.as_deref(), Some("openai"));
    assert_eq!(
        session.model_config.as_ref().map(|m| m.model_name.as_str()),
        Some("gpt-4.1")
    );

    let (role, repository) = session_manager.get_role(&session_id).await.unwrap();
    assert_eq!(role, SessionRole::Manager);
    let expected_repo = SessionManager::canonical_repository(&repo_dir)
        .await
        .unwrap()
        .to_string_lossy()
        .into_owned();
    assert_eq!(repository.as_deref(), Some(expected_repo.as_str()));

    let summary = surface.session_status(&session_id).await.unwrap();
    assert_eq!(summary.role, SessionRole::Manager);
    assert_eq!(summary.parent.as_deref(), Some(melody_id.as_str()));
    assert!(!summary.running, "start_session must not run anything");
}

#[tokio::test]
async fn start_session_without_a_mode_is_refused() {
    let temp_dir = TempDir::new().unwrap();
    let repo_dir = temp_dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).unwrap();
    let data_dir = temp_dir.path().join("data");

    let session_manager = Arc::new(SessionManager::new(data_dir));
    seed_melody(&session_manager, &repo_dir).await;
    let (_agent_manager, _active_runs, surface) = test_surface(&session_manager).await;

    let sessions_before = session_manager.list_all_sessions().await.unwrap().len();

    let result = surface
        .start_session(StartSessionArgs {
            repo: repo_dir.clone(),
            task: "fix the failing build".to_string(),
            mode: None,
            provider: Some("openai".to_string()),
            model: Some("gpt-4.1".to_string()),
            extensions: Some(vec![]),
        })
        .await;

    assert!(
        matches!(result, Err(StartSessionError::MissingMode)),
        "a start_session with no mode must be refused, never silently defaulted: {result:?}"
    );

    let sessions_after = session_manager.list_all_sessions().await.unwrap().len();
    assert_eq!(
        sessions_before, sessions_after,
        "a refused start_session must not create a manager row"
    );
}

async fn new_connection(data_root: &Path) -> AcpServerConnection {
    let openai = OpenAiFixture::new(
        vec![],
        <AcpServerConnection as Connection>::expected_session_id(),
    )
    .await;
    <AcpServerConnection as Connection>::new(
        TestConnectionConfig {
            data_root: data_root.to_path_buf(),
            ..Default::default()
        },
        openai,
    )
    .await
}

/// `role` requires a `User` session (blocker 3: `session/new` refuses
/// `melody`/`manager` on anything else), so this also sets `client` — the
/// meta field that makes a session `User` — matching how a real client
/// claiming a role would call `session/new`.
fn role_meta(role: &str) -> serde_json::Map<String, serde_json::Value> {
    let mut meta = serde_json::Map::new();
    meta.insert(
        "role".to_string(),
        serde_json::Value::String(role.to_string()),
    );
    meta.insert(
        "client".to_string(),
        serde_json::Value::String("desktop".to_string()),
    );
    meta
}

fn role_meta_no_client(role: &str) -> serde_json::Map<String, serde_json::Value> {
    let mut meta = serde_json::Map::new();
    meta.insert(
        "role".to_string(),
        serde_json::Value::String(role.to_string()),
    );
    meta
}

fn session_title_meta(title: &str) -> serde_json::Map<String, serde_json::Value> {
    let mut meta = serde_json::Map::new();
    meta.insert(
        "sessionTitle".to_string(),
        serde_json::Value::String(title.to_string()),
    );
    meta
}

/// A session created through the ordinary `session/new` path (the one the
/// UI takes when the user starts a chat directly, never touching
/// `start_session`) must still show up in Melody's `list_sessions` — that is
/// the whole point of task 207's card ("every session, including the ones I
/// start from the UI"). This also exercises `_meta.role`: the first session
/// created here claims the melody role the same way, through the real
/// `session/new` RPC.
#[test]
fn a_session_new_session_appears_in_list_sessions_by_title() {
    run_test(async {
        let temp_dir = TempDir::new().unwrap();
        let data_root = temp_dir.path().join("data");
        let work_dir = temp_dir.path().join("work");
        std::fs::create_dir_all(&work_dir).unwrap();

        let conn = new_connection(&data_root).await;

        let melody_response = conn
            .cx()
            .send_request(NewSessionRequest::new(&work_dir).meta(role_meta("melody")))
            .block_task()
            .await
            .unwrap();
        let melody_id = melody_response.session_id.0.to_string();

        let ordinary_response = conn
            .cx()
            .send_request(
                NewSessionRequest::new(&work_dir).meta(session_title_meta("Alpha from the UI")),
            )
            .block_task()
            .await
            .unwrap();
        let ordinary_id = ordinary_response.session_id.0.to_string();

        // A fresh SessionManager pointed at the same data root sees the same
        // durable rows the live connection's own SharedAcpState wrote — the
        // pattern `seed_list_sessions` already uses in acp_server_test.rs.
        let session_manager = Arc::new(SessionManager::new(data_root));
        let (role, _repository) = session_manager.get_role(&melody_id).await.unwrap();
        assert_eq!(
            role,
            SessionRole::Melody,
            "_meta.role on session/new must be applied through set_role"
        );

        let (_agent_manager, _active_runs, surface) = test_surface(&session_manager).await;
        let sessions = surface.list_sessions().await.unwrap();
        assert!(
            sessions.iter().any(|s| s.id == ordinary_id && s.title == "Alpha from the UI"),
            "a session created via session/new must appear in Melody's list_sessions by title: {sessions:?}"
        );
    });
}

/// Codex review blocker 1: reconfiguring a manager that has a turn in flight
/// must refuse, not cancel it. Simulates "a turn in flight" on the exact
/// registry `on_prompt` claims a run against (`ActiveRunRegistry`, via its
/// `_for_test` seam — not `AgentManager`'s cancel-token map, which real
/// prompt turns never touch) and checks `start_session` refuses against it.
#[tokio::test]
async fn start_session_refuses_a_busy_manager_without_cancelling_it() {
    let temp_dir = TempDir::new().unwrap();
    let repo_dir = temp_dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).unwrap();
    let data_dir = temp_dir.path().join("data");

    let session_manager = Arc::new(SessionManager::new(data_dir));
    seed_melody(&session_manager, &repo_dir).await;
    let (_agent_manager, active_runs, surface) = test_surface(&session_manager).await;

    let session_id = surface
        .start_session(StartSessionArgs {
            repo: repo_dir.clone(),
            task: "first task".to_string(),
            mode: Some(GooseMode::Approve),
            provider: Some("openai".to_string()),
            model: Some("gpt-4.1".to_string()),
            extensions: Some(vec![]),
        })
        .await
        .unwrap();

    let turn_cancel_token = CancellationToken::new();
    assert!(
        active_runs.start_prompt_run_for_test(
            &session_id,
            "real_turn",
            turn_cancel_token.clone(),
            placeholder_agent(&session_manager),
        ),
        "the run registry must accept the first claim"
    );

    let result = surface
        .start_session(StartSessionArgs {
            repo: repo_dir.clone(),
            task: "second task".to_string(),
            mode: Some(GooseMode::Auto),
            provider: Some("openai".to_string()),
            model: Some("gpt-4o".to_string()),
            extensions: Some(vec![]),
        })
        .await;

    assert!(
        matches!(result, Err(StartSessionError::Busy)),
        "start_session on a busy manager must refuse, not reconfigure it: {result:?}"
    );
    assert!(
        !turn_cancel_token.is_cancelled(),
        "a refused start_session must never cancel the manager's active turn"
    );
    assert!(
        active_runs.is_active_for_test(&session_id),
        "the original turn's busy claim must still stand after the refusal"
    );

    let session = session_manager
        .get_session(&session_id, false)
        .await
        .unwrap();
    assert_eq!(
        session.goose_mode,
        GooseMode::Approve,
        "a refused start_session must not change the manager's settings"
    );
    assert_eq!(session.provider_name.as_deref(), Some("openai"));
    assert_eq!(
        session.model_config.as_ref().map(|m| m.model_name.as_str()),
        Some("gpt-4.1")
    );
}

/// Codex review blocker 2: reconfiguring a manager must not wipe other
/// extension state (e.g. `todo.v0`) already persisted on its
/// `extension_data` row — only the `enabled_extensions.v0` entry changes.
#[tokio::test]
async fn start_session_preserves_other_extension_data_on_reconfigure() {
    let temp_dir = TempDir::new().unwrap();
    let repo_dir = temp_dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).unwrap();
    let data_dir = temp_dir.path().join("data");

    let session_manager = Arc::new(SessionManager::new(data_dir));
    seed_melody(&session_manager, &repo_dir).await;
    let (_agent_manager, _active_runs, surface) = test_surface(&session_manager).await;

    let session_id = surface
        .start_session(StartSessionArgs {
            repo: repo_dir.clone(),
            task: "first task".to_string(),
            mode: Some(GooseMode::Approve),
            provider: Some("openai".to_string()),
            model: Some("gpt-4.1".to_string()),
            extensions: Some(vec![]),
        })
        .await
        .unwrap();

    // Persist unrelated extension state onto the manager row, the way the
    // todo extension would while the manager is running.
    let mut extension_data = session_manager
        .get_session(&session_id, false)
        .await
        .unwrap()
        .extension_data;
    TodoState::new("- [ ] finish the thing".to_string())
        .to_extension_data(&mut extension_data)
        .unwrap();
    session_manager
        .update(&session_id)
        .extension_data(extension_data)
        .apply()
        .await
        .unwrap();

    surface
        .start_session(StartSessionArgs {
            repo: repo_dir.clone(),
            task: "second task".to_string(),
            mode: Some(GooseMode::Auto),
            provider: Some("openai".to_string()),
            model: Some("gpt-4o".to_string()),
            extensions: Some(vec![]),
        })
        .await
        .expect("reconfiguring a non-busy manager must still succeed");

    let session = session_manager
        .get_session(&session_id, false)
        .await
        .unwrap();
    let todo = TodoState::from_extension_data(&session.extension_data);
    assert_eq!(
        todo.map(|t| t.content),
        Some("- [ ] finish the thing".to_string()),
        "start_session must preserve unrelated extension_data (e.g. todo.v0) when reconfiguring"
    );
}

/// Second-round Codex review blocker 1: the exclusivity claim must be
/// released even if the `start_session` call itself is cancelled mid-flight
/// (its future dropped before it returns) — not just on a normal early
/// return — otherwise the manager stays "busy" forever with no one to
/// un-claim it. Forces that by spawning the call and aborting the task once
/// it has provably taken the claim.
#[tokio::test]
async fn start_session_releases_its_claim_when_cancelled_mid_flight() {
    let temp_dir = TempDir::new().unwrap();
    let repo_dir = temp_dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).unwrap();
    let data_dir = temp_dir.path().join("data");

    let session_manager = Arc::new(SessionManager::new(data_dir));
    seed_melody(&session_manager, &repo_dir).await;
    let (_agent_manager, active_runs, surface) = test_surface(&session_manager).await;
    let surface = Arc::new(surface);

    let session_id = surface
        .start_session(StartSessionArgs {
            repo: repo_dir.clone(),
            task: "first task".to_string(),
            mode: Some(GooseMode::Approve),
            provider: Some("openai".to_string()),
            model: Some("gpt-4.1".to_string()),
            extensions: Some(vec![]),
        })
        .await
        .unwrap();

    let handle = {
        let surface = Arc::clone(&surface);
        let repo_dir = repo_dir.clone();
        tokio::spawn(async move {
            surface
                .start_session(StartSessionArgs {
                    repo: repo_dir,
                    task: "second task".to_string(),
                    mode: Some(GooseMode::Auto),
                    provider: Some("openai".to_string()),
                    model: Some("gpt-4o".to_string()),
                    extensions: Some(vec![]),
                })
                .await
        })
    };

    // `yield_now`, not a timed sleep: on the default current-thread test
    // runtime a sleep can let the spawned task run to completion (claim
    // taken and released) in one go, since the local sqlite round-trips are
    // fast enough to finish inside a single scheduler slice. Yielding after
    // every step gives the spawned task's `.await` points (several, between
    // the claim and the release) a chance to interleave with this check.
    let mut attempts = 0;
    while !active_runs.is_active_for_test(&session_id) {
        attempts += 1;
        assert!(
            attempts < 200_000,
            "the spawned start_session never took the claim"
        );
        tokio::task::yield_now().await;
    }

    handle.abort();
    let _ = handle.await;

    assert!(
        !active_runs.is_active_for_test(&session_id),
        "an aborted start_session must not leave its exclusivity claim registered forever"
    );
}

/// Second-round Codex review blocker 3: `start_session` must refuse to
/// reconfigure a manager that is already loaded (e.g. by a connection that
/// has activated it), since `AgentManager::remove_session_if_loaded` only
/// evicts the server-wide cache, not a connection-local `Arc<Agent>` a
/// caller may already hold — reconfiguring under it would leave that caller
/// running against stale settings indefinitely.
#[tokio::test]
async fn start_session_refuses_a_loaded_manager() {
    let temp_dir = TempDir::new().unwrap();
    let repo_dir = temp_dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).unwrap();
    let data_dir = temp_dir.path().join("data");

    let session_manager = Arc::new(SessionManager::new(data_dir));
    seed_melody(&session_manager, &repo_dir).await;
    let (agent_manager, _active_runs, surface) = test_surface(&session_manager).await;

    let session_id = surface
        .start_session(StartSessionArgs {
            repo: repo_dir.clone(),
            task: "first task".to_string(),
            mode: Some(GooseMode::Approve),
            provider: Some("openai".to_string()),
            model: Some("gpt-4.1".to_string()),
            extensions: Some(vec![]),
        })
        .await
        .unwrap();

    // Simulate a connection having activated (and so cached) the manager's
    // agent, the way `GooseAcpAgent::prepare_acp_session_agent` does.
    agent_manager
        .get_or_create_agent(session_id.clone())
        .await
        .unwrap();
    assert!(agent_manager.has_session(&session_id).await);

    let result = surface
        .start_session(StartSessionArgs {
            repo: repo_dir.clone(),
            task: "second task".to_string(),
            mode: Some(GooseMode::Auto),
            provider: Some("openai".to_string()),
            model: Some("gpt-4o".to_string()),
            extensions: Some(vec![]),
        })
        .await;

    assert!(
        matches!(result, Err(StartSessionError::ManagerLoaded)),
        "start_session must refuse a manager that's already loaded: {result:?}"
    );

    let session = session_manager
        .get_session(&session_id, false)
        .await
        .unwrap();
    assert_eq!(
        session.goose_mode,
        GooseMode::Approve,
        "a refused start_session must not change the loaded manager's settings"
    );
    assert_eq!(session.provider_name.as_deref(), Some("openai"));
}

/// Codex review blocker 3 (melody_surface half): `start_session` must never
/// reconfigure — and so never return — a manager row whose session is not
/// `User`, even if `melody_session_roles` already associates it with this
/// repository (e.g. a pre-fix `_meta.role=manager` on an `Acp` session).
#[tokio::test]
async fn start_session_refuses_a_non_user_manager_row() {
    let temp_dir = TempDir::new().unwrap();
    let repo_dir = temp_dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).unwrap();
    let data_dir = temp_dir.path().join("data");

    let session_manager = Arc::new(SessionManager::new(data_dir));
    seed_melody(&session_manager, &repo_dir).await;
    let (_agent_manager, _active_runs, surface) = test_surface(&session_manager).await;

    let bad_manager = session_manager
        .create_session(
            repo_dir.clone(),
            "leaked manager".to_string(),
            SessionType::Acp,
            GooseMode::default(),
        )
        .await
        .unwrap();
    session_manager
        .set_role(&bad_manager.id, SessionRole::Manager, Some(&repo_dir))
        .await
        .unwrap();

    let result = surface
        .start_session(StartSessionArgs {
            repo: repo_dir.clone(),
            task: "fix it".to_string(),
            mode: Some(GooseMode::Approve),
            provider: Some("openai".to_string()),
            model: Some("gpt-4.1".to_string()),
            extensions: Some(vec![]),
        })
        .await;

    assert!(
        matches!(
            result,
            Err(StartSessionError::ManagerNotUser(SessionType::Acp))
        ),
        "start_session must refuse, not reconfigure, a non-User manager row: {result:?}"
    );

    let session = session_manager
        .get_session(&bad_manager.id, false)
        .await
        .unwrap();
    assert_eq!(
        session.session_type,
        SessionType::Acp,
        "a refused start_session must not have changed the mistyped row's session type"
    );
    assert!(
        session.provider_name.is_none(),
        "a refused start_session must not have written its settings onto the mistyped row"
    );
}

/// Codex review blocker 3 (session/new half): `_meta.role` of `melody` or
/// `manager` must be refused on a session that is not `User` — here, an
/// ordinary ACP session (no `client` meta, so not `Hidden` and not `User`).
#[test]
fn session_new_refuses_manager_role_on_a_non_user_session() {
    run_test(async {
        let temp_dir = TempDir::new().unwrap();
        let data_root = temp_dir.path().join("data");
        let work_dir = temp_dir.path().join("work");
        std::fs::create_dir_all(&work_dir).unwrap();

        let conn = new_connection(&data_root).await;

        let result = conn
            .cx()
            .send_request(NewSessionRequest::new(&work_dir).meta(role_meta_no_client("manager")))
            .block_task()
            .await;

        assert!(
            result.is_err(),
            "session/new must refuse _meta.role=manager on a non-User session: {result:?}"
        );

        let session_manager = Arc::new(SessionManager::new(data_root));
        let all_sessions = session_manager.list_all_sessions().await.unwrap();
        for session in &all_sessions {
            let (role, _repository) = session_manager.get_role(&session.id).await.unwrap();
            assert_ne!(
                role,
                SessionRole::Manager,
                "a refused session/new must not have left a manager role behind"
            );
        }
    });
}
