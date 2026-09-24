use crate::agents::Agent;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tokio_util::sync::CancellationToken;

struct ActiveRun {
    run_id: String,
    cancel_token: CancellationToken,
    /// Routes steering from another roaming connection to the run owner.
    agent: Arc<Agent>,
}

struct SessionRunState {
    agent_run: Option<ActiveRun>,
    live_active: bool,
}

pub(crate) enum StartRunError {
    AgentRunExists { run_id: String },
    LiveVoiceInteractionExists,
    LiveVoiceInteractionMissing,
}

#[derive(Default)]
pub struct ActiveRunRegistry {
    runs_by_session: Mutex<HashMap<String, SessionRunState>>,
    /// Serializes ending a run with steering one. The agent's steer queue is
    /// per session, not per run, so an ending run must clear it before its
    /// successor can start, and no steer may land in between.
    transitions: tokio::sync::Mutex<()>,
}

impl ActiveRunRegistry {
    pub(crate) fn start_prompt_run(
        &self,
        session_id: &str,
        run_id: String,
        cancel_token: CancellationToken,
        agent: Arc<Agent>,
    ) -> Result<(), StartRunError> {
        let mut runs = self
            .runs_by_session
            .lock()
            .expect("active run lock poisoned");
        if let Some(state) = runs.get(session_id) {
            if let Some(agent_run) = &state.agent_run {
                return Err(StartRunError::AgentRunExists {
                    run_id: agent_run.run_id.clone(),
                });
            }
            if state.live_active {
                return Err(StartRunError::LiveVoiceInteractionExists);
            }
        }
        runs.insert(
            session_id.to_string(),
            SessionRunState {
                agent_run: Some(ActiveRun {
                    run_id,
                    cancel_token,
                    agent,
                }),
                live_active: false,
            },
        );
        Ok(())
    }

    pub(crate) fn start_live_delegation(
        &self,
        session_id: &str,
        run_id: String,
        cancel_token: CancellationToken,
        agent: Arc<Agent>,
    ) -> Result<(), StartRunError> {
        let mut runs = self
            .runs_by_session
            .lock()
            .expect("active run lock poisoned");
        let Some(state) = runs.get_mut(session_id) else {
            return Err(StartRunError::LiveVoiceInteractionMissing);
        };
        if let Some(agent_run) = &state.agent_run {
            return Err(StartRunError::AgentRunExists {
                run_id: agent_run.run_id.clone(),
            });
        }
        state.agent_run = Some(ActiveRun {
            run_id,
            cancel_token,
            agent,
        });
        Ok(())
    }

    pub(crate) fn agent_run(&self, session_id: &str) -> Option<(String, Arc<Agent>)> {
        self.runs_by_session
            .lock()
            .expect("active run lock poisoned")
            .get(session_id)
            .and_then(|state| state.agent_run.as_ref())
            .map(|run| (run.run_id.clone(), run.agent.clone()))
    }

    pub(crate) fn agent_cancel_token(&self, session_id: &str) -> Option<CancellationToken> {
        self.runs_by_session
            .lock()
            .expect("active run lock poisoned")
            .get(session_id)
            .and_then(|state| state.agent_run.as_ref())
            .map(|run| run.cancel_token.clone())
    }

    pub(crate) fn cancel_agent_run(&self, session_id: &str) {
        if let Some(cancel_token) = self.agent_cancel_token(session_id) {
            cancel_token.cancel();
        }
    }

    /// Ends `run_id` if it still owns the session: discards the session's
    /// pending steers, then removes the run and runs `on_removed` under the
    /// registry lock. A successor can only start once the run is removed, so
    /// it never shares a steer queue with this run's cleanup.
    pub(crate) async fn end_agent_run(
        &self,
        session_id: &str,
        run_id: &str,
        on_removed: impl FnOnce(&Arc<Agent>),
    ) -> Option<Arc<Agent>> {
        let _transition = self.transitions.lock().await;
        let (owner, agent) = self.agent_run(session_id)?;
        if owner != run_id {
            return None;
        }
        agent.discard_pending_steers(session_id).await;
        self.remove_agent_run_and_then(session_id, run_id, on_removed)
    }

    /// Held while checking which run to steer and queueing the steer, so the
    /// steer cannot land between a run's steer discard and its removal.
    pub(crate) async fn lock_steering(&self) -> tokio::sync::MutexGuard<'_, ()> {
        self.transitions.lock().await
    }

    #[cfg(test)]
    pub(crate) fn remove_agent_run(&self, session_id: &str, run_id: &str) -> Option<Arc<Agent>> {
        self.remove_agent_run_and_then(session_id, run_id, |_| {})
    }

    /// Removes the run if `run_id` still owns the session and runs `on_removed`
    /// before releasing the registry lock, so the session's next run cannot
    /// start until the old run's cleanup (unpin, idle announcement) is done.
    pub(crate) fn remove_agent_run_and_then(
        &self,
        session_id: &str,
        run_id: &str,
        on_removed: impl FnOnce(&Arc<Agent>),
    ) -> Option<Arc<Agent>> {
        let mut runs = self
            .runs_by_session
            .lock()
            .expect("active run lock poisoned");
        let state = runs.get_mut(session_id)?;
        if state.agent_run.as_ref()?.run_id != run_id {
            return None;
        }
        let agent = state.agent_run.take()?.agent;
        if !state.live_active {
            runs.remove(session_id);
        }
        on_removed(&agent);
        Some(agent)
    }

    pub(crate) fn start_live(&self, session_id: &str) -> bool {
        let mut runs = self
            .runs_by_session
            .lock()
            .expect("active run lock poisoned");
        if runs.contains_key(session_id) {
            return false;
        }
        runs.insert(
            session_id.to_string(),
            SessionRunState {
                agent_run: None,
                live_active: true,
            },
        );
        true
    }

    pub(crate) fn finish_live(&self, session_id: &str) {
        let mut runs = self
            .runs_by_session
            .lock()
            .expect("active run lock poisoned");
        if let Some(state) = runs.get_mut(session_id) {
            state.live_active = false;
            if state.agent_run.is_none() {
                runs.remove(session_id);
            }
        }
    }

    pub(crate) fn is_active(&self, session_id: &str) -> bool {
        self.runs_by_session
            .lock()
            .expect("active run lock poisoned")
            .contains_key(session_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn live_runs_are_scoped_by_session() {
        let registry = ActiveRunRegistry::default();

        assert!(registry.start_live("one"));
        assert!(!registry.start_live("one"));
        assert!(registry.start_live("two"));

        registry.finish_live("one");
        assert!(registry.start_live("one"));
    }

    #[tokio::test]
    async fn prompt_and_live_runs_conflict() {
        let registry = ActiveRunRegistry::default();

        assert!(registry
            .start_prompt_run(
                "session",
                "run".into(),
                CancellationToken::new(),
                Arc::new(Agent::new()),
            )
            .is_ok());
        assert!(!registry.start_live("session"));

        registry.remove_agent_run("session", "run");
        assert!(registry.start_live("session"));
        assert!(matches!(
            registry.start_prompt_run(
                "session",
                "run".into(),
                CancellationToken::new(),
                Arc::new(Agent::new()),
            ),
            Err(StartRunError::LiveVoiceInteractionExists)
        ));
    }

    #[tokio::test]
    async fn task181_next_run_waits_for_the_old_runs_cleanup() {
        let registry = Arc::new(ActiveRunRegistry::default());
        let agent = Arc::new(Agent::new());
        assert!(registry
            .start_prompt_run(
                "session",
                "old".into(),
                CancellationToken::new(),
                agent.clone(),
            )
            .is_ok());

        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let mut next_run = None;
        let removed = registry.remove_agent_run_and_then("session", "old", |_| {
            let registry = registry.clone();
            let agent = agent.clone();
            next_run = Some(std::thread::spawn(move || {
                let started = registry
                    .start_prompt_run("session", "new".into(), CancellationToken::new(), agent)
                    .is_ok();
                started_tx.send(started).unwrap();
            }));
            assert!(
                started_rx
                    .recv_timeout(std::time::Duration::from_millis(200))
                    .is_err(),
                "the next run must not start while the old run is still cleaning up"
            );
        });
        assert!(removed.is_some());
        next_run.unwrap().join().unwrap();
        assert!(started_rx.recv().unwrap());
        assert!(
            registry
                .remove_agent_run_and_then("session", "old", |_| panic!("stale cleanup ran"))
                .is_none(),
            "a finished run's cleanup must not touch the next run"
        );
        assert_eq!(
            registry.agent_run("session").map(|(run_id, _)| run_id),
            Some("new".into())
        );
    }

    fn steer_texts(steers: Vec<crate::conversation::message::Message>) -> Vec<String> {
        steers
            .iter()
            .map(|message| message.as_concat_text())
            .collect()
    }

    #[tokio::test]
    async fn task181_steer_for_the_next_run_survives_the_old_runs_cleanup() {
        use crate::conversation::message::Message;
        let registry = ActiveRunRegistry::default();
        let agent = Arc::new(Agent::new());
        assert!(registry
            .start_prompt_run(
                "session",
                "old".into(),
                CancellationToken::new(),
                agent.clone()
            )
            .is_ok());
        agent
            .steer("session", Message::user().with_text("for the old run"))
            .await;

        let ended = registry
            .end_agent_run("session", "old", |agent| {
                let old_steer_left =
                    futures::executor::block_on(agent.has_pending_steers("session"));
                assert!(
                    !old_steer_left,
                    "the old run's steers must be gone before a successor can start"
                );
            })
            .await;
        assert!(ended.is_some());

        assert!(registry
            .start_prompt_run(
                "session",
                "new".into(),
                CancellationToken::new(),
                agent.clone()
            )
            .is_ok());
        {
            let _steering = registry.lock_steering().await;
            agent
                .steer("session", Message::user().with_text("for the new run"))
                .await;
        }
        assert!(
            registry
                .end_agent_run("session", "old", |_| panic!("stale cleanup ran"))
                .await
                .is_none(),
            "a finished run's late cleanup must not end its successor"
        );

        assert_eq!(
            steer_texts(agent.drain_pending_steers("session").await),
            vec!["for the new run".to_string()]
        );
    }

    #[tokio::test]
    async fn task181_steering_waits_for_a_run_that_is_ending() {
        let registry = Arc::new(ActiveRunRegistry::default());
        let steering = registry.lock_steering().await;
        let ending = tokio::spawn({
            let registry = registry.clone();
            async move { registry.end_agent_run("session", "old", |_| {}).await }
        });
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        assert!(
            !ending.is_finished(),
            "ending a run and steering one must not interleave"
        );
        drop(steering);
        assert!(ending.await.unwrap().is_none());
    }

    #[tokio::test]
    async fn live_delegation_shares_the_live_session_without_admitting_another_prompt() {
        let registry = ActiveRunRegistry::default();
        assert!(registry.start_live("session"));
        assert!(registry
            .start_live_delegation(
                "session",
                "delegated".into(),
                CancellationToken::new(),
                Arc::new(Agent::new()),
            )
            .is_ok());
        assert!(matches!(
            registry.start_prompt_run(
                "session",
                "prompt".into(),
                CancellationToken::new(),
                Arc::new(Agent::new()),
            ),
            Err(StartRunError::AgentRunExists { .. })
        ));

        registry.finish_live("session");
        assert_eq!(
            registry.agent_run("session").map(|(run_id, _)| run_id),
            Some("delegated".into())
        );
    }
}
