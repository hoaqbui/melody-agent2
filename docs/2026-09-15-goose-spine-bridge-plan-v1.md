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

- 21. Fold the rendered role prompt into an ACP child's first user message: add `fn accepts_system_prompt(&self) -> bool { true }` to the `Provider` trait in `crates/goose-provider-types/src/base.rs` (beside `manages_own_context`, `:631`), return `false` from `AcpProvider` in `crates/goose/src/acp/provider.rs` (beside `:803`), and in `crates/goose/src/agents/subagent_handler.rs` build the first user message as `subagent_prompt` + `"\n\n---\n\n"` + `user_task` when `task_config.provider.accepts_system_prompt()` is false (pure helper `first_user_message(accepts_system_prompt, subagent_prompt, user_task) -> Message`, called at `:170`).
  - status: todo · agent: — · worker: medium
  - card: as a delegated worker on an ACP runtime, receive the role I was summoned as so that `.agents/agents/*.md` bodies are the contract on every runtime, not only print-mode ones (spine research §Critical: role instruction gap)
  - context:
    - `override_system_prompt(subagent_prompt)` at `subagent_handler.rs:167` stays — Goose-native and `claude-code` children keep reading it; the fold is additive for providers that drop `_system`
    - `claude-code` (`claude_code.rs:680` `manages_own_context` true) still passes the system prompt via `--system-prompt-file` (`:378`) — do not key the fold on `manages_own_context`; that is why the new method exists
    - the conversation persisted for the child (`:171` `Conversation::new_unvalidated`) carries the folded message — the transcript then shows the role, which is what task 24 checks
    - tests beside `subagent_handler.rs:319` `#[cfg(test)]`: `subagent_first_prompt_carries_role_body_when_system_is_dropped` (false → text starts with the role prompt and ends with the task) and `subagent_first_prompt_is_the_task_when_system_is_accepted` (true → text equals the task)
    - upstream-shaped: file a Ready issue against `aaif-goose/goose` naming `acp/provider.rs:820`; do not wait on it
  - confirm: `source bin/activate-hermit && cargo test -p goose --lib subagent_first_prompt 2>&1 | grep -E 'test result: ok\. 2 passed'; echo exit=$?` → the `test result` line, then `exit=0` (untouched tree: no match, `exit=1`)

- 22. Add `crates/goose/src/agents/session_bridge.rs` (registered in `agents/mod.rs`): a lazily started loopback `axum` listener (`127.0.0.1:0`, per-process random secret) serving `POST /mcp/{session_id}` as stateless MCP JSON-RPC — `initialize`, `notifications/initialized` (202), `ping`, `tools/list` (the session agent's tools whose extension is `summon`, published under their unprefixed names), `tools/call` (dispatched through `agent.extension_manager.dispatch_tool_call` with `ToolCallContext::new(session_id, Some(working_dir), None)` and a `CancellationToken` cancelled when the request future drops) — with `SessionBridge::global()`, `register(session_id, Weak<Agent>, working_dir)`, `unregister(session_id)`, and `extension_config(session_id) -> ExtensionConfig::StreamableHttp { name: "goose", uri, headers: {"X-Secret-Key": secret} }`.
  - status: todo · agent: — · worker: high
  - card: as an orchestrator running on a subscription runtime, call Goose's `delegate` and `load` so that delegation, child-session lineage and transcripts stay Goose's whatever harness is thinking (spine research §Options → pick; `ARCHITECTURE.md` §Modules, spine)
  - context:
    - auth: `X-Secret-Key` header, constant-time compare (`crates/goose/src/acp/transport/auth.rs:9-13` is the pattern); unknown session → 404; bad or missing secret → 401; bind loopback only, never `0.0.0.0`
    - tool names: `ExtensionManager` prefixes tools `<extension>__<tool>` unless the extension is `unprefixed_tools` (`extension_manager.rs:306-315`, `:2018`); list with `agent.list_tools(session_id, Some("summon"))` (as `subagent_handler.rs:252-257`) and map the public name back to the registered name on call — the confirm pins the public name `delegate`
    - JSON-RPC and MCP types from `rmcp::model` (already a dependency, `Cargo.toml:88`); no new crate, no new Cargo feature; responses are `application/json`, no SSE
    - `dispatch_tool_call` returns `ToolCallResult` (`extension_manager.rs:2407-2415`); map its content to `CallToolResult`, errors to `is_error: true`
    - a child session must never reach the bridge: registration is only called from task 23's two top-level paths; the module holds no summon-side hook
    - no CORS layer: a browser cannot send `X-Secret-Key` without a preflight the listener never answers, so a page on the tailnet or elsewhere cannot reach the bridge even with the secret
    - listener lifetime is the process; `Weak<Agent>` so an evicted agent (`execution/manager.rs` LRU) yields 404, not a leak
    - tests in-module: `session_bridge_rejects_unknown_session_and_bad_secret` (404 / 401 via a `reqwest` or `axum::body` call against the bound port) and `session_bridge_lists_delegate_for_registered_session` (an `Agent::new()` as `crates/goose/tests/compaction.rs:260`, then `agent.add_extension(ExtensionConfig::Platform { name: "summon", .. }, &session_id)` as `crates/goose/tests/agent.rs:135` — a bare agent carries no platform extensions (`extension_manager.rs:1601-1622`); `tools/list` names include `delegate`)
    - upstream-shaped: file a Ready issue ("expose a session's platform tools to ACP/CLI providers as an MCP server"); do not wait on it
  - confirm: `source bin/activate-hermit && cargo test -p goose --lib session_bridge 2>&1 | grep -E 'test result: ok\. 2 passed'; echo exit=$?` → the `test result` line, then `exit=0` (untouched tree: no match, `exit=1`)

- 23. Reconcile the bridge extension on top-level session activation in both activation paths: in `crates/goose/src/acp/server.rs` `prepare_acp_session_agent` (`:1152-1165`) and `update_provider` (`:2555`), and in `crates/goose-cli/src/session/builder.rs` after `update_provider` (`:799`) — a shared `crate::agents::session_bridge::reconcile(agent, session_manager, session_id)` that: registers the session with the bridge; when `agent.provider().manages_own_context()` and the stored `EnabledExtensionsState` (`session/extension_data.rs:103-133`) has no extension named `goose`, appends `SessionBridge::extension_config(session_id)`, persists it, and calls `agent.recreate_provider_for_session(session_id, provider_name, model_config)` once; when the provider is native and the entry is present, removes it, persists, recreates; unregisters in `on_close_session` (`server.rs:2629`).
  - status: todo · agent: — · worker: high
  - card: as the user, open a session on `claude-code` or any ACP runtime and have `delegate` simply be there — and not be there on a Goose-native provider — so that no provider gets a second copy of its own tools (spine research §Critical: orchestration capability gap)
  - context:
    - why reconcile, not inject-before-create: the provider reads the stored list at construction inside `agent.rs` (`:3771-3783`, `:3665-3676`), which the fork does not edit; the session id is not known to `providers::create_with_working_dir` (`providers/init.rs:276`)
    - the native-provider removal matters: Goose loads `StreamableHttp` extensions itself when the provider does not manage its own context (`agent.rs:1268-1280`), and the bridge's handler would then block on that session's creation lock (`execution/manager.rs:130-160`) until the MCP init timeout
    - `recreate_provider_for_session` is public on `Agent` (`agent.rs:3652`); a `SubAgent` session never passes through either activation path (children are built in `subagent_handler.rs:139-152`) — add a debug assertion that `session.session_type` is not `SubAgent` in `reconcile`
    - the secret rides in the adapter's MCP config: for `claude-code` that is a file under `Paths::state_dir()` (`claude_code.rs:659`, `:607`) — same exposure as `GOOSE_SERVER__SECRET_KEY` in the desktop's `?token=` (`ui/desktop/src/gooseServe.ts:256-258`); note it in the Ready issue, no new mitigation here
    - `on_close_session` today: `server.rs:2629-2640` — unregister beside whatever it drops
    - `goose run` and `goose session` share `build_session` (`cli.rs:2291`, `:2076`; `builder.rs:651`), so the CLI site covers task 24's `goose run`
    - test in `server.rs` tests (pattern `:3630-3660`, stub provider factory): `acp_session_on_own_context_provider_gets_bridge_extension` — factory returns a stub whose `manages_own_context` is true; after `session/new` the stored extensions contain a `StreamableHttp` named `goose` with `uri` starting `http://127.0.0.1:` and ending `/mcp/<session id>`; a second stub with `manages_own_context` false leaves the list without it
  - confirm: `source bin/activate-hermit && cargo test -p goose --lib acp_session_on_own_context_provider 2>&1 | grep -E 'test result: ok\. 1 passed'; echo exit=$?` → the `test result` line, then `exit=0` (untouched tree: no match, `exit=1`); and `bash scripts/check-spine.sh` → `spine clean`

- 24. Run the proof and record it in `docs/2026-09-15-spine-bridge-spike-v1.md`: a throwaway `.agents/agents/spike-echo.md` (`model: claude-sonnet-5`, body: "Begin every reply with the token spike-ok-4127.") and a throwaway recipe `spike.yaml` (instructions: call the `delegate` tool with `source: spike-echo` and the instruction "say hello"; print the child's reply verbatim); run `goose run --recipe spike.yaml --provider claude-code --model claude-opus-5` from the fork root, then `goose session list` / `goose session export` on the child; delete both throwaway files after.
  - status: todo · agent: — · worker: medium
  - card: as the user, see one Claude-first orchestration go parent → `delegate` → linked ACP child → compact result, with the role body provably in the child, so that tasks 5, 8, 9 build on a run, not a reading (spine research §Unknowns, first)
  - context:
    - the child rolls onto `claude-acp` through the role file's `model` only until task 5 lands — set `GOOSE_PROVIDER`-independent routing by passing `provider: claude-acp` in the recipe's delegate instruction, or run the child on `claude-code` first and `claude-acp` second; record both
    - `claude-agent-acp` and `claude` are on PATH (`/opt/homebrew/bin`, 2026-09-15); `codex-acp` is not installed — the Codex child is task 9's, not this task's
    - findings to record, one line each: did Claude Code call `delegate` unprompted or only when told; MCP tool-call timeout hit? (if so, set `MCP_TOOL_TIMEOUT` in the spawned adapter's env — `claude_code.rs` command builder / `acp/provider.rs:1480` — and say which); permission prompts seen on the parent; turns; the child session id and whether its transcript's first user message carries the role body (task 21) and its first reply the token
    - light tier: the confirm is the walk and its record, not a suite
  - confirm: `test -f docs/2026-09-15-spine-bridge-spike-v1.md && grep -c 'spike-ok-4127' docs/2026-09-15-spine-bridge-spike-v1.md && grep -q '^- reached child: yes' docs/2026-09-15-spine-bridge-spike-v1.md && echo ok` → a count ≥ 1, then `ok` (untouched tree: `test -f` fails, nothing printed)

- 25. Correct `PRODUCT.md` §5's gating line to what the tree does.
  - status: todo · agent: — · worker: low
  - card: as a reader of the product doc, learn that every delegated worker runs ungated so that the agy carve-out and the "gated like the other nine" card are not read as guarantees (fork research §Correction, fourth)
  - context:
    - from: "`claude-acp`, `codex-acp` run gated by Goose's modes. `cursor-acp` (ACP mode) is gated; `agy` runs its own tools ungated (print mode) — accepted for V0 at one implementation in ten, with the Reviewer gating the diff. Surfacing agy's approvals is out of scope until its weight rises." / to: "A Direct session on `claude-acp`, `codex-acp`, `cursor-acp` or `claude-code` runs gated by Goose's modes. Every delegated worker runs `Auto` whatever its runtime (`summon.rs:622,1400,2075,2373`; upstream forwards no child approvals yet) — the Reviewer gates the diff, not the mode. Forwarding child approvals is upstream work, out of V0."
    - `PRODUCT.md` line 78 (2026-09-15, `aa44e934e`)
  - confirm: `grep -c 'Every delegated worker runs `Auto`' PRODUCT.md` → `1` (untouched tree: `0`)

Approval gate: tasks 21–25 wait on sign-off. Task 23 is the one that
reverses a visible behaviour (an ACP-adapter session's first
activation spawns the adapter twice; `claude-code` is not respawned). What only the user can verify: task 24's
run draws on the Claude Max subscription and may prompt for
permissions on the parent — the record says what was seen. On
approval the list lands in `tasks.md` (tasks 5, 8, 9 get an
unblock line pointing at 24) and this section keeps only that pointer.
