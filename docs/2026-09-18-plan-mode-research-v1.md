# Plan mode, first-run onboarding, command palette — research map

Dated 2026-09-18; tree at `d7d9406f2` (worktree branch
`worktree-agent-a3656d888c1edda15`). Cluster `plan-mode` of the UX-parity
list: items 8 (Plan mode: Accept / Revise), 13 (First-run onboarding),
14 (Command palette ⌘K). Question as asked: for each, what exists, what
is missing, which option wins, how a Playwright walk would prove it, and
the plan skeleton with confirms baselined on today's tree. Read-only: no
source edits, no task claims.

## The surprise (lead finding)

**Nothing in the tree stops the orchestrator between Plan and Implement,
and nothing in the tree can tell the user a seat is signed out.**
`.agents/agents/orchestrator.md:23` reads "Normal: delegate to `planner`,
`implementer`, and `reviewer` in sequence" — no wait, no Accept; the RPI
strip has no state for "waiting on you" (`rpi-strip-state.ts:30`
`RPI_STRIP_STATES = ['empty', 'loading', 'error', 'ready']`). And the
selectors' only probe is a binary lookup (`registrations.rs:240`
`acp_adapter_installed`, `acp_tooling.rs:5-15` a PATH resolve): no
provider, sidecar or renderer call asks whether `claude`, `codex`,
`cursor-agent` or `agy` is logged in, so PRD §States' "Sign in" and
DESIGN's Unavailable row have no producer. Worse, the Hard stop's own
seat, `claude-code`, is registered without an inventory probe
(`init.rs:94` `register::<ClaudeCodeProvider>(true)`), so its `available`
is `default_inventory_configured` over one key with a default
(`claude_code.rs:629-635`, `inventory/mod.rs:905-919`) — **always true** —
and `needsInstall('claude-code', …)` (`session-controls.ts:39-42`) can
never fire even with `claude` missing (task 58's hand check "no
uninstalled adapter here" was the symptom).

## Reframe trail

1. "How does the orchestrator pause for Accept?" > it does not; the
   role file runs the three roles back to back (`orchestrator.md:23-24`)
   and the only ACP-side pause primitives are the tool-permission turn
   (`claude_code.rs:957-999`, every tool, Approve mode only) and the
   MCP-server elicitation (`mcp_client.rs:526`, external servers only —
   `summon.rs` is not in `grep -rln elicit crates/goose/src`) > "Which
   carrier reaches a `claude-code` orchestrator reliably?"
2. "Append the gate with `_goose/unstable/session/system-prompt/set`
   mid-session?" > `claude_code.rs:449-457` `get_or_try_init` spawns the
   CLI once with `--system-prompt-file` (`:378`); later system prompts
   never reach the live process > the gate rides in the recipe at
   `session/new` (`orchestratorRecipe`, `session-controls.ts:55-61`) and,
   mid-session, only in the user message itself.
3. "Where would 'Sign in' come from?" > no auth field anywhere on the
   wire (`providers.ts:44-76` maps `available`, `configured`,
   `lastRefreshError` only); each CLI does answer on the command line
   (`claude auth status --json`, `codex login status`, `cursor-agent
   status --format json`, `agy models` — run this session, below) > the
   probe is a sidecar `execFile`, the `gh` precedent (`git.ts:40-75`).
4. "Does upstream ship a command primitive?" > no `cmdk` in
   `ui/pnpm-lock.yaml`, no `command.tsx` under `components/ui/`
   (`ls` below), ⌘K unbound in the renderer and in
   `defaultKeyboardShortcuts` (`settings.ts:68-80`) > compose `dialog.tsx`
   + `input.tsx`; no dependency.

## Recorded decisions

- Task 70 tagged the review session by *title* because no client call
  writes session meta (`DESIGN.md:98`; `review-session.ts:127-133`) — the
  same gap is why a spine gate (option ii below) needs a new ACP method.
- Task 27: the Agents tree and the RPI strip are views over the bridge's
  `DelegationUpdate`, keyed by child session id (`ARCHITECTURE.md:84`,
  `rpi-strip-state.ts:1-4`) — the gate derives from those rows, not from
  a parsed transcript.
- Task 58: Easy shows the lever and nothing else (`DESIGN.md:10` Starts
  as a chat) — every new control below lands behind Advanced.
- Decided 2026-09-15 (`tasks.md` §Waiting on the user, "A"): the
  orchestrator is `claude-code` in print mode — every carrier below is
  judged against that provider, not `claude-acp`.

## 8. Plan mode: Accept / Revise

### Inventory

Roles and what the orchestrator does today:
- `.agents/agents/orchestrator.md:21-26` — tier table; `:23` Normal =
  planner → implementer → reviewer "in sequence"; `:26` big projects:
  "review it with an advisor" — the only gate named is an Advisor, never
  the user. `:16` "Accept or reject implementation and review artifacts
  against objectives" — the orchestrator accepts, the user is told at
  `:17`.
- `planner.md:26-28` — "Do not modify code", "Do not delegate"; `:30-61`
  the Return shape (`# Implementation Plan` … `## Out of Scope`) — the
  markdown the Artifact pane renders.
- `PRODUCT.md:290-292` §8 diagram: "ORCHESTRATOR approves / adjusts"
  sits between the Plan's Advisor and the IMPLEMENTER — the product
  already draws the gate at that edge; §12 V1 names "plan
  acceptance/revision UX" (`PRODUCT.md:388`).

The strip (task 29) and where "waiting for you" would show:
- `rpi-strip-state.ts:10` `PHASES`; `:16` `PhaseStatus = 'dim' | 'active'
  | 'done' | 'failed'`; `:30` the four strip states; `:38-50`
  `phaseOfRole` maps `planner → 'plan'`; `:76-99` `phaseViews` groups
  rows into runs; **`:84` `reran` is false when `lastPhase === phase`**, so
  planner → planner (the Revise loop) joins one run and reads "Plan", not
  "Plan ×2" — the PRD's counter (`:206-208`) fires only on Review FAIL →
  Implement, never on Revise.
- `RpiStrip.tsx:60-66` returns null while `empty`; `:81-115` one
  `<button data-testid="rpi-phase-<phase>" data-status data-runs
  data-artifact>` per phase; `:99` a click calls `openArtifact(artifact)`.
  Mounted at `WorkspaceShell.tsx:1118-1120` above the chat, both faces.
- `delegations.ts:23-34` `Delegation { source?, status?, provider?,
  model?, title, updatedAt? }` — `source` is the role; `:128`
  `useSessionDelegations`; `:52-57` `upsert` replaces a known child's
  row in place, so the rows never say whether two planner rows ran in
  parallel or one after the other — an idle boundary is not in the
  rows today. Reload-seeded rows carry no `source`
  (`tasks.md` task 29 hand check), so after a restart the strip cannot
  tell Plan from any other child until a live event.
- The session's idle signal: `chatSessionStore.ts:18-28`
  `AcpChatSessionSnapshot.chatState`; `chatState.ts:1-9` `ChatState.Idle`
  … `WaitingForUserInput`; `useAcpChatSessionSnapshot`
  (`chatSessionStore.ts:591`) is already read by the shell
  (`WorkspaceShell.tsx`), the Agents, Review and Diff panes.

The Artifact pane (task 30) and where Accept / Revise go:
- `ArtifactPane.tsx:46-58` reads `usePaneContext().artifact` and the
  delegations; `:63-76` one `acpExportSession(id, 'json')` per child;
  `:161-192` the header row: `artifact-header` · Copy · Open transcript —
  the row Accept · Revise… would join; `artifact-state.ts:24-32`
  `lastAssistantText` is the handoff (the plan), `:47-52` `paneState`.
- `pane-context.ts:27-28` `artifact`, `openArtifact(childSessionId)`.

Sending a prompt into the parent session (task 70, reuse):
- `review-session.ts:68-90` `prompt(sessionId, text, cwd)`: loads the
  session if the store has none, appends `createUserMessage(text)` to the
  store, `acpChatSessionController.submitMessage(...)` with `onFinish` →
  `notifyTurnFinished`. Module-private today; `:98-100` `rerunReview`
  is its only other caller.
- `chatSessionController.ts:56-60` `submitMessage(sessionId,
  userMessage, options)`; `:172-180` returns silently while
  `activePromptAttemptId` is set — Accept during a running turn is a
  no-op, so the buttons must disable while `chatState !== Idle`.
- Prefill instead of send: `AppEvents.INSERT_INPUT_TEXT`
  (`constants/events.ts:15`), dispatched by the Browser's Share
  (`BrowserPane.tsx:291-295`), handled in `ChatInput.tsx:797-799` — the
  Revise… path: land "Revise the plan: " in the input and focus it.

How the orchestrator could be told to pause — the three carriers:
- (i) prompt level: the role body rides as recipe `instructions` at
  session/new (`session-controls.ts:55-61`; `WorkspaceShell.tsx:626-629`,
  `:1099-1100`; `Hub.tsx:146`); on `claude-code` the system prompt is a
  file passed once at spawn (`claude_code.rs:378-379`, `:449-457`
  `get_or_try_init`) — an instruction added later by
  `_goose/unstable/session/system-prompt/set` (`custom_requests.rs:198-217`,
  `manage_sessions.rs:57-90`) reaches only a not-yet-spawned process. The
  user message always reaches the model, so Accept ("Plan accepted —
  implement it") and Revise ("Revise the plan: … then stop again for my
  Accept") re-arm the gate turn by turn.
- (ii) spine gate: the bridge's `tools/call` (`session_bridge.rs:284-325`)
  reads the session record (`:291-301`) right before
  `dispatch_tool_call` — a per-session flag in `extension_data` could
  refuse `delegate(source: "implementer")` there. No ACP call writes
  such a flag: the closest shapes are `session/project/update`
  (`custom_requests.rs:729-734`) and `session/rename` (`:738-743`); a new
  method means `goose-sdk-types` + `custom_dispatch.rs` + a regenerated
  client (`justfile:169-177`, CI diffs `ui/goose-acp-client/src/generated/`).
  The refusal returns as a tool error the model must then handle — it
  still needs (i)'s words to know why.
- (iii) elicitation: the desktop declares `elicitation: { form: {} }`
  (`acpConnection.ts:149`) and renders a form
  (`ElicitationRequest.tsx:98-104`, Accept at `:202-204`); the server
  forwards `ActionRequired::Elicitation` (`acp/server.rs:1520-1534`,
  `server/elicitation.rs:17-46`). The producer is an *external* MCP
  server's `elicitation/create`, correlated to its active tool call
  (`mcp_client.rs:325-331`, `:526-560`); summon is in-process and raises
  none. The desktop cancels a pending form at 300 s
  (`elicitationRequests.ts:29`, `:46-63`) — reading a plan takes longer.

The lever and the Advanced face, for "Plan first":
- `session-controls.ts:145-149` `LEVER` — Hard = `claude-code` ·
  Orchestrate; `Lever.tsx:39-63` blocked stops and their titles;
  `SessionControls.tsx` (141 lines) — the Advanced popover listing every
  ACP config option (`workspace-config-<id>` test ids, `DESIGN.md:89`).

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| (i) prompt-level gate — a rule in `orchestrator.md` ("after the Planner returns, present the plan and end your turn; implement only after the user's Accept"), the same line appended by `orchestratorRecipe()` when the gate is on; Accept / Revise are user messages | zero spine change, works on every runtime, the gate re-arms through the messages the user sends anyway | the model can overrun (probably rarely on Opus with the rule in both the role and the recipe) — caught by the walk and by the UI: Implement lighting while the gate is armed reads as a `warning` bar with Stop |
| (ii) spine gate — `extension_data` flag read in `session_bridge.rs:291-301`, refuses `delegate(source: "implementer")`; a new `_goose/unstable/session/gate/set` | a hard stop no model can skip | a new ACP method, sdk-types, client regen, a bridge test; still needs (i)'s words; refuses the user's *own* "just implement it" until the flag flips |
| (iii) elicitation — summon raises a form after the planner returns | the answer lands inside the `delegate` result, one round trip | a new producer path in summon (in-process, no `mcp_client`), 300 s desktop cancel, upstream's form (fields, not a plan), a Revise note has to loop inside the tool call |

Pick: **(i)**, with (ii) named as the escalation if a live walk shows
the orchestrator overrunning more than once in ten runs.
- The rule lands in two places so a session started outside the app
  (CLI) gets it too: `orchestrator.md` §Task sizing (Normal and Unknown
  tiers end their turn after the Planner; Tiny has no plan and no gate)
  and the recipe line `orchestratorRecipe(role, { planGate: true })`.
- "Waiting for you" is derived, not parsed: `plan.status === 'done'` ∧
  `implement.status === 'dim'` (for the latest plan run) ∧ `chatState
  === Idle` ∧ the session is Orchestrate. A sentinel line in the reply
  ("Awaiting your Accept") is *not* required — a parse would fail on a
  paraphrase and the derived state is right whether the model stopped by
  rule or by accident (Accept then simply says "implement").
- DESIGN §Shared component states has no "waiting on the user" row. The
  strip maps it to **Partial** — the resolved part (Plan, lit) is live,
  the unresolved part carries one bar naming what is missing ("Plan ready
  — waiting for you") whose actions are Accept · Revise…; focus
  unchanged; announces the bar's text. Recorded here as a DESIGN
  amendment the plan writes (`DESIGN.md:133` shape).
- Placement (Into Rule — the control lives on the thing it controls):
  the strip's Plan chip carries the bar and the two buttons (the strip is
  the session's RPI face); the Artifact pane's header row
  (`ArtifactPane.tsx:161-192`) mirrors Accept · Revise… on a Plan
  artifact so reading and accepting are one place. Both call one
  function.
- Accept = `prompt(sessionId, 'Plan accepted — implement it.', cwd)`
  (`review-session.ts:71` exported, or lifted to
  `src/workspace/prompt.ts` — the second use is this one); Revise… =
  `INSERT_INPUT_TEXT` with "Revise the plan: " and focus — the user's note
  is the message (Starts as a chat). Both disabled, never hidden, while
  `chatState !== Idle` (submit is a silent no-op then,
  `chatSessionController.ts:176-178`).
- "Plan first" placement — the axis is `DESIGN.md:10` (nothing beyond
  the lever in Easy): the gate is **on by default in Orchestrate** and
  the off switch is a row in Advanced › Session controls ("Wait for plan
  acceptance", `workspace-config-plan-gate`), persisted per project like
  `goose.workspace.columns` (`DESIGN.md:29`). A chip beside the lever
  loses (a control in Easy); a fourth lever stop loses (the lever's
  triples are provider · model · mode, `session-controls.ts:134-149`, and
  a stop is not a switch). Mid-session the switch changes only what the
  next Accept / Revise text says; the recipe line is fixed at session/new.
- The walk catches the overrun: after Plan reads `done`, Implement must
  still read `dim` and the strip must reach the waiting state *before*
  any Accept; an Implement row lighting first fails the test. In the UI
  the same condition (gate armed, `implement` becomes `active` with no
  Accept sent) shows a `warning` bar "Implement started without your
  Accept" with Stop — the model's overrun is visible, never silent.
- Revise → re-plan reads "Plan ×2": the rows need a carrier for the
  boundary (`upsert` erases order, `delegations.ts:52-57`), so
  `delegations.ts` stamps `startedAt` on a row's first sight (the
  `running` event; `DelegatedChild.createdAt` for a seeded row) and
  `phaseViews` opens a new run for a same-phase worker row whose
  `startedAt` is after the previous run's terminal `updatedAt` — two
  researchers in parallel stay one run, a planner after a finished
  planner reads ×2 (the `:84` rule plus one comparison).

### UX test plan

Setup: `provisionRoleRepo()` (`fixtures.ts:238-262` — the repo's own
`.agents/agents/` copied into a scratch git repo, `GOOSE_TEST_DIR`); the
planner rolls `codex-acp` w9 / `claude-code` w1 (`planner.md:4-6`), so
`codex-acp` or `claude` must be installed and signed in on the walking
machine, as the rpi-strip walk already needs (`rpi-strip.spec.ts:1-8`).
Easy face, viewport 1400×900, dock emptied.

1. Click the lever's Hard (`workspace-lever-stop-hard`) → URL has
   `resumeSessionId=`; `rpi-strip` has count 0.
2. Type "Plan the change: add a `--version` flag to
   `scripts/check-spine.sh`. Delegate once to the planner role, then stop
   for my review." ⌘Enter → within 120 s `rpi-phase-plan[data-status=
   active]`, `rpi-strip[data-state=loading]`.
3. Wait → `rpi-phase-plan[data-status=done]` within 120 s; then within
   30 s `rpi-strip[data-state=awaiting]` (new state), `rpi-gate` visible
   reading "Plan ready — waiting for you", `rpi-accept` and `rpi-revise`
   enabled; `rpi-phase-implement[data-status=dim]` — asserted *before*
   step 4 and again after a 10 s settle (the overrun check);
   `[data-testid="chat-input"]` enabled.
4. Click Plan → `artifact-pane` visible, `artifact-row-<child>`
   selected, `artifact-body` contains "Implementation Plan";
   `artifact-accept` and `artifact-revise` in the header row.
5. Click `rpi-revise` → the chat input's value starts with "Revise the
   plan: " and has focus (`document.activeElement` is the input); type
   "keep it to one file" ⌘Enter → `rpi-phase-plan[data-status=active]`
   within 120 s, then `done`, `rpi-phase-plan-runs` reads "×2", and the
   strip returns to `awaiting`.
6. Click `rpi-accept` → the transcript's last user message is "Plan
   accepted — implement it." (`[data-testid="user-message"]` or the
   store), `rpi-gate` count 0 within 2 s, `rpi-phase-implement` reaches
   `active` within 120 s; `rpi-strip[data-state=loading]`.
7. Advanced (⋯ → Advanced controls): Session controls ▾ shows
   `workspace-config-plan-gate` checked; uncheck → the next session
   started from this project carries no gate line
   (`session.recipe.instructions` from the export lacks it — read
   through `acpExportSession`).

States the surface declares (`RPI_STRIP_STATES` grows by `awaiting`):
- empty — the strip is absent (unchanged, `RpiStrip.tsx:65`).
- loading — a phase pulses; the gate bar is absent.
- partial → **awaiting** — Plan lit and done, Implement dim, the bar
  "Plan ready — waiting for you" with Accept · Revise…; the bar is the
  only new element and it grows out of the Plan chip (Into Rule).
- error — a failed phase stays red; if Plan failed there is no gate.
- ready — every lit phase done and the gate passed or off.
- warning (a bar, not a state) — Implement lit while the gate is armed
  and no Accept was sent: "Implement started without your Accept" ·
  Stop.

Keyboard: the bar's buttons are in the strip's `role="group"` tab
order after the phase chips; Enter on Accept sends; Enter on Revise…
moves focus to the input; Esc is still cancel-turn (`DESIGN.md:173`).

Phone width (≤ `PHONE_MAX_WIDTH_PX`): the strip mounts above the chat
as today (`tasks.md` task 29: "phone width mounts it too, unwalked");
the bar wraps under the chips (`flex-wrap`, `RpiStrip.tsx:72`); the
Artifact pane is a rail tab; walk at 390×844 through steps 3 and 6.

Human only: whether Opus actually stops after the Planner on a real,
unscripted task (the walk's prompt says "stop"; the product's case is a
prompt that does not); that the plan the pane shows is the one the
implementer follows; the ×2 counter on a Revise where the orchestrator
re-plans itself instead of re-delegating (no planner row → no counter,
by design — say if that should still count).

### Scope

- in: `.agents/agents/orchestrator.md` (the gate rule);
  `session-controls.ts` (`orchestratorRecipe` gate line, `PLAN_GATE_KEY`
  storage), `session-controls.test.ts`; `src/acp/delegations.ts` (the
  `startedAt` stamp — no SDK import changes); `rpi-strip/rpi-strip-state.ts`
  (`awaiting`, `gateState`, the `:84` re-run rule over `startedAt`), its test;
  `rpi-strip/RpiStrip.tsx` (the bar, Accept, Revise…, the overrun bar);
  `panes/artifact/ArtifactPane.tsx` (the mirrored buttons);
  `panes/review/review-session.ts` (export `prompt`) or a new
  `workspace/prompt.ts`; `SessionControls.tsx` (the switch);
  `WorkspaceShell.tsx` (passes `chatState` and the gate setting to the
  strip); `tests/e2e/plan-gate.spec.ts`; `DESIGN.md` §States amendment,
  §Vocabulary rows "gate", "Accept", "Revise".
- out: option (ii)'s ACP method and bridge check (escalation only);
  option (iii); parsing the plan for a sentinel; a Plan pane distinct
  from Artifact (PRODUCT.md §11 "Plan · Tasks" — the Artifact pane is
  the plan's face until a second artifact kind needs its own); carrying
  `source` on reload-seeded rows (`session/children` follow-up, task 29
  hand check) — the gate after a restart waits for a live event.
- protected: `crates/goose/src/agents/agent.rs`, `state_machine/`
  (`ARCHITECTURE.md:107`); `session_bridge.rs`, `summon.rs` (no spine
  edit in this pick); `components/ElicitationRequest.tsx`,
  `ChatInput.tsx` (composed through `INSERT_INPUT_TEXT`, not edited);
  `planner.md`'s Return shape.

### Unknowns

- How often Opus 5 on `claude-code` overruns the gate with the rule in
  both the role and the recipe — cheap to test? yes (ten live runs of
  step 2's prompt without "stop"); reversible? yes ((ii) is the belt).
- Whether `submitMessage` from outside `BaseChat` leaves upstream's
  input state consistent (task 70 sends this way for a session no chat
  mounts; the parent *is* mounted here) — cheap to test? yes (step 6);
  reversible? yes (dispatch `INSERT_INPUT_TEXT` + a programmatic submit
  instead).
- Whether the gate line in the recipe survives `encodeRecipe` unchanged
  and lands in the child of a *routine* saved from an Orchestrate
  session (`tasks.md` task 59/63: routines run unattended — a gate there
  would stall) — cheap to test? yes; reversible? yes (strip the line in
  `routine/` on save).
- The awaiting derivation after an app restart, when seeded rows carry
  no `source` — cheap to test? yes; reversible? n/a (a known gap,
  task 29).
- The Revise counter when the orchestrator re-plans *itself* instead of
  re-delegating (no planner row → no `startedAt`, no ×2) and whether a
  seeded row's `createdAt` orders correctly against a live row's
  `updatedAt` (two clocks: the server's record and the event's) — cheap
  to test? yes (walk step 5 after a restart); reversible? yes (drop the
  ×2 assertion, keep "Plan").

## 13. First-run onboarding

### Inventory

What a fresh install shows today:
- `App.tsx:683-711` wraps the routes in `OnboardingGuard`;
  `OnboardingGuard.tsx:65-101` `checkProvider` passes when
  `acpReadDefaults().providerId` is set (`:70-75`) or a fallback
  provider+model resolves (`:77-87`); otherwise `:175-201` upstream's
  wizard — "Welcome to goose · Connect an AI model provider"
  (`:20-27`) over `ProviderSelector`.
- `ProviderSelector.tsx:74-81` lists `acpListSetupProviderDetails()` →
  `providers.ts:106-109` filters `visible_in_setup`; `:16-31` the two
  paths are "Use a Local Model" and "Connect to a Provider (OpenAI,
  Anthropic, Google, etc)" — API keys, the opposite of PRODUCT.md §1
  ("never API-key-first").
- `claude_code.rs:620-637` — `claude-code` is `.deprecated(Some(
  "claude-acp"))` → `visible_in_setup: false` (`inventory/mod.rs:735`), so
  the fork's orchestrator seat never appears in upstream's wizard.
- `main.ts:879-897`, `:986` — `GOOSE_DEFAULT_PROVIDER` from the bundled
  config seeds a default; when set, `OnboardingGuard` passes at `:70`
  and lands on the Hub with no seat probed. The Hub's empty state is
  upstream's greeting (`Hub.tsx:42-44`) over the chat input — it
  reports no seat.
- `onboarding.rs:29-56` (`_goose/unstable/onboarding/import/*`) scans
  goose and Claude Desktop configs for MCP servers — an import of
  extensions, nothing about runtimes; not a fit.

The selectors' probe states:
- `providers.ts:44-76` `providerEntryToDetails`: `is_available ←
  entry.available`, `is_configured ← entry.configured`,
  `last_refresh_error`; `uses_acp ← entry.acp`. No auth field on the
  wire (`custom_requests.rs` has none).
- `inventory/mod.rs:728-734` — `configured` for an ACP adapter is the
  config entry's `enabled && configured`; `available` is
  `entry.inventory_configured()` → `registrations.rs:231-242`
  `acp_inventory(...).with_configured(|| acp_adapter_installed(command))`
  → `acp_tooling.rs:5-15` a `SearchPaths` resolve of the binary. Binaries:
  `claude-agent-acp` (`claude_acp.rs:18`), `codex-acp` (`codex_acp.rs:16`,
  the provider name doubles as the command), `cursor-agent`
  (`cursor_acp.rs:18`), `agy` (`agy.rs:27`).
- `claude-code`: `init.rs:94` registers with no inventory →
  `default_inventory_configured` (`inventory/mod.rs:905-919`) → true
  because `CLAUDE_CODE_COMMAND` has default `"claude"` (`claude_code.rs:
  629-635`); `acp: false` → `needsInstall` (`session-controls.ts:39-42`
  requires `uses_acp`) is false whatever the PATH holds.
- `session-controls.ts:15-20` `RUNTIMES` = claude-acp · codex-acp ·
  cursor-acp · agy — the Claude row is two binaries: `claude-agent-acp`
  for Easy/Medium, `claude` for Hard (`LEVER`, `:145-149`).
- `SessionChips.tsx:31`, `:236-245` — "Install" is the only affordance;
  `Lever.tsx:39-63` — a stop is blocked with " — Install" in its title.
  No "Sign in" string exists in `src/workspace` (`grep -rn "Sign in"
  src/workspace` → only the Git pane's `gh` row, task 66).
- Auth failure at session time: `acp/provider.rs:196` maps the adapter's
  error to `ProviderError::Authentication`; the desktop shows it as the
  provider's error in the chat (PRD step 2 fail path) — after the user
  typed.

What each CLI answers on the command line (run 2026-09-18 on this Mac,
all four installed and signed in):
- `claude auth status --json` → `{"loggedIn": true, "authMethod":
  "claude.ai", … "email": …}`, exit 0; `claude auth status --help` lists
  `--json` (default) and `--text`; `claude auth login` opens the browser
  flow (`--claudeai` default, `--console`, `--sso`) — interactive, a
  terminal or the OS browser.
- `codex login status` → "Logged in using ChatGPT", exit 0; `codex login`
  opens the browser, `--device-auth` for a headless code.
- `cursor-agent status --format json` (alias `whoami`) → "✓ Logged in as
  <email>" in text, exit 0; `cursor-agent login` (honours
  `NO_OPEN_BROWSER`), `logout`.
- `agy` has **no login/logout/status subcommand** (`agy --help`:
  `agent · changelog · install · mcp · models · plugin · remote-control ·
  update`); `agy models` fetches the list ("Fetching available
  models…", exit 0) — the only cheap call that needs the account, so it
  is the probe; the sign-in path is whatever `agy` does on first run
  (probably a browser flow) — an Unknown.

Where a probe could run:
- The sidecar's `gh` precedent: `git.ts:40-75` `execFile('gh', …)`,
  ENOENT → `503 … reason: 'missing'`, exit 4 → `503 … reason: 'auth'`,
  prompts disabled by env; routes are `'POST /git/…'` keys dispatched by
  `http.ts:136-159` behind the per-launch key. No generic exec route
  exists (`grep -n "'POST /" ui/sidecar/src/*.ts` lists git only).
- The renderer's sidecar client: `src/native/sidecar.ts` (pty message
  `{ type: 'input', data }` at `:209`); the Terminal pane takes `ptyId,
  cwd` only (`TerminalPane.tsx:55-61`) — no "open with a command", which
  is why task 66's Sign in hint tells the user to type `gh auth login`
  themselves.
- Web build detection: `WorkspaceShell.tsx:200` `WEB_SHIM`,
  `AppSettingsSection.tsx:238` `IS_WEB_BUILD` (user-agent test); the
  Phone card's URL comes from the `get-phone-url` IPC (`DESIGN.md:86`)
  — on the phone the desktop's URL is `window.location` itself.

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A. sidecar `POST /runtimes/probe` — `execFile` of the four status commands (the `gh` shape, `git.ts:40-75`), answering `{ seat, installed, signedIn, detail }`; the renderer derives Install / Sign in / Ready | one probe for desktop and phone (the phone has no local binaries — the sidecar is the Mac); fixes the `claude-code` hole without touching a provider; the `gh` route is the second concrete use of `execFile` | a new exec surface on the sidecar (Security specialist at the plan gate); the probe runs the CLIs' own commands, which can change |
| B. a spine `signed_in` beside `available` — each adapter's `InventoryRegistration` gains an auth resolver | the selector stays "a view over the ACP provider option" (`ARCHITECTURE.md:103`) | edits `claude_acp.rs` / `codex_acp.rs` / `cursor_acp.rs` (PRD §Scope: "adapters are added, never modified"), sdk-types + client regen, and `claude-code` still needs its own probe |
| C. no probe — keep upstream's wizard, add the four rows as links to install docs | nothing new | the lead finding stands: no Sign in, no Install on Hard; the wizard still leads with API keys |

Pick: **A**.
- The route is `POST /runtimes/probe` with no body; it runs the four
  commands with a 10 s timeout each, `env` minus prompts, `cwd` the
  sidecar's; a missing binary is `installed: false`, a non-zero exit or
  a `loggedIn: false` is `signedIn: false` with stderr's first line as
  `detail`; the phone gets the same answer (the Mac's).
- The Runtimes screen (`src/workspace/onboarding/RuntimesGate.tsx`,
  one route `#/runtimes`) is four rows — Claude (checks `claude` and
  `claude-agent-acp`, the row says which is missing) · Codex · Cursor ·
  agy — each reading **Install** (opens the runtime's install page,
  `openExternal`; the command shown in mono with Copy), **Sign in**
  (the command shown in mono with Copy — `claude auth login`, `codex
  login`, `cursor-agent login`, `agy` — and a **Recheck** that re-probes;
  the web build says "on the Mac"), or **Ready** (`success`, the account
  from the probe when it has one); a **Continue** that is enabled once
  any seat is Ready and reads which stops the lever can offer.
- When it shows: on launch, after `OnboardingGuard` passes, when the
  probe finds *no* seat Ready — mounted as a wrapper beside
  `OnboardingGuard` in `App.tsx:683` (the guard is upstream's; the fork
  composes around it, never edits it). Otherwise reachable from Settings
  › App ("Runtimes") and from a blocked stop's title. Continue hands off
  to the Hub (`navigate('/')`, the guard's own hand-off at
  `OnboardingGuard.tsx:140`).
- Upstream's wizard stays for the API-key path (More…); the fork's
  bundled default provider (`main.ts:890`) is what lets the guard pass.
- The lever and chips read the same probe: `needsInstall` grows a sibling
  `seatState(providerId, probe)` → `'install' | 'signin' | 'ready' |
  'unknown'`; a stop blocked on `signin` reads " — Sign in" and opens the
  Runtimes screen.
- Phone build: no installs and no sign-in from a phone; the screen shows
  each row's state read-only and, for anything not Ready, "Sign in on
  the Mac" with the desktop's address (`window.location.origin`).

### UX test plan

Setup: the walking Mac has all four installed and signed in (the
fixtures spawn the app with `...process.env`, `fixtures.ts:59-60`, but
`main.ts:1227` resolves the login-shell PATH itself, so hiding a binary
from the walk is not possible — Install and Sign in rows are human
checks). Fresh `GOOSE_TEST_DIR`, Easy face.

1. Launch → the Hub shows (all Ready, the gate does not interpose).
2. Settings › App → "Runtimes" row (`settings-runtimes`) → click →
   `runtimes-gate[data-state=ready]`; four `runtimes-row-<seat>` with
   `data-state=ready`, each row's text includes the runtime's name and
   "Ready"; `runtimes-continue` enabled.
3. Click `runtimes-recheck` → within 100 ms `runtimes-gate[data-state=
   loading]` (rows keep their last state with a spinner); within 15 s
   back to `ready`.
4. Recheck with the sidecar unreachable → `runtimes-gate[data-state=
   error]`, the error text names the sidecar and offers Retry; rows keep
   their last state. No fixture stops the sidecar today (`fixtures.ts`
   spawns the whole app, `:45-70`), so 13d either adds a
   `GOOSE_TEST_SIDECAR_PORT` override that points the renderer at a
   closed port for this step, or the step is a hand check.
5. Continue → the Hub; the lever's Hard is not blocked
   (`workspace-lever-stop-hard` without `data-blocked`).
6. Phone project (390×844, web build): `#/runtimes` renders the four
   rows read-only, no Install/Sign in buttons, `runtimes-phone-note`
   contains the page's own origin.

States the surface declares (`RUNTIMES_GATE_STATES`):
- empty — never (four fixed rows); the row-level "not installed" is a
  row state, not the surface's.
- loading — four skeleton rows on first probe; on Recheck the rows stay
  and carry a spinner ("loading" announced once).
- partial — some rows Ready, some Install / Sign in: Continue enabled,
  reading "Continue with <n> of 4"; each blocked row carries its one
  action.
- error — the probe call failed (sidecar down, 401): the cause, Retry;
  rows keep their last state.
- ready — every row Ready; Continue reads "Continue".
- unavailable (rows) — Install · Sign in exactly as `DESIGN.md:129`.

Keyboard: rows are a list; Tab reaches each row's action, then Recheck,
then Continue; Enter on Copy copies; Esc does nothing (not a dialog).

Phone width: rows stack, actions replaced by the "on the Mac" line;
Continue reads "Open the Hub".

Human only: a missing binary (rename `claude` off PATH, relaunch →
Claude row reads Install with the command); a signed-out seat (`codex
logout` → Sign in; run `codex login` in the Terminal pane → Recheck →
Ready); `agy`'s first-run sign-in flow (undocumented — record what it
does); the `claude-code` hole closed on Hard (no `claude` → Hard blocked
with Install).

### Scope

- in: `ui/sidecar/src/runtimes.ts` (the route, `execFile`, the four
  commands, timeouts), `runtimes.test.ts`, its registration in
  `index.ts`'s route table; `ui/desktop/src/native/runtimes.ts` (client);
  `src/workspace/onboarding/seat-state.ts` (pure: probe → row states,
  `RUNTIMES_GATE_STATES`), its test; `RuntimesGate.tsx`; `App.tsx` (the
  wrapper and the `#/runtimes` route beside `OnboardingGuard`);
  `session-controls.ts` (`seatState`), `Lever.tsx`, `SessionChips.tsx`
  (read Sign in); `AppSettingsSection.tsx` (the Runtimes row);
  `tests/e2e/runtimes-gate.spec.ts`; `DESIGN.md` §Vocabulary "seat",
  "Runtimes screen"; `ARCHITECTURE.md` sidecar line (one more route
  family, keyed).
- out: any edit to `claude_acp.rs`, `codex_acp.rs`, `cursor_acp.rs`,
  `agy.rs`, `claude_code.rs`, `registrations.rs` (option B); running the
  sign-in *for* the user (the browser flows are the CLIs' own);
  upstream's `OnboardingGuard`/`ProviderSelector` (composed, not
  edited); an install action (a link, never a package manager call);
  the MCP import (`onboarding.rs`).
- protected: the sidecar's key gate (`http.ts:150-156` — the new route
  is a `routes` entry, so it inherits the 401); no route accepts a
  command or a PATH from the body; `execFile` with an argv array, never
  a shell string.

### Unknowns

- `agy`'s signed-out behaviour: what `agy models` prints and exits when
  no Google account is linked, and what first-run sign-in looks like —
  cheap to test? yes (needs a second account or a moved `~/.agy`);
  reversible? yes.
- Whether `claude auth status --json` is stable across `claude`
  releases (it is documented as default JSON today) — cheap to test?
  yes; reversible? yes (parse `loggedIn` only, fall back to exit code).
- `cursor-agent status --format json`'s shape: only the text form was
  run this session ("✓ Logged in as <email>", exit 0); `--format json`
  is in `--help` but unread — the exit code is the probe until it is —
  cheap to test? yes; reversible? yes.
- Whether the bundled `GOOSE_DEFAULT_PROVIDER` is set in the fork's dev
  and packaged builds (decides if `OnboardingGuard` ever shows) — cheap
  to test? yes (`getBundledConfig`, `main.ts:879-897`); reversible?
  n/a.
- The probe's cost on the phone path (four CLI spawns per Recheck over
  the tailnet) — cheap to test? yes; reversible? yes (cache 60 s in the
  sidecar).

## 14. Command palette ⌘K

### Inventory

What upstream ships:
- No `cmdk`: `grep -n "cmdk\|fuse.js\|fuzzysort\|kbar" ui/pnpm-lock.yaml`
  → nothing; `ls ui/node_modules/.pnpm | grep -ci cmdk` → `0` (after an
  offline install in this worktree); `ls src/components/ui/` →
  `BackButton BaseModal ConfirmationModal Diagnostics Expand
  JsonSchemaForm RecipeWarningModal Select Stop Tooltip button card
  collapsible dialog dropdown-menu icons input scroll-area skeleton
  switch tabs` — no `command.tsx`.
- Primitives to compose: `dialog.tsx` (upstream's overlay stack,
  `DESIGN.md:65`), `input.tsx`, `dropdown-menu.tsx` (the ⋯ menu,
  `RailMenu.tsx:28-33`); a fuzzy filter already exists in
  `ProviderSelector.tsx:97-103` (`normalize` + `includes`) — lift, not
  add.
- Upstream's spotlight is a separate window: `main.ts:1660-1706` a
  `BrowserWindow` on `#/launcher` behind `shortcuts.quickLauncher`
  (`CommandOrControl+Alt+Shift+G`, `settings.ts:71`) — "Ask goose
  anything…", a prompt box, not a command list (PRD `:28-30` keeps it).

The keybinding:
- ⌘K is free: `grep -rn "key === 'k'\|Cmd+K\|CommandOrControl+K"
  src` → nothing; `defaultKeyboardShortcuts` (`settings.ts:68-80`) binds
  T · N · O · , · F · G · ⇧G · ⇧T · / · ⌥G · ⌥⇧G; the shell's handler
  (`WorkspaceShell.tsx:986-1021`) takes ⌘1/2/3 and ⇧⌘F and is the place
  a ⌘K branch goes; `App.tsx:507` takes ⌘N. `menu.ts`/`main.ts:2726-2919`
  accelerators are the app menu's — a ⌘K there would need an IPC; the
  renderer handler needs none.
- Hand check: a focused xterm swallows keys it binds; ⌘K is not one
  xterm binds by default, but the Terminal pane's `attachCustomKeyEvent`
  (if any) decides (`terminal-session.ts`) — unwalked.

What it should list, and the calls that exist:
- Panes: `PANE_IDS` (`pane-store.ts:16-27`) with `PANE_TITLES` /
  `PANE_ICONS` (`WorkspaceShell.tsx:161-176`, `:1041`); open via
  `store.openPane(id)` (`:993`).
- Sessions: `acpListSessions(cursor, { keyword })` (`sessions.ts:150-
  171`) — server-side keyword search already exists; open via
  `setView('pair', { resumeSessionId })` (`ArtifactPane.tsx:183-186`).
- Routines: `acpListSchedules()` (`schedules.ts:50`), Run now =
  `acpRunScheduleNow` (`:137`); the Schedules route.
- The lever's stops: `STOPS` / `LEVER` (`session-controls.ts:132-149`),
  applied as `startSession(provider, mode, stop)` for a new chat or
  `switchRuntime` mid-session (`WorkspaceShell.tsx:622-660`).
- Routes: Board (`#/board`, `DESIGN.md:101`), Settings (`/settings`),
  Schedules — `useNavigation` (`hooks/useNavigation.ts`).
- Session actions: `useSessionActions(session)` (`useSessionActions.ts:
  70-116`) — `openRename`, `fork`, `viewJson`, `viewModelInteractions`,
  `archive`, `openDelete`; its dialogs are mounted once by
  `SessionActionDialogs` (`WorkspaceShell.tsx:1189`, `SessionActionsHeader.tsx`)
  — the palette must call the *shell's* instance, not its own, or the
  rename/delete dialogs never open.
- The ⋯ menu's rows (`RailMenu.tsx`, `DESIGN.md:82`) — the palette's
  session section is that list; one source of rows for both.

Phone: the tab rail (`WorkspaceShell.tsx:1150-1196` `TabRail shown
onShow`), chat first then the panes; `DESIGN.md:59` "one thing visible,
no split" — a search tab on the rail opens the same palette full-screen.

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A. compose — `dialog.tsx` + `input.tsx` + a roving-focus list; rows from one `commands()` builder over the calls above; the `ProviderSelector` filter | no dependency; upstream's overlay stack, so `DESIGN.md:65` ("the fork adds no overlay") holds as written; the Glass Rule applies as to any menu over the transcript | writing keyboard navigation and grouping by hand (~150 lines) |
| B. add `cmdk` | typed groups, keyboard model, aria for free | a dependency with no second use (`AGENTS.md`: `cargo add`-style discipline applies to pnpm too — the brief bars one without a second concrete use); Radix Dialog inside cmdk duplicates `dialog.tsx` |
| C. extend the ⋯ dropdown with a search field | least code | a dropdown is anchored to the bar; the phone has no bar; a menu that filters sessions and routines is no longer the session's menu |

Pick: **A**.
- One builder, `src/workspace/palette/palette-state.ts` `commands(ctx)`
  → `{ id, group, label, hint, run }[]` in groups **Panes · Session ·
  Sessions · Routines · Lever · Go to**; `filterCommands(commands,
  query)` uses the lifted `normalize`; sessions come from
  `acpListSessions(null, { keyword: query })` after 150 ms of no
  typing (loading row meanwhile), the rest is local.
- `CommandPalette.tsx` on `dialog.tsx`: an input at the top
  (`palette-input`), a list of `palette-item-<id>` rows with ↑ ↓ Enter,
  group headings; Esc closes (a dialog, so Esc is allowed, `DESIGN.md:65`).
- Opens from ⌘K anywhere in the shell (`WorkspaceShell.tsx:989`
  branch), from the ⋯ menu's new first row "Command palette ⌘K", and on
  the phone from a search tab at the rail's end (`palette-tab`). Into
  Rule: it grows out of the ⋯ button (desktop) or the search tab
  (phone) — `origin-top-right` / `origin-bottom` — and closes back into
  it; focus returns to what opened it.
- Vocabulary: **command palette** (never "spotlight" or "launcher" —
  upstream's `/launcher` window keeps those).

### UX test plan

Setup: any Orchestrate or Direct session on `/pair`, one routine saved
(`routine.spec.ts` shape), Easy face, 1400×900.

1. Press ⌘K → `command-palette` visible within 150 ms,
   `palette-input` focused, `palette-list` shows the groups Panes ·
   Session · Routines · Lever · Go to with at least `palette-item-pane-
   terminal`, `palette-item-session-rename`, `palette-item-routine-
   <id>-run`, `palette-item-lever-hard`, `palette-item-go-board`.
2. Type "term" → the list narrows to rows whose normalized label
   includes "term" (`palette-item-pane-terminal` first); ↓ then Enter →
   the palette is gone and `workspace-pane-terminal` is open with
   `workspace-pane-button-terminal[aria-pressed=true]`; focus is on the
   Terminal pane.
3. ⌘K, type the session's title's first word → within 1 s
   `palette-list[data-state=loading]` then a `palette-item-sess-<id>`
   row; Enter → URL `resumeSessionId=<id>`.
4. ⌘K, type "rename", Enter → `session-rename-dialog` opens (the shell's
   `useSessionActions` instance); Esc closes it and focus returns to the
   chat input.
5. ⌘K, type "run", Enter on `palette-item-routine-<id>-run` → the
   Schedules route's Run now toast, as `routine.spec.ts` asserts.
6. ⌘K, Esc → gone; focus is where it was (the chat input's
   `document.activeElement` before and after).
7. ⋯ menu → first row "Command palette" with the ⌘K hint
   (`workspace-command-palette`) → opens the same dialog.
8. Phone (390×844): the rail's last tab `palette-tab` → the palette
   fills the screen, `palette-input` focused, the software keyboard
   does not cover the first three rows (assert `palette-list` top ≤
   40 % of the viewport).

States the surface declares (`PALETTE_STATES`):
- empty — a query with no match: "No command matches "<query>"" and
  the query kept; Esc clears the query first, then closes.
- loading — the local groups render at once; the Sessions group shows
  one skeleton row while the keyword search runs.
- partial — the Sessions or Routines call failed: the local groups
  stay; the failed group carries one bar with the cause and Retry.
- error — never for the whole surface (the local groups need no call).
- ready — every group resolved.

Keyboard: ⌘K toggles; ↑ ↓ move, Home/End jump, Enter runs, Tab stays in
the dialog, Esc closes; typing always goes to the input (a keydown on a
row refocuses the input and forwards the character).

Phone width: full-screen dialog, the input pinned at the top, groups as
sections; no ⌘ — the rail tab is the only opener.

Human only: ⌘K while an xterm has focus (does the Terminal pane swallow
it); ⌘K inside the Browser pane's webview (a guest page may bind it);
VoiceOver reading the group headings; the Into motion from the ⋯
button versus the rail tab.

### Scope

- in: `src/workspace/palette/palette-state.ts` (+ test),
  `CommandPalette.tsx`; `WorkspaceShell.tsx` (⌘K branch, mount, passes
  `sessionActions`, `store`, `startSession`/`switchRuntime`, the rail's
  search tab); `RailMenu.tsx` (the first row); `ProviderSelector.tsx`'s
  `normalize` lifted to `src/utils/fuzzy.ts` (two uses);
  `tests/e2e/command-palette.spec.ts`; `DESIGN.md` §Vocabulary "command
  palette", §Accessibility (⌘K), §Iconography (`Command` icon for the
  ⋯ row, `Search` for the rail tab).
- out: `cmdk` or any package; a second session-actions instance; app-menu
  accelerators (`main.ts`) — the renderer binds ⌘K; command history or
  ranking; a prompt box in the palette (upstream's launcher owns "Ask
  goose anything…").
- protected: `components/ui/dialog.tsx`, `input.tsx`, `dropdown-menu.tsx`
  (composed, unchanged); `useSessionActions.ts` (called, not edited);
  `RailMenu.tsx`'s existing rows and letters (`DESIGN.md:82` — the
  letters still fire while the menu is open; the palette adds none).

### Unknowns

- Whether `acpListSessions`'s `_meta.query` matches titles only or
  message text (`list_sessions.rs`, unread) — cheap to test? yes;
  reversible? yes (client-side filter over `acpListRecentSessions`).
- Whether the Terminal pane's xterm passes ⌘K through
  (`terminal-session.ts`, unread for key handling) — cheap to test? yes;
  reversible? yes (`attachCustomKeyEventHandler` returning false for
  ⌘K).
- The dialog's Glass Rule treatment over the transcript (`DESIGN.md:17`
  names menus over the transcript; a dialog is upstream's overlay) —
  cheap to test? yes; reversible? yes.

## §Plan skeleton

Confirms below were run on the untouched tree this session
(`d7d9406f2`, `ui/node_modules` installed offline in the worktree with
`pnpm install --offline --frozen-lockfile`, exit 0). Each fails today as
pasted. Cross-cluster waits: the sibling briefs were not in the
scratchpad (`ls scratchpad/` → `r-chat-panes` only, no brief), so waits
are named by what the tree shows; "none found" is a claim to check
against the other clusters' docs, not a fact.

Item 8 — plan gate

- 8a. Gate rule in `orchestrator.md` + `orchestratorRecipe(role, {
  planGate })` line + per-project setting key.
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/session-controls.test.ts -t "plan gate" 2>&1 | grep -E "Tests"` → the `Tests` line contains `1 passed`; today: `Tests  11 skipped (11)`
  - worker: low · waits on: nothing
- 8b. `rpi-strip-state.ts`: `awaiting` state, `gateState(views,
  chatState, gateOn)`, and the `:84` re-run rule (a same-phase worker
  row after an idle boundary opens a new run).
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/rpi-strip/rpi-strip-state.test.ts -t "awaiting" 2>&1 | grep -E "Tests"` → the `Tests` line contains `3 passed`; today: `Tests  14 skipped (14)`
  - worker: low · waits on: 8a (the setting it reads)
- 8c. The strip's gate bar with Accept · Revise…, the overrun bar, the
  Artifact pane's mirrored buttons, `prompt` exported from
  `review-session.ts`.
  - confirm: `grep -c 'data-testid="rpi-accept"' ui/desktop/src/workspace/rpi-strip/RpiStrip.tsx` → `1`; today: `0`
  - worker: medium · waits on: 8b
- 8d. Session controls row "Wait for plan acceptance" (Advanced).
  - confirm: `grep -c 'plan-gate' ui/desktop/src/workspace/SessionControls.tsx` → `1` or more; today: `0`
  - worker: low · waits on: 8a
- 8e. Walk `tests/e2e/plan-gate.spec.ts` (the UX plan's steps 1–7,
  plus the phone pass), DESIGN §States/§Vocabulary amendment.
  - confirm: `just walk "plan gate"` → `1 passed`; today: `Error: No tests found` (`--list`)
  - worker: medium · waits on: 8c, 8d; live `codex-acp` or `claude` signed in

Item 13 — first-run onboarding

- 13a. Sidecar `POST /runtimes/probe` (`execFile`, four commands,
  timeouts, `installed`/`signedIn`/`detail`), keyed like every route.
  - confirm: `cd ui/sidecar && pnpm vitest run src/runtimes.test.ts 2>&1 | grep -E "Tests|No test"` → the `Tests` line contains `4 passed`; today: `No test files found, exiting with code 1`
  - worker: medium (Security specialist at the plan gate) · waits on: nothing
- 13b. `src/native/runtimes.ts` client + `src/workspace/onboarding/
  seat-state.ts` (probe → row states, `RUNTIMES_GATE_STATES`,
  `seatState` for the lever).
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/onboarding/seat-state.test.ts 2>&1 | grep -E "Tests|No test"` → the `Tests` line contains `5 passed`; today: `No test files found, exiting with code 1`
  - worker: low · waits on: 13a (the response shape)
- 13c. `RuntimesGate.tsx`, the `#/runtimes` route and the wrapper beside
  `OnboardingGuard` in `App.tsx`, the Settings › App row; the lever and
  chips read `seatState` (Sign in on a stop).
  - confirm: `grep -c 'runtimes-gate' ui/desktop/src/App.tsx` → `1` or more; today: `0`
  - worker: medium · waits on: 13b
- 13d. Walk `tests/e2e/runtimes-gate.spec.ts` (steps 1–6; Install /
  Sign in rows are hand checks), DESIGN §Vocabulary rows,
  ARCHITECTURE sidecar line.
  - confirm: `just walk "runtimes gate"` → `1 passed`; today: `Error: No tests found` (`--list`)
  - worker: medium · waits on: 13c

Item 14 — command palette

- 14a. `palette-state.ts` (`commands`, `filterCommands`,
  `PALETTE_STATES`) and `src/utils/fuzzy.ts` lifted from
  `ProviderSelector.tsx:97-103`.
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/palette/palette-state.test.ts 2>&1 | grep -E "Tests|No test"` → the `Tests` line contains `4 passed`; today: `No test files found, exiting with code 1`
  - worker: low · waits on: nothing
- 14b. `CommandPalette.tsx` on `dialog.tsx`, ⌘K in the shell, the ⋯
  menu row, the phone rail's search tab.
  - confirm: `grep -c 'command-palette' ui/desktop/src/workspace/WorkspaceShell.tsx` → `1` or more; today: `0`
  - worker: medium · waits on: 14a; 8d (the Lever group lists the same stops the Session controls row sits beside — no code wait, a copy wait)
- 14c. Walk `tests/e2e/command-palette.spec.ts` (steps 1–8), DESIGN
  §Vocabulary/§Accessibility/§Iconography lines.
  - confirm: `just walk "command palette"` → `1 passed`; today: `Error: No tests found` (`--list`)
  - worker: medium · waits on: 14b; a saved routine in the fixture (`routine.spec.ts`'s shape)

Order: 8a ∥ 13a ∥ 14a (disjoint files) → 8b ∥ 13b → 8c ∥ 8d ∥ 13c ∥
14b → 8e ∥ 13d ∥ 14c. Item 8 is the V1 core (`PRODUCT.md:388`) and goes
first when the workers are scarce.
