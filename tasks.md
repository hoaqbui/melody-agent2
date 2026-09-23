# Tasks — melody-agent2

Read this before claiming work, and before handing off. Every agent,
every session, every runtime shares this one ledger.

## Ground rules

- **Claim before work.** One task, one agent, one `status:` —
  `todo | doing | blocked | done`. Two agents on one task is a
  collision, not parallelism.
- **A claim that isn't committed doesn't exist.** Claim, commit, then
  work — an agent on another branch or worktree sees only what landed.
  The sweep rides the same rule: done leaves in the landing commit.
- **Append, never rewrite another agent's entry.** `context:` grows by
  accretion. Correct a line by adding the correction beneath it.
- **CARD is why, not how.** A solution word in `card:` skips the plan
  gate — the requirement belongs there, the approach in the plan.
- **CONTEXT cites, never pastes.** Every finding carries `file:line`
  or URL + date. A body pasted here goes stale the next commit.
- **CONFIRM is a command and an expected, never prose.** A check that
  passes on the untouched tree is not a check. Only the agent that ran
  the command marks the task `done`.
  This project is `testing: light` (PRODUCT.md §8): one smoke per task,
  a unit test only where the change is pure logic; no suites.
- **Blocked names what unblocks it.** No bare `blocked` — the line
  says what is waited on and who owns it. Anything only the user can
  verify is listed as such, never assumed.
- **Done is spent.** A task marked `done` leaves the file in the same
  commit that lands it — this is a work surface, not a ledger of what
  happened. Git holds the history. Last task out → the file goes too.
- **Write the handoff before the session ends.** The file is the
  memory; the session is not.

Paths below are relative to the fork root (this directory once task 1
lands). `file:line` cites are against `aaif-goose/goose@a23a8cd5` and were
re-checked at the fork base `426967d` (v1.51.0, 2026-09-15): all hold;
`summon.rs:1626` is now `:1628`.

- **Light by default, full at the gates.** Amended 2026-09-21 (task
  143, user: "reduce the amount of testing"): a task's `confirm:` is
  `just smoke` (eight seat-free walks, ~4 min) plus the one walk the
  change touches (`just walk "<pattern>"`) — never the whole set, and
  never an `@seat` walk unless the change is in what that walk proves.
  `just test-light` when the change is pure logic or Rust. `just
  test-full` (every walk, the `@seat` ones included) runs only before a
  tag; the relaunch for the user rides on the tag. Workers use a private
  `PLAYWRIGHT_DEBUG_PORT_BASE`; one `until` wait, never a polling loop of
  background sleeps (2026-09-16).

## Tasks

### docs/2026-09-15-goose-fork-plan-v1.md

### docs/2026-09-15-goose-spine-bridge-plan-v1.md

- 33. File the three upstream Ready issues against `aaif-goose/goose` named by the spine bridge plan: (i) role bodies never reach an ACP worker (`acp/provider.rs:820`), (ii) a session's platform tools exposed to ACP/CLI providers as an MCP server (`agents/session_bridge.rs`), and `runtimes:` in agent frontmatter (task 5).
  - status: blocked · agent: — · worker: low
  - blocked: posting to GitHub is outward-facing — owner: user, say "file them" and name the account
  - card: as the fork's maintainer, put each spine patch in front of upstream so that the fork carries fewer patches over time (AGENTS.md §Contribution Workflow: issue first, template in `.github/ISSUE_TEMPLATE/`)
  - context:
    - each issue: problem, the fork's patch as evidence (`file:line`, commit), the verification the spike ran; `gh issue create` does not apply templates — paste the template body
  - confirm: `gh issue list --repo aaif-goose/goose --author @me --state open --json title | python3 -c "import json,sys; t=[i['title'] for i in json.load(sys.stdin)]; print(sum('bridge' in x.lower() or 'system prompt' in x.lower() or 'runtimes' in x.lower() for x in t))"` → `3`

### PRODUCT.md §11 — tranche 5 (V0.5): agent activity, artifacts, browser

Planned 2026-09-15 21:25 from PRD steps 10–12 and the spine research §Activity contract gap; tasks 28–30 wait on 27's pick before any source edit.

### Parity with Codex desktop and Claude Cowork — plan v1 (approved 2026-09-16)

Planned in `docs/2026-09-16-parity-plan-v1.md` (approved 2026-09-16, "approved all recommendations"). Order: wave 1 = 47 ∥ 48 ∥ 51 (disjoint files); then 49 ∥ 50 (after 48) ∥ 52 (after 51) → 53 → 54 → 59 (after 53 and 58) → 55. 61 and 62 (below) run in wave 1 too — sidecar-only.

### Tranche 6 — parity with Claude Code desktop, Codex desktop, Emdash (planned 2026-09-16)

Planned 2026-09-16 from the parity read (user: "plan it out all in tasks.md", then "implement and orchestrate with sub agents to parity"). The three gaps that stay felt daily after tranche 5: PR creation with CI status, a task board over parallel work, finish notifications. Order: 66 now (sidecar + Changes/Git, independent) ∥ 65; then 28 ∥ 30 ∥ 67 ∥ 68 after 65 lands (30's list is its own entry point; 67 and 68 read the delegations store); 69 (running, independent) → 71 (the Work column's tab bar and dock positions, after 69); then 29 → 70 (after 66 and 30).

## Handoff — Goose spine evaluation (2026-09-15, Codex)

- **Resume here:** `docs/2026-09-15-goose-spine-research-v1.md` owns the evidence and options. User said “continue” after the recommendation to preserve Claude-first and repair ACP integration, then requested handoff. Direction carried forward; no implementation plan has been completed or approved.
- **Next action:** finish a bounded integration plan for Claude ACP → Goose Summon `delegate` → linked Codex ACP child → compact result. Prove a unique instruction present only in the role body reaches the child. Specify session authority, lifecycle, cancellation, permissions and result metadata before implementation; no new sidecar task engine.
- **Corrections to existing task assumptions (append-only; not a replacement plan):**
  - tasks 5, 7–9: ACP ignores Goose's system prompt and tool list (`crates/goose/src/acp/provider.rs:820`); MCP forwarding skips platform extensions (`:1843`). Role content becomes the child system prompt (`crates/goose/src/agents/subagent_handler.rs:134`, `:166`). Weighted selection and role files alone cannot deliver the orchestration path. Task 9 depends on resolving these integration gaps.
  - task 5: `tasks_update` has no production constructor call found; use the actual delegate result/child-session metadata and design missing lifecycle/runtime fields explicitly (`crates/goose/src/agents/subagent_execution_tool/notification_events.rs:28`; `crates/goose/src/agents/platform_extensions/summon.rs:1433`). Decide how runtime selection interacts with the existing environment override (`:1822`).
  - tasks 6, 9: delegated approval handling is not established by provider mode mapping. Summon assumes Auto (`summon.rs:1394`), but Claude ACP reads global mode (`crates/goose/src/providers/claude_acp.rs:70`); requests can wait for confirmations the child handler does not forward (`crates/goose/src/acp/provider.rs:1005`).
  - tasks 5, 11: automatic fail-over needs backend ownership and partial-work semantics; switching plus a memo is not that policy (`crates/goose/src/acp/server.rs:2555`). ACP errors currently map to Authentication/RequestFailed (`crates/goose/src/acp/provider.rs:182`), so quota classification also needs design.
  - task 17: the Gemini CLI template ignores extensions/tools and lacks ACP handoff behavior (`crates/goose/src/providers/gemini_cli.rs:184`, `:212`, `:80`). Confirm agy's actual protocol/flags; do not claim MCP or permission parity from a clone.
- **Integration leads, not approved design:** `PlatformExtensionContext` already carries the session manager and weak extension manager (`crates/goose/src/agents/platform_extensions/mod.rs:230`); `ToolCallContext` carries session/cwd/call identity (`crates/goose/src/agents/tool_execution.rs:34`); `ExtensionManager::dispatch_tool_call` exists (`crates/goose/src/agents/extension_manager.rs:2407`). Check ACP activation/provider-construction order (`crates/goose/src/acp/server.rs:1156`; `server/new_session.rs:74`) before choosing where to attach a session-bound MCP facade. Production HTTP-server feature/dependency implications remain unresolved (`crates/goose/Cargo.toml:88`, `:265`).
- **Alternative retained:** Goose-native `chatgpt_codex` sends system instructions and tools (`crates/goose/src/providers/chatgpt_codex.rs:1003`), unlike `codex-acp`; using it as orchestrator changes the Claude-first promise and does not fix ACP child instructions.
- **Advisor:** first-rung `claude -p … --model opus --effort high` completed and confirmed the main gaps; review recorded in the research note. A later narrow hook/transport consult (`--effort medium`) was stopped for handoff before returning; no result or pending worker to rely on.
- **Verification this session:** `bash scripts/check-spine.sh` → `spine clean`, exit 0. No build, runtime matrix or adapter smoke run; no task marked done. Another session landed task 2 as `2d6ad3c26`; that build was not rerun here.
- **Concurrent work:** tasks 4 and 7 remain claimed by Comprehend [12ee2f]. At handoff, `ui/desktop/package.json`, `ui/pnpm-lock.yaml` and untracked `.agents/` were other ongoing work; preserve them. This evaluation owns only its research note and this handoff addition. No source code or architecture rules changed by this session.

### docs/2026-09-18-ux-parity-plan-v1.md — tranche 7 (approved 2026-09-18)

Approved 2026-09-18 on the user's delegation; all 17 gate decisions as recommended (17 → Permissions; 6 → CLT already current, proc-macro rebuild pending — see 77). Order (plan §Approach): wave 1 = 73 ∥ 74 ∥ 75 ∥ 76 ∥ 77 (Rust, gated) ∥ 78 ∥ 79 ∥ 80 ∥ 81 (disjoint files); wave 2 = 82 (75) ∥ 84 (74, 76) ∥ 85 (73, 74, 76) ∥ 86 (76) ∥ 87 (76) ∥ 88 (78) ∥ 89 (77) ∥ 90 (79) ∥ 91 (80) ∥ 92 (81); wave 3 = 83 (82, 85, 86, 87, 94) ∥ 93 (88) ∥ 94 (74, 84) ∥ 95 ∥ 96 (90) ∥ 97. Each pane's own "Add to chat" affordance is owned by that pane's task.

- 88. Undo this turn: the shell takes `T0` = `/git/snapshot` on send and `T1` on streaming→idle, keeps `{turnId → {T0, T1}}` per project in `project-storage.ts`; pure `turn-undo.ts` (+ test): the turn's file set from `diff --name-status T0 T1`, refused when a later turn's set intersects it; Undo = `/git/diff T1..T0` applied through `/git/apply` (task 48), created files removed, with **Redo** in place (the reverse patch, task 50's pattern); a slot in `UserMessage.tsx`'s action row ("Undo this turn" / "Redo this turn").
  - status: done · agent: session-wave2 [Fable, worktree worker per AGENTS.md chain] · worker: high
  - card: as the user, take back everything one turn did to the tree without hunting for the files, so that letting the agent try costs nothing (chat-panes research §11; Codex desktop's undo)
  - UX test plan (walk `turn undo`): setup — scratch repo, `notes.md` committed; steps — (1) ask the agent to append `t88-a` to `notes.md` and create `made.txt`; wait for idle; (2) hover the user bubble → "Undo this turn" (`turn-undo`) enabled; (3) click → `notes.md` matches HEAD, `made.txt` gone, the control now reads "Redo this turn", a divider under the turn says "turn undone"; (4) Redo → both back; (5) send a second turn that edits `notes.md` again → the first turn's Undo is disabled with title "a later turn changed notes.md"; (6) keyboard: the control is in the bubble's action row Tab order; states — ready · partial (turn has a `T0` but no `T1` — still streaming — disabled "in progress") · error (apply refused → the row shows git's stderr, Redo hidden) · empty (a turn with no file changes shows no control); phone: the action row shows on tap (existing behaviour); human-only: snapshot cost on a large repo (`add -A` twice per turn — decision 12), `git gc` pruning an unreferenced tree mid-session
    - 2026-09-18 (session): worker branch worktree-agent-a07e5e31cafedb11e (1d6696c3b) not merged: T0/T1 capture is wired and turn-undo.ts is pure, but /git/snapshot on its branch reads `git rev-parse --git-path index` and copies it relative to the process cwd (3 sidecar snapshot tests fail) — resolve it against the toplevel; walk not run. Snapshot timing measured by the worker: ~10–20 ms per turn on this repo (decision 12)
    - 2026-09-19 (session): merged to main — the snapshot index path resolves against the toplevel (sidecar 88 tests green, incl. the three snapshot cases); /git/diff gains `nameStatus` and a two-tree `base..head` form beside numstat; T0/T1 capture wired in the shell; typecheck, eslint and 238 workspace tests green. NOT done: `just walk "turn undo"` needs a live model turn and the Claude seat is out of credits; `grep -q turn-undo UserMessage.tsx` → ok
    - 2026-09-21 (session): the bubble read `PaneContext` for its snapshots and the chat renders outside the pane tree, so no button ever showed; a `TurnUndoSlot` (the file-link slot's pattern) now hands the shell's `snapshotsFor`/`undo` to `UserMessage.tsx`, snapshots live in shell state (localStorage the durable copy) so the button appears when T0 lands, and `undo` refuses on a later turn's file set (`laterTurns` + `intersects`, `turn-undo.test.ts` 6 cases), applies the two-tree diff through `/git/apply` (reverse for Undo) and appends a "Turn undone"/"Turn redone" divider. Runs: `just walk "turn undo"` → 1 passed (21.7 s); typecheck 0; eslint 0; i18n:check green (five new keys seeded into 15 locales; 60 orphan keys from the upstream merge removed)
  - confirm: `cd ui/desktop && grep -q "turn-undo" src/components/UserMessage.tsx && echo ok` → `ok` (untouched: exit 1); `just walk "turn undo"` → 1 passed (untouched: no spec)

- 89. Approve mode, desktop half: `ToolCallConfirmation.tsx` gains testids (`tool-confirmation`, `tool-confirmation-diff`, `tool-approval-allow-once|always-allow|deny`), a diff row rendering task 77's forwarded `diff` block through `unified-diff.ts`, a partial bar ("waiting for <seat>") and `TOOL_CONFIRMATION_STATES`; Session controls gains one line under the Mode radios naming what the current seat does with Approve (`workspace-config-mode-note`: Claude asks for risky actions · Codex asks outside the workspace · Cursor plans without editing · agy cannot ask) and the Error row when a seat refuses the change (`sessionConfig.ts:65-72` surfaced).
  - status: done · agent: session-wave3 [Fable, sonnet worktree worker] · worker: medium
    - 2026-09-21 (session): live on `claude-acp`, the walk found four things the unit tests could not. (1) Upstream's inline approval (the tool row, `ToolCallWithResponse.tsx`) wins whenever the confirmation id matches a tool request, and it had neither the testids nor the diff — one shared `ToolConfirmationBody` now renders in both the standalone card and the row, the diff riding through `messageRowContext.confirmationDiff`. (2) The buttons' state map was keyed by `generation ?? id`; once the response landed the store swapped the local request (with generation) for the persisted confirmation (without), the decision was forgotten and the buttons re-armed on a call that had already run — keyed by call id now, reset only for a new pending request. (3) `DropdownMenuRadioItem` closed Session controls on a mode pick, so the note was only readable during the close animation — the radios keep the menu open. (4) The adapter's title is `Write /abs/path/probe.txt` (passed through as 89 asked), and under Approve the server refuses a switch to agy ("agy runs `--dangerously-skip-permissions`; it cannot ask" — task 77) — the walk now matches the path loosely, asserts the refusal toast under Approve, then sets Auto and asserts the switch and the note. Runs: `just walk "approve mode"` → 1 passed (20.8 s; Deny → file absent, Allow → file present, agy refused then accepted, Tab·Tab·Enter → Denied once); the six-walk batch below → 6 passed
    - 2026-09-19 (session): merged to main (5e8d731af); unit confirms rerun on main pass (1 passed, grep 1, typecheck clean, 676 component+workspace tests). `just walk "approve mode"` not run — it needs a live `claude-acp` seat and the Claude seat is at its monthly spend limit; 89 stays open on that walk alone.
  - card: as the user, see exactly what the seat wants to do — the file and the diff, by the tool's real name — and know before I pick Approve what that seat will actually do with it (approve-mode research §Options pick A + C's copy)
  - UX test plan (walk `approve mode`, on `claude-acp`): setup — Advanced on, scratch repo; steps — (1) Session controls → Mode → Approve; the note under the radios reads "Claude asks for risky actions"; (2) prompt "create probe.txt containing HELLO using your file-write tool"; (3) a card appears (`tool-confirmation`) titled `Write probe.txt` with a diff row showing `+HELLO`; (4) click Deny (`tool-approval-deny`) → the card collapses to `Write probe.txt · Denied once`, `probe.txt` does not exist, the reply names the refusal; (5) repeat the prompt, click Allow once → the file exists; (6) switch Runtime to agy → the Mode row shows the Error state "agy cannot ask — Approve unavailable" and Mode stays Auto; (7) keyboard: the three buttons by Tab, Enter; states — empty (no pending call) · loading (card up, waiting on the user — the partial bar names the seat) · partial (a seat that never asks: the note says so) · error (refused mode change) · ready; phone: the card is the same component in the chat stage; human-only: a real Deny mid-edit on Codex (`read-only` asks only outside the workspace), Always Allow on an ExitPlanMode prompt flipping the seat to `auto` (approve-mode research unknowns)
    - from 77 (2026-09-18): the permission update now carries `_meta.goose.toolCall.toolName` and a `ToolCallContent::Diff` block (path, oldText?, newText) beside the prompt text; agy refuses Approve/SmartApprove/Chat with RequestFailed("agy runs `--dangerously-skip-permissions`; it cannot ask"); Cursor Approve maps to `plan`
    - toolchain note (2026-09-18): `cargo clippy -p goose --all-targets -- -D warnings` fails on 1.98.1 with 24 pre-existing lints in agents/extension_manager.rs, extension_malware_check.rs, mcp_client.rs, agent.rs, extension.rs (large Err variants, useless format!) — none in files 77 touched; the clippy gate needs its own task before any Rust merge claims it green
  - confirm: `cd ui/desktop && pnpm vitest run src/components/ToolCallConfirmation.test.tsx -t "renders the adapter diff" 2>&1 | grep -E 'Tests'` → contains `1 passed` (untouched: `0` matching); `grep -c "workspace-config-mode-note" src/workspace/SessionControls.tsx` → `1` (untouched: `0`); `just walk "approve mode"` → 1 passed (untouched: no spec)

- 96. The plan-gate walk and the live overrun count: `tests/e2e/plan-gate.spec.ts` per task 90's UX test plan (steps 1–7 + phone width); then ten live Hard runs on `claude-code` with the gate on, recorded in `docs/2026-09-18-plan-gate-runs-v1.md` (overrun count, wall clock, the model); > 1 overrun in ten → the spine gate (plan-mode research option (ii)) becomes a task — decision 13.
  - status: todo · agent: — · worker: medium
  - card: as the user, know the gate holds in practice, not only in a rule (plan-mode research §8 "the walk catches the overrun")
  - context: the walk needs a signed-in `claude`; the ten runs cost ten Hard turns on Claude Max — the seven-day utilization read 0.87 (`allowed_warning`) during the approve-mode probes on 2026-09-18, so schedule them after the window resets
    - from 90 (2026-09-18): the `rpi strip` walk (a live Hard session that must delegate to the researcher) fails on main today at 'Research active' after 120 s — and fails the same way with the plan gate off, with the orchestrator role's gate line removed, and with the desktop sources checked out at 3317f25ba (before wave 1); the Claude seat answers `claude -p` in 5 s. Not a regression of 79/90; the live orchestrate path needs its own look before this walk is written
    - 2026-09-22 (session, user: "test this out with goose and show me this working today"): the live orchestrate path, measured. Headless it works on every path tried — `GOOSE_PROVIDER=claude-code GOOSE_MODEL=claude-opus-5 goose run --no-session -t "<the rpi-strip prompt>"` from the repo root: researcher on `cursor-acp` grok-4.6-medium (the 1-in-10 roll; no "binary does not resolve" warn in the log, `logging.rs:37` carries `goose=info`) in 68 s; `GOOSE_RUNTIME_ROLL_SEED=0` → agy gemini-3.8-flash-high in 33 s (child 15 s); the same with `GOOSE_STATE_MACHINE=1` in 50 s — the child gets the role body as its first message and returns a brief (sessions `20260922_2/5/8`, parents `_1/_4/_7`). The desktop walk lit Research active (screenshot in the run's `test-results/`), the child `20260922_2` on agy was created in the walk profile with the role and the task and never wrote an assistant message; 63 s later the orchestrator replied "the delegation timed out without returning anything" and the strip never reached done (`rpi-strip.spec.ts:67`). Ruled out: Claude Code's `MCP_TOOL_TIMEOUT` (default 1e8 ms, read from the binary), the loop path (the desktop sends `unrolledAgentLoop: true`, `settings.ts:107`; headless passes under both), agy itself (PONG in 5–16 s on the user's profile, the walk profile, a fresh temp dir and under hermit's Node; it is a Mach-O binary), the cwd. Not yet read: what the agy child's stderr said — the adapter forwards it at `debug` only (`acp/provider.rs:1464-1490`) and the walk's goosed log holds nothing past the connection — and the delegate tool result the claude-code adapter saw (external-dispatch tool rows are not persisted). The first walk died earlier still: upstream's "New Recipe Warning" for the Orchestrator role on the fresh per-launch profile (task 147) — `trustRecipeIfAsked` added after Hard in `rpi-strip`, `agents-pane` and `artifact-pane` (`review-pane` had it)
    - later the same day: the cause is task 154 — the sync delegate's ~60 s cap on the claude-code side, reproduced headless; the desktop is exonerated
  - confirm: `just walk "plan gate"` → 1 passed (untouched: no spec); `test -f docs/2026-09-18-plan-gate-runs-v1.md && grep -c '^| ' docs/2026-09-18-plan-gate-runs-v1.md` → `≥ 11` (untouched: no file)

### docs/2026-09-20-program-plan-v1.md — tranche 9 (approved 2026-09-20)

Approved 2026-09-20 (user: "Ok orchestrate it"); pick B of `docs/2026-09-20-program-rest-research-v1.md`. Order: 103 ∥ 105 ∥ 106 (one `Justfile`, one sitting) → 104 (three specs, walks rerun) → 108 (doc draft) → 107 (rule change; waits on two advisors on runtimes other than Claude). Tranches 10–12 are planned at their gates.

- 107. Revise `AGENTS.md` §Model routing on the evidence, one dated row under the table, naming the mechanism it governs: the evidence is from the session's Agent-tool worktree subagents (`model: haiku` for tranches 1–7's workers, `model: sonnet` for wave 3), not from the table's `claude -p --model haiku` CLI rung — 17/17 haiku diffs needed session corrections (`tasks.md` §Waiting "Worker routing evidence"), and three sonnet workers stalled on task 83 without a line while the Sonnet endpoint timed out (2026-09-19; whether the stall was the endpoint or the worktree isolation is untested — one worker on a trivial task once the endpoint answers would tell). The rule change proposed: the worker chain's first rung for `worker: medium` and above is a sonnet-class model, haiku keeps `worker: low`; a stalled worker that leaves an empty worktree is retried once, then the session implements (as 83 was); the row says which mechanism (Agent tool vs CLI) each rung names. Takes one advisor per lens (architect, PM) on runtimes other than the one that drafted it, per AGENTS.md; the row lands only with their verdicts quoted.
  - status: blocked · agent: — · worker: —  (session; a rule change)
  - blocked: the row is drafted with both advisors' changes in `docs/2026-09-20-agents-routing-row-v1.md`; the session's edit to `~/github/agent-workspace/AGENTS.md` was refused by the permission classifier (an agent-instructions file) — owner: user, paste the row or say "apply it" from an interactive session; then run the two confirms
  - card: as the user paying for three seats, route work to the rung that lands it, so that the session stops redoing worker output
  - context:
    - `AGENTS.md` lives in `~/github/agent-workspace` (global rules), not this repo — the edit is there; this repo's `tasks.md` records the pointer
    - the advisor chain's first rung (`claude -p … --model opus`) is dark while the seat is out; the row waits on an advisor that answers, or on the user
    - 2026-09-22 (session): the evidence grew — tasks 138–151 all ran `agent: session` on the Claude seat while Codex, Cursor and agy sat idle, which is why Claude Max ran dry on 2026-09-19 and the $20 seats never hit a limit; once the row lands, `worker: medium` and above goes to a worker, research to agy and review to Codex per PRODUCT.md §6, and the session only reruns `confirm:`
  - confirm: `grep -c "2026-09-19" ~/github/agent-workspace/AGENTS.md` → `≥ 1` (untouched: `0`); `python ~/github/agent-workspace/scripts/check-reach.py` → PASS


### The beta gate — the reds of the first full run (2026-09-20, user: "fix the reds. add to tasks.")

`just test-full` ran end to end for the first time since the 1.98.1 move (24.0 min): clippy green, spine clean, Rust light suite 90/91 (one flaky), sidecar 89, desktop 1231, walks 34 passed / 8 failed. Five of the eight need a live Claude seat (agents pane, artifact pane, review pane, rpi strip, turn undo — tranche 10). The three below are headless. 112 is the user's ask the same turn: a macOS app to try.

### One tabbed panel, split by drag only (approved 2026-09-20, user: "make it only one tabbed panel on the right … tabs easier to read, connect more with the panel like actual tabs" → option B, "actually do B")

Option B: one pane visible by default, every open pane a tab, the pressed tab the visible one; the split survives only as a drag — drop a tab onto the top or bottom half to show two panes, the seam between them as today; the header's three position icons go. Tabs restyle as attached tabs. Order: 113 → 114 → 115 → 116 (walks and DESIGN.md last, all on main).

### Per-panel tab bars (approved 2026-09-20, user: "1 or 2 tab bar menu … starts off with 1 … add a tab with the + … second tab bar menu is identical to the first" → option A)

Each panel owns its tab bar; the bar holds only open panes; + adds one; drag a tab onto a half makes the second panel with an identical bar; a panel whose last tab closes goes. The permanent launchers (task 71) are retired. Order: 117 → 118 → 119 → 120, all on main.

### docs/2026-09-20-work-ledger-plan-v1.md — the Telemetry pane over a work ledger (approved 2026-09-20, user: "ok draft a plan" → "build the tasks")

A + A4 from the research (`docs/2026-09-20-telemetry-pane-research-v1.md`), the PRD `docs/2026-09-20-work-ledger-prd-v1.md`, the prototype `docs/mockups/2026-09-20-work-ledger.html`. Order: 125 ∥ 126 → 127 ∥ 128 → 129 ∥ 130 ∥ 131 → 132 → 133, all on main. Only the user can verify: the hand-counted rows against their own count, the routing-change date, whether the Claude seat reports `cacheReadTokens`.


### docs/2026-09-20-closeout-plan-v1.md — closeout (approved 2026-09-20)

One branch, one remote, merged worktrees gone, every open workstream handed to its owner. Order: 134 → 135 → **user pushes** → 136 → 137. The push is the user's (the classifier refuses it from a session).

### Beta follow-ups (approved 2026-09-21, user: "approved" on the recommendation)

- 138. Attach on the workspace route: find the second cause hiding the composer's attach button in Easy and Advanced (the quiet gate was lifted in 4ef77d78d; the `easy mode` walk still read zero `chat-attach` — suspect `isBottomBarNarrow` at the Chat column's width, or the button's `!isBottomBarNarrow` fragment), fix it, and add the `chat-attach` count-1 assertion back to `easy-mode.spec.ts`.
  - status: done · agent: session · worker: medium
    - 2026-09-21 (session): the suspicion held — upstream's one "narrow" gate (`bottomBar < 480px`) hid attach and the folder with the facts, and a three-column window at 1200px leaves the bar at ~320px. Two widths now: under 480 the facts drop; under 300 the folder and branch; attach stays in every row. `easy-mode.spec.ts` asserts `chat-attach` and `chat-folder` count 1 in Easy. Runs: `just walk "easy mode"` → 1 passed
  - card: as the user, attach a file from the composer on the workspace route, so that the beta's chat has the one control every chat has
  - confirm: `grep -c 'chat-attach' ui/desktop/tests/e2e/easy-mode.spec.ts` → `≥ 1` (untouched: `0`); `just walk "easy mode"` → 1 passed

- 139. Three flaky spots in the harness: (a) the first walk after a source change dies with "Target page, context or browser has been closed" during launch — the fixture retries the CDP connect once when the page closes within the first 10 s; (b) `command-palette.spec.ts` "Terminal pane lets ⌘K through" depends on the dock a previous test left — it calls `emptyDock` first; (c) `bridge_broadcasts_delegate_started_and_done` fails only in the batch — find the shared state (a static, a port, an env var) with `--test-threads=1` vs default and isolate it.
  - status: doing (a done; b, c open) · agent: session · worker: medium
    - 2026-09-21 (session), (a): three causes, each with its fix in `fixtures.ts`. Stale Electrons from an aborted run kept the debug port, so the next run attached to a windowless corpse (and both wrote one `main.log`, which is why the evidence contradicted itself) — `freeDebugPort` kills whatever listens on the port before launch and after teardown. The dev renderer's first load never mounts on a cold Vite cache (`start-gui` wipes it every launch) and reloads 4–5 s in — `start-gui:walk` keeps the cache and `just walk` builds the ACP client once up front; the attach waits for main's "React ready" line on stdout. The window still closes itself ~1.5 s after mount about one launch in four (no IPC, navigation or crash in main's log; the process stays up windowless) — a launch whose window closes is killed and started again, once; the fixture has its own 150 s timeout so a cold build cannot eat the test's 60 s. Runs: `just walk "turn undo|session menu|pane menu|easy mode|approve mode|usage ring"` → 6 passed (2.8 min), no relaunch needed; earlier batches of 3–4 launched clean after the port guard. The self-close is not explained — if the relaunch fires often, that is the next lead. Later the same day: `review branch` walked green for the first time (1 passed, 59 s) once the walk answers upstream's recipe-consent dialog (`trustRecipeIfAsked`, `recipe-trust` testid on the modal's button). (d) `src/notifications.test.ts` fails 9/9 with `window.localStorage` undefined under the system Node 26 — under hermit's Node all 150 files pass (1350 tests, 2026-09-22); the §Environment line says so; closed
  - card: as the session, trust a red walk on the first run, so that every red is a finding and not a rerun
  - confirm: `for i in 1 2 3; do just walk "dock"; done` → 3 × 1 passed; `just walk "command palette"` → 7 passed twice in a row; `cargo test -p goose --lib -- session_bridge summon scheduler` → `0 failed` three times

### Composer row, round 2 (approved 2026-09-21, user: "is there something we can do to improve on this? … the ux is rough" → options A/B/C → "option a - easy is quiet"; PRD `docs/2026-09-20-composer-row-prd-v1.md`)

- 140. Easy is the PRD's four: the Easy row is **lever · folder · attach · send** — `WorktreeChip` and `RoutineChip` leave Easy (both stay in Advanced; the worktree is one lever-tooltip away and in the ⋯ menu), dictation's mic shows in Easy only while recording, and the `worktree` walk switches to Advanced before it reaches for the chip.
  - status: done · agent: session · worker: medium
    - 2026-09-21 (session): Easy's chips are the lever alone (`WorkspaceShell.tsx` `chips`); the mic (`chat-dictate`) renders in Easy only while recording, and upstream's new Live voice button (the waveform, from the 2026-09-21 merge) only in Advanced or during a call; `worktree`, `review branch` and `board` switch to Advanced for the chip. Runs: `just walk "easy mode"` → 1 passed; `just walk "worktree|usage ring|session menu|board|review branch"` → 7 passed (runs inbox and studio light matched the pattern too); `grep -c WorktreeChip WorkspaceShell.tsx` → 2 (the import and Advanced's one use — the confirm below counted the two uses, now one)
  - card: as the user in Easy, see four controls under the prompt and nothing that needs explaining, so that the row is as quiet as the mockup I picked
  - confirm: `just walk "easy mode|worktree"` → 3 passed; `grep -c "WorktreeChip" ui/desktop/src/workspace/WorkspaceShell.tsx` → `1` (untouched: `2`)
- 141. Advanced, one glyph per meaning and one type: the seat chip drops the cube (the cube is the model's — the user's word) for a seat glyph; the model chip shows the resolved model id (`latestInference.resolvedModel`, mono per the PRD) and hides when the seat reports only `current`; the folder and branch chips set in the row's sans like every other chip; Session controls (the sliders, label-less) moves to the right group beside attach, where the icon-only controls live.
  - status: done · agent: session · worker: medium
    - 2026-09-21 (session): the seat chip draws `CommandLineIcon` (the seats are CLIs); the model chip takes `latestInference.resolvedModel` when the seat says `current`, and hides when neither is known; `SessionChipsSlot` hands the row `{left, right}` and Session controls rides in `right`, before attach. The folder and branch already set in sans — the walk now proves it (`getComputedStyle` of `chat-folder` equals the seat chip's face and is not mono; the model id is), and that the seat and model glyphs differ. Runs: `just walk "easy mode"` → 1 passed; 297 workspace + ChatInput unit tests
  - card: as the user in Advanced, read the row left to right as seat · mode · worktree · folder · branch, then the tools, with no glyph used twice and no placeholder word, so that I can tell the model from the seat at a glance
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/SessionChips.test.tsx src/components/ChatInput.test.tsx 2>&1 | grep Tests` → passed; `grep -c "CubeIcon" ui/desktop/src/workspace/SessionChips.tsx` → `0` (untouched: `1`); `just walk "easy mode|usage ring|session menu"` → 3 passed
- 142. The row on the board: `DESIGN.md` §Vocabulary gains the two rows as written (Easy: lever · folder · attach · send; Advanced: seat · mode · worktree · folder · branch · model — then controls · attach · send), and the ux_tests `DESIGN_LANGUAGE.md` §3.1 rule "one glyph, one meaning" is quoted there.
  - status: done · agent: session · worker: low
    - 2026-09-21 (session): the chip row in §Vocabulary amended; `grep -c "One glyph, one meaning" DESIGN.md` → 1
  - card: as the next session, find the row's rule in one place, so that a chip never comes back without a decision
  - confirm: `grep -c "one glyph, one meaning" DESIGN.md` → `1` (untouched: `0`)

### Less testing (approved 2026-09-21, user: "please also reduce the amount of testing we have to do for melody" → options A–D → "approved your recommendation": A + D now, B next, C when the tag gate hurts)

- 143. The smoke gate: eight seat-free walks tagged `@smoke` (pane menu · files · changes bar · editor · git · three columns · dock · markdown), `just smoke` runs them; every walk that spends a live Claude turn is tagged `@seat` and runs only through `just test-full`; the ground rule reads smoke + the walk touched.
  - status: done · agent: session · worker: low
  - card: as the session, verify a task in one short run instead of guessing which walks a change might touch, so that a red is a finding and green costs four minutes
    - 2026-09-21 (session): `just smoke` → 9 tests (8 specs) in 3.7 min the first run (8 passed, dock red on a launch that died and relaunched), 7 passed the second (5.8 min; markdown pane and pane menu red at launch). The launch deaths are the walk's, not the smoke gate's — see 139a and 147. `walk-prep` now does every launch-time build once per run (ACP client, sidecar, locales); a launch is `electron-forge start` alone
  - confirm: `just smoke` → 8 specs passed under 6 min (untouched: no recipe); `grep -l "tag: '@seat'" ui/desktop/tests/e2e/*.spec.ts | wc -l` → 18
- 144. The hand-check backlog to what only the user decides: §Notes and hand checks holds the decisions (one line each), one finding-turned-work, and four environment lines; the per-task "try X" lines leave (git keeps them).
  - status: done · agent: session · worker: low
  - card: as the user, see the dozen calls that are mine in one screen instead of forty lines of checks, so that a sitting with the app answers them all
  - confirm: `awk '/^### Notes and hand checks/{f=1} /^## Ownership/{f=0} f' tasks.md | grep -c "^- "` → `≤ 20` (untouched: 55)
- 145. (next, B) Fold the walks that prove only a render into unit tests and retire them: turn-undo's button, the dock/pane-store walks re-proving `pane-store.test.ts`, loading-state — target 39 → ~27 specs.
  - status: todo · agent: — · worker: medium
  - card: as the session, spend a launch only where a launch proves something a unit test cannot, so that `test-full` fits in a coffee
  - confirm: `ls ui/desktop/tests/e2e/*.spec.ts | wc -l` → `≤ 30` (untouched: 39); `just test-full` → green
- 147. Walks on their own profile: the dev app under test and the user's running Goose.app share `~/Library/Application Support/Goose` (Electron `userData` — Local Storage, the dock, the theme) and goosed's `~/.local/share/goose/sessions.db` — the user's sidebar fills with the walks' "Respond with the single" sessions, and two Electron instances on one profile is the best remaining explanation for windows closing 2–5 s after launch (139a: no IPC, navigation or crash behind them). The fixture points the app at a scratch profile — `GOOSE_PATH_ROOT=<scratch>` for goosed with the user's `config.yaml` copied in at `walk-prep`, and a `GOOSE_USER_DATA` (or `--user-data-dir`) the main process honours under `ENABLE_PLAYWRIGHT` — so a walk never writes where the user reads.
  - status: done · agent: session · worker: medium
    - 2026-09-22 (session): `GOOSE_PATH_ROOT=$TMPDIR/goose-walks-profile` for goosed (config.yaml copied from `~/.config/goose` when newer, everything else there and `~/.agents` linked so the seats sign in as the user) and `GOOSE_USER_DATA` — honoured by `main.ts` before the settings path is read — as a fresh `userData-*` per launch, removed at teardown (a shared one leaked the dock from test to test the first time). Runs: `just smoke` ×3 → 9 passed (2.4 min), 8 passed + one `changes bar` stats race (1.5 min), 9 passed (2.4 min); 0 relaunches in 27 launches; the user's `sessions.db` 293 → 293 across them. The seat walks were not rerun on the profile (the run was stopped)
  - card: as the user, run the app while walks run and see only my own sessions, so that testing never shows up in my sidebar or my window
  - confirm: `sqlite3 ~/.local/share/goose/sessions/sessions.db "select count(*) from sessions where name like 'Respond with the single%'"` unchanged across a `just smoke` (untouched: grows by 3+); `just smoke` × 3 → 0 "relaunching" lines
- 146. (later, C) Walks in parallel: a per-app sidecar port (the fixture hands each launch its own, the renderer reads it from the sidecar URL it already gets), `workers: 3` in `playwright.config.ts` — when the tag gate starts to hurt.
  - status: todo · agent: — · worker: medium
  - card: as the session, run the tag gate in under ten minutes, so that a tag is cheap enough to cut often
  - confirm: `grep -n "workers:" ui/desktop/playwright.config.ts` → `3`; `just test-full` → green in under 12 min

### docs/2026-09-21-sidebar-tabs-prd-plan-v1.md — sidebar tabs (user: "organize this left side … reduce the amount of needed groups. add search and sorting" → option C → three mockups → "c1", then "wait, c3" 2026-09-22; approved as C3)

- 148. Pure sidebar logic: `src/workspace/sidebar-sessions.ts` — `repositoryOf` (a `.worktrees/<slug>` cwd folds to its repo and names the slug; `$TMPDIR`, `/var/folders`, `/tmp` → `elsewhere`), `repoChips` (All first with the total, one per repo with its count, Elsewhere last), `dayOf` (Today · Yesterday · weekday within the week · date), `groupByDay`, `sortSessions` (recent · name · project), `filterSessions` (`{repo, query}` on title, repo and slug, case-folded) — with `sidebar-sessions.test.ts`.
  - status: done · agent: session · worker: medium
    - 2026-09-22 (session): `sidebar-sessions.ts` + 10 tests (repositoryOf, tempRoots, repoChips with leaf disambiguation, filterSessions, sortSessions, dayOf/groupByDay); `pnpm vitest run src/workspace/sidebar-sessions.test.ts` → 10 passed
  - card: as the user, press one repo and see its chats by day with worktrees folded in, so that the list is about my projects and not my checkouts
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/sidebar-sessions.test.ts 2>&1 | grep Tests` → `≥ 10 passed` (untouched: no file)
- 149. The bottom tab bar: `NavigationPanel.tsx` renders **Chats · Library · Automate · Settings** as ARIA tabs at the rail's foot (icon over label, the active one in the accent, roving arrows, the tab remembered in localStorage); `NAV_ITEMS` gains `tab: 'library' | 'automate'`, loses the `home` and `sessions` rows; Library lists Recipes · Skills · Apps (when on) · Extensions, Automate lists Board · Scheduler with the summary card when its data is there.
  - status: done · agent: session · worker: medium
    - 2026-09-22 (session): `NavigationPanel.tsx` renders the four ARIA tabs at the foot (roving arrows, `sidebar-tab` remembered; Settings a route, selected while on it); `NAV_ITEMS` carries `tab`, `home` and `sessions` left the rows (`NEW_CHAT_PATH`, `SESSION_HISTORY_PATH`); the Automate summary card is not built — its data (routines' next run, the board's counts) has no rail-side source yet, left for the sitting. Typecheck 0, eslint 0
  - card: as the user, find the eleven things the rail offered under four words at the bottom, so that the column above is the conversation list and nothing else
  - confirm: `grep -c "sidebar-tab-" ui/desktop/src/components/Layout/NavigationPanel.tsx` → `≥ 4` (untouched: `0`); `cd ui/desktop && pnpm run typecheck`
- 150. The Chats panel: search first with **New chat** (`+`, ⌘N) beside it (`/` focuses, Esc clears, "No chats match"); the repo chip row (All · repos · Elsewhere with counts, pressed chip remembered, scrolls sideways); the day-grouped flat list (title + time + unread dot, a meta line with the repo and `· wt/<slug>`), the sort control on the first heading (Recent · Name · Project; Name and Project drop the day headings); **Show all** → `/sessions`.
  - status: done · agent: session · worker: medium
    - 2026-09-22 (session): search (`/` focuses, Esc clears, `sidebar-no-match`), `+` New chat and ⌘N, the chip row (All · repos · Elsewhere with counts, hidden when there is only All, pressed chip and sort remembered), day headings with the sort `<select>` on the first, the row's meta line with the repo and `· wt/<slug>`, Show all → `/sessions`. Runs: `just walk "sidebar"` → 1 passed; the screenshot matched mockup C3
  - card: as the user, type three letters or press a repo and see the chat, so that finding yesterday's session is one gesture
  - confirm: `grep -c "sidebar-search\|sidebar-sort\|sidebar-new-chat\|sidebar-chip-all" ui/desktop/src/components/Layout/NavigationPanel.tsx` → `≥ 4` (untouched: `0`)
- 151. The walk and the board: `tests/e2e/sidebar.spec.ts` (`@smoke`, seat-free — the four tabs and their panels, the search empty state, the All chip, the sort control, ⌘N); `DESIGN.md` §Vocabulary gains **tab bar** (the rail's), **repo chip** and **Elsewhere**; i18n extract + the 15 locales seeded.
  - status: done · agent: session · worker: low
    - 2026-09-22 (session): `sidebar.spec.ts` tagged `@smoke` covers both profile states (sessions or none); DESIGN.md §Vocabulary gained the tab bar row; 18 strings extracted and seeded, i18n:check green. Runs: `just smoke` → 10 passed (3.0 min, the sidebar walk in it); `session menu|three columns|studio light` → 3 passed; full desktop unit suite green; eslint 0
  - card: as the next session, know the rail's words and prove them in one launch, so that the rail does not drift back to eleven rows
  - confirm: `just walk "sidebar"` → 1 passed (untouched: no spec); `cd ui/desktop && pnpm run i18n:check` → green

### Routing follow-ups (2026-09-22, user: "anything you recommend we change?" → "add your recommendations to the plan")

Order: 152 → 139 b/c → 145 → 153 (needs the merged tree; a spine patch). 107 stays the user's paste and is the mechanism behind the third recommendation: the map exists, the session has not been using it.

- 153. Per-role effort: `runtimes:` entries gain `effort:` (`low | medium | high | xhigh`), read by `summon.rs` beside `model` and handed to the adapter as its effort flag (`claude-agent-acp` and `codex-acp` — read each adapter's flag or config key from its `--help`, never guessed; agy and Cursor keep effort in the model name and ignore the field); the role files set Orchestrator, Planner, Reviewer and the five Advisors `high`, Implementer and Researcher `medium`; one unit test on the parse and the pass-through (a spine patch, candidate upstream).
  - status: todo · agent: — · worker: high
  - card: as the user paying per token, spend the thinking where judgment happens and not where diffs are typed, so that each seat costs what its role needs
  - context: role files carry only `{provider, model, weight}` (`summon.rs:174-176`); a delegated child inherits the parent's `thinking_effort` (`summon.rs:4165`) but neither `claude_acp.rs` nor `codex_acp.rs` reads it — effort on the Claude and Codex seats is the adapter default today
  - confirm: `grep -c "effort:" .agents/agents/*.md | grep -vc ':0$'` → `10` (untouched: `0`); `cargo test -p goose --lib -- summon effort` → `0 failed`

### docs/2026-09-22-ux-must-should-plan-v1.md — UX Must + Should (approved 2026-09-22, user: "queue those all up in a plan with tasks, and orchestrate" → "focus on must and shoulds")

Order: 154 (above) ∥ 155–157 (mockups, session) ∥ wave 1 (158 · 160 · 161 · 162 · 163 · 170 · 173 · 174 · 175 · 179, disjoint files; 180 session) → 159 · 169 · 172 → 93 (above, after 158) → user picks → 164–168 · 171 → 176 last. Mockups for the pick: `docs/mockups/2026-09-22-lever-words.html` (164), `-turn-failure.html` (165), `-states-sheet.html` (166–168, 171). Two calls made under "orchestrate" that were the user's: 179 resolves the sidebar spec-vs-rule as the spec, 174 picks "Describe a task…". Workers per AGENTS.md chain; the session reruns every confirm. Evidence: `docs/2026-09-22-ux-pass-research-v1.md`, screenshots in `docs/2026-09-22-ux-pass/`.

- 181. A reconnect during a turn loses the turn's reply (umbrella for 197–200, plan `docs/2026-09-23-task181-shared-run-plan-v1.md`; closes when 200 passes): every ACP connection builds its own `AgentManager` (`acp/server.rs:2784` → `create_agent()`, `server.rs:969`), so after the desktop's socket recovers (`acpConnection.ts:72-184`) and `ChatSessionsContainer.tsx:44-53` restores each open session, `execution/manager.rs:212` "Restoring evicted" builds a fresh Agent and the running turn's stream has no listener — the parent keeps only the user message. Found under task 154 (2026-09-22), where the reconnects came from the session's own workers editing renderer files under the dev app (Vite hot updates); in the product the trigger is a system resume (`reconnectAcpAfterSystemResume`) or a dropped socket.
  - status: todo · agent: — · worker: high
  - card: as the user, keep a long orchestrated turn's answer when my laptop sleeps or the connection blips, so that a reconnect is not a lost turn
  - context: options from 154 — (b) share one `AgentManager` across ACP connections as `active_runs` is (`server_factory.rs:87-89`), keeping `--roam`'s per-connection cwd, and re-attach a load to an in-flight run (`load_session.rs:461-483`); (c) the desktop skips `restoreSession` for a session with an active run (stops the duplicate agents, does not recover the stream). (b) is a spine change and an upstream issue; a plan gate first
  - confirm: a walk that starts a Hard turn with a 60 s delegate, calls `reconnectAcpAfterSystemResume()` from the page mid-turn, and still sees the orchestrator's reply → 1 passed (untouched: the reply never lands)
  - 2026-09-23 (session): now M0-b of `docs/2026-09-23-melody-program-plan-v2.md` — option (b), after 196; Melody's long turns depend on it. Codex's plan review adds to the confirm: the session has one agent after the reconnect (a log line counted, not assumed)

- 177. The fork's own roles start without upstream's "New Recipe Warning": `CreateSessionOptions` (`ui/desktop/src/sessions.ts:28`) gains `trustedRole: boolean` (default false); `ensureRecipeConsent` (`sessions.ts:95`) returns before the prompt when it is set; the three app-started role sessions pass it — Hard's orchestrator (`WorkspaceShell.tsx:800`, `:1565`) and Review branch… (`panes/review/review-session.ts:105`). Recipes from the library, deeplinks and anything else still ask.
  - status: blocked — reverted before commit (session, 2026-09-22): the user's yes rested on my framing that these roles "ship in the repo"; they are read from whatever folder is open (`WorkspaceShell.tsx:1564` `orchestratorRole` ← the project's `.agents/agents/orchestrator.md`), so a cloned repo's author would run instructions with no consent. Upstream already asks once per recipe hash, so a real user sees it once per role version; the repeats were fresh walk profiles, which `trustRecipeIfAsked` answers. Waits on the user: drop 177 (recommended), or narrow it to role files whose hash matches the fork's canonical `.agents/agents` · agent: — · worker: low
  - card: as a first-run user, start Hard without a security prompt about a file that ships in my repo (user: yes, 2026-09-22; `tasks.md` §Notes recipe consent)
  - confirm: `grep -c "trustedRole: true" ui/desktop/src/workspace/WorkspaceShell.tsx ui/desktop/src/workspace/panes/review/review-session.ts | grep -v ':0$' | wc -l` → `2` (untouched: `0`); `just walk "rpi strip"` → 1 passed with `trustRecipeIfAsked` finding no dialog (log line)
- 182. Quota never reaches the failed-turn card (found by 165, 2026-09-22): goose folds every seat's rate-limit and usage-limit error into `ProviderError::CreditsExhausted { top_up_url: None }` (`crates/goose/src/acp/provider.rs:183-207`), the server sends it as `credits_exhausted` with no reset time (`acp/server.rs:1770-1793`), and the desktop turns that into the upstream "credits exhausted" notice (`chatSessionController.ts:200-215`) before the turn fails. Reset times exist only in status snapshots never forwarded — codex-acp `resetsAt`, claude-agent-acp `rate_limit_info` on `usage_update`. 2A (fail-over divider, reset-time card) needs: a `quota_exhausted` / `rate_limited` error kind with `resetAt` from the provider, then the card's quota state. Also: "Switch runtime…" on the card needs the Runtime chip made openable from outside (`SessionChips.tsx`, uncontrolled dropdown).
  - status: todo · agent: — · worker: high
  - card: as the user, see when a seat's window reopens and what took over, so that a closed quota is not a mystery (user pick 2A, 2026-09-22)
  - confirm: `cargo test -p goose --lib acp::provider -- quota` → a test that a codex `usageLimitExceeded` with `resetsAt` reaches the client error with the reset time (untouched: no test matches)

### docs/2026-09-22-melody-rename-prd-plan-v1.md — Goose → Melody (approved 2026-09-22, user: "rename and rebrand everything to be Melody" → "Brand + app identity" → "App folder only", "Turn it off", "Keep goose://", "Yes, edit the prompts" → "Approve, include drawings")

Order: 184 (migration) → 183 (identity); 185 ∥ 186 ∥ 187 ∥ 189 ∥ 190 ∥ 191 on disjoint files; 188 after 187; 192 last; 193 waits on the user's pick. Commits stage only the task's paths (`Lever.tsx` is the user's, uncommitted).

- 193. Draw Melody artwork for the goose drawings: `ui/desktop/src/components/FlyingBird.tsx` (the streaming loader), `ui/desktop/src/components/icons/Geese.tsx` (the recipe modal) and `Rain` in `ui/desktop/src/components/icons/Goose.tsx` (the logo's hover).
  - status: todo · agent: — · worker: high
  - card: as the user, I want no goose drawn anywhere in Melody so that the rebrand is whole (user, 2026-09-22: "Approve, include drawings")
  - context:
    - options first: mockups of each replacement beside the Takes strip emblem (DESIGN.md §Iconography; canonical `ux_tests/docs/melody-style-guide.html`), the user picks before any source edit
    - uses: `FlyingBird` in `LoadingGoose.tsx:46`, `McpAppRenderer.tsx:1001`; `Geese` in `CreateEditRecipeModal.tsx:500`; `Rain` in `GooseLogo.tsx:39`
  - confirm: `cd ui/desktop && grep -rlE "<(FlyingBird|Geese|Rain)\\b" src | wc -l && pnpm run typecheck` → 0 files (4 today), typecheck 0

- 194. Rename the Goose-named UI code in `ui/desktop/src` and `ui/desktop/tests` to Melody: components, files, hooks, i18n message keys, CSS classes, test ids and the `goose-app` package name.
  - status: blocked · agent: — · worker: medium
  - blocked: 192 lands first (the rename moves files the in-flight tasks edit); then an inventory — every Goose identifier sorted into rename vs keep — goes to the user before any edit (owner: session, then user)
  - card: as the next person reading the code, I want the UI's names to be Melody's so that the code and the product are one thing (user, 2026-09-22: "consider this a full ui/ux fork of goose" → "Rename UI code too")
  - context:
    - baseline 2026-09-22: 17 Goose-named files or folders under `src` and `tests` (e.g. `components/GooseSidebar/`, `GooseMessage.tsx`, `LoadingGoose.tsx`, `icons/Goose.tsx`), 119 distinct identifiers matching /goose/i in `src`
    - keep, because they name a real goose thing or stored data: `gooseServe*` and `src/bin/goose` (the `goose serve` process), `gooseAcpClient` and `@aaif/goose-acp-client` (generated from the crates), `Goosehints*` (`.goosehints`), `goose://`, `GOOSE_*`, `persist:goose` (renaming orphans the renderer's localStorage)
    - i18n key renames move every locale's key in the same commit; `i18n:check` must stay green
    - ARCHITECTURE.md §Modules › components (amended 2026-09-22): the UI is Melody's own, upstream UI is not tracked
  - confirm: `cd ui/desktop && find src tests -iname "*goose*" | grep -viE "gooseServe|gooseAcpClient|gooseSessionNotifications|Goosehints|src/bin/goose" | wc -l && pnpm run typecheck && pnpm run lint:check && pnpm exec vitest run` → 0 (6 today), typecheck 0, lint and i18n green, unit tests pass

- 195. Publish Melody builds as GitHub releases on `hoaqbui/melody-agent2` and point the updater at them: `ui/desktop/src/utils/autoUpdater.ts`, `ui/desktop/src/utils/githubUpdater.ts`, `ui/desktop/src/updates.ts`, `Justfile`.
  - status: todo · agent: — · worker: medium
  - card: as the user, I want an installed Melody to pull down my own builds so that a new build reaches the app without a manual copy (user, 2026-09-22: "is there a way where I can run a build, and it pulls down releases?" → option A → "let's add A to tasks for now")
  - context:
    - the updater's two paths: electron-updater first (`autoUpdater.ts:343-351`, feed `aaif-goose/goose`), which needs an Apple-signed app and fails on ad-hoc builds; then the GitHub fallback (`autoUpdater.ts:123-195`, `githubUpdater.ts:458-460`, `:556-584`) that downloads `<bundleName>.zip` and swaps the running `.app` (`:229-240`) — the fallback is the path an unsigned fork uses
    - point both at `hoaqbui/melody-agent2`; `bundleName` already defaults to Melody (task 183); `UPDATES_ENABLED` back to true (task 185 turned it off)
    - a release needs a version above the installed one — the app carries upstream's 1.52.0 (`ui/desktop/package.json`); a Melody version scheme is part of this task
    - a `just release-melody` recipe: bump the version, `just make-ui`, `gh release create v<version> ui/desktop/out/Melody-darwin-arm64/Melody.zip`; publishing is outward-facing, so each release runs on the user's word
    - the fork has no releases today (`gh release list --repo hoaqbui/melody-agent2` → empty, 2026-09-22)
  - confirm: `cd ui/desktop && grep -c "hoaqbui" src/utils/autoUpdater.ts src/utils/githubUpdater.ts && grep -c "UPDATES_ENABLED = true" src/updates.ts && grep -c "^release-melody" ../../Justfile && pnpm run typecheck` → each ≥ 1 (0 today), typecheck 0; then one published release that an older installed Melody offers and installs (the user's hand check)

### docs/2026-09-23-melody-program-plan-v3.md — Melody, the main agent: M0 (approved 2026-09-23, user: "approved and start ochestrating"; v3 scope 2026-09-23: "do must should and could, and we should be v0.9 and ready for alpha testing")

Order: 198 → 200 (199 runs beside M1b); 197 done 2026-09-23 (one server-owned AgentManager, running agents pinned; `task181_shared_ownership` → 3 passed). 196 done 2026-09-23 (forced-sync delegate → SLEPT after 183 s; `just walk "rpi strip"` → 1 passed). 181 is the umbrella; its plan: `docs/2026-09-23-task181-shared-run-plan-v1.md`. M1a is planned at 200's gate. 201 done 2026-09-23 (two stale expectations: the list meta's accumulated usage fields from task 125, and the Melody rename's import message; `test_list_sessions` → 7 passed, `apply_onboarding_imports_continues_after_candidate_failure` → 1 passed, clippy clean).



- 198. The server owns each run; a load re-attaches to it without gaps (181, step 2)
  - status: doing · agent: codex-worker gpt-5.6-sol (wt/t198), verified by claude-session-2026-09-23 · worker: high
  - card: as the user, I want a long reply to keep coming after my laptop sleeps or the Wi-Fi drops, so that Melody's long turns are never lost (FURPS R · MoSCoW Must)
  - context: plan §The change, bullets 2–5; `acp/server.rs:2409`, `:2251`, `:266`, `:2373`; `load_session.rs:392-467`; tests on the duplex harness `tests/acp_fixtures/mod.rs:332`, `acp_fixtures/server.rs:236`
  - confirm: `cargo test -p goose --test acp_server_test task181_reconnect` → 2 passed, one per agent loop (connection A drops after BEFORE; B loads and gets the prefix once, then AFTER and the end; one turn persisted; `Arc::ptr_eq` on the agent) — today the run is cancelled

- 199. Two clients, cancel, close, permission hand-over and isolation on a shared run (181, step 3; beside M1b)
  - status: todo · agent: — · worker: high
  - card: as the user, I want two windows or a reconnect mid-permission to behave, so that a prompt waiting on me is never silently rejected (FURPS R F · MoSCoW Should)
  - context: plan §The change, bullets 6–7 and §Risks; `acp/server.rs:1684`, `:1688`, `:1120`, `:2496`, `:2707`
  - confirm: `cargo test -p goose --test acp_server_test task181_multi_connection` → 6 passed

- 200. The desktop recovers a turn mid-reconnect, and a walk proves it (181, step 4)
  - status: todo · agent: — · worker: high
  - card: as the user, I want the reply to show once and Stop to still work after a reconnect, so that recovery is visible (FURPS R U · MoSCoW Must)
  - context: `chatSessionController.ts:145`, `chatSessionStore.ts:230`, `:684`; the walk calls `import('/src/acp/acpConnection.ts').then(m => m.reconnectAcpAfterSystemResume())` mid-turn (dev walk only), extending `tests/e2e/agents-pane.spec.ts`
  - confirm: `just walk "reconnect during a Hard turn"` → 1 passed with the parent's reply exactly once (today: the reply never lands); `just smoke` → passes; then 181 closes

## Waiting on the user

- 192 — after Melody.app launches: your theme, layout and workspace are kept; the app menu shows Settings…; the microphone prompt names Melody; Browser pane logins survived or not; `goose://` links open Melody (move or delete `ui/desktop/out/Goose-darwin-arm64/Goose.app` if they open Goose); then say whether `~/Library/Application Support/Goose` and `…/Melody.first-launch-2026-09-22` (the empty profile of the first, failed copy) can go.
- 193 — pick the Melody artwork for the loader, the recipe modal and the logo hover from mockups.

### Handoff — one line, one command each (2026-09-20, closeout; the decisions moved under §Notes and hand checks 2026-09-21)

- **Push the fork.** The remote is `origin` → https://github.com/hoaqbui/melody-agent2 (public, forked from aaif-goose/goose today). The classifier refuses pushes from a session. Our history as the fork's main:
  `git push --force origin main && git push origin --tags`
  — or beside upstream's main: `git push origin main:melody && git push origin --tags` then `gh repo edit hoaqbui/melody-agent2 --default-branch melody`. Pushed 2026-09-20 (93989e47c) and again 2026-09-21 (b3b640a02, from the session — the push went through this time; both tags on origin). Pushed 2026-09-22 (3f0e1bd75, the emblem and the sidebar-tabs plan).
- **93 · 96 — the seat:** 88 and 89 landed on the live seat (2026-09-21); 93 (transcript diff cards) and 96 (the plan-gate walk and ten Hard runs) are the rest of tranche 10 — say "run tranche 10".
- **Branch sweep on origin (2026-09-22, user: "clean up worktrees/branches"):** local is clean — one worktree, one branch, no stashes. Origin carries 775 branches besides `main`: `telemetry` (the fork's, fully merged) and 774 copies of upstream's from fork time (upstream keeps all 829). The session's classifier refuses `git push --delete`; the names are in `docs/2026-09-22-origin-branches-to-delete.txt` — `split -l 100 docs/2026-09-22-origin-branches-to-delete.txt /tmp/del_chunk_ && for f in /tmp/del_chunk_*; do git push origin --delete $(cat $f); done`, then `git fetch --prune origin` → `git ls-remote --heads origin | wc -l` reads 1.
- **Upstream merge 2026-09-22:** 9 commits (ACP SDK 1.5 on both sides, recipe parameter limits, provider fixes) merged on main with three conflicts (the SDK version, the lockfile, `schedule.rs`'s factory config losing `data_dir`); behind it: cargo build, ACP schema regenerated (no drift), typecheck 0, eslint 0, 1350 desktop + 97 sidecar + 93 Rust light, `just smoke` 9 passed (2.6 min), `approve mode` + `usage ring` 2 passed.
- **133 — the telemetry session:** landed (f7dd58ea5, aff408be5 both on main); the `telemetry` worktree and branch removed 2026-09-22 (merged, clean).


### Notes and hand checks

Pruned 2026-09-21 (task 144, user: "reduce the amount of testing"): the per-task "try X" lines are
gone — git holds them (`git log -S"hand checks" -- tasks.md`), the walks cover the surfaces, and
`just test-full` is the gate. What stays is what only the user can decide or see, one line each.

**Decisions — say yes/no or pick, and the line leaves**

- **The look at Light** and the four `DESIGN.md` §Open decisions (runtime colour, Esc as pane-close, phone breakpoint, dark canvas off macOS) — one sitting with the app; tranche 11 waits on it. `STUDIO_SHOT=<path> just walk "studio light"` writes the record.
- **`ARCHITECTURE.md` sign-off** — one word deletes §Bootstrap Status (task 108 drafted the paragraph).
- **Iconography** — lucide (upstream's set, the panes) vs Heroicons 16 solid (the composer row, ux_tests) on one app: keep both by surface, or converge.
- **Recipe consent on the fork's own roles** (tasks 70 · 28) — Reviewer, Orchestrator and delegated children pop upstream's "New Recipe Warning" once per hash; skip it for sessions the app itself starts, or keep the gate?
- **`since session start` omits untracked files** (task 14) — `git diff HEAD` shape; accepted gap, or queue?
- **Re-adding a worktree slug fails until its branch is deleted** (task 48) — delete the branch on Remove, or leave `wt/<slug>` as a record?
- **agy is ungated in print mode** (task 17; `permission_mode: always-proceed`) — accepted for V0 with the Reviewer gating the diff; the server now refuses Approve on agy (task 77); still fine?
- **Vibrancy** (task 57) — does the desk show through the charcoal on your display? If not: transparent `backgroundColor` in `main.ts` is the fix.
- **Task 33** — file the upstream issues once the parity fixes have been in use (parked by you 2026-09-16).
- **Task 107** — paste the AGENTS.md routing row (`docs/2026-09-20-agents-routing-row-v1.md`).

**Findings that became work** — a routine runs on the GLOBAL provider/model, not the one the sheet shows (task 59: recipe `Settings` carries no `goose_mode`/cwd, `execute_job` ignores `settings`) — a bug, not a decision; it needs a task when routines matter again.

**Environment — read before running walks**

- Run the desktop suite under hermit's Node (`export PATH="$PWD/bin:$PATH"`): under the system Node 26 (`/opt/homebrew`), jsdom's `window.localStorage` reads undefined and the 9 notifications tests fail (139d is this, not a source change).
- A `pnpm install` in `ui/` drops the executable bit on `node_modules/.bin`; `just fix-bins` (run by `walk` and `smoke`) restores it and writes `~/.skip-forge-system-check`, without which forge spends 15 min in "Checking package manager version".
- Walks share one machine: the sidecar's fixed port 7788 and the debug port mean one walk at a time on this checkout; a second checkout sets `PLAYWRIGHT_DEBUG_PORT_BASE`. The fixture frees its debug port and relaunches once if the window closes (139a).
- 2026-09-22: `target/` vanished mid-session (present at 20:41, gone by 20:52) between a `just copy-binary debug`, two `just walk` runs and a system-pnpm `eslint` that tried a modules purge and aborted; nothing in the Justfile, `fixtures.ts` or `ui/desktop/scripts` removes it. Rebuilt with `cargo build` (13:53). If it happens again, note what ran in between.
- 2026-09-22: never let a worker edit `ui/desktop/src` while a walk runs — the dev app takes Vite hot updates and the ACP socket reconnects on each (task 154's "drops every 2–20 s" were this); run walks between worker waves.
- 2026-09-22: walks run invisible — `fixtures.ts` sets `GOOSE_WALK_QUIET=1`, and `main.ts` opens the window transparent, click-through, never focused, with the dock icon hidden and occlusion backgrounding off (a covered window otherwise stops its timers and the Changes bar poll with them). `WALK_VISIBLE=1 just walk "<name>"` shows the window to watch a walk.
- `just test-full` opens with `cargo clippy` under the fork's two `-A` lints; the Rust light suite's sqlx dylib line is non-fatal on Darwin 27 (decision 6 of the 2026-09-18 parity plan) — a loud marker, never a silent pass.

## Ownership

- **This file owns:** task state — the claim, the 3C body, the check.
- **The plan doc owns:** approach and negative space, and dates the
  change. **`ARCHITECTURE.md` owns:** the boundaries a task may not
  cross.
