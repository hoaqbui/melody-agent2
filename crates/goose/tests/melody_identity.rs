use goose::config::GooseMode;
use goose::session::{SessionManager, SessionRole, SessionType};
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

#[tokio::test]
async fn role_and_repository_survive_reopening_the_store() {
    let temp_dir = TempDir::new().unwrap();
    let data_dir = temp_dir.path().join("data");

    let session_id = {
        let sm = SessionManager::new(data_dir.clone());
        let session = sm
            .create_session(
                temp_dir.path().to_path_buf(),
                "Manager for repo-x".to_string(),
                SessionType::User,
                GooseMode::default(),
            )
            .await
            .unwrap();

        sm.set_role(
            &session.id,
            SessionRole::Manager,
            Some("repo-x".to_string()),
        )
        .await
        .unwrap();

        let (role, repository) = sm.get_role(&session.id).await.unwrap();
        assert_eq!(role, SessionRole::Manager);
        assert_eq!(repository.as_deref(), Some("repo-x"));

        session.id
    };

    // Reopen a fresh SessionManager against the same data directory to
    // prove the role and repository were persisted, not held in memory.
    let reopened = SessionManager::new(data_dir);
    let (role, repository) = reopened.get_role(&session_id).await.unwrap();
    assert_eq!(role, SessionRole::Manager);
    assert_eq!(repository.as_deref(), Some("repo-x"));

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
    let sm = Arc::new(SessionManager::new(data_dir));
    let repository = repo_canonical.to_string_lossy().to_string();

    let sm_a = Arc::clone(&sm);
    let repository_a = repository.clone();
    let working_dir_a = repo_dir.clone();
    let call_a = tokio::spawn(async move {
        sm_a.get_or_create_manager(&repository_a, "Manager", working_dir_a)
            .await
            .unwrap()
    });

    let sm_b = Arc::clone(&sm);
    let repository_b = repository.clone();
    let working_dir_b = worktree_dir.clone();
    let call_b = tokio::spawn(async move {
        sm_b.get_or_create_manager(&repository_b, "Manager", working_dir_b)
            .await
            .unwrap()
    });

    let (id_a, id_b) = tokio::join!(call_a, call_b);
    let id_a = id_a.unwrap();
    let id_b = id_b.unwrap();
    assert_eq!(id_a, id_b, "two concurrent starts must yield one manager");

    let (role, stored_repository) = sm.get_role(&id_a).await.unwrap();
    assert_eq!(role, SessionRole::Manager);
    assert_eq!(stored_repository.as_deref(), Some(repository.as_str()));

    let sessions = sm.list_all_sessions().await.unwrap();
    let manager_count = sessions.iter().filter(|s| s.id == id_a).count();
    assert_eq!(
        manager_count, 1,
        "the race must not create a second session"
    );
}
