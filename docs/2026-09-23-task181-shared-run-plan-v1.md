# Task 181 — a reconnect keeps the running reply — plan

Dated 2026-09-23. M0-b of `docs/2026-09-23-melody-program-plan-v2.md`; task 181 in `tasks.md` (option (b)). Drafted by Codex (gpt-6-astra, read-only — the advisor chain's second rung, because this account's Claude spend limit stopped the first) and checked against the tree by the session. Constraint: nothing in `crates/goose/src/agents/agent.rs` or `state_machine/` changes (`ARCHITECTURE.md:119`); both agent-loop paths are tested (`AGENTS.md` §Agent Loop Migration).

## What's actually broken — two faults, not one

- **Each connection has its own `AgentManager`.** `create_agent()` → `GooseAcpAgent::new()` → `AgentManager::new` per connection (`acp/server.rs:2784`, `server_factory.rs:124`, `server.rs:969`); its per-session creation lock prevents duplicates within one manager only (`execution/manager.rs:127`). The shared `ActiveRunRegistry` (`server_factory.rs:38`, `:134`) holds a run's id, cancel token and `Arc<Agent>`, but no reply history and no subscribers (`execution/active_run.rs:8`).
- **The reply belongs to the prompt request that started it.** `on_prompt` consumes `agent.reply(...)` and `forward_agent_stream` sends through that connection (`acp/server.rs:2409`, `:2251`); when the request future drops, its guard cancels and removes the run (`:266`, `:2373`). So even with one shared manager, a reconnect today *cancels* the run.
- The desktop reconnects by closing and reopening the socket, and `ChatSessionsContainer` reloads every open session (`acpConnection.ts:72`, `ChatSessionsContainer.tsx:44`, `chatSessionController.ts:145`); load re-prepares the session and never subscribes to a run in flight (`load_session.rs:404-467`).

## The change

- **One server-owned `AgentManager`,** built lazily in `server_factory.rs` and passed in through `GooseAcpAgentOptions`; capabilities, transport, subscriptions and `--roam`'s `session_cwd` stay per connection (`server_factory.rs:27`, `:82`; `server.rs:304`, `:330`, `:347`). Agents in an active run are pinned against LRU eviction. Not `AgentManager::instance()` — the orchestrator extension's singleton keeps its own configuration (`execution/manager.rs:65`, `orchestrator.rs:124`).
- **The server owns each run.** A server task builds and consumes the reply stream; the drop guard moves into it; a prompt request only subscribes and awaits the result. Losing a transport removes a subscriber; only completion, an explicit cancel, shutdown or a producer failure ends the run. Resumed turns get the same ownership (`server.rs:2347`, `:2204`, `:259`; `load_session.rs:252`).
- **Replay and subscription.** A delivery record beside the shared registry: run id, ordered events, replay state, subscribers, outcome. Side effects happen once; each subscriber gets notifications rendered for its capabilities; permission callbacks aren't replayed as ordinary events (`server.rs:2218`, `:2251`, `:1647`).
- **Load without gaps.** If a run is active, branch before `prepare_session_for_activation`: capture the replay watermark and install the subscriber atomically, replay history before the active turn, then the turn's output up to the watermark, then everything after. Attaching to a running session applies no recipe, provider, extension or cwd change; an incompatible cwd or MCP change is refused while it runs (`load_session.rs:392`, `:401`, `:408`, `:416`, `:423`, `:467`).
- **Two connections at once** each get their own subscription; either may cancel; close ends every attachment. **Pending permissions** are held centrally with one responding connection, handed over on disconnect — a lost socket is never a "reject". Client-backed filesystem and terminal tools route through the ACP side, not the first socket (`server.rs:1684`, `:1688`, `:1120`, `:2496`, `:2707`).
- **Desktop:** active-run notifications restore streaming or idle and the Stop button without waiting for the lost prompt call; late failures from the old attempt are ignored (`chatSessionStore.ts:230`, `:684`).

## Risks and their controls

- concurrency — attach, start, close and configuration changes serialize per session; no lock held across provider work or a network send; tested: completion during replay, two loads at once, a duplicate prompt, close then reload
- memory — shared ownership keeps things longer; subscriber queues bounded, streamed chunks compacted into replay state, a finished record released after it's persisted; an explicit overflow outcome, never a silently dropped chunk
- one connection's settings leaking to another — the session-name sender and extension overrides capture a connection today (`execution/manager.rs:115`, `:198`; `server.rs:1072`); they route through shared delivery; a watching connection can't change the running session's tools
- upstream merges — changes stay in the ACP layer and execution ownership; filing upstream is the user's call (an upstream PR needs a Ready issue, `AGENTS.md:9`)

## Tasks (become 197–200 in `tasks.md` on approval)

- **197. One server-owned AgentManager; running agents pinned.** `server_factory.rs:124`, `server.rs:969`, `execution/manager.rs:274`.
  - confirm: `cargo test -p goose --lib task181_shared_ownership` → 3 passed (one agent across two connections; concurrent creation makes one; an agent in a run survives eviction) — the new assertions fail on today's tree
  - worker: high
- **198. The server owns the run; a load re-attaches without gaps.** Prompt/resume ownership, the delivery record, the load branch, permission routing, close/cancel.
  - confirm: `cargo test -p goose --test acp_server_test task181_reconnect` → 2 passed, one per agent loop (a gated provider emits BEFORE; connection A drops; B loads and gets the prefix exactly once, then AFTER and the end; one turn persisted; `Arc::ptr_eq` on the agent) — fails today: the run is cancelled
  - worker: high
- **199. Two clients, cancel, close, permissions, isolation.**
  - confirm: `cargo test -p goose --test acp_server_test task181_multi_connection` → 6 passed (two subscribers see ordered output; cancel from B; permission hand-over; mismatched `--roam` cwd refused; eviction pressure; completion during attach)
  - worker: high
- **200. The desktop recovers, and the walk proves it.** `chatSessionController.ts:145`, `chatSessionStore.ts:230`; the reconnect case in the Agents walk (`tests/e2e/agents-pane.spec.ts`), calling `import('/src/acp/acpConnection.ts').then(m => m.reconnectAcpAfterSystemResume())` mid-turn in the dev walk.
  - confirm: `just walk "reconnect during a Hard turn"` → 1 passed with the parent's reply exactly once (today: the reply never lands, `tasks.md:258`); plus `just smoke`
  - worker: high

A filtered `cargo test` that reports 0 tests is a failure, not a pass. 181 closes when 200's walk passes; M1a is planned at that gate.
