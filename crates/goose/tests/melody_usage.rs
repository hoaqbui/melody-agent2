use goose::config::GooseMode;
use goose::conversation::message::MessageUsage;
use goose::providers::base::CostSource;
use goose::session::session_manager::{DB_NAME, SESSIONS_FOLDER};
use goose::session::{SessionManager, SessionRole, SessionType};
use goose_providers::conversation::token_usage::Usage;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use std::path::Path;
use tempfile::TempDir;

async fn open_raw_pool(data_dir: &Path) -> Pool<Sqlite> {
    let db_path = data_dir.join(SESSIONS_FOLDER).join(DB_NAME);
    SqlitePoolOptions::new()
        .connect_with(SqliteConnectOptions::new().filename(&db_path))
        .await
        .unwrap()
}

/// 214: every recorded model call names its seat (provider), even for a
/// manager session no desktop window has open. The manager's turn here
/// runs on a stub provider and is never rendered anywhere — the row must
/// still land in `usage_ledger`, carry `stub` in the fork-owned
/// `melody_usage_provider` side table, and be joinable back to its role
/// (`manager`) and its parent (the one `melody` session), exactly the way
/// 206's `set_role`/`get_or_create_manager` wire a manager under Melody.
#[tokio::test]
async fn manager_turn_on_stub_provider_names_its_seat() {
    let temp_dir = TempDir::new().unwrap();
    let data_dir = temp_dir.path().join("data");
    let repo_dir = temp_dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).unwrap();

    let sm = SessionManager::new(data_dir.clone());

    let melody = sm
        .create_session(
            repo_dir.clone(),
            "Melody".to_string(),
            SessionType::User,
            GooseMode::default(),
        )
        .await
        .unwrap();
    sm.set_role(&melody.id, SessionRole::Melody, None)
        .await
        .unwrap();

    let manager_id = sm
        .get_or_create_manager(&repo_dir, "Manager")
        .await
        .unwrap();
    sm.update(&manager_id)
        .parent_session_id(Some(melody.id.clone()))
        .provider_name("stub")
        .apply()
        .await
        .unwrap();

    let ledger = MessageUsage {
        input_tokens: Some(120),
        output_tokens: Some(45),
        total_tokens: Some(165),
        cost: Some(0.02),
        cost_source: Some(CostSource::Estimated),
        ..Default::default()
    };

    sm.record_usage_metrics(
        &manager_id,
        None,
        Usage::new(Some(120), Some(45), Some(165)),
        "stub-model",
        &ledger,
    )
    .await
    .unwrap();

    // One join, literally the query 215's work-ledger row needs: a usage
    // row's provider, tied back to its session's role and its parent
    // Melody session, in a single statement rather than separate API
    // calls that only prove the pieces exist independently.
    type UsageJoinRow = (
        Option<String>,
        Option<i32>,
        Option<i32>,
        Option<i32>,
        String,
        String,
        Option<String>,
    );

    let pool = open_raw_pool(&data_dir).await;
    let (model, input_tokens, output_tokens, total_tokens, provider, role, parent_session_id): UsageJoinRow = sqlx::query_as(
        r#"
        SELECT u.model, u.input_tokens, u.output_tokens, u.total_tokens,
               p.provider, r.role, s.parent_session_id
        FROM usage_ledger u
        JOIN melody_usage_provider p ON p.usage_ledger_id = u.id
        JOIN melody_session_roles r ON r.session_id = u.session_id
        JOIN sessions s ON s.id = u.session_id
        WHERE u.session_id = ?
        "#,
    )
    .bind(&manager_id)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(provider, "stub");
    assert_eq!(model.as_deref(), Some("stub-model"));
    assert_eq!(input_tokens, Some(120));
    assert_eq!(output_tokens, Some(45));
    assert_eq!(total_tokens, Some(165));
    assert_eq!(role, "manager");
    assert_eq!(parent_session_id.as_deref(), Some(melody.id.as_str()));
}
