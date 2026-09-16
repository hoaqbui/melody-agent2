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

## Tasks

### docs/2026-09-15-goose-fork-plan-v1.md

- 9. Run the runtime matrix: from a Goose session in this directory on `claude-acp`, delegate the same one-file task ("add a `--version` line to `scripts/check-spine.sh` help") to implementer on `claude-acp`, `codex-acp`, `cursor-acp`, `agy`, then call `advisor` six times with `exclude_provider` set, and record per run: provider, model, turns, result shape, permission prompts seen, in `docs/2026-09-15-runtime-matrix-v1.md`.
  - status: doing · agent: subagent-t9 via claude-session-opus-2 (14:00, worktree) · worker: medium
  - unblocked 2026-09-16 14:00: 6, 17 landed, `codex-acp` installed; orchestrator on `claude-code` (bridge, task 24)
  - was blocked: no subscription orchestrator in tree can call `delegate` except `chatgpt_codex` (research v1 addendum, evening). Unblocks: the user's pick — run the matrix from a `chatgpt_codex` session as the interim proof, or wait for repair (ii) — owner: user
  - unblocks (2026-09-15 20:40, plan spine-bridge v1 approved): tasks 22–24 give `claude-code` `delegate` via the session bridge; run the matrix with the orchestrator on `claude-code` after 24
  - still blocked 2026-09-15 21:20 on: task 26 (ACP workers refuse the folded template), task 6 (`cursor-acp`), and `npm i -g @agentclientprotocol/codex-acp` — owner: user for the install, this ledger for 26 and 6
  - 2026-09-15 22:30: task 26 resolved by pick A+C — Claude worker seats move to `claude-code` (task 34), the role-body fold (`subagent_handler.rs` `first_user_message`, merged) stays for `codex-acp` / `cursor-acp` children; this matrix is where that fold is judged: record per ACP child whether its first reply follows the role body (token test as spike doc §Setup) — still waits on task 6 and the `codex-acp` install
  - card: as the user, see each role×runtime pair work once so that the fork's UI work builds on a proven spine
  - context:
    - needs `codex-acp` installed (`npm i -g @agentclientprotocol/codex-acp`; `codex_acp.rs:37-42`), `claude-agent-acp` (present), `cursor-agent` (present, `~/.local/bin`), `agy` (present), and tasks 5, 6, 17 landed
    - the unknowns this settles: does `delegate(provider: "<acp>")` run `AcpProvider` inside a `SubAgent` session with `max_turns` honoured (research v1 §Unknowns, first); do the Claude model ids pass through `claude-agent-acp`; does the advisor roll respect `exclude_provider` and never repeat the excluded provider
    - print-mode flags seen 2026-09-15 running the same three runtimes by hand: `codex exec` needs `--skip-git-repo-check` outside a git repo; `cursor-agent -p` needs `--trust`; ACP mode may differ — record what each adapter needed
    - use `goose session` CLI, not the desktop, so the result is independent of tranche 4
    - record the subscription each run drew on (PRODUCT.md §5) and any quota message — that is the first fail-over datum
  - confirm: `test -f docs/2026-09-15-runtime-matrix-v1.md && grep -c '^| \(codex-acp\|cursor-acp\|claude-acp\|agy\) |' docs/2026-09-15-runtime-matrix-v1.md` → `4`

- 20. Add the phone layout to `src/workspace/`: below 768 px the pane store exposes one visible pane behind a tab rail (chat · Files · Editor · Diff · Terminal · Git), the terminal key bar from task 15 is shown, and reconnect-on-foreground reattaches the pty and refreshes the chat; Playwright gets a `phone` project (390 × 844, touch, iPhone UA).
  - status: doing · agent: subagent-t20 via claude-session-opus-2 (14:00, worktree) · worker: medium
  - card: as the user on the phone, check what the agent did and nudge it from wherever I am so that the walk does not wait for the desk (PRD step 13, criteria 7–8)
  - context:
    - iOS Safari suspends background tabs: the WS drops; on `visibilitychange` → visible, reconnect to the sidecar and reattach the pty by id (task 15/18), then pull the session's messages since the last seen id via `src/acp`
    - CodeMirror 6 iOS tap-to-place (discuss.codemirror.net/t/3345) — read the current changelog before relying on editing; reading and small edits are the bar at V0
    - test on `hoa-phone` over the tailnet (`tailscale status`, 2026-09-15) — the Playwright phone project is the mechanical check, the phone is the manual one (§Waiting on the user)
  - confirm: `cd ui/desktop && pnpm run typecheck && pnpm exec playwright test -g "phone" --project=phone; echo exit=$?` → `exit=0` (at 390 px: chat first; tap Files → tree; tap a file → editor; tap Terminal → key bar visible; `pwd` prints the cwd)

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

- 28. Add the Agents pane (`ui/desktop/src/workspace/panes/agents/`): a tree of delegated work under the orchestrator — runtime · role · task title · status (waiting / running / done / failed) — rows appearing when the `delegate` call starts; click a row → a read-only worker transcript pane over the child session (`_goose/*` session load through `src/acp`).
  - status: blocked · agent: — · worker: high
  - blocked: waits on task 27's pick for the event source — owner: this ledger
  - unblocked 2026-09-15 22:05: task 27 picked (a) — the bridge publishes a per-session broadcast, the ACP server forwards it as `GooseSessionUpdate::DelegationUpdate`, with a `_goose/unstable/session/children` read for reload/CLI (`docs/2026-09-16-agent-activity-research-v1.md` §Options → pick); the tree is keyed by `subagent_session_id`, not by a parent tool-call row — on `claude-code` the parent has none (`claude_code.rs:1011`); `status: waiting` has no producer, rows start at `running`. Needs its own spine task (the publish side) before this pane; plan it from the research's §Scope skeleton
  - card: as the user, see who is working on what and open a worker's transcript so that orchestration stops being invisible (PRD step 10; PRODUCT.md §3.4, §11)
  - context:
    - states per PRD §States "Agents": empty → "No delegated work yet"; partial → status-only row while the transcript is not stored; error → the worker's error stays on the row
    - the picked runtime shows on the row once task 5's payload carries it; until then provider/model from the child session record
    - no ACP imports outside `src/acp` (task 4's depcruise rule)
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/agents && pnpm run depcruise; echo exit=$?` → `exit=0`

- 29. Add the RPI strip above the chat (`ui/desktop/src/workspace/rpi-strip/`): phases Research · Plan · Implement · Review lit when a worker with that role starts (from the same event source as task 28), a phase with an artifact clickable, a re-run phase showing a counter.
  - status: blocked · agent: — · worker: medium
  - blocked: waits on task 27's pick, and on task 28's row model to map role → phase — owner: this ledger
  - 2026-09-15 22:05: 27 picked; still waits on 28's row model (session-keyed, see 28)
  - card: as the user, see which RPI phase the orchestrator is in so that a long task reads as progress, not a blank chat (PRD step 11)
  - context:
    - role → phase from the role file name (`researcher` → Research, `planner` → Plan, `implementer` → Implement, `reviewer` → Review; advisors light the phase they gate)
    - states: all dim / active pulses / lit-not-clickable without artifact / red on failure, still clickable (PRD §States "RPI strip")
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/rpi-strip; echo exit=$?` → `exit=0` with ≥3 tests

- 30. Add the Artifact pane (`ui/desktop/src/workspace/panes/artifact/`): the markdown a worker returned (Brief, Plan, Result, Review — PRODUCT.md §7 shapes), opened from an RPI phase or an Agents row, rendered read-only with the role and runtime in its header.
  - status: blocked · agent: — · worker: medium
  - blocked: waits on tasks 28 and 29 (its two entry points) — owner: this ledger
  - card: as the user, read the compact artifact a worker produced without opening its transcript so that Claude's conclusions and the worker's evidence are one click apart (PRD step 11; PRODUCT.md §3.4)
  - context:
    - the artifact is the child session's last assistant message (`summon.rs:1412` returns last-only output) — read it through `src/acp`, do not re-derive from the parent's transcript
    - markdown rendering: reuse whatever the chat already uses for assistant text (`components/`), compose, do not fork
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/artifact && pnpm run depcruise; echo exit=$?` → `exit=0`

### Parity with Codex desktop and Claude Cowork — plan v1 (approved 2026-09-16)

Planned in `docs/2026-09-16-parity-plan-v1.md` (approved 2026-09-16, "approved all recommendations"). Order: wave 1 = 47 ∥ 48 ∥ 51 (disjoint files); then 49 ∥ 50 (after 48) ∥ 52 (after 51) → 53 → 54 → 59 (after 53 and 58) → 55. 61 and 62 (below) run in wave 1 too — sidecar-only.

- 53. Add the Runs inbox to the Schedules route: `ui/desktop/src/components/schedule/runs/` (list, row, an unread store keyed by `updated_at` vs a local last-seen in `localStorage`) composed into `SchedulesView.tsx`; row = schedule · started · outcome · snippet · unread; Open → `pair?resumeSessionId=<id>` with Changes selected at "since session start"; Dismiss → `session/archive`; Accept → stage the paths of the diff since `HEAD@{started_at}` + `/git/commit` through `src/native/sidecar`, enabled only when the run's `working_dir` equals the sidecar's cwd, with the cwd shown on the row; poll every 15 s while the route is open.
  - status: doing · agent: subagent-t53 via claude-session-opus-2 (13:40, worktree) · worker: high
  - card: as the user, find what the agent did while I was away in one list, open it with its changes, and accept or dismiss it so that unattended work is reviewed, not lost (Codex parity gap 3, local-first; PRODUCT.md §12 scheduling moves out of Future for the local case)
  - context:
    - one row component shared with task 28's Agents pane (same fields, different source); the inbox is global, the Agents pane is per session
    - an unattended run on `claude-acp` takes its permission mode from the global `GOOSE_MODE` (`claude_acp.rs:70-91`), not the run's `Auto` — the row states the run's mode until a later task passes the session mode into the provider
    - strings as `runsInbox.*` keys in every locale as task 11 did
  - confirm: `cd ui/desktop && pnpm vitest run src/components/schedule/runs && pnpm run typecheck && pnpm exec playwright test -g "runs inbox"; echo exit=$?` → `exit=0` (walk: a schedule with one finished run → one row, unread; Open → pair with Changes; back → read)

- 54. Run each scheduled job in its own worktree: `execute_job` in `scheduler.rs` runs `git worktree add -b wt/<slug> <toplevel>/.worktrees/<slug>` itself when the schedule's recipe sets `worktree: true` (a recipe settings field; the scheduler has no sidecar), records the path and branch on the session, and the inbox's Accept becomes `/git/merge {slug}` with Dismiss = `/git/worktree/remove`; the main checkout is never the cwd of an unattended run when the field is on.
  - status: todo · agent: — · worker: high
  - card: as the user, let unattended runs land on branches so that accepting one is a merge and my checkout is never touched while I'm away (research 46 A2; research 44 §Recorded decisions)
  - context:
    - waits on 48, 49, 53; the recipe field is the opt-in, default off
    - `scheduler.rs` shelling to git is a second git site (the sidecar is the first) — keep it to `add` and record; list/remove/merge stay the sidecar's
  - confirm: `source bin/activate-hermit && cargo test -p goose --lib scheduler_worktree 2>&1 | grep -E 'test result: ok\. [1-9]'; echo exit=$?` → `exit=0`; and the task 53 walk with a `worktree: true` schedule: Accept → the main checkout's log has the merge commit

- 55. Amend the documents the picks reverse: `docs/2026-09-15-workspace-prd-v1.md` §Scope (worktree-per-task in, dated) and step 5 / decision 5 (per-hunk stage and revert, dated), `DESIGN.md` `:125` (Undo in place of confirm), `PRODUCT.md` §11 (`tasks_update` line → task 27's pick) and §12 (local scheduling out of Future), `ARCHITECTURE.md` §Modules sidecar line (worktree lifecycle, apply) — dated amendments, no rewrites.
  - status: todo · agent: — · worker: low
  - card: as a reader, find the map and the PRD saying what the tree does so that the next plan does not re-argue these picks
  - context:
    - `ARCHITECTURE.md` rule: constrain, don't describe — one line per new responsibility
  - confirm: `grep -c 'worktree' docs/2026-09-15-workspace-prd-v1.md ARCHITECTURE.md | awk -F: '{s+=$2} END {print s}'` → ≥ 3 (untouched tree: fewer); and `grep -c 'V0.5.*scheduling' PRODUCT.md` → `1` (untouched tree: 0 — the scheduling line moves from §12 Future into the V0.5 line)

- 59. Save a session as a routine: "Save as routine…" in the session's Advanced controls (ledger task 58) and the ⋯ menu opens a sheet prefilled from the session — title (the session's display name), instructions (the first user prompt, editable), the session's provider · model · goose mode · extensions · working directory — with a trigger picker Manual · Hourly · Daily · Weekly · Custom cron and, after task 54, a "Run in its own worktree" checkbox; Save calls `save_recipe` then, unless Manual, `create_schedule` (`crates/goose/src/acp/server/custom_dispatch.rs` `dispatch_save_recipe`, `dispatch_create_schedule`); the sheet closes into the Schedules route where the routine appears with "Run now" (`run_schedule_now`) and its runs land in the Runs inbox (task 53); a routine's run session shows a "Routine: <title>" chip in the header linking back to the schedule.
  - status: todo · agent: — · worker: high
  - card: as the user, turn a session that worked into something that runs again — on a schedule or on demand — so that the work I supervised once becomes a routine I only review (user 2026-09-16: "sessions can become persistent in the form of routines/automations"; research 46 A1–A2)
  - context:
    - after 53 (inbox) and ledger 58 (Advanced controls host the button); the recipe is built client-side from the session record and the ACP config options — no new server method; `recipe.settings` carries provider/model/mode as today's recipe schema allows (`crates/goose/src/recipe/mod.rs`); extensions by name
    - vocabulary: "routine" in copy, "schedule"/"recipe" stay the route and file names (DESIGN.md §Vocabulary row; PRODUCT.md §11 automations line amended in 55)
    - the session's transcript is not part of the routine — instructions are the prompt, not the history; a "Save the reply as instructions" affordance is a later ask
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/routine && pnpm run typecheck && pnpm exec playwright test -g "routine"; echo exit=$?` → `exit=0` (untouched tree: no `routine` dir or spec; walk: open a session, Advanced → Save as routine → title prefilled, Manual, Save → Schedules lists it → Run now → Runs inbox shows the run)

- 62. Fixed sidecar port and the phone URL in the app: the desktop starts the sidecar on port `7788` (setting `sidecar.port`, Settings › App), falling back to `0` only when the bind fails and saying so in the log; Settings › App gains a "Phone" card showing the tailnet URL with the key (task 61) as text with Copy and as a QR code (rendered inline as SVG — no new dependency: a small QR encoder under `src/utils/qr.ts` with a test, or `qrcode` only if one already exists in `ui/node_modules`), refreshed on every launch; the ⋯ rail menu gains "Open on phone…" which opens that card.
  - status: doing · agent: subagent-t62 via claude-session-opus-2 (13:10, worktree) · worker: medium
  - card: as the user, bookmark one URL on my phone and scan a code once, so that the phone build is a door I can find, not a port I read out of a log (user 2026-09-16, "approved all recommendations": fixed port + URL in the app)
  - context:
    - after 61 (the URL carries the key); `ui/desktop/src/main/sidecar.ts` `sidecarArgs` is where `--port 0` lives; `SidecarResult.urls` already holds both listeners
    - `validSettingKeys` in `main.ts` must gain `sidecar.port`; the web shim needs nothing
    - DESIGN.md §Vocabulary: "Phone" card row; §Iconography `Smartphone`, `QrCode`
  - confirm: `cd ui/desktop && pnpm vitest run src/main/sidecar.test.ts src/utils/qr.test.ts && pnpm run typecheck; echo exit=$?` → `exit=0` (untouched tree: no `qr.test.ts`, vitest exits 1) and the desktop log's `sidecar listening at` line names port `7788`


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
- task 14 hand check — "since session start" base: open a session in a git cwd, commit, open Changes → the selector offers it and lists the committed file; `git diff HEAD` omits untracked files (accepted gap, or queue).
- `ARCHITECTURE.md` — sign-off deletes `## Bootstrap Status`; until then the map is a proposal and tasks 10–16 plan against a guess.
- task 20 — the phone check is manual: open the URL on `hoa-phone`, walk PRD step 13, judge the terminal with the key bar.
- task 9 — the handoff-memo criterion (PRD §Criteria, second) is a manual check: ask "what did we just change?" after a runtime switch and judge the answer.
- Goose spine integration — the next session must finish the concrete plan above and obtain plan approval before source edits; “continue” established the direction, not an unwritten implementation scope.

## Ownership

- **This file owns:** task state — the claim, the 3C body, the check.
- **The plan doc owns:** approach and negative space, and dates the
  change. **`ARCHITECTURE.md` owns:** the boundaries a task may not
  cross.
