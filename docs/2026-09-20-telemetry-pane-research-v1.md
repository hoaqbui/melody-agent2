# Telemetry pane — research map

Dated 2026-09-20. Question as asked: "can you add telemetry panel that helps me understand which models are being called which what settings" → "research a plan" → "draft me a mock up ux" → "show me dashboards! graphs! time over days, months, quarters!" → "help me understand where we are routing, what models is being used, and are the roles continuing to be effective?" → "no prose. just numbers and charts … hover … why it is important" → "at the top, 3 trends in prose bullets" → "research 'roles — are they earning their keep' more".

## The surprise (lead finding)

**Upstream already has a per-call model log and a surface for it — and both are empty for the fork's four runtimes.** `View recent model interactions` (session menu ▸ Transcript view, `SessionActionsHeader.tsx:47-49`) dumps `llm_request.*.jsonl` from the state dir as raw JSON (`useSessionActions.ts:227-248` via `diagnosticsGet_unstable(level: 'full')`, `session/diagnostics.rs:153-207`). Each file is one request: `{model_config, input}` then `{data, usage}` lines (`goose-provider-types/src/request_log.rs:63-101`). But only the API-key providers call `start_log` (bedrock, codex, cursor_agent, gcpvertexai… `providers/*.rs`); `claude_acp.rs`, `codex_acp.rs`, `cursor_acp.rs`, `agy.rs`, `claude_code.rs`, `gemini_cli.rs` never do (`grep -c start_log` → 0 each). For Claude · Codex · Cursor · agy the JSON dialog shows nothing, and no `llm_request*` exists on this Mac (`~/.local/state/goose/logs/` holds `cli`, `debug`, `server` only).

The per-call record that *does* exist for every runtime is on the transcript itself: `message.metadata.inference` and `message.metadata.usage`.

## Reframe trail

1. "add a telemetry panel" > telemetry means *which model, which settings, per call* > where does the spine already record that?
2. "is there a per-call log?" > yes, `llm_request.*.jsonl`, but not for ACP adapters > what is recorded for those?
3. "what's on the wire for an ACP turn?" > `InferenceMetadata {provider, requestedModel, resolvedModel, providerSessionId}` on every assistant message, `MessageUsage` beside it, `DelegationUpdate {provider, model, source}` per child > the panel is a view over the transcript, not a new log
4. "which settings, per call?" > Goose never sets temperature/effort for an ACP adapter — it forwards `thinking_effort` and the model id once per session (`acp/provider.rs:316-322`, `:607-617`) and the vendor CLI holds the rest > settings are session-level truth; per-call truth is the model that answered
5. "over days, months, quarters" > cross-session, so the transcript is not enough > the session list carries `createdAt · lastMessageAt · providerId · modelId · messageCount` per session but **no tokens or cost** (`acp/response_builder.rs:30-47`) > totals need `session/load` per session (its `usage_update`) or one allowed spine touch: `accumulatedInputTokens · OutputTokens · Cost` on that meta — `Session` already holds them (`types/session.ts:36-37`)
6. "are the roles effective?" > `DelegationUpdate.status` is the only wire signal, and it lies: `Done` is "the delegate call returned text" (`summon.rs:89-97`), so an Implementer returning `BLOCKED` (`implementer.md:24`) or a diff the session then rewrote both read Done > effectiveness is three parsed signals: the return text (`BLOCKED`, the Reviewer's `## Verdict`), the session's own writes after Done on the worker's files (the "17/17 corrected" evidence, `tasks.md:196`), and the Reviewer's verdict on the role's branch (`review-parse.ts:56-60`)
7. "per call?" > usage is attached once per **turn** (`agent.rs:345`), and for an ACP seat a turn is one `session/prompt` to the vendor CLI, which makes model calls Goose never sees > the panel's unit is the turn — the word on the surface is **Turns**, and the honest line says a Claude · Codex · Cursor · agy turn hides the CLI's own calls

## Inventory — read this session

- `ui/desktop/src/types/message.ts:170-174`, `:177-188`, `:190-198` — `InferenceMetadata {provider, requestedModel, resolvedModel?, providerSessionId?}` and `MessageUsage {inputTokens, outputTokens, totalTokens, cacheReadTokens, cacheWriteTokens, cost, costSource, elapsedMs, timeToFirstTokenMs, isCompaction}` on `MessageMetadata`; persisted with the message, so replay carries it
- `crates/goose/src/agents/agent.rs:2444-2456` — `InferenceMetadata` built once per reply from `model_config.model_name`, `provider.fetch_model_info(..).resolved_model`, `provider.provider_session_id()`; attached to every assistant message of the turn (`:3464-3472`); `agent.rs` is not editable in the fork (`ARCHITECTURE.md` §Invariants)
- `crates/goose/src/agents/agent.rs:345-367`, `:3474-3482` — `attach_turn_usage` puts the turn's `ProviderUsage` on the **last** assistant message (or the preferred id) once per turn; `AgentEvent::MessageUsage {message_id, usage}` forwarded as `message_usage` (`acp/server.rs:2298-2306`, `:1860-1880`). So a turn with five tool rounds is five assistant messages sharing one `inference` and one `usage` — the panel's row is *the message carrying `usage`*, one per turn, not every message with `inference`
- `crates/goose-agent/src/inference.rs:405-414`, `:446-448` — the state-machine path builds the same `InferenceMetadata` and stamps every assistant chunk; `state_machine/session.rs:130` emits `MessageUsage` — parity holds under `GOOSE_STATE_MACHINE=1`
- `grep -rn is_compaction crates/` — the flag exists on the wire and in sqlite (`session_manager.rs:921`, `:1099`) but no producer sets it true in this tree; a compaction row cannot be shown yet
- `ui/goose-acp-client/src/generated/types.gen.ts:2700-2709`, `:2713-2719` — `GooseSessionUpdate` = `usage_update` (session `used / contextLimit / accumulatedInputTokens / accumulatedOutputTokens / accumulatedCost`) · `status_message` · `message_usage` · `delegation_update`
- `ui/desktop/src/acp/sessionNotificationAdapter.ts:109-110` — `usage_update` returns `[]` (dropped); `BaseChat.tsx:551-560` reads `tokenState` for the composer's ring instead
- `ui/desktop/src/acp/chatSessionStore.ts:18-22` — `AcpChatSessionSnapshot {session, messages, tokenState, notifications}`; `useAcpChatSessionSnapshot(sessionId)` (`chatSessionController.ts:32`) is the one read a pane needs
- `ui/desktop/src/acp/delegations.ts:59`, `:80` — `applyDelegationUpdate`, `subscribeDelegationUpdates`, `useSessionDelegations` (used by `AgentsPane.tsx:17`); `DelegationUpdate {subagentSessionId, parentSessionId, source?, provider, model, title, status, error?, parentToolCallId?}` (`types.gen.ts:2780-2800`)
- `ui/desktop/src/types/session.ts:8-17`, `:35-58` — `ModelConfig {model_name, temperature?, max_tokens?, context_limit?, reasoning?, request_params?, toolshim}`; `Session {provider_name, goose_mode, model_config, accumulated_usage, accumulated_cost, session_type}`
- `crates/goose/src/acp/provider.rs:58-61`, `:316-322`, `:607-617` — the ACP provider forwards `thinking_effort` (`ModelConfig.request_params`) to the adapter's `effort` config option and the model id via `model_config_option_id`; nothing else (no temperature, no max_tokens)
- `ui/desktop/src/acp/sessionConfig.ts:1-4`, `:34` — the server's session config options (provider, mode, model, thinking_effort) per session, `useSessionConfigOptions(sessionId)`
- `ui/desktop/src/workspace/session-controls.ts:171-176`, `:192-202` — `LEVER` triples and `stopOfSession(session)` → Easy · Medium · Hard · Custom
- `ui/desktop/src/components/messageRowContext.ts:30`, `ProgressiveMessageList.tsx:44` — today only `resolvedModel` is read from `inference`; `GooseMessage.tsx:140-142` renders `MessageUsageStats` per message (tokens/cost/tps), no model, no roll-up
- `ui/desktop/src/hooks/useSessionActions.ts:227-248`, `SessionActionsHeader.tsx:47-49`, `:75-77` — "View recent model interactions": a JSON dialog over `report.logs.llm`
- `crates/goose/src/session/diagnostics.rs:153-207`, `crates/goose/src/providers/utils.rs:95-176` — `llm_request.{0..9}.jsonl` in `Paths::in_state_dir("logs")`, ten kept, rotated per request; installed by `goose-cli/src/logging.rs:14`
- `crates/goose-provider-types/src/request_log.rs:63-101` — the line shape: `{model_config, input}` then `{data, usage}` / `{error}`
- `crates/goose-provider-types/src/conversation/token_usage.rs:7-19` — `ProviderUsage {model, usage, stats?, cost?, cost_source?, finish_reasons?, response_id?}`; `MessageUsage::from_provider_usage` drops `model` and `finish_reasons` (`message.rs:819`)
- `ui/desktop/src/workspace/pane-store.ts:4-26` — `PaneId` union and `PANE_IDS`; `WorkspaceShell.tsx:175-200` — `PANE_TITLES` (i18n) and `PANE_ICONS` (lucide) per id; `PRIMARY_PANES` at `:204`
- `ui/desktop/src/workspace/panes/agents/AgentsPane.tsx:6-20` — the pattern a data pane follows: session id from the route, `useSessionDelegations`, pure `agents-state.ts` + test, `ProgressiveMessageList` reused for a transcript
- `DESIGN.md:67-125` §Vocabulary — a pane is a noun tab; provider ids never reach the default surface (Runtime · model in the runtime's written name, ids in mono as machine text, the worker row's rule); §Shared states — Empty · Loading · Partial · Running · Error each with its line; "Diagnostics" is the vocabulary tier the telemetry words belong to
- `crates/goose/src/acp/response_builder.rs:28-47` — `SessionMeta {messageCount, createdAt, lastMessageAt?, archivedAt?, userSetName, sessionType, hasRecipe, projectId?, providerId?, modelId?, lastMessageSnippet?}` is every session's `_meta` on `session/list`; no usage, no cost. `sessions.ts:90-113` reads it into `Session`; `acpListSessions` pages by cursor (`:150-157`). Adding three totals here is inside `acp/` (allowed), untyped `_meta` so no client regen
- `crates/goose/src/agents/platform_extensions/summon.rs:89-97` — `delegation_finished`: `Ok(_)` → `Done`, `Err` → `Failed` + `error`; the child's return text is not inspected. The text reaches the parent transcript as the `delegate` tool's response
- `.agents/agents/implementer.md:19`, `:24`, `:29-46` — the Implementer runs the task's `confirm:` itself, returns `BLOCKED` when the plan's assumption fails, and returns a fixed shape (`## Tests Run · ## Validation · ## Deviations From Plan · ## Remaining Issues · ## Files Changed`) — parseable: a non-empty Deviations or Remaining Issues is a partial, `Files Changed` is the set to intersect with the session's later writes
- `.agents/agents/reviewer.md:21`, `:35-36` — `PASS / PASS WITH ISSUES / FAIL`; `review-parse.ts:10`, `:56-60` already parses it (PASS WITH ISSUES before PASS)
- `.agents/agents/orchestrator.md:23-26`, `:64`, `:74` — the walk order per size, "require implementers to return BLOCKED … decide whether to return to the planner", one `confirm:` per task — so "back to the planner after BLOCKED" and "confirm passed first time" are the two outcomes a role is judged on
- `tasks.md:196` — the only re-work evidence today is a hand count ("8/8 wave-1 and 9/9 wave-2 haiku diffs needed session corrections"); task 107 (`:129-136`) turns it into a routing rule. Nothing on the wire marks a turn "session after worker"
- `ui/desktop/src/workspace/rpi-strip/rpi-strip-state.ts:37`, `:75` — `phaseOfRole(source)` maps a delegation's `source` to Research · Plan · Implement · Review; the same map keys the roles board
- `ui/desktop/src/acp/sessions.ts:198` — `acpSessionChildren(sessionId)` lists a parent's workers with `createdAt · lastMessageAt · providerId · modelId`: the Median and Seat columns without loading a transcript
- `git status` — task 119 (`doing · agent: session`) has 32 uncommitted files (e2e walks, `WorkColumn.tsx`, `WorkspaceShell.tsx`, i18n); this work branches on top and does not touch them

Boundary check against `ARCHITECTURE.md`: the pane lives in `src/workspace/panes/telemetry`, reads only `src/acp` exports (`useAcpChatSessionSnapshot`, `useSessionDelegations`, `useSessionConfigOptions`) — no `@aaif/goose-acp-client` import from workspace (§Invariants line 2); no `electron`/`node:*`; `agent.rs` and `state_machine/` untouched. No drift found; the map's "workspace" module line already names "views over ACP session notifications".

## Recorded decisions

- Runtime identity has no colour role; a provider id never rises to the default surface — the panel names Claude · Codex · Cursor · agy, ids in mono beneath (`DESIGN.md` Named Runtime Rule, One Word Rule, worker row)
- A pane never floats or modals; it lives in the Work column's tab bar (`DESIGN.md` One Dock Rule; `b7a9c2bd0` per-panel bars)
- `agent.rs` / `state_machine/` are not edited in the fork (`ARCHITECTURE.md` §Invariants) — rejected: attaching request params to `InferenceMetadata` at `agent.rs:2451`
- "Diff" → "Changes", "header" retired etc. (`DESIGN.md` Retired) — the new word is **Telemetry**, not "Usage" (upstream's per-message stats), not "Logs" (the diagnostics dump)

## Start-over view (2026-09-20, user: "if you had to start over, what would you do?")

- Not a token dashboard first — a **work ledger**: one event per moment the app already knows (`turn` usage landed · `worker` returned · `correction` the session wrote over a worker's file · `confirm` ran · `review` verdict parsed · `undo` · `handoff`), appended as JSONL by the sidecar per project. Every chart is a fold over it; nothing is derived twice.
- Three views over the one ledger: **Now** (this session: settings + turns), **Over time** (Days · Weeks · Months · Quarters), **Roles** (routing ribbons, the board, clean-done trend). Three trends at the top written by rules (the largest movements, templated), never a model call inside the telemetry pane.
- Every number carries *why it matters* and *where it reads from* on hover; the words live nowhere else.
- Honest marks: **hand-counted** on rows the wire cannot see (Agent-tool subagents, `tasks.md`), **est.** on prices the seat did not report, **—** where neither exists.
- What it needs beyond the renderer: A4's three fields (`acp/response_builder.rs`), a sidecar `ledger` route (append/read JSONL, `/fs/watch` on `tasks.md` for confirms), and the spine bridge for workers to appear at all. Prototype: `docs/mockups/2026-09-20-work-ledger.html` (published as an artifact 2026-09-20).

## Options → pick

| Option | Owns | Trades away |
|---|---|---|
| **A — view over the transcript** (pane reads `inference` + `usage` per assistant message, `DelegationUpdate` per child, the session's `model_config` + config options for settings; no spine change) | every runtime incl. the four ACP seats; replay; zero Rust; one pure state file | per-call settings (only the answering model is per-call; effort/model/mode are per-session) |
| B — A + per-call request params on the wire | per-call truth (temperature, effort, mode as sent) | blocked: the only seam that knows them is `agent.rs:2451`; `acp/server.rs` sees session config only, so B collapses to A |
| C — read `llm_request.*.jsonl` through diagnostics (what "View recent model interactions" does) | the full request/response body for API-key providers | empty for Claude · Codex · Cursor · agy (no `start_log`); ten-request cap; raw JSON |
| D — the sidecar tails `goose serve` tracing | provider spans, timing | log-text parsing, off pattern (`ARCHITECTURE.md` native never does ACP) |

Pick: **A**, with a "Show raw request" link into upstream's JSON dialog only where a `llm_request` log exists (API-key seats) — C composed, not rebuilt.
- children (A1 vs A2): A1 lists each delegated child as a row from `DelegationUpdate` (role → runtime · model · status); A2 adds the child's tokens by loading its session (`sessionChildren_unstable` + `acpLoadSession`, `sessions.ts:200`) — one more fetch, and the Agents pane already opens the transcript. Recommend A1 now; A2 is one task later if the roll-up needs child cost.
- the "settings" header is honest copy: settings per session; the model that answered per turn; a turn on an ACP seat is one prompt to that CLI whose own calls never show — a line in place, not an error
- the Settings card shows the permission gate and provider/model ids in mono — allowed only because Telemetry is a **Diagnostics-tier** surface, and the `DESIGN.md` vocabulary row must say so (the default-surface rule keeps ids and the gate off every other pane)


### Roles — the signals, priced

| Signal | On the wire today | Cost to compute | Lies when |
|---|---|---|---|
| Done / Failed | yes — `DelegationUpdate.status`, `error` | none | a `BLOCKED` return or a rewritten diff both read Done |
| Blocked | no — parse the child's return text for `BLOCKED` (Implementer contract) | the parent transcript is already loaded; one regex | a worker that redesigns silently instead of returning BLOCKED (the rule it is told not to break) |
| Corrected by the session | no — session `write`/`edit`/`shell` tool calls **after** the worker's Done whose path ∩ the return's `## Files Changed` ≠ ∅; plus task 88's Undo on that turn | parent transcript + a path-set intersection | a follow-up the plan intended (a second task on the same file); mitigated by "same task ref in the delegation title" |
| Review PASS | yes for review sessions (`review-parse.ts`); for a delegated Reviewer, parse its return text the same way | none | a review of the branch, not the role — attribute to the role whose delegation last touched the branch |
| Retried | no — a second delegation with the same `source` and the same `task N` in `title` inside one session | delegations store | a task legitimately split in two |
| Confirm passed first time | no — the session runs `confirm:`; the result lives only in `tasks.md` status | the sidecar can read `tasks.md` per project (`/fs/read`) and count `done` per `worker:` tier | tasks marked done by hand |
| Median time · tokens / run | yes — `sessionChildren` dates; tokens need the child's `session/load` | one list call; N loads for tokens (lazy) | — |

Verdict thresholds (the mockup's): **Effective** = clean-done (done − blocked − corrected) ≥ 80% of runs and PASS ≥ 80%; **Watch** = below either; **Failing** = corrected ≥ half the runs, or clean-done < 50%. Corrected is the number that decides — it is the one the user already counts by hand.

### Cross-session (Days · Weeks · Months · Quarters)

| Option | Owns | Trades away |
|---|---|---|
| **A3 — session grain from the list, turn grain lazily** | one paged `session/list` for every chart at session grain (created, provider, model, count); a session's transcript loaded only when the range is small enough to show turns | tokens and cost per session need a load each — the headline numbers are partial until the loads land |
| **A4 — A3 + totals on the list meta** (`response_builder.rs` `SessionMeta` gains `accumulatedInputTokens · accumulatedOutputTokens · accumulatedCost`) | every headline and time-series chart from one call; no loads for the roll-up | one `crates/goose/src/acp/` edit (allowed: not `agent.rs`, not `state_machine/`), the upstream-diff grows by three fields |
| A5 — a sidecar sqlite read | full per-message grain for any range | the sidecar touches goose's store (a fourth writer's neighbour) — off pattern |

Pick for the dashboard: **A4** — three serialized fields on a struct the fork already reads by hand; the per-turn charts (model switches inside a session, workers) stay lazy per A3.

## Scope — in / out / protected

- in (dashboard, A4): `crates/goose/src/acp/response_builder.rs` (`SessionMeta` + three fields), `ui/desktop/src/acp/sessions.ts` (`sessionInfoToSession` reads them), `panes/telemetry/telemetry-buckets.ts` (+ test: day/week/month/quarter keys unique across years — the mockup hit the collision), the roles signals in `telemetry-roles.ts` (+ test: BLOCKED parse, Files Changed ∩ later writes, verdict parse reused from `review-parse.ts`)
- in: `ui/desktop/src/workspace/pane-store.ts` (`PaneId` + `PANE_IDS` gain `telemetry`); `ui/desktop/src/workspace/WorkspaceShell.tsx` (`PANE_TITLES`, `PANE_ICONS`; `Activity` from lucide); `ui/desktop/src/workspace/panes/telemetry/{TelemetryPane.tsx, telemetry-state.ts, telemetry-state.test.ts}`; `ui/desktop/src/i18n/messages/*.json` (17 files: `workspaceShell.paneTelemetry`, `telemetryPane.*`); `DESIGN.md` §Vocabulary one row (naming Telemetry a Diagnostics-tier surface: ids and the permission gate in mono, the one pane where they show); `tests/e2e/telemetry-pane.spec.ts` (one walk); `tasks.md`
- out: a compaction row (nothing sets `isCompaction` yet); a per-request log for ACP seats (the CLI's calls are invisible to Goose); any edit under `crates/` beyond A4's three `SessionMeta` fields (A needs none; B is blocked); child token fetch (A2, later); a cost calculator (upstream's `cost`/`costSource` is what is shown); persistence beyond the transcript (the transcript *is* the store); phone layout beyond what the pane already gets from the tab rail
- protected: `sessionNotificationAdapter.ts:109` stays `[]` unless the pane needs session totals the snapshot's `tokenState` lacks — check `tokenState` first; upstream's `MessageUsageStats` and the JSON dialog are composed, never copied (Upstream Rule)

## Unknowns

- **does the work the user judges run through `delegate` at all?** The 17/17 evidence is from the session's Agent-tool worktree subagents (`tasks.md:129`), which never pass through `goose serve` — no `DelegationUpdate`, no child session, and `session/list` hides `sub_agent` sessions anyway (`acp/server.rs:141-142`). On day one the Implementer rows would read 0 runs. Interim source: the sidecar reads `tasks.md` (`/fs/read`) and counts `status: done` per `worker:` tier, shown with a **hand-counted** mark; the wire source arrives when the spine bridge (tasks 5, 8, 9) routes the session's workers through `delegate` — cheap to test? yes (count `delegation_update` notifications in one Hard session); reversible? yes

- does the child's return text carry `## Files Changed` reliably from every seat, or only from claude-code (the only seat that receives the role body today — `tasks.md:197-198`)? — cheap to test? yes (read three recent delegate tool responses); decides whether Corrected needs a fallback (any session write in the worker's worktree)
- how long does one `session/load` take for a 200-turn session, ×38 sessions a fortnight? — cheap to test? yes (time `acpLoadSession` in the console); decides whether A4 is required or A3 suffices

- ~~does `tokenState` carry `accumulatedCost`?~~ — yes: `TokenState.accumulatedCost` (`types/chat.ts:4-8`); the session roll-up reads the snapshot, `sessionNotificationAdapter.ts:109` stays as is
- does the claude-acp adapter report `resolvedModel` distinct from `requestedModel` (e.g. `claude-opus-5` vs a dated snapshot), or the same string? — cheap to test? yes, one live turn and read the message JSON; reversible? n/a (copy only)
- is `cost` ever `provider_reported` for the ACP seats, or always null? — cheap to test? yes (same turn); decides whether the cost column shows "—" by default
- does claude-acp report `cacheReadTokens`? — cheap to test? yes (one live turn); the Cache column reads "—" until it does
- ~~palette: panes by `PANE_IDS` or by hand?~~ — by `PANE_IDS` (`palette-state.ts:47`); no palette edit
