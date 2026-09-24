#![recursion_limit = "256"]
#[allow(dead_code)]
#[path = "acp_common_tests/mod.rs"]
mod common_tests;

use agent_client_protocol::schema::v1::NewSessionRequest;
use common_tests::fixtures::server::AcpServerConnection;
use common_tests::fixtures::{Connection, OpenAiFixture, TestConnectionConfig};
use goose::acp::server::melody_surface::{MelodySurface, StartSessionArgs, StartSessionError};
use goose::agents::{AgentConfig, GoosePlatform};
use goose::config::permission::PermissionManager;
use goose::config::GooseMode;
use goose::execution::manager::AgentManager;
use goose::session::{SessionManager, SessionRole, SessionType};
use std::path::Path;
use std::sync::Arc;
use tempfile::TempDir;

async fn test_surface(session_manager: &Arc<SessionManager>) -> (Arc<AgentManager>, MelodySurface) {
    let agent_config = AgentConfig::new(
        Arc::clone(session_manager),
        PermissionManager::instance(),
        None,
        GooseMode::default(),
        true,
        GoosePlatform::GooseCli,
    );
    let agent_manager = Arc::new(AgentManager::new(agent_config, None).await.unwrap());
    let surface = MelodySurface::new(Arc::clone(session_manager), Arc::clone(&agent_manager));
    (agent_manager, surface)
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
    let (_agent_manager, surface) = test_surface(&session_manager).await;

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
    let (_agent_manager, surface) = test_surface(&session_manager).await;

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

fn role_meta(role: &str) -> serde_json::Map<String, serde_json::Value> {
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
#[tokio::test]
async fn a_session_new_session_appears_in_list_sessions_by_title() {
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

    let (_agent_manager, surface) = test_surface(&session_manager).await;
    let sessions = surface.list_sessions().await.unwrap();
    assert!(
        sessions.iter().any(|s| s.id == ordinary_id && s.title == "Alpha from the UI"),
        "a session created via session/new must appear in Melody's list_sessions by title: {sessions:?}"
    );
}
