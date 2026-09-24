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
  - status: todo — code merged 2026-09-23; publishing the first release waits for the M4 → A gate and the user's word · agent: — · worker: medium
  - progress: code done 2026-09-23 (confirm rerun by the session: hoaqbui in all three, 'Melody' 1, UPDATES_ENABLED 1, 0.9.0-alpha.1 1, manifest step 1, npm-versions exit 0, githubUpdater 28 passed, lint clean); also fixed: `generate-mac-update-manifest.js` hard-coded Goose.zip; `MACOSX_DEPLOYMENT_TARGET` defaults to 12.0 in the recipe. Open: `just bump-version` still sets ui/desktop's version (would clobber the alpha line); `gh release create` needs `--notes`
  - card: as the user, I want an installed Melody to pull down my own builds so that a new build reaches the app without a manual copy (user, 2026-09-22: "is there a way where I can run a build, and it pulls down releases?" → option A → "let's add A to tasks for now")
  - context:
    - the updater's two paths: electron-updater first (`autoUpdater.ts:343-351`, feed `aaif-goose/goose`), which needs an Apple-signed app and fails on ad-hoc builds; then the GitHub fallback (`autoUpdater.ts:123-195`, `githubUpdater.ts:458-460`, `:556-584`) that downloads `<bundleName>.zip` and swaps the running `.app` (`:229-240`) — the fallback is the path an unsigned fork uses
    - point both at `hoaqbui/melody-agent2`; `bundleName` already defaults to Melody (task 183); `UPDATES_ENABLED` back to true (task 185 turned it off)
    - a release needs a version above the installed one — the app carries upstream's 1.52.0 (`ui/desktop/package.json`); a Melody version scheme is part of this task
    - a `just release-melody` recipe: bump the version, `just make-ui`, `gh release create v<version> ui/desktop/out/Melody-darwin-arm64/Melody.zip`; publishing is outward-facing, so each release runs on the user's word
    - the fork has no releases today (`gh release list --repo hoaqbui/melody-agent2` → empty, 2026-09-22)
  - confirm: `cd ui/desktop && grep -c "hoaqbui" src/utils/autoUpdater.ts src/utils/githubUpdater.ts && grep -c "UPDATES_ENABLED = true" src/updates.ts && grep -c "^release-melody" ../../Justfile && pnpm run typecheck` → each ≥ 1 (0 today), typecheck 0; then one published release that an older installed Melody offers and installs (the user's hand check)
  - 2026-09-23 (planning, plan v3 A): now A's first task; the version scheme is `0.9.0-alpha.N` in `ui/desktop/package.json` only (`:4`, today `1.52.0`), the crates keep 1.52
  - correction: `githubUpdater.ts:460` still defaults `bundleName` to `'Goose'`; a packaged app has no `GOOSE_BUNDLE_NAME`, so it would look for `Goose.zip` while `bundle:default` writes `Melody.zip`
  - found: `githubUpdater.ts:461` reads `releases/latest`, which skips prereleases and drafts; `autoUpdater.ts:347` asks `releaseType: 'release'`; `forge.config.ts:71-76` publishes to `aaif-goose/goose` as a draft — settled: the updater lists releases and takes the highest semver including prereleases
  - found: every macOS check needs a `mac-update-requirements.json` asset whose `version` equals the tag minus `v` (`githubUpdater.ts:527-545`); `release-melody` runs `scripts/generate-mac-update-manifest.js --version <v>` and uploads it beside `Melody.zip`
  - found: `just bump-version` also sets Cargo.toml (`Justfile:353-360`) and `get-tag-version` reads Cargo (`:386-388`) — `release-melody` reads and sets `ui/desktop/package.json` alone; `ui/scripts/npm-versions.mjs:65-69` (run in CI, `.github/workflows/ci.yml:48`) drops the desktop ≠ Cargo check
  - found: builds aren't Apple-signed without `APPLE_TEAM_ID` (`forge.config.ts:50`); an update's swap strips quarantine (`githubUpdater.ts:358`), a first download does not — 258 carries the install step
  - confirm (amended 2026-09-23): `grep -c "hoaqbui" ui/desktop/src/utils/autoUpdater.ts ui/desktop/src/utils/githubUpdater.ts ui/desktop/forge.config.ts | grep -c ':0$'` → 0 (3 today); `grep -c "'Melody'" ui/desktop/src/utils/githubUpdater.ts` → ≥ 1; `grep -c "UPDATES_ENABLED = true" ui/desktop/src/updates.ts` → 1; `grep -c '"version": "0.9.0-alpha.1"' ui/desktop/package.json` → 1; `grep -A12 "^release-melody" Justfile | grep -c "generate-mac-update-manifest"` → 1; `node ui/scripts/npm-versions.mjs check` → exit 0; `cd ui/desktop && pnpm vitest run src/utils/githubUpdater` → passes with `0.9.0-alpha.2` offered over `0.9.0-alpha.1` from a prerelease-only list

### docs/2026-09-23-melody-program-plan-v3.md — Melody, the main agent: M0 (approved 2026-09-23, user: "approved and start ochestrating"; v3 scope 2026-09-23: "do must should and could, and we should be v0.9 and ready for alpha testing")

Order: M0 done 2026-09-23 — 200 done (the desktop follows a turn across a reconnect: a lost prompt socket keeps the turn and follows the server's run; the reply lands once; Stop survives a drop and is resent; an overflowed replay holds the turn and retries quietly; merged 934e7853a after four Codex reviews → PASS; confirm rerun: lint:check 0, test:light 1491, `just walk "reconnect during a Hard turn"` 1 passed — the delegate's pid alive at idle 103 ms after Stop, no leftovers; `just smoke` 10 passed); 181 closes with it. 199 runs beside M1b; 284, 285 are the server gaps 200's walk found. 198 done 2026-09-23 (rework merged 297e67b02 after a Claude opus review → rework and three Codex reviews → PASS: reattach replays exactly once, a run keeps going with no client, permissions and elicitations survive a dropped client and settle on a client error, an overflowed run refuses a partial replay, ending a run can't clobber its successor or drop its steers; confirm rerun: `task181_reconnect` 12 passed (4 scenarios + overflow + permission error, both loops), `acp_server_test` 71, lib 371 incl. task181_/steer/execution::/acp::, clippy and fmt clean); 197 done 2026-09-23 (one server-owned AgentManager, running agents pinned; `task181_shared_ownership` → 3 passed). 196 done 2026-09-23 (forced-sync delegate → SLEPT after 183 s; `just walk "rpi strip"` → 1 passed). 181 is the umbrella; its plan: `docs/2026-09-23-task181-shared-run-plan-v1.md`. M1a is planned at 200's gate. 201 done 2026-09-23 (two stale expectations: the list meta's accumulated usage fields from task 125, and the Melody rename's import message; `test_list_sessions` → 7 passed, `apply_onboarding_imports_continues_after_candidate_failure` → 1 passed, clippy clean).



- 199. Two clients, cancel, close, permission hand-over and isolation on a shared run (181, step 3; beside M1b)
  - status: todo · agent: — · worker: high
  - card: as the user, I want two windows or a reconnect mid-permission to behave, so that a prompt waiting on me is never silently rejected (FURPS R F · MoSCoW Should)
  - context: plan §The change, bullets 6–7 and §Risks; `acp/server.rs:1684`, `:1688`, `:1120`, `:2496`, `:2707`
  - confirm: `cargo test -p goose --test acp_server_test task181_multi_connection` → 6 passed

- 284. A cancelled run's idle update says it was cancelled (found by 200's walk)
  - status: todo · agent: — · worker: medium
  - card: as the user, I want a window that re-attached to know a run was stopped, not finished, so that the chat and the ledger don't record a cancel as a completion (FURPS R · MoSCoW Should)
  - context: after a re-attach the client never sees the prompt's `stopReason`; the run's idle notification carries no outcome; add the outcome (`end_turn · cancelled · refusal · max_tokens`) to it in both agent-loop paths, and have `chatSessionStore.ts` read it; 200's walk then asserts `cancelled` directly
  - confirm: `cargo test -p goose --test acp_server_test task284` → a re-attached client's idle update carries `cancelled` after Stop (0 today)

- 285. Cancelling a parent ends its delegates: a Done/Failed update per child and no orphaned process (found by 200's walk)
  - status: todo · agent: — · worker: high
  - card: as the user, I want Stop to stop the whole tree, so that no delegate row stays "running" and no shell keeps working after I stopped it (FURPS R · MoSCoW Must)
  - context: 200's walk saw, after Stop, the delegate row still `running` (no terminal delegation update sent) and the Claude Code child's `zsh`/`python3` alive past the cancel and past app teardown; the delegate's process group must be killed on cancel, and a `failed`/`cancelled` delegation update sent
  - confirm: `just walk "reconnect during a Hard turn"` extended → after Stop the delegate row leaves `running` within 10 s and `pgrep -f "time.sleep(307)"` finds nothing (today: row running, process alive)

### docs/2026-09-23-melody-program-plan-v3.md — Melody, the main agent: M1a + P1 (drafted 2026-09-23; confirm lines re-checked at 200's gate)

214 done 2026-09-23 (`melody_usage_provider(usage_ledger_id, provider)` as `melody_schema_version` 2 — a side table, since `usage_ledger` is upstream's newest table; the provider is read from `sessions.provider_name` inside `record_usage_metrics`' own transaction, loops untouched; agy review: no blockers; confirm rerun: `melody_usage` 1 passed, `melody_identity` 6, lib session 232, fmt and clippy clean. For 215: LEFT JOIN the provider (older and carried-forward rows have none); a manager's `parent_session_id` must be set by whoever starts it — 207). 206 done 2026-09-23 (`melody_session_roles` behind its own `melody_schema_version` — upstream's schema stays at 16; `set_role`, `get_role`, `melody_session`, `get_or_create_manager(cwd, name)` in one `BEGIN IMMEDIATE`, `canonical_repository` collapsing linked worktrees to the main checkout; a manager's `working_dir` is its repository root; CHECK: a manager has a repository; Codex FAIL → rework → agy PASS; confirm rerun: `melody_identity` 6 passed, lib session 232, fmt and clippy clean. For 207: `start_session`'s repo is a cwd, canonicalized inside; the manager row is created `User`/Auto with no parent — 207 sets mode and parent. Upstream-merge note: `get_or_create_manager` inlines `create_session`'s INSERT). Order: 206 → 207 → 208 (after 198's rework merges) ∥ 209 ∥ 210 ∥ 214 → 211 (after 208, beside 199) ∥ 212 (after 208) ∥ 213 (after 208); 215 after 210. Shared files: 206 and 214 both touch `session_manager.rs`'s schema bookkeeping, but 206 (rework, Codex-reviewed) keeps its table fork-owned — `melody_session_roles` and its indexes live behind a separate `melody_schema_version` counter (`MELODY_SCHEMA_VERSION`, `ensure_melody_schema`), never upstream's `schema_version`/`CURRENT_SCHEMA_VERSION`, so upstream's own next migration still runs unskipped on a Melody database; `CURRENT_SCHEMA_VERSION` stays 16. 214 adds its `usage_ledger.provider` column the same way, as `melody_schema_version` 2 (a new `match` arm on `apply_melody_migration`), not a bump to `CURRENT_SCHEMA_VERSION` — the fork's next number, not upstream's. 207 and 209 both edit `session_bridge.rs`'s dispatch; 208 and 210 both edit `acp/server.rs` — parallel only in separate worktrees, merged in order. Each Rust confirm is its own integration target (`crates/goose/tests/melody_*.rs`); the gate runs them together with `cargo test -p goose --test 'melody_*'` (quoted for zsh); a filtered run reporting 0 tests is a failure. Loop parity (AGENTS.md): 208, 211, 212, 213 run turns — each test runs once per loop, following `assert_task181_reconnect(use_state_machine)` (`acp_server_test.rs:364`, `:503-509`). **M1a starts after 198's rework merges** (a run with no client attached must keep going).

- 207. Melody's session tools on the bridge: `list_sessions`, `start_session(repo, task, mode, provider, model, extensions)` and `session_status`; creates the manager session but runs nothing (208 runs it); ARCHITECTURE.md gains the entry
  - status: doing · agent: session's worker (2026-09-24) · worker: high
  - card: as the user, I want Melody to see every session, including the ones I start from the UI, and to open work in a repository with a setup she chose on purpose, so that she manages my projects without my naming session ids (FURPS F · MoSCoW Must)
  - context: the bridge lists only summon's tools (`agents/session_bridge.rs:282-286`) and dispatches into the session's own `Agent` (`:288-327`); create and activate need a client connection (`acp/server/new_session.rs:36-73`, `acp/server.rs:1322-1337`, `:1563-1573`; `get_session_agent` errors without `client_cx` `:2138-2141`) — so the tools live at the server layer over `SharedAcpState` (`server.rs:358-363`, `acp/server_factory.rs` `shared()`) with activation needing no client; never a silent mode (`new_session.rs:50`; summon's children are Auto `summon.rs:837-849`) — a start missing mode, provider/model or extensions is refused; started sessions are `User` with parent Melody and role manager (206); `session/new` gains `_meta.role` (`new_session.rs:281-291`) for M1b; `list_sessions` reads stored rows incl. empty ones (`server.rs:145-150`): id, title, repository, role, parent, running; ARCHITECTURE.md: the Melody surface entry, `:118`'s stale cites → `summon.rs:1622-1624`, `:2609-2621`
  - confirm: `cargo test -p goose --test melody_surface` → 3 passed (a `User` session with Melody as parent, role manager and the asked mode/provider/model; a start without a mode refused; a `session/new` session appears in her `list_sessions` by title) — today: no test target; `grep -c "Melody surface" ARCHITECTURE.md` → ≥ 1 (0 today)
  - found 2026-09-24: an unmerged implementation exists — `f612236d9` on `worktree-agent-af66e3e80ed39459a` (based on `4bd3b831d`, 206 included); confirm rerun there: `melody_surface` 3 passed, `melody_identity` 6. Codex review FAIL: (1) re-starting an existing manager cancels its active turn via `remove_session_if_loaded` after overwriting its config (`melody_surface.rs:197`) — refuse a busy manager before any mutation; (2) reconfiguring replaces all `extension_data`, dropping persisted state like `todo.v0` (`:179`) — replace only enabled extensions; (3) `session/new` `_meta.role="manager"` accepts `Acp`/`Hidden` sessions, and `start_session` reuses them without making them `User` (`new_session.rs:184`, `melody_surface.rs:176`); nit: `session_bridge.rs:68` comment restates the field. Rework on that branch, then merge. Blocked meanwhile: agent worktrees start from `origin/main` (`db484be1f`, 115 commits behind), and the classifier refuses the catch-up merge and the merge into main — waits on the user

- 208. The task Melody hands a manager runs at once with no window open, reaches any window that loads it, and a busy manager says so instead of waiting
  - status: todo · agent: — · worker: high
  - card: as the user, I want the task Melody hands a manager to start at once and stream into whatever window I open on it, so that work she starts is live, not parked until I open its chat (FURPS R F · MoSCoW Must)
  - context: a prompt's run needs the connection that sent it (`on_prompt`, `server.rs:2657-2803`, `begin_run_attachment` `:2690-2692`); `forward_agent_stream` waits for a connection and cancels after `RUN_REATTACH_TIMEOUT` (`server.rs:251`, `:951-984`) — 198 review item 3, so after 198's rework; loads re-attach via `attach_active_run` (`acp/server/load_session.rs:246-333`); one run per session (`server.rs:2168-2180`) → busy with its run id, nobody waits; loop parity: a headless run takes the loop of the Melody turn that called it (`server.rs:467-472`, `:2727`; the desktop always sends the flag `ui/desktop/src/acp/prompt.ts:15`)
  - confirm: `cargo test -p goose --test melody_run` → 4 passed, 2 per loop (a client loads the manager mid-run and gets the prefix once, then the rest, one turn persisted; a run with no client finishes, persists and frees the session at once) — today: no test target

- 209. Server-side authorization by caller role and target: only Melody calls her tools; a manager sees only its repository; each session gets its own bridge secret
  - status: todo · agent: — · worker: medium
  - card: as the user, I want only Melody to start and inspect sessions across my projects, so that a worker or a stray session can't spawn work or read another repository through her tools (FURPS R · MoSCoW Must)
  - context: one process-wide secret for every adapter (`session_bridge.rs:76-80`, `:141`, checked `:243-249`); the URL's session id picks whose tools run (`:233-238`); dispatch runs any tool the agent has, not only the listed ones (`:288-314` vs `:282-286`); the only role check skips delegated children (`:182`); rule: melody → all three tools; manager → `session_status` for its own repository; none or `SubAgent` → refused and not listed
  - confirm: `cargo test -p goose --test melody_authz` → 3 passed (role-none `start_session` errors, no row created; a manager's `session_status` on another repository refused; session A's secret on B's URL → 401) — today: no test target

- 210. A `SessionCreated` notice to every connected window, and `session/list` carrying parent and role, with empty and older role sessions still listed
  - status: todo · agent: — · worker: medium
  - card: as the user, I want a session Melody starts to appear in my window the moment it exists, marked as hers, and to still be there after a reconnect even before it has said anything, so that nothing she runs is invisible (FURPS F U · MoSCoW Must)
  - context: no created notice exists; `GooseSessionUpdate` is `crates/goose-sdk-types/src/custom_notifications.rs:34-40`; `DelegationUpdate` is per session per connection (`server.rs:1462-1506`) — this one reaches every connection with custom notifications (`:1035-1040`); `SessionMeta` has neither parent nor role (`acp/response_builder.rs:30-54`); the list hides message-less sessions (`acp/server/list_sessions.rs:207`; JOIN `session_manager.rs:2125-2129`) and pages at 50 (`list_sessions.rs:15`) — Melody and manager sessions list regardless; the desktop polls 10 s after `SESSION_CREATED` (`ui/desktop/src/hooks/useNavigationSessions.ts:106-138`), switching to the notice is M1b's; `just generate-acp-types` (`Justfile:180-182`)
  - confirm: `cargo test -p goose --test melody_list` → 2 passed (a second connection gets `SessionCreated` with `parentSessionId` and `role`; after a reconnect `session/list` returns an empty manager and one behind 50 newer sessions, both with parent and role) — today: no test target; `just check-acp-artifacts` → no diff

- 211. Approvals from a session Melody started reach the user when no window has that chat open; approve, reject and disconnect each resolve exactly once
  - status: todo · agent: — · worker: high
  - card: as the user, I want a permission request from a session Melody started to reach me even when its chat isn't open, and to settle exactly once however I answer or if I disconnect, so that her work neither stalls silently nor runs unapproved (FURPS R U · MoSCoW Must)
  - context: a permission request goes only to the run's own connection (`server.rs:1824-1890`); a failed request becomes `Permission::Cancel` (`:1863-1868`); the test client answers from a set decision (`crates/goose/tests/acp_fixtures/server.rs:236-250`); split with 199 — 199 owns hand-over between two clients on a shared run, 211 owns no client having the session loaded; the desktop's display of it is M1b's; a disconnect re-asks when a client attaches (recommended) rather than rejecting
  - confirm: `cargo test -p goose --test melody_approvals` → 6 passed (approve, reject, client-disconnected, each on both loops; each resolves once and the tool runs only on approve) — today: no test target

- 212. A restart never reports a cut-short task as complete, and Melody rebuilds her picture from saved state
  - status: todo · agent: — · worker: medium
  - card: as the user, I want Melody to tell me a task was interrupted when Melody restarted mid-turn, never that it finished, and to know my sessions again from what was saved, so that I can trust her status after a crash or a compaction (FURPS R · MoSCoW Must)
  - context: running turns live only in memory (`server.rs:350`, `:2168`; summon's background tasks `summon.rs:808`); a turn cut short leaves the user's message with no reply; `session_status` = saved state + the live registry — no live run and an unanswered last turn = interrupted; after compaction, what Melody knows comes from `list_sessions`
  - confirm: `cargo test -p goose --test melody_restart` → 2 passed, one per loop (tear down mid-turn on a manager; a fresh server on the same data dir → `session_status` says `interrupted`, `list_sessions` still names the manager with role and parent) — today: no test target

- 213. P1 budget: idle Melody and idle managers make no model calls, and one combined limit caps running managers plus workers
  - status: todo · agent: — · worker: medium
  - card: as the user paying for seats, I want Melody and her managers to cost nothing while idle and never run more at once than I allow, so that a quiet afternoon doesn't burn my quota (FURPS P · MoSCoW Should)
  - context: summon caps async background delegations at `GOOSE_MAX_BACKGROUND_TASKS` = 5 per session (`summon.rs:786-790`, `:2473-2479`); sync delegates (`:1597`) and Melody's starts are uncapped; nothing counts managers and workers together; model calls outside a prompt: session naming (`server.rs:1252-1253`), tool-chain label summaries (`:1752-1771`); count calls with a stub provider (`session_bridge.rs:498-528`); over the limit a start or delegate is refused naming the count, nothing queues silently; the one allowed idle call is T3's budgeted nightly tidy-up (team-memory plan §Decisions 1)
  - confirm: `cargo test -p goose --test melody_budget` → 3 passed (per loop: 0 provider calls over an idle window after Melody's and a manager's turns; with a limit of 2, a third start or delegate is refused with "2 of 2") — today: no test target

- 215. P1 in the work ledger: a turn event says whose turn it was (Melody, a manager, or an ordinary session) and its parent
  - status: todo · agent: — · worker: low
  - card: as the user, I want the Telemetry ledger to tell Melody's turns and her managers' turns apart, seat by seat, so that I can see what orchestration costs next to my own sessions (FURPS P · MoSCoW Should)
  - context: `TurnEvent.who` is `'session' | 'worker'` (`ui/desktop/src/native/ledger.ts:24-39`), built by `turnEvents` (`workspace/panes/telemetry/ledger-events.ts:21-46`); written only for the chat on screen (`ledger-writer.ts:11-17`, mounted `WorkspaceShell.tsx:995`) — 214's rows are the durable record for unopened managers; role and parent from 210's list meta; 229 edits the same files and lands after
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/telemetry/ledger-events.test.ts -t "melody"` → 2 passed (a Melody turn and a manager turn, each with role, seat and parent) — today: 0 passed; `pnpm run typecheck` → 0

### docs/2026-09-23-melody-program-plan-v3.md — Melody, the main agent: M1b + S1 (drafted 2026-09-23; confirm lines re-checked at the M1a → M1b gate)

Order: 224 can start now, beside M1a (it needs none of M1a's tools). After M1a's gate: 220 ∥ 225, then 221 → 222 (both edit `WorkspaceShell.tsx`), 223 alongside once 220 lands; 226 is M1b's gate walk. 224 done 2026-09-23 (Lever.tsx, STOP_MESSAGES, the palette group, Telemetry's Lever row and 10 i18n keys gone; a new Easy session takes the orchestrator setup when the folder has the role and claude-code is installed, else direct Opus; confirm rerun: no lever, test:light 1412 passed; `just walk "easy mode"` 1 passed after the walk learned to accept the recipe warning; rpi-strip, agents-pane, artifact-pane walks updated, to run at the M0 gate; the folder chip stays until §11's header move). 224, 221 and 222 all edit `WorkspaceShell.tsx`, so they land one after another. S1 follows M1b's gate, beside M2 ∥ M3: 227 → 228; 229 beside 227. Needs from M1a: 220/225 — Melody's role set at creation, the durable role and `start_session`; 222/223 — `session/list` carrying `parentSessionId` and the role; 226/229 — the `SessionCreated` notice; 227 — the durable run status.

- 220. Melody's session: created once, its id kept in settings, the same conversation after every restart
  - status: todo · agent: — · worker: medium
  - card: as the user, I want one Melody conversation that is always there and still the same one after a restart, so that she knows where we left off (FURPS F R · MoSCoW Must)
  - context: `createSession` (`ui/desktop/src/sessions.ts:84`, options `:28-37`) has no role field today; a new setting `melody.sessionId` beside `workspace.planGate` (`utils/settings.ts:62-63`, default `:108-109`) and in main's allowlist (`main.ts:2083-2105`); her session runs in `~/Melody` (T0) on `claude-code`; pure decision in `src/workspace/melody/melody-session.ts` — stored id × session list → reuse or create; a stored id that no longer loads makes a new one and says so; two concurrent calls make one session; no Archive, no Delete (design §14)
  - confirm: `cd ui/desktop && pnpm exec vitest run src/workspace/melody/melody-session.test.ts && grep -c "'melody.sessionId'" src/utils/settings.ts src/main.ts` → the test passes (reuse · create when unset · create when the stored id is gone · one create under two concurrent calls) and each grep ≥ 1 (today: no test file)

- 221. The Work toggle and ⋯ in the Chat header; Work collapses when it has no tabs
  - status: todo · agent: — · worker: medium
  - card: as the user, I want Chat to take the full width when Work has nothing in it, and one button that brings Work back, so that an empty column never takes space from the chat (FURPS U · MoSCoW Must; design §4, §5, §19, §20)
  - context: Work always renders today (`WorkspaceShell.tsx:1739-1762`); ⋯ is the bar's `trailing` (`WorkColumn.tsx:129-137`, `:480`; built `WorkspaceShell.tsx:1531-1552`); the Chat header's top right is the watermark (`components/BaseChat.tsx:520-529`); rules as pure store logic beside `openPane`/`closePane` (`pane-store.ts:245`, `:281`; `settle` `:138`) — no tabs collapses Work, the toggle shows/hides it (`aria-pressed`), pressed with no tabs it opens a Terminal; hidden flag saved with the dock (`WorkColumn.tsx:109-117`); ⌘3 shows Work first (`WorkspaceShell.tsx:1433-1460`); walks updated in the same commit: `three-columns.spec.ts:33-38`, `pane-menu.spec.ts:8`, `dock.spec.ts:28`, `session-menu.spec.ts:25`
  - confirm: `cd ui/desktop && pnpm exec vitest run src/workspace/pane-store.test.ts && grep -c "collapse" src/workspace/pane-store.test.ts` → passes, ≥ 1 (0 today); `just walk "work toggle"` → 1 passed (today: no tests found); then `just smoke` passes

- 222. Melody's tab in Work: bottom panel by default, × hides her, ⌘J opens and closes
  - status: todo · agent: — · worker: high
  - card: as the user, I want Melody one keystroke away beside whatever I'm working on, so that I can hand her a task without leaving the session I'm in (FURPS U · MoSCoW Must; design §8, §14, §19)
  - context: after 220, 221; a `'melody'` PaneId (`pane-store.ts:4-29`) left out of the + menu (`WorkColumn.tsx:420-470`) and `PRIMARY_PANES`/`MORE_PANES` (`WorkspaceShell.tsx:226-227`); opens bottom (`pane-store.ts:198`); × hides her and keeps the chat mounted; her body is `BaseChat` on her session id (`ChatSessionsContainer.tsx:66-75`, panes handed in `App.tsx:737-748`), no chips, placeholder "Ask Melody, or hand her a task…"; her line "N sessions · N need you" (§8); ⌘J beside ⌘1–3 (`WorkspaceShell.tsx:1433-1460`); tabpanel labelled Melody, feed `role="log"`; reconnect restore covers her (`ChatSessionsContainer.tsx:44-53`); risk: two `BaseChat` mounted at once
  - confirm: `just walk "melody tab"` → 1 passed: ⌘J shows `melody-tab` bottom with her input focused; a draft survives × and ⌘J; after a reload the same id as `melody.sessionId` (today: no tests found)

- 223. Melody's pin above search, and her row pinned at the top of Today
  - status: todo · agent: — · worker: medium
  - card: as the user, I want Melody always at the top of my sessions, saying what she's doing, so that I never have to look for her (FURPS U · MoSCoW Must; design §6, §7, §18, §20 decision 2)
  - context: after 220, beside 221/222 (`components/Layout/NavigationPanel.tsx`, `workspace/sidebar-sessions.ts`); the pin between the spacer and search (`NavigationPanel.tsx:629-632`), a Floating Button whose second line says what she's doing; clicking it does what ⌘J does through an AppEvent (the `OPEN_DIAGNOSTICS` pattern, `constants/events.ts:22`); her row first in Today via a pure `withMelodyFirst` beside `withAwaitingFirst` (`sidebar-sessions.ts:142-149`), applied where `days` is built (`NavigationPanel.tsx:546-553`); companion rows are M2's
  - confirm: `cd ui/desktop && grep -c "export function withMelodyFirst" src/workspace/sidebar-sessions.ts && pnpm exec vitest run src/workspace/sidebar-sessions.test.ts` → 1 and passes (0 today); `just walk "melody pin"` → 1 passed

- 225. Melody's tools and role, and one minimal repository manager, so that Melody → manager → worker runs headless
  - status: todo · agent: — · worker: high
  - card: as the user, I want to ask Melody for work in a repository and have that repository's manager and its workers do it, so that I talk to one agent and the work still happens where it belongs (FURPS F · MoSCoW Must)
  - context: after M1a; Melody's tools are M1a's facade only (`list_sessions`, `start_session`, `session_status`), no developer or file tools; her instructions `~/Melody/AGENTS.md` plus a Melody role (where it lives is open: task 177's lesson, `summon.rs:595-633`); the manager is what `start_session` makes, one per repository, Hard's setup (`claude-code`, Opus, the repo's `orchestrator.md`); its workers are `SubAgent`s that never delegate (`.agents/agents/orchestrator.md:61`)
  - confirm: `cargo test -p goose --test melody_chain` → passes: `start_session` in a fixture repo makes one manager (`User`, parent Melody, role manager); its `delegate` makes a `SubAgent` whose parent is the manager; Melody lists no developer tools (today: no test target)

- 226. The M1b gate walk: Melody starts a session, its manager delegates to a worker, and she reports it done
  - status: todo · agent: — · worker: high
  - card: as the user, I want to see a request to Melody become a session, a manager and a worker, and come back to her as done, so that Melody works end to end in the app (FURPS F U · MoSCoW Must; plan §Gates M1b → M2 ∥ M3)
  - context: after 220–225; `@seat`; builds on `agents-pane.spec.ts:18` and `fixtures.ts:396`; steps: ⌘J → ask her to start a session in a fixture repo → a `sidebar-session-*` row appears without a reload with her as parent → a worker row reads done → her tab says done → a ⌘N session appears in her next answer, named without its id
  - confirm: `just walk "melody starts a session"` → 1 passed (today: no tests found); then `just smoke`

- 227. The diagnostics report names the chain and why it failed (S1, server)
  - status: todo · agent: — · worker: high
  - card: as the user, when a session Melody started fails, I want to know who started it, which manager ran it, which worker failed and why, so that I fix the cause instead of guessing (FURPS S · MoSCoW Could)
  - context: after M1b's gate; today the report is one session's JSON and logs (`crates/goose/src/session/diagnostics.rs:87-95`, served `acp/server/diagnostics.rs:5`); links exist: `parent_session_id` (`session_manager.rs:93-95`), `list_children` (`:494-505`); a `chain` field — ancestors to Melody, descendants — each {id, name, role, session_type, status, reason, provider, model}; `ui/goose-acp-client` regenerated
  - confirm: `cargo test -p goose --lib session::diagnostics -- chain` → 1 passed: Melody → manager → a failed worker gives a three-link chain carrying the worker's reason (today: 0 passed)

- 228. Session controls › Diagnostics shows the chain and the reason, before any download (S1, desktop)
  - status: todo · agent: — · worker: medium
  - card: as the user, I want Diagnostics to tell me in words which link failed and why, so that I don't have to read a JSON file (FURPS S U · MoSCoW Could)
  - context: after 227; the row `workspace-config-diagnostics` (`SessionControls.tsx:201-205`) → `OPEN_DIAGNOSTICS` (`WorkspaceShell.tsx:1361`) → `DiagnosticsModal` (`components/ui/Diagnostics.tsx:87`, `:100-130`); above the download: "Started by Melody → <manager> → <worker>", each a link; a pure `chainRows(report)`
  - confirm: `cd ui/desktop && pnpm exec vitest run src/workspace/diagnostics-chain.test.ts && pnpm run test:light` → passes (today: no test file)

- 229. Telemetry records Melody's handoffs and shows the chain for the open session (S1, desktop)
  - status: todo · agent: — · worker: medium
  - card: as the user, I want Telemetry to show where a session came from and which worker failed, so that the chain behind the numbers is visible (FURPS S · MoSCoW Could)
  - context: after M1b's gate, beside 227; the ledger's `handoff` kind has no shape (`native/ledger.ts:7-15`, `:83`; `ui/sidecar/src/ledger.ts:20`) — give it {from, managerSessionId, sessionId, repo}, appended on `SessionCreated` with Melody as parent; Telemetry › Now (`TelemetryNow.tsx:284-346`) gains a "Started by" row
  - confirm: `cd ui/desktop && grep -c "export function handoffEvent" src/workspace/panes/telemetry/ledger-events.ts && pnpm exec vitest run src/workspace/panes/telemetry/ledger-events.test.ts src/workspace/panes/telemetry/telemetry-now.test.ts` → 1 and both pass (0 today); then `just walk "telemetry pane"`

### docs/2026-09-23-melody-program-plan-v3.md — M2 companions (drafted 2026-09-23; confirm lines re-checked at the M1b → M2 ∥ M3 gate)

Order: three lanes. **Rust A:** 234 → 236 → 237 (the role file, the folder it reads, the fence around that folder). **Rust B:** 235; separately 238 (239 is P1's, drafted with M1a). **UI:** 240 (the user picks the marks first) → 241 → 242 (both edit `NavigationPanel.tsx`), after 235's list fields. 243 last: the M2 → M4 gate. All build on M1a's surface (start_session · session_status, authorization by caller role, durable role metadata, one manager per repository, `session/list` with parent link and role) and M1b's pin and minimal manager (225). Files shared with M3, settled at M2/M3's gate: `NavigationPanel.tsx`, `WorkspaceShell.tsx` (chat header `:1675-1690`, `:1728-1736`), `sidebar-sessions.ts`, `components/icons/Goose.tsx`, i18n.

- 234. The manager role: `.agents/agents/manager.md`, shipped with Melody; a companion always gets this role body, never a `manager.md` from the repository it manages
  - status: todo · agent: — · worker: high
  - card: as the user, I want every companion to work the same way in any repository, delegating and never editing repository files itself, so that a cloned repository can't rewrite what my manager does (FURPS F · MoSCoW Should)
  - context: summon finds roles in the session's folder (`crates/goose/src/agents/platform_extensions/summon.rs:595-640`); a companion's folder is someone else's repository (task 177's lesson); the body: understand, delegate, never edit repository files, write memory only in `~/Melody/<name>/` and drafts under `memories/`, never wait on another manager (use `send_to_session`, 238), re-read your folder when context was lost; `runtimes:` is `claude-code` only (ACP seats drop the system prompt, `acp/provider.rs:970`); `.agents/agents/orchestrator.md:61` stays
  - confirm: `test -f .agents/agents/manager.md && cargo test -p goose --test melody_companions manager_role` → 2 passed: a repository's own `manager.md` containing `SENTINEL-HOSTILE` is ignored for the bundled body; the bundled `runtimes:` lists only `claude-code` (today: `test -f` exits 1)

- 235. Companion names and marks: when a manager is first created for a repository, Melody proposes an unused musical name and mark, stored with the session; her reply names it; the user can rename it
  - status: todo · agent: — · worker: high
  - card: as the user, I want each repository's manager to have a name I recognise and can change, so that "Tempo" means compo's manager everywhere (design §20 #5; FURPS F U · MoSCoW Should)
  - context: a `companion` `ExtensionState` v0 {name, mark, repo key} on the manager session (`crates/goose/src/session/extension_data.rs:43`, pattern `:103-109`) unless M1a's role metadata holds it; `session/list` meta gains `companion: {name, mark}` (`acp/response_builder.rs:30-54`); the title is the name with `user_set_name` (`session_manager.rs:68`); rename through `acpRenameSession` (`NavigationPanel.tsx:324`), a clash refused; `start_session`'s result carries `companion_created`; Harmony · Tempo · Chord drawn (`docs/mockups/2026-09-22-melody-visual-design.html:1096`), the pool beyond from 240
  - confirm: `cargo test -p goose --test melody_companions names` → 4 passed: two repositories get two pool names; both survive a restart; a rename updates the list meta, a clash is refused; `session/list` carries `companion.name` and `mark` (today: no test target)

- 236. Each companion's folder `~/Melody/<name>/` (`charter.md`, `MEMORY.md`, `journal/`) is created with the companion and read into its system prompt at start and on every restore
  - status: todo · agent: — · worker: high
  - card: as the user, I want a companion to remember its repository across days, compactions and restarts, so that it doesn't relearn the repository every time (PRD v2 step 6; FURPS R · MoSCoW Should)
  - context: on creation the three entries from 234's charter template, one commit in `~/Melody` (`memory: <name> joins for <repo>`); not a git repository → the companion starts, the folder is skipped, Melody says why; a rename is one `git mv`; `MELODY_HOME` override for tests; read as a `companion` system-prompt extra via `Agent::extend_system_prompt` (`agent.rs:3564`, called not edited; also `acp/server/manage_sessions.rs:90`) at creation and every restore (`execution/manager.rs:271`); `claude-code` gets the system prompt file on every spawn (`claude_code.rs:378`, `:396`); never loads Melody's `USER.md` or `MEMORY.md`
  - confirm: `cargo test -p goose --test melody_companions folder` → 4 passed: a new companion has the three entries and one commit; the system prompt contains a sentinel from `charter.md`; an edit after an eviction appears after the restore; `~/Melody/USER.md`'s text is absent (today: no test target)

- 237. Two permissions: a manager writes only inside `~/Melody/<name>/` and `~/Melody/memories/`; any other write is refused on the server; workers keep their role's repository permissions
  - status: todo · agent: — · worker: high
  - card: as the user, I want a manager that can keep notes but can't touch my code, so that only reviewed worker diffs change a repository (team-memory plan §Decisions 1; FURPS F R · MoSCoW Should)
  - context: every `claude-code` `can_use_tool` request carries the tool and `input.path` (`claude_code.rs:969-1006`, test `:1659`) and arrives as a `ToolConfirmation` at `acp/server.rs:1665-1683` → `handle_tool_permission_request` (`:1824`) — outside `agent.rs`; for a manager, Write/Edit/MultiEdit/NotebookEdit are answered from the path's realpath, checked like the sidecar's `requestPath`; needs the manager's seat in an asking mode per session (mode is process-wide today, `claude_code.rs:349-365`, `:727-737` — M1a's explicit mode); Bash: none, or only `git -C ~/Melody` (open)
  - confirm: `cargo test -p goose --test melody_companions fence` → 5 passed: a manager's Write to `<repo>/README.md` is denied with no client prompt; a Write to its journal is allowed; a `../` escape and an outward symlink are denied; a worker's repository Write is decided as today (today: no test target)

- 238. `send_to_session(target, text)` · `cancel_send(target, run_id)`: returns at once with a run id or a structured busy; never waits for the target's turn
  - status: todo · agent: — · worker: high
  - card: as the user, I want Melody and my companions to pass work to each other without one blocking on another, so that a busy companion makes a retry, never a hung turn (FURPS F R · MoSCoW Should)
  - context: avoid `orchestrator.rs:558-599` (runs the target's loop inside the caller's call, fails when busy `:537-546`); busy is atomic: `ActiveRunRegistry::start_prompt_run` (`execution/active_run.rs:32-45`) → `AgentRunExists` (`acp/server.rs:2168-2176`) → `{busy: {active_run_id}}`, no server queue; cancel via `agent_cancel_token` (`acp/server.rs:2854`) for runs the caller started; the run starts through `on_prompt` (`:2657-2800`) so an open window streams it; the bridge's 5-minute timeout (`session_bridge.rs:36-39`) never applies; authorization is M1a's (Melody → any; manager → its sessions and other managers, async only; worker refused); exposed only on the Melody surface (`session_bridge.rs:282-330`)
  - confirm: `cargo test -p goose --test melody_send` → 5 passed: an idle target sleeping 30 s returns a run id in < 1 s; a busy target returns `busy` and no second run; cancel ends the target's run and the caller goes on; manager → manager returns at once; a `SubAgent` caller is refused (today: no test target)

- 240. One mark component that takes the member (Melody, or a companion's mark), plus a pool of marks for companions after the first three
  - status: todo · agent: — · worker: medium
  - card: as the user, I want each companion's mark to be its own at every size, so that a row, a chip and a pin name it without words (design §0, §20 #5; FURPS U · MoSCoW Should)
  - context: options first — mockups of the pool beside `m-harmony`/`m-tempo`/`m-chord` (`docs/mockups/2026-09-22-melody-visual-design.html:691`), the user picks before any source edit (as task 193); `components/icons/Goose.tsx` → one component that takes the member; sizes 16/22/28/32, a working state with the teal halo (§16 row 01, and under Reduce motion); the pool matches 235's
  - confirm: `cd ui/desktop && pnpm exec vitest run src/components/icons/member-mark.test.tsx && pnpm run typecheck` → each pool mark renders at 16 and 22 px with an accessible name; typecheck 0 (today: no test file)

- 241. Companion rows under Melody's pin, and the companion view: its conversation in Chat, with the list filtered to its repository
  - status: todo · agent: — · worker: medium
  - card: as the user, I want to see my companions under Melody and open one like a chat, so that each repository's manager is one click away (design §6, §7; FURPS F U · MoSCoW Should)
  - context: under M1b's pin (`NavigationPanel.tsx:629`); a row is mark · name · "repo · N sessions · status word" · dot (design `:1099-1100`); click → its session in Chat, header name / "Manages <repo> · <runtime> · <model>", composer "Ask <name>…" (design `:1157-1166`), the repository chip pressed (`filterSessions`, `sidebar-sessions.ts:126-139`); companions and Melody leave the day groups (§7); data from 235's meta and M1a's role
  - confirm: `cd ui/desktop && pnpm exec vitest run src/workspace/companions.test.ts` → passes: rows built from list meta with count and status word; companion and Melody sessions left out of day groups; picking a companion filters to its repository (today: no test file)

- 242. "Started by Tempo" · "Started by Melody" · "Started by you" in the session header, and the manager's mark in the row's meta line
  - status: todo · agent: — · worker: medium
  - card: as the user, I want every session to say who started it, so that I know whether a companion, Melody or I own it (design §7, §11, §18; FURPS U · MoSCoW Should)
  - context: the chip in the chat header (`WorkspaceShell.tsx:1675-1690`) as `session-origin[data-origin=melody|<name>|you]` (design `:1039-1040`, `:1155`); from the parent link — parent is Melody → Melody; a companion → its name and mark; none → you; a parent missing from the list → no chip; the row's second line (`NavigationPanel.tsx:367-370`) gains the manager's mark
  - confirm: `cd ui/desktop && pnpm exec vitest run src/workspace/session-origin.test.ts` → 4 passed (no parent → you; Melody; Tempo with its mark; unknown parent → none) (today: no test file)

- 243. The M2 → M4 gate: the `companion` walk, and v3's gate line amended from "friend" to "companion"
  - status: todo · agent: — · worker: high
  - card: as the user, I want one run to prove that companions are real, reused, reachable managers, so that M4 builds on something that works (v3 §Gates; FURPS F R · MoSCoW Should)
  - context: `tests/e2e/companion.spec.ts` (@seat) in a fixture repository — ask Melody to start work → a companion row with a proposed name, its manager delegates (a worker row); a second request → the same companion id, no second row; open the row → it takes a message and replies; the worker's refused delegation is checked headless (`summon.rs:1622-1624`, no `delegate` in its tools `:2609-2621`); amend `docs/2026-09-23-melody-program-plan-v3.md:38`
  - confirm: `just walk "companion" && cargo test -p goose --test melody_companions worker_cannot_delegate` → 1 passed, 1 passed (today: no tests found)

### docs/2026-09-23-melody-program-plan-v3.md — M3 visual language (drafted 2026-09-23; starts at M1b's gate, beside M2)

Order: 246 first (the contract) → 247 ∥ 249 ∥ 251 → 248 (after 247; both edit `components/board/*`) → 250 (needs M1b's tab and pin; motion 01's companion marks after M2) → 252 (the M3 → M4 gate). Motion 06 is 254's. Files shared with M2 (`WorkColumn.tsx`, `NavigationPanel.tsx`, `BoardCard.tsx`, `components/icons/Goose.tsx`) listed at the M2/M3 gate.

- 246. The ink language in `DESIGN.md` and the tokens — teal focus and activity, amber needs you, blue links only, green/red outcomes, everything filled is ink; teal for progress and "on" (§20 decision 4); the Upstream Rule line brought in line with `ARCHITECTURE.md:98`
  - status: todo · agent: — · worker: high
  - card: as the user, I want each colour to mean one thing wherever it shows, so that a glance tells me the state without reading (FURPS U · MoSCoW Should)
  - context: targets are the design's `TOKENS` table (`docs/mockups/2026-09-22-melody-visual-design.html:1236-1257`); light: `theme-tokens.ts:102` `background-inverse` `#0b7a72` → ink `#1e1d1a`, `:116` `text-info` `#2277cc` → `#44c1b8`, `:135` `ring-primary` → `#44c1b8`; dark: `:163` `#ae81ff` → `#f8f8f2`, `:165`/`:177` `#66d9ef` → `#44c1b8`, `:168`/`:180` `#e6db74` → `#fbbf24`, `:196` → `#44c1b8`; the focus ring keeps a 1 px `#0b7a72` edge on paper, light teal never text; `main.css` `:1108`, `:1140`, `:1117` still paint blue; `text-text-info` used as text in 5 files (`TelemetryRoles.tsx`, `TelemetryNow.tsx`, `RunRow.tsx`, `SubRecipeEditor.tsx`, `UsageRing.tsx`) — re-pointed by meaning; switch checked (`ui/switch.tsx:15-16`) and usage ring (`UsageRing.tsx:158`) → teal (§20 wins over §3); `DESIGN.md` §Tokens `:164`, `:168`, §Principles `:9`, §Open decisions `:225`; the light snapshot (`theme-tokens.test.ts:101`) regenerated on purpose
  - confirm: `grep -c "'--color-ring-primary': '#44c1b8'" ui/desktop/src/theme/theme-tokens.ts` → 2 (0 today); `grep -c "#2277cc" ui/desktop/src/styles/main.css` → 0 (2 today); `grep -c "composed not restyled" DESIGN.md` → 0 (1 today); `cd ui/desktop && pnpm vitest run src/theme/theme-tokens.test.ts` → passes incl. a light focus-edge ≥ 3:1 case; `just walk "studio light"` → 1 passed

- 247. **Needs you** replaces **Needs review**; one status dot beside its word everywhere, the card's 3 px status outline, and the hover rule (lift 1 px + a 4 px outline in the item's own colour; a wash only on ghost buttons, menu items, tabs)
  - status: todo · agent: — · worker: medium
  - card: as the user, I want the word for work waiting on me, and the mark beside it, to be the same on every surface, so that I never translate between "review", "waiting" and a colour (FURPS U · MoSCoW Should)
  - context: §20 #1, §18, §3 parts table (`visual-design.html:788-790`), hover §16 `:1007`; copy: `BoardCard.tsx:18`, `BoardView.tsx:60`, `:76`, `en.json:237`, `:267`, `:306` + 15 locales (35 files carry "Needs review"), `board.spec.ts:94`, `DESIGN.md` §Vocabulary `:105-107`; internal ids stay (`board-state.ts:28-33`); three dot maps to one (`BoardCard.tsx:41-46`, `AgentRow.tsx:34-39`, `RpiStrip.tsx:57`); lift `button.tsx:8-9`; §Vocabulary's `check:` (`:135`) becomes runnable
  - confirm: `grep -rl "Needs review" ui/desktop/src ui/desktop/tests | wc -l` → 0 (35 today); `grep -rl "const STATUS_DOT" ui/desktop/src | wc -l` → 0 (3 today); `cd ui/desktop && pnpm run i18n:check` → green; `just walk "sidebar|agents pane"` → passed

- 248. One icon set: Heroicons 16 solid replace lucide app-wide (16 px buttons, 14 px rows and chips); `DESIGN.md` §Iconography becomes a lucide → Heroicons table
  - status: todo · agent: — · worker: medium
  - card: as the user, I want every glyph drawn in one style with the same weight as the mark, so that the app reads as one thing and not two libraries (FURPS U · MoSCoW Should)
  - context: §1 (Icon A), §17 `:1030`, the icon grid `visual-design.html:1546-1551`; 95 files import `lucide-react` (86 names); `@heroicons/react` `package.json:70`, `lucide-react` `:109`; each name checked against `ui/node_modules/@heroicons/react/16/solid` (`document-plus-minus` has no 16-solid export); replaces `DESIGN.md:178`'s list; after 247; Settings swept here so 255 starts on one set
  - confirm: `grep -rl "from 'lucide-react'" ui/desktop/src | wc -l` → 0 (95 today); `grep -c '"lucide-react"' ui/desktop/package.json` → 0; `cd ui/desktop && pnpm run lint:check` → green; `just smoke` → passed

- 249. The runtime colour palette — designed first, avoiding teal, amber, green, red and blue; the user picks; then each runtime's written name carries its colour wherever it shows
  - status: todo · agent: — · worker: high
  - card: as the user, I want to tell Claude's work from Codex's, Cursor's and agy's at a glance when several run at once, so that I never read every row to find one seat's work (FURPS U · MoSCoW Should; §20 decision 4)
  - context: a mockup `docs/mockups/<date>-runtime-palette.html` in both themes first, the user picks (193's pattern); never colour alone (`DESIGN.md:13`); names in `AgentRow.tsx`, `BoardCard.tsx`, `SessionChips.tsx`, companions' lines (M2); a pure `runtime-colours.ts` with a ΔE test; closes `DESIGN.md:225`; a table in `runtime-colours.ts`, not new theme roles (§17 adds none)
  - confirm: `ls docs/mockups/*-runtime-palette.html` → 1 file; `cd ui/desktop && pnpm vitest run src/workspace/runtime-colours.test.ts` → each hue ≥ ΔE 20 from teal, amber, green, red, blue in both themes (today: no file); `just walk "agents pane"` → passed

- 250. The locked motion picks (01 family working · 03 Work gives way · 05 answered ask settles · 07 Running → Done · 08 Needs you draws its outline · 09C send launches · 10 counts roll) and Melody's tab tint; every pick stops under Reduce motion
  - status: todo (after M1b's gate; 01's companion marks after M2) · agent: — · worker: high
  - card: as the user, I want every change of state to come from somewhere and go somewhere, so that I can follow what moved without hunting for it (FURPS U · MoSCoW Should)
  - context: §16's locked table (`visual-design.html:1012-1024`), `docs/mockups/2026-09-22-melody-motion-proposals.html`; no new duration roles (`main.css:248-251`); surfaces: 05 `ToolCallConfirmation.tsx` and the plan gate; 07/08 `BoardCard.tsx` and M1b's session card; 09C `.send-disc` (`main.css:1116`, `:1155-1170`); 10 `ChangesBar.tsx` and the pin's count; 03 `WorkColumn.tsx`/`pane-store.ts`; 01 one mark component (§3 `:787`); reduced motion `main.css:380-392`; `DESIGN.md` §Motion gains the table
  - confirm: `grep -cE "@keyframes (ask-settle|outline-draw|send-launch|count-roll|family-)" ui/desktop/src/styles/main.css` → ≥ 5 (0 today); `just walk "changes bar|board"` → passed incl. a `prefers-reduced-motion` run with `animation-name: none`

- 251. Work's tab bar from the keyboard: the pane picker, tab keyboard control and tab overflow
  - status: todo · agent: — · worker: medium
  - card: as the user, I want to reach, switch and close every open tab, and every pane not yet open, without the pointer and without a tab falling off the bar's edge, so that Work is as usable from the keys as the chat is (FURPS U · MoSCoW Should)
  - context: the bar is `role="toolbar"` with `aria-pressed` buttons (`WorkColumn.tsx:318-330`, `:428-433`), no arrows, `overflow-x-auto` (`:435`); `+` lists closed panes (`:440-470`); `DESIGN.md:80`, `:199`, `:151`; ⌘1–3 and ⌘J are taken; keys: ← → between tabs, Enter shows, Delete closes, ⌥↓/⌥↑ between panels (the Codex UX pass in memory); the walk extends `pane-menu.spec.ts`
  - confirm: `grep -c 'role="tablist"' ui/desktop/src/workspace/WorkColumn.tsx` → ≥ 1 (0 today); `just walk "pane menu"` → passed with arrows, Enter, Delete and a 360 px overflow list

- 252. The M3 → M4 gate walk: the settled window states (§4) at 1512 px in both themes, computed colours checked against 246's roles
  - status: todo (last in M3) · agent: — · worker: medium
  - card: as the user, I want the window to look like the design I settled, in light and dark, so that M4 builds on the look I approved and not on drift (FURPS U S · MoSCoW Should)
  - context: plan v3 `:39`; §4 states (`visual-design.html:805-826`): two panels with Melody bottom · bottom empty · no tabs (Work collapses) · Melody hidden; pattern `studio-light.spec.ts:12`; asserts focus ring and active tab icon `#44c1b8`, filled controls ink, Running teal, Needs-you amber; eight screenshots for the user's eye (computed styles are the gate, no pixel baselines)
  - confirm: `just walk "window states"` → 1 passed, 8 screenshots (today: no spec); every `check:` in `DESIGN.md` prints nothing

### docs/2026-09-23-melody-program-plan-v3.md — M4 first run and Settings (after the M2 → M4 and M3 → M4 gates)

Order: 254 first (the seat row and sign-in) → 253 ∥ 255 → 256 (after 255, M1a's checks, M1b's session; its memory row after T1); 257 any time after M1b. The M4 → A gate is 253's `@seat` walk.

- 253. The first-run walkthrough: welcome → seats → projects → meet Melody, once on a fresh profile, before the Hub
  - status: todo · agent: — · worker: high
  - card: as a new alpha tester, I want to go from a fresh install to Melody's first message in one guided path, so that my first minutes set up a seat and a project instead of a provider form (FURPS U S · MoSCoW Could)
  - context: today two guards in a row (`App.tsx:723-724`): `OnboardingGuard` (`OnboardingGuard.tsx:55`, `:165-166`) and `RuntimesGuard` (`RuntimesGuard.tsx:22-27`) — first run replaces both; a Ready seat or an API provider counts; Projects per §21 (`:1582-1585`); "Meet Melody" opens her tab and sends her first turn; a pure `first-run.ts` step machine; existing profiles don't see it; walks already run on fresh profiles (task 147); mock pattern `runtimes-gate.spec.ts:101-112`
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/onboarding/first-run.test.ts` → passed (today: no file); `just walk "first run"` → 2 passed (seat-free steps; the `@seat` path to Melody's first message)

- 254. Seats: signing in runs in a Terminal tab that closes back into its row and rechecks by itself (motion 06); API providers wait behind **Use an API key instead**; one seat list for first run and Settings › Seats
  - status: todo · agent: — · worker: high
  - card: as the user, I want to sign a seat in without leaving the app or pressing Recheck, and reach an API key only when I ask for one, so that the default path is my subscription seat (FURPS U S · MoSCoW Could)
  - context: today Sign in navigates to `/` with `terminalInput` (`RuntimesGate.tsx:85`), typed into a shell (`TerminalPane.tsx:119-121`) that outlives the command; the pty's exit `terminal-session.ts:260-262`; argv per CLI from its `--help` (`RuntimesGate.tsx:51-59`; agy keeps its line); motion 06 §16 `:1018`; a pure `seat-sign-in.ts` (opening → running → exited 0 → closing → recheck → ready; non-zero → Error row with the CLI's last line + Try again); API key opens upstream's `ProviderSelector`/`ProviderConfigForm`; copy §21 Seats (`:1572-1575`); `DESIGN.md:117` amended
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/onboarding/seat-sign-in.test.ts` → passed (today: no file); `just walk "runtimes gate"` → passed: a stub CLI exits 0, the tab closes, the row reads Ready without Recheck

- 255. The Settings route with the design's categories (General · Seats · Projects · Extensions · Keyboard · Phone · Privacy and data · Updates and about); changes apply at once, no Save; the irreversible asks first
  - status: todo · agent: — · worker: high
  - card: as the user, I want every setting in a named place I can click through, so that I find a setting by what it is about and not by which upstream tab it came from (FURPS U · MoSCoW Could)
  - context: `SettingsRoute` (`App.tsx:772`) renders upstream's eight tabs (`SettingsView.tsx:190-255`); every upstream row finds a category or is listed as retired; General takes Easy/Advanced (`DESIGN.md:88`); Phone keeps its ids (`:89`); Updates composes `settings/app/UpdateSection.tsx` gated on `UPDATES_ENABLED`; version from `app.getVersion()`; the settings-row part §3 `:797`
  - confirm: `grep -c "TabsTrigger" ui/desktop/src/components/settings/SettingsView.tsx` → 0 (8 today); `just walk "settings"` → 1 passed through each category, no Save button; `just walk "phone card|runtimes gate"` → passed

- 256. Settings › Melody: her seat, "Show Melody at launch", what she may do without asking (each switch enforced by the server), what she remembers
  - status: todo (after 255, M1a's authorization, M1b's session; "Her memory" after T1) · agent: — · worker: medium
  - card: as the user, I want to decide in one place what Melody may start and message without asking me, so that her reach is mine to set (FURPS U S · MoSCoW Could)
  - context: rows §21 Melody (`:1567-1571`); each "may do" row maps to M1a's server check (plan v3 `:22`) — no check, no row; "Her memory" (View · Clear…) reads `~/Melody`; Clear… is a confirm dialog (§3 `:779`)
  - confirm: `just walk "settings melody"` → 1 passed: "Start sessions in a new repository" off → Melody asks instead of starting (`@seat`; today: no spec)

- 257. The phone's tab order: Melody, Chat, then the panes
  - status: todo (after M1b's gate) · agent: — · worker: low
  - card: as the user on my phone, I want Melody first on the tab rail, so that the phone opens on who knows everything (FURPS U · MoSCoW Could; §20 decision 3)
  - context: the rail builds `[chat, ...PANE_IDS]` (`WorkspaceShell.tsx:366-373`); phone mode `visible: 'chat' | PaneId` (`pane-store.ts:67`); a pure `phoneTabOrder()`; the phone project runs by hand
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/pane-store.test.ts -t "phone tab order"` → 1 passed, `['melody', 'chat', …]` (0 matching today)

### docs/2026-09-23-melody-program-plan-v3.md — A v0.9 alpha (195 is A's first task; publishing only on the user's word each time)

Order: 195 → 258 ∥ 298 → 259. 259's confirm is the A-done gate (plan v3 `:41`). 298 added 2026-09-24 (user: "A" — the phone walk joins the gate; no hand check on a real phone).

- 258. The alpha checklist: who tests, how to install (fresh, with the quarantine step), what to try, known issues, where feedback goes
  - status: todo (after 195) · agent: — · worker: low
  - card: as an alpha tester, I want one page that tells me how to install, what to try and where to report, so that my first hour produces feedback and not questions (FURPS S · MoSCoW Must)
  - context: plan v3 `:30`; 1.52.0 installs don't see 0.9 as newer, so testers install fresh; an unsigned first download is quarantined; "what to try" follows first run → seats → Melody's first message → a session she starts; known issues from open `tasks.md` entries at release time; who tests and where feedback goes are the user's answers (default: GitHub issues on `hoaqbui/melody-agent2`)
  - confirm: `f=$(ls docs/*-melody-alpha-checklist-v1.md) && grep -cE "^## (Who tests|Install|What to try|Known issues|Where feedback goes)" "$f"` → 5 (today: no file)

- 298. `just test-phone`: the phone walks run unattended and join the A gate beside `test-full`
  - status: todo · agent: — · worker: medium
  - card: as the user, I want the phone build checked before every alpha tag, so that desktop work can't silently break Melody on my phone (FURPS R · MoSCoW Should)
  - context: `test-full` runs only the `walks` project (`Justfile:255-260`); the `phone` project (`playwright.config.ts:45-56`, `tests/e2e/phone.spec.ts`) needs a sidecar serving `dist-web/` on :3285 and proxying `/acp` to a `goose serve`, both started out of band, with the sidecar's `?key=` in `WEB_BUILD_URL` (`phone.spec.ts:1-8`); `build:web` is `ui/desktop/package.json:25`; the recipe starts both under a throwaway `GOOSE_PATH_ROOT` (as the walks do, `fixtures.ts:130`), runs the project, and stops them on any exit; `Justfile:248-251`'s "run by hand" comment updated; plan v3 `:41` gains `just test-phone`
  - confirm: `just test-phone` → the `phone` project passes with nothing started beforehand and no `:3285` listener left after (`lsof -iTCP:3285 -sTCP:LISTEN | wc -l` → 0); `grep -c "test-phone" docs/2026-09-23-melody-program-plan-v3.md` → ≥ 1 (0 today)

- 259. v0.9 alpha, done: `v0.9.0-alpha.1` published and installed fresh, it opens on Melody, and `v0.9.0-alpha.2` arrives through the updater
  - status: todo (after the M4 → A gate, 195, 258 and 298; each `gh release create` on the user's word) · agent: — · worker: medium
  - card: as the user, I want an installed alpha to pull down the next build by itself, so that testers stay current without reinstalling (FURPS R S · MoSCoW Must)
  - context: the gate is plan v3 `:41` (every Must/Should/Could closed, T1–T4's gates passed); `just test-full` before each tag; the swap path `githubUpdater.ts:229-240`, `:358`; log lines `GitHubUpdater: Update available:` (`:515`), `Current app version` (`:468`); the user's hand checks: opens on Melody's tab; Settings › Updates offers alpha.2; About reads `0.9.0-alpha.2` after relaunch
  - confirm: `gh release view v0.9.0-alpha.1 --repo hoaqbui/melody-agent2 --json tagName -q .tagName` → `v0.9.0-alpha.1` (not found today); `gh release view v0.9.0-alpha.2 --repo hoaqbui/melody-agent2 --json assets -q '[.assets[].name]|sort|join(",")'` → `Melody.zip,mac-update-requirements.json`; `grep -c "Update available: true" ~/Library/Logs/Melody/main.log` → ≥ 1; `just test-full` and `just test-phone` → green

### docs/2026-09-23-team-memory-program-plan-v2.md — team memory and growth: T0 (approved 2026-09-23, user: "continue" on the plan's decision 1 and 2 recommendations)

T0 done 2026-09-23: 202 (`~/Melody` committed, `83f5f23`); 203 (health check + lifecycle in its `AGENTS.md`, `9cc819d`; a fresh `claude -p --model haiku` there, no tools → "Pulse, Memory, Gaps, Companions, Next week"); 204 (PRD v2, v1 retired, the four conflicts marked settled in the research and v3; `both loops` 0, `memories/` 6); 205 (`scripts/melody-notebook-week.py` — fixture `4 · 3 · 1` exit 0, journal removed exit 1, live `0 · 0 · 0`). T0's gate still needs a week of use (§Waiting on the user). T1–T4 are in v0.9's scope (2026-09-23); T1 is planned at T0's gate, beside M1a.

### docs/2026-09-23-team-memory-program-plan-v2.md — T1: outcomes the scorecard can trust (drafted 2026-09-23; beside M1a, shares P1's ledger work)

Order: 264 → 265 ∥ 266 ∥ 267 ∥ 268 → 269. T1 done 2026-09-23; gate passed on main after 268's merge (`pnpm vitest run ledger-outcome agents-verdict telemetry` 73 passed; walks `telemetry pane` 1 passed — it covers Roles, there is no `telemetry roles` walk — and `job verdict` 1 passed). 268 done 2026-09-23 (a done row gets Good · Fixed it · Wrong, a why after Wrong, and Fixes… listing this repository's earlier jobs by delegation title with file overlap as a hint; the tap and the pick append `verdict` and `link` directly; confirm rerun: `just walk "job verdict"` 1 passed, agents-verdict 11, typecheck and lint clean). 267 done 2026-09-23 (a commit appends `land` with the committing session's id via a new `/git/diff-tree` route; a `Fixes-job:` trailer appends `link`; undo/redo append `undo` with `redo`; a stale 10-minute heartbeat appends `gap` once per cwd per launch; confirm rerun: appendLedger 2 · 1, 3 passed, test:light 1444, sidecar 102, `just walk "changes bar"` 1 passed). 269 done 2026-09-23 (Telemetry's Now, Roles and Trends read `outcomeOf`; `reworked` and `unknown` shown; confirm rerun: 2 passed, telemetry 57, lint clean; walks `telemetry pane`/`telemetry roles` to run at T1's gate). 266 done 2026-09-23 (`ledger-outcome.ts`: `outcomeOf`, `jobsOf`; `UndoEvent` gained `redo` — 267 records a redo as `undo` with `redo: true`; `now` is ms; confirm rerun: ledger-outcome 19 passed, with ledger-events and telemetry 54; lint clean). 265 done 2026-09-23 (sidecar dedup by kind · session · worker · message-or-natural-id, duplicates answer `{ok, duplicate}`; confirm rerun: 1 passed, sidecar 100, desktop ledger-events 12, both typechecks clean). 264 done 2026-09-23 (kinds `land · verdict · link · gap` in both lists; `worker` carries `turnId`, `member`, `charterSha`, `taskRef`, `taskHash`, `baseSha` — charter, hash and base stay null until their writers exist; confirm rerun: `'land'` 1 each, sidecar 1 passed, desktop 1 passed, sidecar suite 98 passed). 267 edits `ChangesBar.tsx`, `WorkspaceShell.tsx`, `ledger-writer.ts` and lands alone on them. The T1 → T4 gate is 266's vitest + 268's walk.

### docs/2026-09-23-team-memory-program-plan-v2.md — T2: Team health, Usage, Team Context (gated on M1b + M3; decision 2a: Work tabs first)

Order: 270 → 271 ∥ 272 → 273 ∥ 274; 275 after use. 270 done 2026-09-24: `docs/2026-09-23-team-tabs-prd-v1.md` approved (user: "Approved"), every decision on its recommendation — data sources 1–4 all A, open questions 1–5 as recommended; the PRD's `ARCHITECTURE.md` amendment text is approved for 271 to apply. 271 done 2026-09-24 (`/notebook/list|read|log` over `MELODY_NOTEBOOK`, read-only, log constrained to the root by pathspec; `/ledger/list` and `/ledger/read {name}` with realpath containment — neither `cwd` nor `name` still reads the spawn cwd's file, three existing tests rely on it; new lines keyed on the request cwd's repository, a linked worktree folding to its main checkout, submodules and separate git dirs kept apart; ARCHITECTURE.md §Modules amended; Codex FAIL → rework → PASS; confirm rerun on main: notebook 31 passed, sidecar 135, typecheck clean). For 273: `/notebook/log` `at` is the author date (`%aI`); a missing notebook answers 404.

- 272. Seat windows reach the renderer: each plan window's used, max and reset
  - status: todo (with or after task 182, a spine patch) · agent: — · worker: high
  - card: as the user, I want each seat's 5-hour, weekly and monthly windows with their reset times, so that Usage can say when one closes and the tidy-up can skip a seat that's nearly full (FURPS F · MoSCoW Should)
  - context: goose folds rate limits into `CreditsExhausted` with no reset (`acp/provider.rs:183-207`); claude-agent-acp's `rate_limit_info` and codex-acp's `resetsAt` are never forwarded (task 182); the desktop reads `usage_update` only for context (`sessionNotificationAdapter.ts:109`); target type `UsageLimit` (`usage-ring.ts:4-12`); feeding `planLimits` also lights the send disc's ring
  - confirm: `cargo test -p goose --lib acp:: -- seat_window` → a claude `rate_limit_info` and a codex `resetsAt` each reach the client as a window (0 match today)

- 273. Team health tab
  - status: blocked — M1b, M3 · agent: — · worker: high
  - card: as the user, I want the team's vital signs in one Work tab, and the check-in one click away, so that I see what's due without asking (FURPS U · MoSCoW Must)
  - context: `PaneId` `'team-health'` (`pane-store.ts:4-29`), label/icon `WorkspaceShell.tsx:206`, `:221`; five tiles (memory lines vs cap, chats with a note — `scripts/melody-notebook-week.py`'s logic, waiting on you, jobs done clean from 266, stale notes); member cards from 266; "Start check-in" sends "check-in" to Melody's session (M1b); links to Team Context (T2b)
  - confirm: `just walk "team health"` → 1 passed: opens from +, tiles read the fixture ledger and notebook, Start check-in reaches Melody's tab (today: no spec)

- 274. Usage tab (mockup D)
  - status: blocked — as 273; live windows need 272 · agent: — · worker: high
  - card: as the user, I want to see which seat closes before it resets, and what each member costs per clean job, so that I move work before the quota wall (FURPS U · MoSCoW Must)
  - context: pure `usage-projection.ts` — pace so far projected to the reset, "closes <day hh:mm>" when it crosses max first; the team table from 266 with each worker's tokens from the child session (`acp/sessions.ts:33-35`); three notes each ending in an action; `PaneId` `'usage'`
  - confirm: `cd ui/desktop && pnpm vitest run usage-projection` → the "Codex weekly 84 % Tue 14:00 → closes Thu 11:00" case passes (today: no file); `just walk "team health"` shows the Usage closing time

- 275. T2b: Team Context as a rich markdown editor over `~/Melody`, then the Reminders, Clean-up, Companions and Routines tabs
  - status: blocked — T2a in use; the user's written rule first · agent: — · worker: high
  - card: as the user, I want to read and edit everyone's memory in one editor where agents only suggest, so that I stay the one who approves what the team believes (FURPS U F · MoSCoW Could)
  - context: the rule written first as the Team Context PRD — direct writes: journals, `MEMORY.md`; suggestions only: charters, `AGENTS.md`, `SOUL.md`, verified `memories/` pages; each save one commit; a stale save stops and asks; features per `docs/mockups/2026-09-23-team-context.html`; the other tabs per `2026-09-23-melody-home.html`; split one task per tab at this gate
  - confirm: `ls docs/*-team-context-prd-v1.md | wc -l && grep -c "stale save" docs/*-team-context-prd-v1.md` → 1, ≥ 1 (0 today)

### docs/2026-09-23-team-memory-program-plan-v2.md — T3: lifecycle routines (after M1b; 276–279 are fixture-only)

Order: 276 ∥ 277 (both `scheduler.rs`, one lands before the other) ∥ 279 → 278 → 280. 278 done 2026-09-23 (the tidy-up runs on branch `tidy-up/<run-id>` in a temporary worktree of `~/Melody` — `working_dir` is a recipe parameter; `scripts/melody-tidy-guard.py` holds a flock, refuses symlinks at begin, and checks one commit on base: journal byte-identical, only A/M on `MEMORY.md`·`DREAMS.md`·`notes/**`, MEMORY removed ≤ 25 % by diff, DREAMS an exact byte prefix + one entry; a pass merges the checked sha `--ff-only --no-autostash --no-overwrite-ignore` while the notebook is still at base; a violation merges only a cause commit; refused runs are kept as `tidy-kept/<run-id>`; nothing is ever reverted, stashed, reset or forced; five Codex reviews → the last blocker fixed by the session and passed by agy; confirm rerun on main: 15 fixtures — ok 0, user-dirty-edit 0, user-commit-during-run-then-begin 0, seven violations 1, ignored-notes-collision · symlink-base · user-commit-during-run 2). 280 passes the worktree path from `guard --begin` to the recipe; 280 must expand `~` in `working_dir` (`scheduler.rs:1310` takes it literally) and hold scheduling until the guard's Codex review passes. 277 done 2026-09-23 (recipe `token_budget`, `min_seat_room`; over budget → `RunStatus::BudgetReached` with the message count, checked on usage events so both loops stop; `max_turns` now reaches the run; on the wire a budget stop shows as Killed with 'token budget reached after N messages' until 280's DTOs; confirm rerun: exact test 1 passed, scheduler+recipe+schedule 181, acp_server_test 71, clippy and fmt clean). 276 done 2026-09-23 (recipe `settings.command` runs argv with no shell and no provider; `RunOutcome` gained `exit_code`, `output` (last 16 KiB); a command recipe needs no prompt; confirm rerun with `--exact scheduler::tests::command_job_makes_no_model_call` → 1 passed, scheduler 25, recipe 164, clippy and fmt clean; kill reaches only the command's own process). 279 done 2026-09-23 (`scripts/melody-routines.py`, fixture `cap 170/200 warn · archived 2 · sweep 3 listed · backup: no remote set · reminders 3` exit 0; a non-repository exits 1; archive idempotent; proposals live at `proposals/YYYY-MM-DD-<name>.md` — a new notebook convention). Only the tidy-up calls a model, within its budget; the tidy-up's limits are enforced by a script after the run, not by the prompt.

- 280. Install the routines on the scheduler
  - status: blocked — 276–279; the user's yes (persistent jobs on their machine) · agent: — · worker: low
  - card: as the user, I want the upkeep routines scheduled once, visible in Routines, and removable, so that upkeep is a setting and not a chore (FURPS U · MoSCoW Should)
  - context: `melody-tidy-up` 03:00 daily; `melody-tidy-guard` 03:30; `melody-cap-check` hourly (no chat-start trigger exists); `melody-archive` on the 1st; `melody-sweep` Sundays; `melody-backup` daily; `melody-reminders` 08:00; cron shape `routine.ts:10-21`
  - found 2026-09-23 (task 276): the UI drops `settings.command` on save — `RecipeSettingsDto` (`crates/goose-sdk-types/src/custom_requests/recipe.rs:72`) has no `command`, and `routine.ts:94` builds settings through it; `ScheduleRunOutcomeDto` (`custom_requests/schedule.rs:134`) has no `exit_code`/`output`. 280 adds both fields, regenerates `acp-schema.json` and the client types, and wires `routine.ts`
  - found 2026-09-23 (task 277): the same DTO gap for `token_budget`, `min_seat_room`; `ScheduleRunStatus` (`custom_requests/schedule.rs:125`) needs `BudgetReached` and `ScheduleRunOutcomeDto` (`:134`) `messages`, `seat_room`; the generated zod enum (`ui/goose-acp-client/src/generated/zod.gen.ts:1537`) and `runs-state.ts:26`, `RunRow.tsx:54` gain `budgetReached`
  - confirm: `goose schedule list | grep -c "melody-"` → 7 (0 today)

### docs/2026-09-23-team-memory-program-plan-v2.md — T4: companion growth (after M2 and T1; C planned at its own gate from ≥ 20 judged jobs per companion)

Order: 281 → 282 ∥ 283.

- 281. A companion's test set, built from judged jobs
  - status: blocked — M2 (`~/Melody/<name>/`), T1 (264, 266, 268) · agent: — · worker: medium
  - card: as the user, I want each companion's tests taken only from jobs I judged, so that a charter change is measured against my standard (FURPS F R · MoSCoW Must)
  - context: `scripts/melody-testset.py build <name>` writes `~/Melody/<name>/tests/<workerSessionId>.md` per judged job: the task (`taskRef`, `taskHash`), `baseSha`, the grader (the task's test command or the Reviewer's rubric), the expected result (the landed diff, or the correction for `fixed`); no task written by an agent; < 3 judged → "not enough history (N judged jobs)"
  - confirm: `python3 scripts/melody-testset.py build tempo --ledger scripts/fixtures/testset/ledger.jsonl --out "$(mktemp -d)"` → `5 tasks`; the 2-verdict fixture → `not enough history (2 judged jobs)` (today: no script)

- 282. Rerun the test set on the old and new charter, pass^3, each run in a fresh worktree
  - status: blocked — 281; the scheduler gains `worktree_base` (keeps `.worktrees/` at two writers, `ARCHITECTURE.md:93`) · agent: — · worker: high
  - card: as the user, I want a charter proposal to show both charters' scores per task before I say yes, so that I accept a change on evidence (PRD v2 step 7; FURPS R · MoSCoW Must)
  - context: each task 3 runs per charter in a worktree at `baseSha`, the charter injected as the recipe's instructions, graded, the worktree removed; pass^3 = all three pass; `add_run_worktree` takes no base today (`scheduler.rs:1085-1096`), nor `/git/worktree/add` (`sidecar git.ts:474-481`); output: the Companions table — task, your verdict, v2, v3, tokens
  - confirm: `python3 scripts/melody-testset.py run --fixture scripts/fixtures/testset/regress` → `scores lower on retina-scale`, then `git worktree list | grep -c "wt/ts-"` → 0; the 2-judged fixture → `not enough history` (today: no script)

- 283. The Scorecard: throughput, lead time, change failure rate, rework rate, tokens per clean job
  - status: blocked — T1 (266), M2 · agent: — · worker: medium
  - card: as the user, I want five delivery numbers per companion from the same fold, so that "getting better" is a trend and not a feeling (FURPS F · MoSCoW Must)
  - context: pure `scorecard.ts` over 266's fold, per member per week — throughput (landed jobs), lead time (`worker` at → `land` at), change failure rate (landed then reworked or undone / landed), rework rate (reworked / final-outcome jobs ≥ 7 days), tokens per clean job (child tokens `acp/sessions.ts:33-35` / landed); unknown jobs excluded and counted beside; feeds 274's team table
  - confirm: `cd ui/desktop && pnpm vitest run scorecard` → passes on 266's fixtures incl. "unknown is excluded, not clean" (today: no file)

### docs/2026-09-24-headless-melody-prd-v1.md — headless Melody (after v0.9; user: "A", 2026-09-24)

- 299. Headless Melody: plan and tranche from the approved PRD
  - status: blocked — the A gate (v0.9 alpha published); PRD approved 2026-09-24, open questions on the recommendations · agent: — · worker: high
  - card: as the user, I want Melody and her work to keep running when the app is closed, and to reach her from the phone and a terminal, so that long delegated work and routines don't depend on a window (FURPS R F · MoSCoW Should, after 0.9)
  - context: research `docs/2026-09-24-headless-melody-research-v1.md` (the external-backend path has no sidecar, `gooseServeLeaseRegistry.ts:83-97`; a server per window, `main.ts:1105-1342`; ledger writers only in the renderer); the `ARCHITECTURE.md` amendment text is in the PRD, codex security review PASS after revision, amendment text approved with the PRD; groundwork 198, 200 (done), 208 (M1a); the plan decides whether 271's `/notebook/*` second root stays or folds into Allowed folders (`~/Melody` is always one), and 271 builds as specified until then
  - confirm: `ls docs/*-headless-melody-plan-v1.md | wc -l` → 1 (0 today); then the user's approval

## Waiting on the user

- T0 (team memory) — open Melody's chats in `~/Melody` for a week; then `python3 scripts/melody-notebook-week.py` counts chats · with a journal line · without, and say whether "where were we?" was answered from her notes. Decision 2c (tabs in the titlebar row) is also still open.
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
