# Agent activity over the bridge — research map

Dated 2026-09-15 (evening); tree at `9a94f8a74`. Task 27 in `tasks.md`.
Question as asked: how can a bridge-dispatched `delegate` surface in the
parent session as agent activity — a row that appears when the `delegate`
call starts, true not inferred (PRD step 10; PRODUCT.md §11)?
Read-only: no source edits, no task claims.

## The surprise (lead finding)

**On `claude-code` — the decided orchestrator — the parent's `delegate`
call has no row at all, not "a row with no `_meta`".** The task text
assumes the adapter renders the call as an external tool call. That holds
for `claude-acp` only (`acp/provider.rs:947-973` emits an
externally-dispatched `ToolRequest`; `acp/server.rs:1552-1567` sends the
initial `ToolCall`). The print-mode provider yields text deltas
(`providers/claude_code.rs:826-874`), `control_request` permission turns
(`:957`), usage, and drops every other line — `assistant` and `user`
stream messages, where `tool_use`/`tool_result` blocks live, fall to
`_ => {}` (`:1011`). Spike run 1's parent transcript is text only
(`docs/2026-09-15-spine-bridge-spike-v1.md` §Run 1) — consistent.

Consequence: the Agents tree cannot be a tool-call tree hung off the
parent's transcript. It is a **session tree** keyed by the child's
`subagent_session_id` and `parent_session_id`, and its event source has
to be something the bridge dispatch itself emits.

## Reframe trail

1. "How does the bridge forward the child's `notification_stream`?" >
   the bridge drops it, but a row also needs a *start* event, and
   `subagent_tool_request` fires on the child's first tool call, not at
   delegation start (`subagent_handler.rs:218`, `:305-325`) > "What is the
   earliest true event, and who emits it?"
2. "Can the parent's tool-call row be matched to the child by result?" >
   no row on `claude-code`; on `claude-acp` the result is rebuilt from
   `content` and `_meta` is gone (`acp/provider.rs:2039-2079`) > "Does
   the row need a parent tool-call id at all?" — no; the child session id
   is the key.
3. "Does the bridge need the ACP client connection?" > the ACP server
   already holds it process-wide and runs an out-of-turn forwarder
   (`acp/server.rs:358`, `:1306-1341`) > "What is the smallest hand-off
   from bridge to server?"

## Inventory — read this session

Bridge and dispatch:
- `agents/session_bridge.rs:269-288` — `tools/call` awaits
  `dispatched.result` only; `ToolCallResult.notification_stream` is never
  polled. The unpolled receiver (capacity 32, `extension_manager.rs:63`,
  `:2512`) fills and later notifications are dropped by `try_send`
  (`tool_execution.rs:29-32`) — no blocking, just silence.
- `session_bridge.rs:36`, `:83-93` — registry is `session_id →
  Weak<Agent>` only; nothing else is keyed per session.
- `session_bridge.rs:145-148` — `sync_extension` `debug_assert!`s the
  session is not `SubAgent`. `session/load` on a child reaches it via
  `load_session.rs:413` → `prepare_acp_session_agent` →
  `sync_session_bridge` (`acp/server.rs:1168`, `:1177-1195`). The
  desktop's "View subagent session" does exactly that
  (`components/ToolCallWithResponse.tsx:882-889`): debug build panics;
  release registers the child and, when its provider manages its own
  context, writes the bridge entry into the child's stored extensions.
- `extension_manager.rs:2505-2529` — a `tool_call_request_id` (the bridge
  passes a v7 uuid, `session_bridge.rs:272`) is what creates the
  per-call notification channel and a `ToolCallNotificationEmitter`.

Summon (the producer):
- `summon.rs:1388-1391` — `task_config` (provider, model) is resolved
  *before* the child session exists.
- `summon.rs:610-636`, `:1406-1411` — child `SubAgent` session created
  and `parent_session_id` linked before the run starts.
- `summon.rs:1423-1431`, `:640-644`, `:654-681` — the child's
  notifications route to the caller's emitter (`Emitter`) or a buffer
  (`Buffer`) when no emitter; `handle_delegate` has the emitter in hand
  from `call_tool` (`:2180-2204`).
- `summon.rs:1433-1447` — `_meta.subagent_session_id` on the result,
  success and error alike; `:1020` and `:1377` — same key on the async
  path.
- `platform_extensions/mod.rs:261-290` — `result_with_platform_notification`
  puts a `platform_event` under `_meta.platform_notification`; both loops
  turn it into an `McpNotification` (`agent.rs:2939-2948`,
  `state_machine/ops_toolcalling.rs:61-62`, `:971-976`). Parity already
  holds for result-time events; no loop edit is needed for any option
  below.
- `subagent_handler.rs:305-325` — `subagent_tool_request` is a
  `LoggingMessageNotification` with `subagent_id` = child session id;
  emitted per child tool request (`:218`).
- `subagent_execution_tool/notification_events.rs:28-32` —
  `tasks_update` has no production caller (`rg 'tasks_update\('` outside
  that file: none).

ACP server and wire:
- `acp/server.rs:2235-2241` — live `McpNotification` → `tool_call_update`
  with `_meta.toolNotification` (`server/tool_notifications.rs:31-69`);
  `platform_event` custom notifications map at `:45-48`. This path needs
  a Goose tool-call id, which a bridge dispatch's parent turn never has.
- `acp/server.rs:358`, `server/dispatch.rs:24` — `client_cx:
  OnceCell<ConnectionTo<Client>>` set once per connection, before any
  session request.
- `acp/server.rs:1276-1286`, `:1288-1304`, `:1306-1341` — the
  thinking-effort forwarder: a session subscribes at
  `register_acp_session`, pushes a session id into a server-owned mpsc, a
  task started at connection time forwards to `cx`. This is the
  out-of-turn push pattern the pick reuses.
- `acp/server.rs:878-883`, `ui/desktop/src/acp/acpConnection.ts:153` —
  custom notifications are gated on `goose.customNotifications`, which
  the desktop declares.
- `goose-sdk-types/src/custom_notifications.rs:8-36` —
  `_goose/unstable/session/update` carries `GooseSessionUpdate`
  (`usage_update | status_message | message_usage`); new variants need
  the discriminator mapping (`:24-31`) and a regenerated client
  (`justfile:169-177`; CI diffs `ui/goose-acp-client/src/generated/`,
  `justfile:159`).
- `ui/desktop/src/acp/sessionNotificationAdapter.ts:109-113` — the
  renderer's handler for custom updates; `usage_update` returns `[]`,
  default returns `[]`. `chatNotifications.ts:49-54` routes them.
- `acp/server/list_sessions.rs:52-74`, `acp/server.rs:140-141` —
  `session/list` refuses any type outside `user | scheduled | acp`;
  `sub_agent` children are invisible to the client.
- `acp/response_builder.rs:30-48` — `SessionMeta` carries `session_type`,
  `provider_id`, `model_id`, no `parent_session_id`.
- `session/session_manager.rs:95`, `:1113`, `:2394-2399` — the column and
  index exist; the only query over the link is the recursive usage CTE.
  No "children of" read exists.

Adapter side (`claude-acp`, for completeness):
- `acp/provider.rs:1286-1338`, `:1339-1385` — adapter `ToolCall` /
  `ToolCallUpdate` accumulate into `ToolCallStart` / `ToolCallComplete`;
  `name` is the adapter's `title`, not the MCP tool name (`:1310-1315`).
- `acp/provider.rs:1000-1010`, `:2039-2079` — the tool response is
  rebuilt from `content` blocks, `raw_output` only as text when content
  is empty; `_meta` does not survive.

CLI path (task 9):
- `goose-cli/src/session/builder.rs:656-673`, `:736-740` — registers the
  session and hands the provider the bridge entry; no ACP client, no
  subscriber. Anything the bridge publishes here has no receiver.

## Recorded decisions

- Hooks are not an in-process bus — `type: "command"` only
  (`hooks/mod.rs:22`, `:149`); rejected as an event source.
- A synthetic `ToolRequest`/`ToolResponse` written into the parent's
  conversation from the bridge — rejected: the turn's own persistence
  owns the conversation, and it edits nothing under `agent.rs` /
  `state_machine/` (`ARCHITECTURE.md` §Invariants).
- `tasks_update` as the row source (PRODUCT.md §11 wording) — rejected:
  no caller (`notification_events.rs:28-32`); the §11 line is corrected
  by this pick, not implemented.
- The bridge reaching `ConnectionTo<Client>` itself — rejected: the
  server already holds it (`acp/server.rs:358`); the bridge stays
  transport-agnostic so the CLI keeps loading it.

## Options → pick

| Option | Owns | Trades away |
|---|---|---|
| **(a) bridge publishes; ACP server forwards** — the bridge registry gains a per-session `broadcast::Sender<ServerNotification>` beside `Weak<Agent>`; `tools/call` routes the dispatched `notification_stream` plus one terminal event built from the `CallToolResult` (`_meta.subagent_session_id`, `is_error`) into it; summon emits a `platform_event` `delegate_started` through its emitter right after `create_subagent_session`; the ACP server subscribes at `register_acp_session` and forwards as a new `GooseSessionUpdate::DelegationUpdate` on `_goose/unstable/session/update` | true start / tool-activity / end events, keyed by child session id; live on desktop and phone (same ACP client); the native Goose loop gets the same `delegate_started` for free via `_meta.toolNotification` (`tool_notifications.rs:45`, `toolNotifications.ts:19-25`) | a schema variant + client regen; one more thing the bridge owns; lossy under lag (broadcast drops oldest — same class as today's 32-cap `try_send`) |
| (b) `_goose/unstable/session/children` polled by the renderer — one `SELECT … WHERE parent_session_id = ?` (index `session_manager.rs:1113`); rows from the child session record (`provider_name`, `model_config`, `name`, `updated_at`, `message_count`) | works on the CLI path with nothing extra; survives reconnect; no wire variant | status is inferred (`message_count` / `updated_at`), never "waiting" vs "running" vs "failed"; no tool activity; polling on a phone tab |
| (c) match the adapter's `delegate` row to the child by the result payload | nothing beyond what lands today | dead on `claude-code` (no row, `claude_code.rs:1011`); on `claude-acp` `_meta` is stripped (`acp/provider.rs:2039-2079`) and the match is end-time, never start-time |

Pick: **(a)**, with (b)'s single read folded in as the reload path (not a
second pick) — on `session/load` and on reconnect the Agents pane
rebuilds from the children query, then live events take over. (b) alone
fails the card ("true, not inferred"); (c) is dead on both paths.

- consequence: the Agents tree is keyed by `subagent_session_id`; a
  parent tool-call id is optional metadata, present only on `claude-acp`.
- consequence: the `delegate_started` payload is the "payload piece"
  commit `9a94f8a74` handed here — `subagent_session_id`,
  `parent_session_id`, `source` (role file), `provider`, `model`, a task
  title (first line of `instructions`), `status: running`; the terminal
  event carries `status: done | failed` and the error text. Task 5's
  roll fills `provider`/`model` from the picked entry; until it lands
  they come from `task_config` (`summon.rs:1388-1391`).
- consequence: `status: waiting` (PRD step 10) has no producer today —
  summon runs the child immediately; the row starts at `running` unless
  the async path (`summon.rs:2035`) is used. Record as partial state.
- consequence: on the CLI path the broadcast has no receiver — the
  bridge's `send` errs and is ignored; children exist in the DB and (b)'s
  read is the only view. This is the required degrade.
- consequence: PRODUCT.md §11's "view over `tasks_update`" line is wrong
  and gets corrected in the plan's doc edit.

## Scope — in / out / protected

- in (plan skeleton, in dependency order):
  `crates/goose/src/agents/platform_extensions/summon.rs` (emit
  `delegate_started` after `:1406-1411`; both sync and async paths);
  `crates/goose/src/agents/session_bridge.rs` (registry entry gains a
  sender; `tools/call` routes `notification_stream` and the terminal
  event; `subscribe(session_id)` for the server);
  `crates/goose-sdk-types/src/custom_notifications.rs` (variant +
  discriminator mapping) and `just generate-acp-types`;
  `crates/goose/src/acp/server.rs` (subscribe at `register_acp_session`,
  forward via the `client_cx` forwarder pattern, gated on
  `supports_goose_custom_notifications`);
  `crates/goose/src/session/session_manager.rs` +
  `goose-sdk-types/src/custom_requests.rs` (one children read);
  `ui/desktop/src/acp/sessionNotificationAdapter.ts` (handler; the
  Agents pane consumes through `src/acp` only — task 4's depcruise
  rule).
- out: any edit to `agent.rs` / `state_machine/` (parity already holds
  at `agent.rs:2939-2965` and `ops_toolcalling.rs:971-987`);
  `tasks_update` and `TaskInfo` (no caller; not revived); the async
  `delegate` UI (`load(peek)` in-memory registries, `summon.rs:576`);
  approval forwarding to children (every child runs Auto, bridge plan
  §Out of scope); `claude-acp` row-to-child matching (dead, above).
- protected: task 28's transcript click-through must not activate a
  child through `session/load` as landed — `sync_extension`'s
  `debug_assert!` (`session_bridge.rs:145-148`) fires; the plan either
  early-returns for `SubAgent` there or reads the child read-only through
  a new `_goose/*` read. Either way `scripts/check-spine.sh` stays
  `spine clean`.

## Unknowns

- Is broadcast lag-drop acceptable for the Agents row, or does the
  terminal event need a guaranteed slot (e.g. send it on the result path
  after draining)? — cheap to test? yes (unit test on the bridge);
  reversible? yes.
- Does `claude` print mode keep the bridge `tools/call` open for a
  multi-minute delegation without `MCP_TOOL_TIMEOUT` (spike §Run 1 set it
  pre-emptively)? If it times out, the terminal event fires with the
  client gone, but the child continues — the row must not claim `failed`
  from a dropped request alone. — cheap to test? yes (task 9's matrix);
  reversible? yes.
- What `title` does `claude-agent-acp` give an MCP tool call (the
  optional parent-row metadata on `claude-acp`)? — cheap to test? yes;
  reversible? n/a (cosmetic).
- Whether the phone shell (task 19/20) receives `_goose/unstable/*`
  through the sidecar unchanged — it is the same ACP stream, so probably
  yes; "probably" is a finding. — cheap to test? yes once task 20's URL
  exists; reversible? yes.
- Whether `session/load` of a child in a release build has already
  written a bridge entry into any child's `extension_data` on this Mac
  (the spike ran the desktop's "View subagent session"? not recorded).
  — cheap to test? yes (`sqlite3 sessions.db`); reversible? yes.
