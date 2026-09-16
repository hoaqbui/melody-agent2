# Server-side runtime fail-over — research map

<!-- Task 32 (tasks.md). Upstream of a fail-over plan; downstream of
     docs/2026-09-15-goose-spine-research-v1.md §Fail-over ownership gap
     and docs/2026-09-15-goose-spine-bridge-plan-v1.md §Out of scope.
     Read-only: no source edits, no task claims. -->

Dated 2026-09-15 (evening; tree at `9a94f8a74`). Question as asked:
"how a session on an adapter that fails to spawn or returns
quota-exhausted moves to the role file's weight-0 runtime with the
handoff memo, owned by `goose serve`, not the shell."

Product lines served: `PRODUCT.md:101`, `:343`, `:423` (the task's
"§17" does not exist — `PRODUCT.md` has fourteen sections; those three
lines are the promise). Adapter cited: `claude-agent-acp` 0.62.0 on
`@anthropic-ai/claude-agent-sdk` 0.3.219, read from
`/opt/homebrew/lib/node_modules` on 2026-09-15.

## The surprise (lead finding)

**The quota rail already exists end to end; nobody feeds it.**
`ProviderError::CreditsExhausted` is the one variant both agent loops
turn into a structured prompt error the ACP server recognises —
legacy loop `agent.rs:3171-3196` → `SystemNotificationType::CreditsExhausted`;
state machine `goose-agent/src/inference.rs:288-294` →
`Message::from_provider_error` → `MessageErrorKind::CreditsExhausted`
(`goose-provider-types/src/conversation/message.rs:262-277`); both
land in `prompt_error_from_message_content` (`acp/server.rs:1694-1722`)
as `data.reason = "credits_exhausted"` (`acp/mod.rs:19-22`), and
`should_retry` refuses to spin on it (`goose-provider-types/src/retry.rs:101-109`).
Meanwhile the ACP provider throws the structure away:
`provider_error_from_acp` maps every non-auth error to `RequestFailed`
(`acp/provider.rs:182-188`), even a `data.reason = credits_exhausted`
it already knows how to read two functions up (`:170-180`). And the
adapter we run sends a categorical kind: `claude-agent-acp` fails the
prompt with `internalError({ errorKind }, text)` where `errorKind ∈
rate_limit | billing_error | overloaded | authentication_failed | …`
(`dist/acp-agent.js:980-985`, `:2277`, `:2313`, `:2323`, `:4412-4414`;
`sdk.d.ts:2901`). Classification is a table in one function, not a
design; and because `CreditsExhausted` is already routed by both
loops, it needs no edit to `agent.rs` or `state_machine/`.

`RateLimitExceeded` is the wrong target for a closed subscription
window: it drops to `MessageErrorKind::Other` (`message.rs:277`) —
invisible to the server — and the legacy loop retries it in place with
backoff before the first item (`agents/reply_parts.rs:415-450`),
burning minutes on a window that resets in hours.

## Reframe trail

1. "How does the server classify quota?" > both loops already route
   `CreditsExhausted` to a prompt error; only `provider_error_from_acp`
   drops the data > "Which adapters send structured data at all?"
2. "Where does the switch live?" > `update_provider` is the full
   switch already (`acp/server.rs:2581-2643`): recreates the provider,
   re-syncs the bridge (`:2640`), drops the old adapter process
   (`acp/provider.rs:1113-1122`) > "What is missing is the trigger and
   the re-run, not the switch."
3. "Does the memo carry partial work?" > after a mid-turn failure the
   conversation tail is tool traffic, and the ACP provider derives the
   next prompt from the *last user-role message* — a tool response
   yields no prompt blocks and an **empty stream**
   (`acp/provider.rs:846-849`, `:1917-1948`, `:1951-1955`; tool
   responses are `Message::user()` at `:997`, `:1008`) > "The re-run
   must rewind to the user prompt, so partial edits leave the
   transcript and survive only on disk."
4. "Who tells the client?" > every provider change already emits
   `ConfigOptionUpdate` (`acp/server.rs:2498-2544`; `server/dispatch.rs:169-174`,
   `:215`) > the divider is a view over an existing notification.

## Inventory — read this session

- `acp/provider.rs:182-188` — `provider_error_from_acp`: `AuthRequired`
  → `Authentication`, everything else → `RequestFailed`. The
  classification gap named by the spine research, confirmed.
- `acp/provider.rs:170-180` — `retry_without_memo_could_help` already
  reads `data.reason == credits_exhausted`; the constant and the
  server-side producer are `acp/mod.rs:19-22`, `acp/server.rs:1725-1745`.
- `acp/provider.rs:1716-1725` — an adapter that dies mid-prompt fails
  `send_request` → `AcpUpdate::Error` → `RequestFailed`; only the text
  distinguishes it (`acp-agent.js:2805`).
- `acp/provider.rs:426-445` — `from_env` spawns the adapter and sends
  `session/new` eagerly; a spawn failure is a provider-creation
  failure, which the server turns into `internal_error` or
  `auth_required` (`acp/server.rs:179-185`; `acp/mod.rs:37`).
- `acp/provider.rs:635-668` — the memo is built on the fallback
  provider's **first** prompt from `messages[..last_user_index]`; it
  needs no fail-over code, only that the fallback be an `AcpProvider`.
  `orchestrator.md`'s weight-0 entry is `cursor-acp`
  (`.agents/agents/orchestrator.md:4-6`), so it holds.
- `acp/server.rs:2285-2394` — `on_prompt` claims one run + cancel
  token (`:2299-2316`), calls `agent.reply` (`:2353-2368`), forwards
  the stream (`:2370-2382`); `forward_agent_stream` returns the prompt
  error before any content is forwarded (`:2196-2200`). A re-run inside
  the same call keeps run id and cancellation intact.
- `acp/server.rs:1157-1170` — `prepare_acp_session_agent` →
  `sync_session_bridge` (`:1177-1196`) is where an adapter session is
  activated; a failure at `session/new` deletes the session
  (`server/new_session.rs:63-72`, `:98-115`).
- `agents/agent.rs:2064`, `:2275-2278`, `:1790-1792` — both loops
  persist the user message before inference; the id is generated
  inside `reply_impl`, so the server never learns it. A re-run of the
  same message duplicates it unless the turn is rewound first.
- `session/session_manager.rs:549-563`, `:2562-2590` —
  `truncate_conversation_from_message` deletes from the named message
  **inclusive**; `truncate_conversation(session_id, timestamp)` is the
  id-free form. The rewind primitive exists.
- `session/session_manager.rs:62-101` — `Session` has `recipe`,
  `provider_name`, `session_type`, `parent_session_id`; no role field.
  Orchestrate = `session/new` with `orchestrator.md`'s body as recipe
  instructions (tasks.md task 11, decided); nothing records *which*
  role file, so the server cannot yet find the weight-0 entry.
- `agents/platform_extensions/summon.rs:1635` — summon titles an agent
  recipe `Agent: {name}`; no other builder in the tree reuses it.
- `providers/claude_code.rs:825-1010` — the print-mode provider matches
  `stream_event | result | error | control_request | system`; no
  `assistant` arm, so the SDK's `assistant.error` kind is never read
  and `result.is_error` collapses to `RequestFailed` text (`:878-915`;
  `cli_common.rs:25-36`).
- `providers/codex.rs:406-423`, `:1147-1162` — upstream's own CLI
  classifier is substring matching: "rate limit" → `RateLimitExceeded`,
  "exceeded your current quota" → `RequestFailed`. Precedent and warning.
- `sdk.d.ts:4250-4258` — the SDK emits `rate_limit_event` (`status:
  rejected`, `resetsAt`, `rateLimitType`); `claude-agent-acp` forwards
  it only as `_meta["_claude/rateLimit"]` on a `usage_update`
  (`acp-agent.js:2756-2766`). A reset time exists before the failure.
- `agents/subagent_handler.rs:47-80`; `summon.rs:1396-1444` — a child
  whose provider fails ends with an error/notification message, and
  `extract_response_text` returns a *success* string ("No text content
  in last message" or the error text); `delegate` only reports
  `Delegation failed` on an `Err` (`:1443`). The orchestrator cannot
  tell a quota-dead child from a quiet one.
- `agents/agent.rs:3239-3255` — the legacy catch-all yields plain text
  for any other variant: a *new* `ProviderError` variant is invisible
  to the server on that path without an `agent.rs` edit.

## Recorded decisions

- Fail-over lives behind `serve`, not the shell — `ARCHITECTURE.md:128`;
  spine research §Fail-over ownership gap ("a disconnected phone must
  not own continuation"). Task 11's selector is the manual form and stays.
- The orchestrator never rolls; weight-0 is a fail-over target only —
  `ARCHITECTURE.md` §Invariants; `PRODUCT.md:101`; `orchestrator.md:44-45`.
- `agent.rs` and `state_machine/` are not edited — `ARCHITECTURE.md`
  §Invariants. Loop-owned fail-over is out before the table.
- Every delegated child runs Auto — `PRODUCT.md:78`; bridge plan §Out
  of scope. Not reopened.
- Auth-required is a sign-in step, not a fail-over — `PRODUCT.md:79`;
  `acp/server.rs:179-185`; `acp/provider.rs:170-173`.

## Options → pick

Axis: who owns the switch. Classification (the table below) is
shared by all three and is not an option.

| Option | Owns | Trades away |
|---|---|---|
| **A. `goose serve` policy in `on_prompt` + activation (recommended)** | trigger, rewind, `update_provider`, re-run under the same run id and cancel token; session record and bridge stay true (`:2581-2643`); memo arrives free on the fallback's first prompt | serve-only (the CLI `goose session` path gets no fail-over); a rewind that drops the failed turn's tool rows; a second adapter spawn inside the prompt |
| B. provider wrapper (`providers/failover.rs`, swaps inside `stream()`) | both loops, CLI, summon children for free (`create_with_working_dir` builds it) | the session record still names the primary (the Runtime selector lies) unless the wrapper also writes sessions it cannot see; explicit `update_provider` semantics blur; the divider needs a synthetic message |
| C. classify only; surface `reason` + the weight-0 entry in the prompt error, client switches | smallest server diff; reuses task 11's manual switch verbatim | the phone owns continuation (rejected above); a background orchestrator stalls until a client reconnects |

Pick: **A**, with the classification landed first as its own task so
the child side (summon, in: 5) shares the same table.

- Classification table, one function replacing `provider_error_from_acp`
  (`acp/provider.rs:182-188`), plus an `assistant` arm in
  `claude_code.rs` (`:825-1010`) reading the same kinds:
  - `data.reason == credits_exhausted` (Goose-as-agent) and `errorKind
    ∈ { rate_limit, billing_error }` (claude-agent-acp) →
    `CreditsExhausted { details, top_up_url: None }` → **fail over**.
  - `errorKind == overloaded | server_error` → `ServerError` →
    existing in-place retry (`retry.rs:103`).
  - `AuthRequired` / `errorKind == authentication_failed |
    oauth_org_not_allowed` → `Authentication` → sign-in, no fail-over.
  - `invalid_request | model_not_found | max_output_tokens` →
    `RequestFailed` → error to the user; a backup does not fix config.
  - process exit before any update (`:1716-1725`) and
    provider-creation failure at activation → **fail over once**.
- Trigger, in `on_prompt`: `forward_agent_stream` returns `Err(e)`
  with `e.data.reason == credits_exhausted`, the session is
  `SessionType::User` and its role names a weight-0 runtime → the
  server (1) truncates from the user message it stamped an id on
  before `reply` (`Message::with_id`; else the timestamp form),
  (2) `update_provider` (`:2581`) to the weight-0 `{provider, model}`,
  (3) sends the `ConfigOptionUpdate` it already builds (`:2498-2544`)
  plus a `StatusMessage` naming the reason (`:1760-1780` shape),
  (4) `agent.reply` again, same message, same run id and cancel token.
  A second failure reaches the client as today.
- Trigger, at activation: `prepare_acp_session_agent` /
  `sync_session_bridge` fails to create the provider and the error is
  not auth-required → switch the session's `provider_name` to the
  weight-0 entry and retry creation once, before
  `cleanup_failed_new_session` deletes the session.
- Consequence: the failed turn's tool rows leave the transcript; the
  edits stay on disk; the memo (`acp/handoff.rs:54`) carries the
  conversation up to the user prompt. The backup discovers partial
  work from the tree, as any fresh runtime would.
- Consequence: the child side is only surfacing — `delegate` returns
  `Delegation failed: …` (`summon.rs:1443`) on a quota-dead child and
  the orchestrator re-delegates with `exclude_provider`
  (`orchestrator.md:55` pattern); summon's own re-roll stays task 5's
  scope, creation failure only.

## Scope — in / out / protected

- in (proposed task skeleton for the plan; not claimed here):
  1. classification — `acp/provider.rs:182-188` (kinds table above),
     `providers/claude_code.rs` (`assistant.error` → same table),
     unit tests beside `provider_error_from_acp` (`:2490-2497`).
  2. role identity — how a top-level session names its role file:
     task 11 passes `session/new` meta (or the recipe title
     `Agent: orchestrator` as `summon.rs:1635` does) and the server
     resolves `.agents/agents/<role>.md` from the session cwd; reuses
     task 5's `runtimes:` parser once it lands.
  3. fail-over on prompt — `acp/server.rs` `on_prompt` (`:2285-2394`):
     id stamping, rewind, `update_provider`, notification, re-run.
  4. fail-over at activation — `acp/server.rs:1157-1196`,
     `server/new_session.rs:63-72`: one retry on the weight-0 entry.
  5. child surfacing — `agents/subagent_handler.rs:64-80`: error on a
     trailing `CreditsExhausted`; `delegate` returns a tool error.
  6. desktop divider — task 11's shell renders "→ Grok from here" on a
     server-initiated `ConfigOptionUpdate` + the `StatusMessage`.
- out: the CLI `goose session` path (serve owns it; the CLI user is
  present and switches by hand); summon re-roll after a child ran
  (task 5 covers creation failure; partial child work is the
  orchestrator's to re-delegate); a new `ProviderError` variant (needs
  `agent.rs:3239-3255` to route it — invariant); proactive fail-over on
  `rate_limit_event.status == rejected` before the failing prompt
  (a later refinement once the reactive path is proven); Direct
  sessions (no role file → no weight-0 target; manual switch only).
- protected: `agent.rs`, `state_machine/`; `update_provider`'s explicit
  form and task 11's selector; summon's child extension lists (a child
  never gets the bridge); the auth-required path (`:179-185`) — a
  spent account fails over, an unauthenticated one signs in.

## Unknowns

- `codex-acp` and `cursor-acp` error shapes on a closed window —
  neither is installed here (`npm root -g`, 2026-09-15); text-only
  rows until captured. Cheap once installed; reversible (a table row).
- `claude-code` on a closed Max window: the `result` string, and
  whether `assistant.error` appears in print-mode stream-json — cheap:
  one prompt against a spent window, or a captured line replayed
  through the `claude_code.rs:878-915` tests; reversible.
- Whether the state-machine path persists the `CreditsExhausted` error
  row (`inference.rs:288-294` emits; the legacy loop yields without
  persisting, `agent.rs:3186-3196`) — the inclusive rewind covers both
  if it targets the user message. Cheap: one test per path; reversible.
- Fallback spawn inside `on_prompt`: `from_env` runs `session/new`
  synchronously (`acp/provider.rs:426-445`) and the run's cancel token
  is not checked inside `recreate_provider_for_session`; a cancel lands
  after the switch. Cheap to measure/test; reversible.
- Role identity (in: 2) depends on task 11; if it lands without one,
  fail-over has no weight-0 target and is a no-op, not a failure.
- Client view after the rewind: `forward_agent_stream` drops every
  event but `Message` / `McpNotification` / `MessageUsage`
  (`acp/server.rs:2253`), so `HistoryReplaced` never reaches an ACP
  client — the desktop keeps the truncated turn's rows until reload.
  A plan question (a `_goose` notification, or whatever compaction
  uses). Cheap to test; reversible.
- Reusing `CreditsExhausted` leaks "add credits" wording where the ACP
  server does not intercept: `goose-cli/src/session/output.rs:361`,
  `:459`, `:511`; `doctor.rs:259`. The desktop never sees it
  (`acp/server.rs:2196-2200`); the CLI shows a misleading line for a
  window that resets — the cost of keeping the CLI out of scope.
- `try_start_turn` (`agents/tool_confirmation_coordinator.rs:37-47`)
  must have released before the same-run re-`reply`, else it is
  refused as an active turn. Cheap to test; reversible.
- A server-authored line naming the dropped turn's edited files,
  prepended to the re-run prompt — not needed for correctness; cheap;
  reversible.
