# Goose spine bridge — plan

<!-- Downstream of docs/2026-09-15-goose-spine-research-v1.md and the
     fork research's evening addendum + correction (direction A picked
     2026-09-15 20:10); upstream of implement. The task list is the
     approval surface. -->

Dated 2026-09-15. Companion: spine research v1, fork research v1
§Addendum (evening) + §Correction, `ARCHITECTURE.md` §Invariants.
Ships the two spine repairs that let a subscription runtime
orchestrate through Goose — (ii) `delegate` reachable from
`claude-code` / ACP adapters, (i) role bodies reaching ACP workers —
plus the proof run > one PR.

## Approach

- **(i) Role body → ACP worker, in the summon path, not the
  provider.** `AcpProvider::stream` drops `_system`
  (`crates/goose/src/acp/provider.rs:820-825`) and `session/new`
  carries no prompt field, so the only channel to an ACP child is its
  first user prompt. `subagent_handler::get_agent_messages` already
  holds both halves — the rendered role prompt
  (`build_subagent_prompt`, `:164-166`) and the task
  (`Message::user().with_text(user_task)`, `:170`) — so the fold
  happens there, gated by a new `Provider::accepts_system_prompt()`
  (default `true`; `AcpProvider` returns `false`). `claude-code`
  keeps `--system-prompt-file` (`providers/claude_code.rs:378`) and
  is untouched. One trait method, one branch, one test.
- **(ii) A process-local session bridge, not a `goose serve` route.**
  Goose already forwards `Stdio` / `StreamableHttp` extensions to
  adapters instead of loading them itself when the provider
  `manages_own_context()` (`agents/agent.rs:1268-1280`;
  `acp/provider.rs:1843`; `claude_code.rs:541-580`). So the whole
  export is: one `ExtensionConfig::StreamableHttp` per session whose
  `uri` is a loopback MCP endpoint that dispatches `tools/call` into
  that session's `ExtensionManager` (`extension_manager.rs:2407`,
  `ToolCallContext::new(session_id, working_dir, None)`,
  `tool_execution.rs:34-55`). The listener lives in
  `crates/goose` (`axum` is already a dependency, `Cargo.toml:122`)
  and starts lazily in whichever process owns the session — `goose
  serve` (desktop), `goose session` (CLI, task 9), `goose acp` — so
  the proof does not depend on tranche 4. A `goose serve` route was
  the alternative: reuses the existing listener and token
  (`acp/transport/auth.rs`) but serves only the desktop path and needs
  `AcpServer` to carry a session → agent registry; rejected for
  coverage, recorded here so nobody re-derives it.
- **Injection is a reconcile, because the provider is built before
  its session is known.** Providers get the session's stored
  extension list at construction (`agent.rs:3771-3783`, `:3665-3676`;
  `AcpProvider` sends `session/new` inside `from_env`,
  `acp/provider.rs:426-445`; `claude-code` writes its MCP config file
  in `from_env`, `claude_code.rs:654-660`) and learn the session id
  only afterwards. Both files are spine. So the ACP server and the CLI
  builder — the two places that activate a top-level session —
  reconcile after the agent exists: provider manages its own context
  and the stored list lacks the bridge entry → append, persist,
  `agent.recreate_provider_for_session` once; native provider and the
  entry is present → remove, persist, recreate. First activation of
  an ACP-adapter session spawns the adapter twice (`session/new` runs
  inside `from_env`); `claude-code` only rewrites its MCP config file,
  its CLI process being a `OnceCell` spawned at first `stream()`
  (`claude_code.rs:269`). Every later activation and every mid-session
  switch reads the stored list — `add_mcp_servers` merges by name
  (`server.rs:547-557`), so a client-sent list never drops the entry. Summon builds
  children's extension lists itself (`summon.rs`, `task_config.extensions`)
  and is not reconciled — a child never sees the bridge, so the
  star topology (`ARCHITECTURE.md` §Invariants) holds by construction.
- **Stateless MCP over HTTP, hand-rolled on rmcp's model types.**
  `POST /mcp/{session_id}` answers `initialize`,
  `notifications/initialized`, `ping`, `tools/list`, `tools/call` as
  JSON (the streamable-HTTP spec's stateless form), auth by
  `X-Secret-Key` with a per-process random secret (constant-time
  compare as `transport/auth.rs:9-13`). rmcp's
  `transport-streamable-http-server` (`Cargo.toml:265`, dev-only) was
  the alternative: its `StreamableHttpService` owns one session
  manager per service and cannot see the path, so per-Goose-session
  routing would need a service per session; rejected for size.
  `tools/call` for `delegate` runs minutes — the request stays open
  and the dispatch's `CancellationToken` is cancelled when the request
  future drops (client gone).
- **The orchestrator's role body enters at session start, not via
  `load`.** `claude-code` is one persistent process whose
  `--system-prompt-file` is fixed at spawn (`claude_code.rs:269`,
  `:684-688`), so Orchestrate mode = the session opens with
  `orchestrator.md`'s body as recipe instructions. Task 11 inherits
  this; the proof run uses a recipe for the same reason.
- **Proof before generalisation.** The last task is the run the
  research asked for (§Unknowns, first): a `claude-code` parent calls
  `delegate`, one linked `claude-acp` child runs, and a token present
  only in the child's role body appears in the child's reply. Its
  findings (MCP tool timeout, whether Claude Code calls `delegate`
  unprompted, permission prompts) are recorded, and tasks 5, 8, 9
  unblock on it.

## Out of scope

- Approval forwarding to delegated children — every child runs `Auto`
  (`summon.rs:622,1400,2075,2373`, in-tree comment); the §5 correction
  in task 25 states it, nothing here changes it (separate upstream
  gap).
- `tasks_update` / `subagent_tool_request` for foreign-adapter
  `delegate` calls (Agents tree, RPI strip) — tranche 5
  (`PRODUCT.md` §11); (ii) makes `delegate` callable, not visible.
- Quota / spawn-failure classification and automatic fail-over —
  research §Fail-over ownership gap; needs its own design after the
  proof run shows real error shapes.
- Exposing `orchestrator.rs`'s `start_agent` (`:670`) — only summon's
  tools cross the bridge (research §Advisor review, fifth).
- `agy` provider parity (task 17 stands on its own; the bridge is not
  injected for print-mode providers that do not forward MCP:
  `gemini_cli.rs` ignores extensions, `:184`, `:212`).
- Any edit to `crates/goose/src/agents/agent.rs` or `state_machine/`
  (`scripts/check-spine.sh`); the reconcile lives in the callers.
- Task 5's `runtimes:` roll — unblocked by this plan, implemented
  under its own entry.

## Tasks

Moved to `tasks.md` under `### docs/2026-09-15-goose-spine-bridge-plan-v1.md`
on 2026-09-15 (approved 2026-09-15 20:40, user "continue" at the gate).
Tasks 21–25; tasks 5, 8, 9 unblock on 24.
