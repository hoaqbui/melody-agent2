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

- 6. Add `crates/goose/src/providers/cursor_acp.rs` (provider `cursor-acp`, binary `cursor-agent`, args `["acp"]`) mirroring `claude_acp.rs`, register it in `providers/mod.rs`, `providers/init.rs`, and `inventory/registrations.rs`.
  - status: doing · agent: claude-session-opus (20:01, worker via claude -p haiku) · worker: high
  - card: as every role's backup seat and one advisor seat, run Grok under Goose's permission modes so that the tenth call is gated like the other nine (PRODUCT.md §5: Grok is a Cursor model; `cursor_agent.rs:277-282` runs `--print --force` ungated)
  - context:
    - required, not optional, since 2026-09-15: Cursor Pro is the only Grok subscription here; models `cursor-grok-4.6-{low,medium,high,xhigh}[-fast]`, `cursor-grok-4.5-high` (`cursor-agent models`, 2026-09-15)
    - template: `claude_acp.rs:1-105`; mode mapping at `:66-75` is Claude-specific — map Goose modes to Cursor's ACP session modes as advertised at `session/new`, falling back to no mode set
    - registration pattern: `init.rs:86-89` (`register_with_inventory::<ClaudeAcpProvider>(false, Some(registrations::claude_acp_inventory()))`) and `registrations.rs:246-248` (`acp_inventory(name, binary, true)`)
    - keep `cursor_agent.rs` (print-mode provider) untouched
    - local `~/.local/bin/cursor-agent acp --help` prints "Start the Cursor Agent as an ACP (Agent Client Protocol) server" (2026-09-15); print mode needed `--trust` outside a trusted workspace ("Workspace Trust Required", exit 1) — check whether `acp` mode does too, and pass it if so
    - `~/.local/bin` is not on this shell's PATH; `gooseServe.ts:36` forwards the login-shell PATH — verify it reaches the binary
    - add a unit test `cursor_acp_metadata_names_binary_and_args`
  - confirm: `source bin/activate-hermit && cargo test -p goose cursor_acp -- --nocapture; echo exit=$?` → `test result: ok.` with ≥1 passed, then `exit=0`

- 9. Run the runtime matrix: from a Goose session in this directory on `claude-acp`, delegate the same one-file task ("add a `--version` line to `scripts/check-spine.sh` help") to implementer on `claude-acp`, `codex-acp`, `cursor-acp`, `agy`, then call `advisor` six times with `exclude_provider` set, and record per run: provider, model, turns, result shape, permission prompts seen, in `docs/2026-09-15-runtime-matrix-v1.md`.
  - status: blocked · agent: — · worker: medium
  - blocked: no subscription orchestrator in tree can call `delegate` except `chatgpt_codex` (research v1 addendum, evening). Unblocks: the user's pick — run the matrix from a `chatgpt_codex` session as the interim proof, or wait for repair (ii) — owner: user
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

- 42. Render the dock in `ui/desktop/src/workspace/WorkspaceShell.tsx` (+ a `Dock.tsx` and `Panel.tsx` beside it): panels stacked on the right with a tab strip each, drag a tab out of its strip (pointer events, no new dependency unless the plan names one) to tear it off into a new panel at the drop position, drag a panel header to reorder, drag seams to resize, close returns a pane into its tab (Into Rule); the top-right menu (task 40) opens panes with `openPane` and shift-click tears off; phone width unchanged (task 20's rail).
  - status: doing · agent: subagent-t42 via claude-session-opus-2 (23:28, worktree) · worker: high
  - card: as the user, drag a panel where I want it on the right and see the others make room so that arranging the workspace feels physical (DESIGN.md §Principles: Floating Button Rule, Into Rule)
  - context:
    - runs after 40 and 41 merge and after the panes (12–16) are in, so every pane body already renders inside a panel; remove the `openCentre`/`selectSide` adapters from task 41 in this task
    - 41 landed (`cf0d6b2d5`): adapters at `pane-store.ts:184-201` plus `settle` (`:59-65`), `centre`/`activeSide`/`sideTabs` kept for the shell — all go here; open from 41: a reopened pane joins the end of the top panel, not its former slot (DESIGN.md Nothing Lost Rule says "keeps its tab slot" — decide and align the rule or the store); DESIGN.md §Principles One Pane Rule and §Vocabulary side-panel rows describe the superseded layout — rewrite them here; on phone the dock folds away whole and `visible` is not carried across a resize (41's call)
    - drag: `pointerdown` on a tab or header → ghost follows the pointer → drop targets are panel strips and the seams between panels; keyboard alternative in the ⋯ menu (Move up / Move down / Tear off) for `DESIGN.md` §Accessibility
    - sizes persist per project in `localStorage` (task 19's settings pattern); never a second store
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace && pnpm run typecheck && pnpm exec playwright test -g "dock"; echo exit=$?` → `exit=0` (walk: open Terminal and Changes → one panel with two tabs; drag Changes' tab below → two panels; drag the lower panel above the upper → order swapped; close Changes → one panel again)

- 20. Add the phone layout to `src/workspace/`: below 768 px the pane store exposes one visible pane behind a tab rail (chat · Files · Editor · Diff · Terminal · Git), the terminal key bar from task 15 is shown, and reconnect-on-foreground reattaches the pty and refreshes the chat; Playwright gets a `phone` project (390 × 844, touch, iPhone UA).
  - status: todo · agent: — · worker: medium
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

- 57. Switch the dark theme to Charcoal Monokai — large radii, floating surfaces with shadows, fewer outlines: replace `darkColorTokens` in `ui/desktop/src/theme/theme-tokens.ts` (light and aura byte-for-byte unchanged; no fourth theme) — ground `#1c1c1c`, secondary `#242424`, raised `#2c2c2c`, text `#f8f8f2` / `#c8c8c2` / `#7a7a72` (tertiary for hints and disabled only), Monokai accents on the roles: `info` `#66d9ef`, `success` `#a6e22e`, `warning` `#e6db74`, `danger` `#f92672`, ring/accent `#ae81ff`, orange `#fd971f`; a radius step `--radius-panel: 16px` / `--radius-control: 12px` / `--radius-chip: 999px` in `:root` and applied to cards, popovers, menus, message bubbles, buttons; borders in dark drop to `rgba(248,248,242,.06)` and every card/panel/popover carries `--shadow-sm` at rest, `--shadow-md` lifted (dark shadows `rgba(0,0,0,.5)` / `.65`); glass blur (`backdrop-filter: blur(18px) saturate(1.3)`, surface alpha .8) on the sidebar, workspace header, dock panels, chat-input card and menus over the macOS vibrancy (`main.ts:1312`); a Monokai `HighlightStyle` for Editor and Changes and the canonical Monokai xterm palette for the Terminal, keyed on the dark variant; a delimited "Charcoal Monokai" section in `ui/desktop/src/styles/main.css` `.dark`. `DESIGN.md`: §Principles gains "Surfaces float: elevation separates, outlines don't" (dated); §Tokens & theme records the palette, the radius step and the border/shadow delta.
  - status: doing · agent: subagent-t57 via claude-session-opus-2 (00:02, worktree; redirected 00:20) · worker: high
  - card: as the user, work in a charcoal Monokai window where panels float on shadow instead of sitting in outlines so that the workspace reads as one instrument, not a browser tab (user 2026-09-16: "glass monokai", then "switch the dark theme over to dark charcoal monokai — large radiuses. floating and shadows. less outlines")
  - context:
    - the theme registry (`theme-tokens.ts:275-279`) and `aura` (`main.css:988`) stay as they are; this task edits the dark map, not the registry — "switch over", not "add"
    - `backdrop-filter` needs paint behind it: vibrancy is on for macOS (`main.ts:1312`, `:1623`); the phone web build has none, so the same tokens read as flat charcoal — correct, on purpose
    - contrast: `#7a7a72` on `#1c1c1c` ≈ 4.0:1 — hints and disabled only, never body copy; `theme-tokens.test.ts` asserts AA for every dark text/background pair and that light/aura maps equal a pre-change snapshot
    - Editor/Changes: `EditorPane.tsx:80` `darkHighlight` and `DiffPane.tsx`'s private theme are keyed on `dark` — keep that key, swap the palette; Terminal: the xterm `theme` option in `panes/terminal/`
    - do not edit `WorkspaceShell.tsx`, `pane-store.ts`, `Dock.tsx` (task 42 in flight) or `panes/browser/*` (56) — the glass/radius classes for header and dock panels land on stable class names (`.workspace-header`, `.workspace-dock-panel`) that the orchestrator adds on merge; list the elements you could not class
    - screenshots of light, dark, aura side by side for the report (`scratchpad/t57/`)
  - confirm: `cd ui/desktop && pnpm vitest run src/theme && pnpm run typecheck && pnpm run lint:check && grep -c "Charcoal Monokai" src/styles/main.css; echo exit=$?` → `exit=0` with the grep ≥ 1 (untouched tree: `src/theme` has no test file, vitest exits 1; grep prints 0)

- 58. Easy and Advanced modes for the workspace, Easy the default: a persisted `workspace.ui` setting (`'easy' | 'advanced'`, task 19's settings pattern, phone included) toggled from the header ⋯ menu ("Advanced controls" checkbox) and Settings › App. **Easy** shows the chat, the pane menu's three primaries, and one **lever** in the chat card's chips slot (task 60) where the Runtime · Mode chips sit: a three-stop segmented slider Easy · Medium · Hard (`role="slider"`, arrow keys move it, label under the knob) that maps to a (provider, model, mode) triple from one table in `session-controls.ts` — Easy → `claude-acp` · `claude-sonnet-5` · Direct; Medium → `claude-acp` · `claude-opus-5` · Direct; Hard → `claude-code` · `claude-opus-5` · Orchestrate (the orchestrator role, workers and advisors from `.agents/agents/`); on a fresh chat the lever sets `session/new` (`providerId`, `modelId`, recipe); mid-session it does what the Runtime switch does today (`switchRuntime`, divider "→ Hard from here"); the lever's tooltip names the triple in one line. **Advanced** shows every control the session has (user 2026-09-16: "advanced mode — show me all controls for the session"): Runtime · Mode (Direct/Orchestrate) as today, plus a **Session controls** strip under the header (or a popover from a `SlidersHorizontal` button when the window is narrow) exposing each ACP session config option the server publishes — `provider`, `model`, `thinking_effort`, goose `mode` auto/approve/chat (`crates/goose/src/acp/response_builder.rs:278` `build_config_options`; the client already reads them for the ACP session) — plus the working directory (read-only, with "Open in Files"), the orchestrator role name when Orchestrate, the enabled-extensions count with a link to Extensions, and a **Save as routine…** button (task 59); the lever is hidden. Switching Easy → Advanced keeps the session; Advanced → Easy shows the lever at the stop whose triple matches the session, else "Custom" (a fourth, read-only stop label, not selectable).
  - status: todo · agent: — · worker: high
  - card: as the user, start with one dial — how hard is this — and never see a runtime or a mode until I ask for them, so that the workspace starts as a chat (user 2026-09-16: "have an easy mode and advanced mode. easy mode — give me a lever between easy, medium, or hard"; DESIGN.md §Principles "Starts as a chat", added here)
  - context:
    - runs after 42 (the shell rewrite), 57 (theme) and 60 (no top bar — the lever and the Advanced strip take the chat card's chips slot, not a header); edits `WorkspaceShell.tsx`, `session-controls.ts`, the ⋯ menu, Settings › App, `src/shims/electron-web.ts` settings shape
    - Advanced renders the config options generically from what `session/new` returned (`SessionConfigOption` list — id, label, current value, choices), so a new server-side option appears without a client change; the four named today are the minimum the walk asserts
    - the triple table is the only place the stops are defined; a stop whose provider `needsInstall` shows the Install affordance in the knob's label, as the Runtime row does today (PRD step 2 rule)
    - `createAcpSession` already takes `providerId`/`modelId` (`src/acp/sessions.ts:6-7`); Orchestrate = the recipe deeplink path in `startSession` (`WorkspaceShell.tsx:299-301`)
    - DESIGN.md: §Principles gains "Starts as a chat — Easy is the default; every control beyond the lever and the three pane icons waits behind Advanced"; §Vocabulary rows Easy/Advanced, lever, the three stops (never "difficulty" or "power" in copy); §Iconography: lever knob is a `Gauge`; §Frame header line amended
    - PRD step 2 amended (dated): Easy path — pick a stop, type; Advanced path — today's step 2
    - tests: `session-controls.test.ts` maps stops → triples and Custom; Playwright `easy mode` walk: fresh app → lever visible, no Runtime select; move to Hard → new session on `claude-code` with the orchestrator recipe; ⋯ → Advanced → Runtime select visible, lever gone; back to Easy → lever on Hard
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace && pnpm run typecheck && pnpm exec playwright test -g "easy mode"; echo exit=$?` → `exit=0` (untouched tree: no `easy mode` spec — playwright exits 1 "no tests found")

- 60. Three vertical panels, no top bar — the frame Claude Code desktop and Codex desktop share: **Sessions** (left; upstream's sidebar, open by default, sessions grouped by project, collapses into the titlebar toggle), **Chat** (centre; never a pane), **Work** (right; the task-42 dock — collapses to the floating rail when it has no panel). Each column is a full-height glass panel of the same kind (task 57 radius and shadow), the two seams drag to resize, widths persist per project (task 19's settings key pattern; defaults 280 · flex · 480 px), and ⌘1 / ⌘2 / ⌘3 focus Sessions / Chat / Work. The header row in `ui/desktop/src/workspace/WorkspaceShell.tsx` (Runtime · Mode · pane menu) goes; its controls disappear into the surfaces they belong to (Into Rule). Runtime and Mode become chips in the chat card's bottom row beside the model and directory chips (`ui/desktop/src/components/ChatInput.tsx:1725-1779` `ModelsBottomBar` / `DirSwitcher` / extensions — add a `SessionChips` slot ChatInput renders when the workspace provides one, so upstream's Hub is unchanged), each a popover with today's rows (Install / "no orchestrator role" states kept, PRD step 2); task 58's lever takes the same slot in Easy. The pane launchers become a **floating rail** pinned to the right edge, vertically centred: the three primaries + ⋯ as glass icon buttons (Floating Button Rule) that slide into the dock's tab strip when a panel is open (the rail disappears into the dock; it reappears when the dock empties). The titlebar drag strip (`:453-455`, 32 px) stays for the traffic lights and the sidebar toggle only — no bar background, no controls in it. Phone: the rail is the existing tab rail's launcher; nothing new.
  - status: todo · agent: — · worker: high
  - card: as the user, look at three columns — my sessions, the conversation, the work — with every control living on the thing it controls, so that the window reads like Claude Code and Codex desktop and nothing sits between me and the conversation (user 2026-09-16: "please remove the top navbar", "the layout should be similar to claude code / codex desktop — 3 vertical panels"; DESIGN.md Into Rule, "Starts as a chat")
  - context:
    - after 42 (dock) and 57 (theme) merge — both edit the shell; 58 (Easy/Advanced) runs after this so the lever lands in the chips slot, not the header
    - every Playwright walk that clicks `workspace-runtime` / `workspace-mode` / the header pane buttons (`workspace-shell`, `pane-menu`, `files-pane`, `git-pane`, `editor-pane`, `browser-pane`, `dock`) keeps its testids — move the ids to the chips and the rail, and rerun all of them
    - the sidebar is upstream's `components` (`AppLayout`/`GooseSidebar`) — wrap, don't fork it: the workspace owns the three-column grid and the seams, the sidebar keeps its own contents; a collapsed sidebar is the titlebar toggle only, as today
    - DESIGN.md §Frame rewritten (dated): three columns Sessions · Chat · Work replace `header` + `sessions` + `centre` + `right dock` at the top level; the dock tree moves under Work; the header line goes, a "rail" line comes in; §Vocabulary: "rail", "chip" rows; PRD steps 2 and 4 amended (dated) — "in the header" → "in the chat card's chips" / "on the rail"
    - `ModelsBottomBar` already shows the ACP model — the Runtime chip sits left of it and the two must not both name the provider; Runtime shows the provider display name, the model chip stays the model
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace && pnpm run typecheck && pnpm exec playwright test -g "workspace shell|pane menu|dock|files pane|git pane|editor pane|browser pane|three columns"; echo exit=$?` → `exit=0` (untouched tree: no `three columns` spec, and `workspace-header` still renders — the new walk asserts `workspace-column-sessions|chat|work` exist, no `workspace-header`, a seam drag changes the Work width and it survives a reload)

### Parity with Codex desktop and Claude Cowork — research (2026-09-16)

User, 2026-09-16 00:15: "research it, plan it, and orchestrate it with sub agents" — the three gaps named in the parity comparison. Research first; the plan follows from these docs and waits on approval before source edits.

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
- `npm i -g @agentclientprotocol/codex-acp` on this Mac — task 9 needs the Codex adapter (`codex_acp.rs:37-42`); a global npm install is yours to run or to tell me to run.
- Task 33 — filing the three upstream issues posts under your GitHub account; say "file them".
- **Sidecar auth (2026-09-15 22:30):** `ARCHITECTURE.md` §Invariants names Tailscale the sidecar's only gate, and task 18 built exactly that — the sidecar answers pty/fs/git for anyone on the tailnet, unauthenticated, from the moment the desktop starts (packaged run logged `100.127.56.10:64870`). If anyone but you is ever on that tailnet, say "sidecar secret" and it becomes a task (a shared token the web build carries, same pattern as `goose serve`); otherwise the invariant stands as written.
- task 11 hand check — one early run of the Mode selector produced three sessions from one click (worker's report, not reproduced in five later runs with a call-site trace). Open the desktop, pick Orchestrate once, count sessions in the list; more than one is a P0 bug.
- Renderer CSP (2026-09-16): the `http:` widening from tasks 12/14 is reverted by task 43 — `index.html:7` is back to upstream's `connect-src`; the desktop renderer reaches the sidecar over loopback, the tailnet listener exists for the phone only. Task 15's `ws:`/`http:` lease and its `upgrade-insecure-requests` drop are removed with it. Hand checks: packaged `file://` build — open Files and Terminal, watch the console for connect-src violations; phone — the tailnet URL from the desktop log still loads the web build and answers `./config`.
- task 13 hand checks — dark theme flips gutter/token colours and the markdown Preview palette; type without saving, close the pane, reopen from the side tab → draft, cursor, undo intact; chmod a file read-only, edit, ⌘S → error line with Retry, edit kept.
- task 16 hand checks — press Esc mid-tool-call, then open Git: Commit stays disabled ("waits for the running tool call") because the orphaned `toolRequest` never gets a terminal status — spec (DESIGN Running row) or bug, your call; ask the agent to write a file with Git open → Unstaged refreshes on its own when the call ends; open Git in a non-repo cwd → "Not a git repository" + path.
- task 40 hand checks — hover lift on the three header icons; ⋯ tooltip is hover-only (focus-opened tooltip lingered after the menu closed — a UX asymmetry to accept or not); Runtime/Mode carry a native `title` (`Claude · Direct`) rather than the styled tooltip; the side tab row now wraps to two lines at seven tabs until task 42 replaces it.
- task 31 hand checks — Browser: open from the header, type `localhost:<port>` of a running dev server → frame renders; Reset clears to the empty line (no per-project dev-server config exists in the tree, so the default is empty — say if you want a `.goose` config key for it); phone web build: a loopback URL shows the "not reachable from here" line instead of the frame, and an `http://` frame under an `https://` workspace is blocked as mixed content (no proxy, by scope). Markdown: pick a `.md` in Files → rendered, dark palette flips; pick a `.rs` → "Not markdown" bar over raw text; the pane follows disk when the agent writes the open file.
- task 56 hand checks — web build: Share row reads "Share sends the address only from here" and inserts `Page: <title>\n<url>`; the webview's cookie partition (`persist:workspace-browser`) is separate from the app's — sign in to a site in Browser, it must not appear signed in anywhere else; guest history is lost when the pane unmounts on a tab switch (address and suggestions survive) — decide if that's acceptable before task 42's dock keeps panes mounted.
- task 17 hand checks — agy print mode is ungated regardless of flags (`permission_mode: always-proceed` in its init event) — accepted for V0 with the Reviewer gating the diff; tool-call `step_type` events are unknown and dropped by the parser, so a tool-using agy turn shows only its text; resumed turns report 31–39 s `duration_seconds` for a 2–4 s step (unexplained).
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
