use goose::config::GooseMode;
use goose::session::session_manager::{DB_NAME, SESSIONS_FOLDER};
use goose::session::{SessionManager, SessionRole, SessionType};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Pool, Sqlite};
use std::path::Path;
use std::process::Command;
use std::sync::Arc;
use tempfile::TempDir;

fn init_git_repo(dir: &Path) {
    let run = |args: &[&str]| {
        let status = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .status()
            .expect("git available for test");
        assert!(status.success(), "git {:?} failed", args);
    };

    run(&["init", "--quiet"]);
    run(&["config", "user.email", "melody@example.com"]);
    run(&["config", "user.name", "Melody Test"]);
    std::fs::write(dir.join("README.md"), "test repo\n").unwrap();
    run(&["add", "README.md"]);
    run(&["commit", "--quiet", "-m", "init"]);
}

fn add_git_worktree(repo: &Path, path: &Path) {
    let status = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["worktree", "add", "--detach"])
        .arg(path)
        .status()
        .expect("git available for test");
    assert!(status.success(), "git worktree add failed");
}

async fn open_raw_pool(data_dir: &Path) -> Pool<Sqlite> {
    let db_path = data_dir.join(SESSIONS_FOLDER).join(DB_NAME);
    SqlitePoolOptions::new()
        .connect_with(SqliteConnectOptions::new().filename(&db_path))
        .await
        .unwrap()
}

/// Builds a database file at exactly schema v16 — upstream's `sessions`
/// table (column-for-column as `SessionStorage::create_schema` defines it)
/// plus an empty `messages` table, and nothing the fork ever added. No
/// `melody_session_roles` or `melody_schema_version` table has ever existed
/// in this file, unlike every other test here, which opens a freshly
/// created (and therefore already fork-upgraded) database.
async fn create_v16_only_database(data_dir: &Path) -> String {
    let db_path = data_dir.join(SESSIONS_FOLDER).join(DB_NAME);
    std::fs::create_dir_all(db_path.parent().unwrap()).unwrap();

    let pool = SqlitePoolOptions::new()
        .connect_with(
            SqliteConnectOptions::new()
                .filename(&db_path)
                .create_if_missing(true),
        )
        .await
        .unwrap();

    sqlx::query(
        r#"
        CREATE TABLE schema_version (
            version INTEGER PRIMARY KEY,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query("INSERT INTO schema_version (version) VALUES (16)")
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(
        r#"
        CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            user_set_name BOOLEAN DEFAULT FALSE,
            session_type TEXT NOT NULL DEFAULT 'user',
            working_dir TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            extension_data TEXT DEFAULT '{}',
            total_tokens INTEGER,
            input_tokens INTEGER,
            output_tokens INTEGER,
            cache_read_tokens INTEGER,
            cache_write_tokens INTEGER,
            accumulated_total_tokens INTEGER,
            accumulated_input_tokens INTEGER,
            accumulated_output_tokens INTEGER,
            accumulated_cache_read_tokens INTEGER,
            accumulated_cache_write_tokens INTEGER,
            accumulated_cost REAL,
            schedule_id TEXT,
            recipe_json TEXT,
            user_recipe_values_json TEXT,
            provider_name TEXT,
            model_config_json TEXT,
            goose_mode TEXT NOT NULL DEFAULT 'auto',
            archived_at TIMESTAMP,
            project_id TEXT,
            parent_session_id TEXT
        )
        "#,
    )
    .execute(&pool)
    .await
    .unwrap();

    sqlx::query(
        r#"
        CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT,
            session_id TEXT NOT NULL REFERENCES sessions(id),
            role TEXT NOT NULL,
            content_json TEXT NOT NULL,
            created_timestamp INTEGER NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            tokens INTEGER,
            metadata_json TEXT
        )
        "#,
    )
    .execute(&pool)
    .await
    .unwrap();

    let session_id = "pre_fork_1".to_string();
    sqlx::query(
        "INSERT INTO sessions (id, name, user_set_name, session_type, working_dir, extension_data, goose_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&session_id)
    .bind("Pre-fork session")
    .bind(false)
    .bind("user")
    .bind("/tmp")
    .bind("{}")
    .bind("auto")
    .execute(&pool)
    .await
    .unwrap();

    pool.close().await;
    session_id
}

#[tokio::test]
async fn role_and_repository_survive_reopening_the_store() {
    let temp_dir = TempDir::new().unwrap();
    let data_dir = temp_dir.path().join("data");

    let expected_repository = SessionManager::canonical_repository(temp_dir.path())
        .await
        .unwrap()
        .to_string_lossy()
        .into_owned();

    let session_id = {
        let sm = SessionManager::new(data_dir.clone());
        let session = sm
            .create_session(
                temp_dir.path().to_path_buf(),
                "Manager session".to_string(),
                SessionType::User,
                GooseMode::default(),
            )
            .await
            .unwrap();

        sm.set_role(&session.id, SessionRole::Manager, Some(temp_dir.path()))
            .await
            .unwrap();

        let (role, repository) = sm.get_role(&session.id).await.unwrap();
        assert_eq!(role, SessionRole::Manager);
        assert_eq!(repository.as_deref(), Some(expected_repository.as_str()));

        session.id
    };

    // Reopen a fresh SessionManager against the same data directory to
    // prove the role and repository were persisted, not held in memory.
    let reopened = SessionManager::new(data_dir.clone());
    let (role, repository) = reopened.get_role(&session_id).await.unwrap();
    assert_eq!(role, SessionRole::Manager);
    assert_eq!(repository.as_deref(), Some(expected_repository.as_str()));

    // A session with no role row at all reads back as `None`.
    let other = reopened
        .create_session(
            temp_dir.path().to_path_buf(),
            "No role".to_string(),
            SessionType::User,
            GooseMode::default(),
        )
        .await
        .unwrap();
    let (role, repository) = reopened.get_role(&other.id).await.unwrap();
    assert_eq!(role, SessionRole::None);
    assert_eq!(repository, None);
    drop(reopened);

    // Open a third time: the fork's schema step must be idempotent, not
    // just safe to run once after an upgrade.
    let third = SessionManager::new(data_dir.clone());
    third.get_role(&session_id).await.unwrap();
    let pool = open_raw_pool(&data_dir).await;
    let melody_version_rows: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM melody_schema_version")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        melody_version_rows, 1,
        "the fork's schema step must stay a single row across repeated opens"
    );
}

/// A database that predates `melody_session_roles` (any real Melody
/// database created before this task, or upstream's own database opened by
/// Melody for the first time) must upgrade in place the first time it's
/// opened: upstream's own sessions untouched, upstream's own schema version
/// left exactly where it was (206's Codex review: a fork migration must
/// never claim upstream's version namespace, or upstream's next migration
/// would never run), and every session reading back with role `None`
/// rather than erroring on a missing table.
#[tokio::test]
async fn a_v16_database_upgrades_in_place() {
    let temp_dir = TempDir::new().unwrap();
    let data_dir = temp_dir.path().join("data");
    let session_id = create_v16_only_database(&data_dir).await;

    let reopened = SessionManager::new(data_dir.clone());
    let session = reopened.get_session(&session_id, false).await.unwrap();
    assert_eq!(session.name, "Pre-fork session");

    let (role, repository) = reopened.get_role(&session_id).await.unwrap();
    assert_eq!(role, SessionRole::None);
    assert_eq!(repository, None);

    let pool = open_raw_pool(&data_dir).await;
    let upstream_version: i32 = sqlx::query_scalar("SELECT MAX(version) FROM schema_version")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(
        upstream_version, 16,
        "the fork's schema step must never touch upstream's own version"
    );
    let melody_version: i32 = sqlx::query_scalar("SELECT MAX(version) FROM melody_schema_version")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(melody_version, 1);
}

#[tokio::test]
async fn deleting_a_session_cascades_its_role_row() {
    let temp_dir = TempDir::new().unwrap();
    let data_dir = temp_dir.path().join("data");
    let sm = SessionManager::new(data_dir.clone());

    let session = sm
        .create_session(
            temp_dir.path().to_path_buf(),
            "Manager session".to_string(),
            SessionType::User,
            GooseMode::default(),
        )
        .await
        .unwrap();
    sm.set_role(&session.id, SessionRole::Manager, Some(temp_dir.path()))
        .await
        .unwrap();

    sm.delete_session(&session.id).await.unwrap();

    let pool = open_raw_pool(&data_dir).await;
    let remaining: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM melody_session_roles WHERE session_id = ?")
            .bind(&session.id)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(
        remaining, 0,
        "deleting the session must cascade its role row"
    );
}

#[tokio::test]
async fn a_second_melody_session_is_rejected() {
    let temp_dir = TempDir::new().unwrap();
    let data_dir = temp_dir.path().join("data");
    let sm = SessionManager::new(data_dir);

    let first = sm
        .create_session(
            temp_dir.path().to_path_buf(),
            "First Melody".to_string(),
            SessionType::User,
            GooseMode::default(),
        )
        .await
        .unwrap();
    let second = sm
        .create_session(
            temp_dir.path().to_path_buf(),
            "Second Melody".to_string(),
            SessionType::User,
            GooseMode::default(),
        )
        .await
        .unwrap();

    sm.set_role(&first.id, SessionRole::Melody, None)
        .await
        .unwrap();
    assert_eq!(
        sm.melody_session().await.unwrap().as_deref(),
        Some(first.id.as_str())
    );

    let rejected = sm.set_role(&second.id, SessionRole::Melody, None).await;
    assert!(
        rejected.is_err(),
        "a second session must not be able to claim the melody role"
    );
    assert_eq!(
        sm.melody_session().await.unwrap().as_deref(),
        Some(first.id.as_str())
    );
}

#[tokio::test]
async fn a_manager_with_no_repository_is_rejected() {
    let temp_dir = TempDir::new().unwrap();
    let data_dir = temp_dir.path().join("data");
    let sm = SessionManager::new(data_dir);

    let session = sm
        .create_session(
            temp_dir.path().to_path_buf(),
            "No repository".to_string(),
            SessionType::User,
            GooseMode::default(),
        )
        .await
        .unwrap();

    let rejected = sm.set_role(&session.id, SessionRole::Manager, None).await;
    assert!(
        rejected.is_err(),
        "a manager row must always carry a repository"
    );
}

#[tokio::test]
async fn concurrent_manager_starts_for_one_repository_return_one_id() {
    let temp_dir = TempDir::new().unwrap();
    let repo_dir = temp_dir.path().join("repo");
    std::fs::create_dir_all(&repo_dir).unwrap();
    init_git_repo(&repo_dir);

    // A cwd inside the repository that summon's own delegates use for
    // sandboxing (a plain subdirectory, not a separate `git worktree add`
    // checkout) — it must resolve to the same canonical repository as the
    // repository root itself.
    let worktree_dir = repo_dir.join(".worktrees").join("x");
    std::fs::create_dir_all(&worktree_dir).unwrap();

    let repo_canonical = SessionManager::canonical_repository(&repo_dir)
        .await
        .unwrap();
    let worktree_canonical = SessionManager::canonical_repository(&worktree_dir)
        .await
        .unwrap();
    assert_eq!(
        repo_canonical, worktree_canonical,
        "a .worktrees/<slug> cwd must resolve to its repository's root"
    );

    // A real `git worktree add` checkout (e.g. `.claude/worktrees/<slug>`)
    // has its own toplevel — `--show-toplevel` there returns the linked
    // checkout, not the main one — so it must resolve back to the main
    // repository's root too, the same as the plain subdirectory above.
    let linked_worktree = temp_dir.path().join("linked-worktree");
    add_git_worktree(&repo_dir, &linked_worktree);
    let linked_canonical = SessionManager::canonical_repository(&linked_worktree)
        .await
        .unwrap();
    assert_eq!(
        repo_canonical, linked_canonical,
        "a linked `git worktree add` checkout must resolve to its main repository's root"
    );

    let data_dir = temp_dir.path().join("data");
    let sm = Arc::new(SessionManager::new(data_dir.clone()));

    let sm_a = Arc::clone(&sm);
    let cwd_a = repo_dir.clone();
    let call_a =
        tokio::spawn(async move { sm_a.get_or_create_manager(&cwd_a, "Manager").await.unwrap() });

    let sm_b = Arc::clone(&sm);
    let cwd_b = worktree_dir.clone();
    let call_b =
        tokio::spawn(async move { sm_b.get_or_create_manager(&cwd_b, "Manager").await.unwrap() });

    let sm_c = Arc::clone(&sm);
    let cwd_c = linked_worktree.clone();
    let call_c =
        tokio::spawn(async move { sm_c.get_or_create_manager(&cwd_c, "Manager").await.unwrap() });

    let (id_a, id_b, id_c) = tokio::join!(call_a, call_b, call_c);
    let id_a = id_a.unwrap();
    let id_b = id_b.unwrap();
    let id_c = id_c.unwrap();
    assert_eq!(
        id_a, id_b,
        "the repo root and a plain subdir must share one manager"
    );
    assert_eq!(
        id_a, id_c,
        "the repo root and a linked worktree must share one manager"
    );

    let (role, stored_repository) = sm.get_role(&id_a).await.unwrap();
    assert_eq!(role, SessionRole::Manager);
    assert_eq!(
        stored_repository.as_deref(),
        Some(repo_canonical.to_string_lossy().as_ref())
    );

    // Count every session the race could have created, not just how many
    // happen to share `id_a` — a rogue second manager would have its own,
    // different id, so filtering by `id_a` alone would never see it.
    let total_sessions = sm.list_all_sessions().await.unwrap().len();
    assert_eq!(
        total_sessions, 1,
        "the race must not create a second session"
    );
}
