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

- **Light by default, full at the gates.** A task's `confirm:` runs the
  light suite (`just test-light`) plus the one or two Electron walks the
  change touches (`just walk "<pattern>"`) — never the whole Playwright
  set. `just test-full` runs only before the app is relaunched for the
  user and at the end of a tranche. Workers use a private
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

- 74. One poll, one source: widen task 69's status poll (`WorkspaceShell.tsx:762-783`, gated on `diffHidden`) to `isWorkspaceRoute`, hold the last `GitStatusResponse` in shell state, keep the Changes dot's baseline rule, expose `gitStatus` on `PaneContext` (+ the `pane-context` test).
  - status: doing · agent: session-wave1 [Fable, worktree worker per AGENTS.md chain] · worker: medium
  - card: as every pane, read one git status instead of polling my own, so that the bar, the tints and the badge agree (panes research §One poll, one source)
  - context: headless — no UX plan; the Changes dot must behave exactly as before (`session menu` walk stays green)
  - confirm: `grep -c "gitStatus" ui/desktop/src/workspace/pane-context.ts` → `≥ 1` (untouched: `0`); `just walk "session menu"` → 1 passed

- 77. Approve mode truth-up, spine half: `AgyProvider::update_mode` returns `ProviderError::RequestFailed` for Approve/SmartApprove/Chat ("agy runs `--dangerously-skip-permissions`; it cannot ask"); `cursor_acp.rs:70-103` maps Approve → `plan` and its comment says what the capture showed (decision 2); the permission update carries `_meta.goose.toolCall.toolName` and a forwarded `diff` content block instead of dropping it (`acp/provider.rs:2107-2147`, `acp/server/tool_calls/conversion.rs:136-156`), and `default_tool_title` stops re-titling a title that is already one; tests `update_mode_refuses_non_auto`, `action_required_carries_adapter_tool_name`. `scratchpad`'s `probe3.py` lands as `scripts/probe-approve.py` — the re-runnable matrix.
  - status: doing · agent: session-wave1 [Fable, worktree worker per AGENTS.md chain] · worker: medium
  - card: as the user, have Approve mean what the seat can do — ask, ask-outside-the-workspace, plan-only, or unavailable — instead of a label that writes files (approve-mode research §The surprise)
  - context:
    - headless — no UX plan; delegated children stay Auto by design (bridge plan §Out of scope); `agent.rs` / `state_machine/` untouched; `check-spine` stays the gate
    - the Rust confirm waits on the toolchain (decision 6); implement now, confirm then
    - decision 6, 2026-09-18 (session): CLT already 27.0 (`pkgutil com.apple.pkg.CLTools_Executables` → 27.0.0.0.1788430756; `softwareupdate --list` → none); the freshly linked dylib from `rustc 1.96.1` + this CLT still fails (`Compiling sqlx-macros` then the same dlopen error, 15:00); `rustup check` → rustup 1.28.2 → 1.29.1 only, the channel is pinned by `rust-toolchain.toml`; a `stable` toolchain probe (`CARGO_TARGET_DIR=target/stable-probe cargo +stable test …`) is running — its result decides whether `rust-toolchain.toml` moves (a repo change, its own line here) or the Justfile's `RUST SKIPPED` marker (landed with this commit) stays
    - decision 6 resolved, 2026-09-18 (session): a `stable` probe (`rustc 1.98.1`, 2026-09-01) built and ran `cargo test -p goose --lib -- session_bridge summon scheduler` → 90 passed, 1 failed — `bridge_broadcasts_delegate_started_and_done` races the global bridge across parallel tests (`session_bridge.rs:550` asserts no prior subscriber) and passes alone 3/3, so it is test isolation, not the toolchain; `rust-toolchain.toml` moved `1.96.1` → `1.98.1` in this commit; the Justfile marker stays as the safety net; every Rust `confirm:` is live again — 77 unblocked and claimed
  - confirm: `source bin/activate-hermit && cargo test -p goose --lib -- update_mode_refuses_non_auto action_required_carries_adapter_tool_name 2>&1 | grep -E 'test result: ok\. 2 passed'; echo exit=$?` → `exit=0` (untouched: 0 tests — and today no cargo build completes); `bash scripts/check-spine.sh` → `spine clean`; `grep -c "fn update_mode" crates/goose/src/providers/agy.rs` → `1` (untouched: `0`)

## Waiting on the user

- **Direction — who can orchestrate (found 2026-09-15 evening, research v1 addendum):** on stock Goose no ACP or print-mode subscription provider receives Goose's tools, and ACP workers do not receive their role body; only `chatgpt_codex` (ChatGPT Plus) and API-key providers do. Options: (A) repair the spine — (i) fold system into the first ACP prompt, (ii) export a session's platform tools (`delegate`, `load`) to ACP agents and `claude-code` as an MCP endpoint on `goose serve`; keeps Claude-first via `claude-acp`; (B) interim Codex-native orchestrator (`chatgpt_codex`) for the proof while A lands; (C) interim Claude API-key orchestrator. Tasks 5, 8, 9 blocked on this; 6 and 17 stand.
  - *Correction (same evening, research v1 §Correction):* `claude-code` (Claude Max, print mode) already receives the role body and forwards StreamableHttp MCP servers, so it is a Claude-first orchestrator that needs only (ii); (i) is the ACP-workers patch. (ii) shrinks to one `goose serve` route plus a per-session synthetic `StreamableHttp` extension. All delegated children run `Auto` regardless of provider (`summon.rs:622,1400,2075,2373`) — `PRODUCT.md` §5's gating line is wrong for workers; fix after the pick. Recommendation: destination A as `claude-code`+(ii), then (i); interim B (`chatgpt_codex`) for the task 9 proof, with the Implementer on `claude-code`. Task 19 is independent of all of this and can run now.
  - *Decided (2026-09-15 20:10, user):* **A** — repair the spine as `claude-code` + (ii), then (i). B and C not taken. Tasks 5, 8, 9 stay blocked until the bounded integration plan (§Handoff, next action) is written and approved; that plan is the next claim on the spine side.
- *Task 21 revision (2026-09-15 21:05) → task 26 (21:25, user: "build out tasks for everything" taken as the go; say so if 21 should stay as landed).*
- Task 33 — parked (user 2026-09-16: file the upstream issues after the parity tranche proves the fixes in use).
- Sidecar auth — decided 2026-09-16 (user): a per-launch sidecar secret → task 61.
- task 11 hand check — one early run of the Mode selector produced three sessions from one click (worker's report, not reproduced in five later runs with a call-site trace). Open the desktop, pick Orchestrate once, count sessions in the list; more than one is a P0 bug.
- Renderer CSP (2026-09-16): the `http:` widening from tasks 12/14 is reverted by task 43 — `index.html:7` is back to upstream's `connect-src`; the desktop renderer reaches the sidecar over loopback, the tailnet listener exists for the phone only. Task 15's `ws:`/`http:` lease and its `upgrade-insecure-requests` drop are removed with it. Hand checks: packaged `file://` build — open Files and Terminal, watch the console for connect-src violations; phone — the tailnet URL from the desktop log still loads the web build and answers `./config`.
- task 13 hand checks — dark theme flips gutter/token colours and the markdown Preview palette; type without saving, close the pane, reopen from the side tab → draft, cursor, undo intact; chmod a file read-only, edit, ⌘S → error line with Retry, edit kept.
- task 16 hand checks — press Esc mid-tool-call, then open Git: Commit stays disabled ("waits for the running tool call") because the orphaned `toolRequest` never gets a terminal status — spec (DESIGN Running row) or bug, your call; ask the agent to write a file with Git open → Unstaged refreshes on its own when the call ends; open Git in a non-repo cwd → "Not a git repository" + path.
- task 40 hand checks — hover lift on the three header icons; ⋯ tooltip is hover-only (focus-opened tooltip lingered after the menu closed — a UX asymmetry to accept or not); Runtime/Mode carry a native `title` (`Claude · Direct`) rather than the styled tooltip; the side tab row now wraps to two lines at seven tabs until task 42 replaces it.
- task 31 hand checks — Browser: open from the header, type `localhost:<port>` of a running dev server → frame renders; Reset clears to the empty line (no per-project dev-server config exists in the tree, so the default is empty — say if you want a `.goose` config key for it); phone web build: a loopback URL shows the "not reachable from here" line instead of the frame, and an `http://` frame under an `https://` workspace is blocked as mixed content (no proxy, by scope). Markdown: pick a `.md` in Files → rendered, dark palette flips; pick a `.rs` → "Not markdown" bar over raw text; the pane follows disk when the agent writes the open file.
- task 56 hand checks — web build: Share row reads "Share sends the address only from here" and inserts `Page: <title>\n<url>`; the webview's cookie partition (`persist:workspace-browser`) is separate from the app's — sign in to a site in Browser, it must not appear signed in anywhere else; guest history is lost when the pane unmounts on a tab switch (address and suggestions survive) — decide if that's acceptable before task 42's dock keeps panes mounted.
- task 17 hand checks — agy print mode is ungated regardless of flags (`permission_mode: always-proceed` in its init event) — accepted for V0 with the Reviewer gating the diff; tool-call `step_type` events are unknown and dropped by the parser, so a tool-using agy turn shows only its text; resumed turns report 31–39 s `duration_seconds` for a 2–4 s step (unexplained).
- task 42 hand checks — drag Terminal into another panel → scrollback intact; drag a seam by mouse; after closing a panel's last tab, focus sits on the header ⋯ and its tooltip must not open; the dock (panels, not just sizes) is saved per project in localStorage — a saved Terminal spawns its pty at launch, a saved Editor opens empty; say if you'd rather sizes only.
- task 57 hand checks — vibrancy: the worker could not observe the desk showing through (charcoal reads flat, not smoky) — if you see no bleed on your desktop, the fix is a transparent `backgroundColor` in `main.ts` plus transparent roots in `AppLayout.tsx:91` / `MainPanelLayout.tsx:12`; off-macOS/phone the .8-alpha surfaces composite over white (≈`#494949`) — an opaque `html` background for the web build is the likely fix (DESIGN §Open decisions); the Changes pane's Monokai highlighting is wired but inert (its editor carries no language); the user bubble is now `#2c2c2c` on shadow instead of white.
- task 60 hand checks — rail slide (edge ↔ dock strip) and the Sessions collapse ease; Settings/Extensions now render inside the Chat column beside Sessions; Ctrl+1/2/3 inside a focused terminal fires the column shortcut (⌘ is the binding); at 600 px the chips go icon-only and the send button clips at the card edge (upstream's bar layout); `navigation_width` in upstream's NavigationContext is now dead code.
- task 58 hand checks — Settings › App "Advanced controls" switch syncs live with the shell; the Install affordance on a stop (no uninstalled adapter here); the phone build's lever; the ⋯ menu checkbox; Hard on `claude-code` runs whatever model the claude CLI is configured with (it publishes no list) — Easy/Medium land on `sonnet` / `opus[1m]` via `claude-acp`; a Playwright walk that dies mid-run leaves the app in Advanced (settings.json is the real file).
- task 48 hand checks — a merge conflict aborts the merge before the 409 (no resolve route exists); `wt/<slug>` branches survive `worktree/remove`, so re-adding the same slug fails until the branch is deleted by hand — say if remove should delete the branch when merged.
- task 51 hand checks — "Run now" in the desktop's schedule view now receives a rejected request when the run's stream fails (`ScheduleDetailView.tsx:162-170`) — confirm it shows a toast rather than swallowing it; a run that fails before its stream starts (provider/extension setup) leaves no outcome on its session (follow-up candidate); Posthog still emits `schedule_job_completed` on failed runs (pre-existing).
- task 47 hand check — before/after: open the desktop in checkout A, switch the directory to worktree B, delegate with `provider: claude-acp`, instructions "write T47-PROBE.txt containing the output of pwd" → the file must land in B (it landed in A before 47); then from a session in `ui/desktop`, delegate `working_dir: "../../.worktrees/<slug>"` (pre-created) → accepted (refused before). Settles whether `claude-agent-acp` accepts a cwd under `.worktrees/`.
- task 61 hand checks — the key is in the desktop log line `sidecar listening at …` every launch until 62 shows it in the app; a phone whose stored key predates a desktop restart 401s until it reloads the new URL; `/config` stays open (working dir + version to the tailnet, unkeyed) — say if you want it gated; packaged `file://` build Files/Terminal not walked.
- task 50 hand checks — the running gate needs a live tool call (Stage/Reject disable with the reason, `diff-blocked` in the header, list refetches when the call ends); edit a file on disk after the pane loaded then Reject → git's stderr as the Error row, list kept; a renamed/binary file's file-level Stage in the app.
- task 49 hand checks — a window opened inside another worktree (this repo's `.claude/worktrees/agent-*`) gets 400 on Merge/Remove because the main checkout is outside the sidecar's cwd roots; Refresh does not clear a 409 (the next Merge does); an open Terminal keeps its pty in a removed worktree until reopened; the Worktree chip in Advanced was not screenshotted.
- task 62 hand checks — scan the Phone card's QR with hoa-phone (the encoder matches python-qrcode module-for-module, no scanner here); a second desktop window in the same launch falls back to a random port and shows a different URL; Copy on the phone build needs a secure context (`http://` rejects silently).
- task 53 product calls — Accept commits only tracked changes (`git diff <base>` omits new files; `add -A` shapes are barred by the protected line) — say if a run that only creates files should be acceptable; after Accept the row stays (a second Accept lands "nothing to commit") — say if Accept should also archive; the row's mode line is the global `GOOSE_MODE`, not a per-run record. Note: `ui/desktop/src/bin/goose` wins over `target/debug/goose` for the dev app — refresh it after every Rust merge (`just copy-binary debug`).
- task 59 findings — a routine runs on the GLOBAL provider/model, not the one the sheet shows: the recipe `Settings` has no `goose_mode`/cwd (`recipe/mod.rs:99-111`) and `execute_job` ignores `settings` (`scheduler.rs:1082-1084`, `GooseMode::Auto` forced, cwd = `current_dir()`) — spine task 63 below; Manual = a paused daily schedule (the sheet says so); only Manual was walked live (Hourly/Daily/Weekly/cron are unit-shaped); the session bridge entry is filtered out of the saved recipe (its secret never lands in YAML).
- task 54 hand checks — Dismiss on a worktree already removed by hand errors and keeps the row (`git worktree prune` is the escape); `worktree: true` where the scheduler cwd is not a repo fails before any session and surfaces only via the Run-now toast / cron log; the recipe reference doc's settings table (`documentation/docs/guides/recipes/recipe-reference.md`) does not list `worktree` yet.
- doc debt after task 55 (2026-09-16) — DESIGN.md's PRD line refs are stale (a rewrite, not an amendment); DESIGN.md §Vocabulary `:84` and both ARCHITECTURE.md diagrams still say `tasks_update`; no PRD journey step covers the Worktree chip, the Runs inbox or the routine sheet (DESIGN §Vocabulary rows are their only spec); task 27's activity pick is documented as the architecture but not yet in code (tranche 5).
- task 63 product call — the routine sheet now saves the session's actual goose mode, so a session in `approve`/`smart_approve`/`chat` produces a routine that runs unattended in that mode (an Approve routine would stall on its first prompt with nobody there) — say if routines should force Auto or refuse non-Auto modes.
- task 66 hand checks — the real-`gh` path: one PR on a scratch repo of your choosing (empty-state texts "no pull requests found" / "no git remotes found" were probed against gh 2.100 and match); a first `git push` over HTTPS/SSH with no TTY — confirm it fails cleanly rather than hanging (else `GIT_TERMINAL_PROMPT=0` on the route); push a worktree branch, open Changes → "Open PR…" beside Merge, sheet reads "From wt/… into main" (typecheck-only today); Sign in cannot open the Terminal pane from the Git pane — its hint says to run `gh auth login` there.
- task 64 hand checks — the live `codex-acp` cell after the quota reset, and that codex-acp still stamps `codexErrorInfo: usageLimitExceeded` (one capture exists); a forced-`provider:` delegate or an async `load(task_id)` child that dies on quota now reports `Delegation failed: …` (was a success string) — the async path is not re-rolled; direct-API HTTP 429 is retried in place by the loop and does not re-roll (needs an `agent.rs` edit to observe).
- task 65 hand checks — the phone shell receiving `_goose/unstable/*` through the sidecar's ACP proxy is unverified; the async `delegate` path emits `running` live but its `done` waits in the task's buffer until a later `load`; a native-API parent's delegate events are dropped by `platform_events.ts` (no `summon` handler) — check the tool row does not render them as raw JSON.
- task 69 hand checks — Delete (D) with its red confirm is jsdom-tested only; Transcript view ▸ Compact on a session with tool rows; Open in ▸ Code editor with and without VS Code/Cursor installed (falls back to the OS default and says which); Keep computer awake actually holds the Mac (`pmset -g assertions` while on); the Terminal dots on startup from the scrollback replay of a background tab; Output style ▸ is the global Detailed · Concise setting (upstream's response style is client-only, nothing to send per session).
- task 28 hand checks — the parent's token counter read 130k/128k in red after a delegation round-trip (claude-code's accounting over the bridge, not isolated); opening a child transcript pops upstream's "New Recipe Warning" (the role rides as a recipe) — decide whether sub_agent sessions should skip it; reload-seeded rows show no status until the next live event.
- task 30 hand checks — after Open transcript the pane lists the child's (empty) artifacts, by spec; multi-child ordering and the running→done re-read are unit-level only.
- task 67 hand checks — the Running column with a live streaming session; a delegated child nested under its parent's card and its click landing on the child; project/runtime filters on a real multi-project board; card shadows use Tailwind's `shadow-sm` (a no-op on buttons under `main.css:25`) — cosmetic.
- task 68 hand checks — a real macOS banner while the window is blurred, its click landing on `/pair?resumeSessionId=…` or `/schedules`; three workers finishing together → one "3 workers finished"; the Sessions-column dot for a session that finished while blurred; phone: Settings › App › Allow notifications, then a finish shows a browser notification.
- task 29 hand checks — after an app restart the strip stays hidden until a live delegation event (reload-seeded rows carry no role — `DelegatedChild` has no `source`; a small follow-up on `session/children` would fix it); the strip pushes the chat down ~52 px when it first appears; phone width mounts it too (unwalked).
- task 71 hand checks — toasts (top-right) cover the bar's ⋯ for a few seconds (upstream's toast position); drag a tab across the Browser pane's webview; long-press on a touch desktop; a pre-71 saved dock restoring in the app (unit-tested only); the bar between ~480 and ~520 px with many tabs (overflow chevron, ⋯ not clipped); the diff-pane walk can fail when run after certain other walks in one batch (shared scratch state) — passes alone.
- task 70 hand checks — Open transcript on a review shows upstream's recipe trust dialog once per seat (same as opening any delegated child — decide whether sub_agent/review sessions should skip it); the review session's card on the Board and its finish notification; Git pane's Review branch… from a main checkout with a remote (base = the remote's default); phone tab rail with a tenth icon; the review session is found by title `Review: <branch> vs <base>` (no client call writes session meta — a `session/update` meta method would make it a tag).
- task 14 hand check — "since session start" base: open a session in a git cwd, commit, open Changes → the selector offers it and lists the committed file; `git diff HEAD` omits untracked files (accepted gap, or queue).
- `ARCHITECTURE.md` — sign-off deletes `## Bootstrap Status`; until then the map is a proposal and tasks 10–16 plan against a guess.
- task 20 hand checks — on `hoa-phone`: scan the Phone card's QR, walk PRD step 13 (chat first, tab rail, Files → Editor, Terminal with the key bar above the iOS keyboard), background the tab for a few minutes and return → terminal scrollback replayed, chat replayed, draft kept; every foreground forces a terminal reset+replay and an ACP teardown (a quick app switch blinks the terminal); `/fs/watch` (the Files dot) is not reattached on foreground (queue candidate); goose's ACP has no "messages since id" pull — whole replay for now (future spine task).
- task 9 hand checks — rerun the `codex-acp` implementer cell after the ChatGPT quota reset (5:05 PM PDT; recipe `scratchpad/t9/recipes/impl-codex-acp.yaml`) — the one fold judgement still open; the `claude-acp` child called Claude Code's own `advisor` server tool despite the role's "Do not delegate" — breach or not is the role owner's call; `cursor-agent` ignores the seat's model id (`cursor_acp.rs:97-101`, ran `grok-4.6-high-fast` for an `xhigh` seat) and `sessions.db` records the seat id, not what ran; the handoff-memo criterion (PRD §Criteria, second) stays manual: ask "what did we just change?" after a runtime switch.
- Goose spine integration — the next session must finish the concrete plan above and obtain plan approval before source edits; “continue” established the direction, not an unwritten implementation scope.

## Ownership

- **This file owns:** task state — the claim, the 3C body, the check.
- **The plan doc owns:** approach and negative space, and dates the
  change. **`ARCHITECTURE.md` owns:** the boundaries a task may not
  cross.
