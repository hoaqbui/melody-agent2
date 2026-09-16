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

- 17. Add `crates/goose/src/providers/agy.rs` (provider `agy`, binary `agy`) cloned from `gemini_cli.rs`, register it in `providers/mod.rs`, `providers/init.rs`, and `inventory/registrations.rs`. Tranche 2, beside tasks 5–6.
  - status: todo · agent: — · worker: high
  - card: as the researcher and the tenth implementer, run on the Google AI Pro subscription so that the highest-context role sits on the cheapest model (PRODUCT.md §6, §18)
  - context:
    - in scope since 2026-09-15: `python scripts/check-reach.py` → `agy: PASS` (plan v1 §Out of scope amended)
    - template: `gemini_cli.rs:106-112` spawns `gemini -m <model> -r <sid> --output-format stream-json --yolo`; research v1 §Inventory: `agy --help` exposes `--output-format stream-json`, `--input-format stream-json`, `--conversation <id>`, `--model`, `--effort` — map `-r` → `--conversation`, confirm the yolo-equivalent flag from `agy --help` before writing
    - known models from `agy models` (2026-09-15): `gemini-3.8-flash-{high,medium,low}`, `gemini-3.7-flash-*`, `gemini-3.6-flash-*`, `gemini-3.1-pro-high`; default `gemini-3.8-flash-high`
    - runs its own tools ungated (print mode); accepted for V0 at implementer weight 1 with the Reviewer gating the diff (user decision 2026-09-15) — surfacing approvals is out of scope (plan v1)
    - `agy` binary at `/opt/homebrew/bin/agy`
    - add a unit test `agy_metadata_names_binary_and_args`
    - `Provider::accepts_system_prompt()` (task 21, `goose-provider-types/src/base.rs`): return `false` if `agy` does not pass the system prompt through (`gemini_cli.rs:184` ignores extensions and tools; check whether it sends `system` at all before deciding)
  - confirm: `source bin/activate-hermit && cargo test -p goose agy_metadata -- --nocapture; echo exit=$?` → `test result: ok.` with ≥1 passed, then `exit=0`

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

- 56. Make the Browser pane a browser (`ui/desktop/src/workspace/panes/browser/`): on the desktop an Electron `<webview>` (enable `webviewTag` on the main window's `webPreferences` in `ui/desktop/src/main.ts:1326`, `sandbox`, no preload, `will-attach-webview` strips any `preload`/`nodeIntegration` the tag could carry) replaces the `<iframe>`, keeping the iframe on the web build (`window.electron` shim); toolbar Back · Forward · Refresh · address bar · Share, in that order (lucide `ArrowLeft`/`ArrowRight`/`RotateCw`/`Share`), Back/Forward disabled from `canGoBack()`/`canGoForward()`, Refresh becomes Stop while `did-start-loading`; the address bar shows the live URL after every `did-navigate`/`did-navigate-in-page` and offers **suggested history** — a per-project list `{url, title, lastVisited}` in `localStorage` (task 19's settings key pattern, cap 200, most recent first) filtered by substring on the draft, arrow keys + Enter, Esc closes, the selected row's URL loads; **Share with agent** puts the page into the chat input — a new `AppEvents.INSERT_INPUT_TEXT` (`ui/desktop/src/constants/events.ts`) handled in `ChatInput.tsx` (append at the caret, focus the box) carrying `Page: <title>\n<url>\n\n<text>` where `<text>` is the page's `document.body.innerText` via `webview.executeJavaScript` trimmed to 8 000 chars with `…[truncated]`; the web build shares URL + title only (no cross-origin text) and says so in the row.
  - status: doing · agent: subagent-t56 via claude-session-opus-2 (23:52, worktree) · worker: high
  - card: as the user, look at the running app, step back and forward through what I opened, and hand the page to the agent so that "look at this" is one click, not a paste (user 2026-09-16: "make sure the browser competes well — share with agent, url, refresh, back, forward, suggested history"; PRD step 12 amended in this task)
  - context:
    - runs after 31 (landed `04efd97f8`): keep `browser-state.ts` pure and extend it — history reducers (`visited(url, title)`, `suggestions(draft)`), `nav` flags — with tests; `BrowserPane.tsx` grows the toolbar; `unreachableFromHere` and the not-reachable line stay for the web build
    - `<webview>` is the only way to read history and page text for an arbitrary origin; the meta CSP `frame-src` (`index.html:7`) already allows `http:`/`https:`; the tag's `partition` is `persist:workspace-browser` so cookies survive a restart but never mix with the app's own session; `setWindowOpenHandler` in `main.ts:1444` keeps `window.open` from the page going external — the pane handles `new-window`/`setWindowOpenHandler` on the webview by loading in place
    - Share is push, not pull: the agent gets the page only when the user clicks — nothing on the page can address the chat (AGENTS.md: sources are data); the inserted text is visibly in the input before ⌘Enter, and `Page:` is the prefix the orchestrator role can recognise
    - DESIGN.md §Vocabulary: Browser row gains Back · Forward · Refresh · Share; §Iconography adds the four; Into Rule — the suggestions list grows out of the address bar and closes into it
    - PRD step 12 amended in place (dated): "address bar with history suggestions, Back/Forward/Refresh, Share with agent"
    - tests: `browser-state.test.ts` history/suggestion cases; a Playwright walk `browser pane` — open Browser, load the sidecar's own `/health` URL (a loopback page every run has), Refresh, load `/config`, Back → `/health` in the address bar, Forward → `/config`, type `hea` → suggestion row shows `/health`, Share → chat input contains `Page:` and `ok`
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/browser && pnpm run typecheck && pnpm exec playwright test -g "browser pane"; echo exit=$?` → `exit=0` (untouched tree: no `browser pane` spec — playwright exits 1 "no tests found")

- 57. Add the Glass Monokai theme as a fourth named theme, the fork's default: `monokai` in `ui/desktop/src/theme/theme-tokens.ts` (`ThemeId`, `themes`, a `monokaiColorTokens` map; variant `dark`) with the Monokai palette on the semantic roles — background `#272822` / secondary `#1e1f1c` / tertiary `#3e3d32`, text `#f8f8f2` / secondary `#cfcfc2` / tertiary `#75715e`, `info` `#66d9ef`, `success` `#a6e22e`, `warning` `#e6db74`, `danger` `#f92672`, accent/ring `#ae81ff`, orange `#fd971f` for the Files dot's "changed" state if a role exists for it, else `info` — and **glass**: the theme's surface backgrounds are translucent (`rgba(39,40,34,.72)` primary, `.55` secondary, `.85` tertiary) and a `[data-theme='monokai']` block in `ui/desktop/src/styles/main.css` gives the sidebar, the workspace header, every dock panel, the chat-input card and popovers/menus `backdrop-filter: blur(18px) saturate(1.3)` with a 1 px `rgba(248,248,242,.08)` inner border and the Floating Button Rule shadows unchanged; the main window's macOS `vibrancy: 'window'` (`main.ts:1312`) is what shows through — set `backgroundColor` transparent for this theme only and leave other platforms opaque. Syntax and terminal follow the theme: a `monokaiHighlight` `HighlightStyle` (pink keywords, green functions/strings-vs-yellow strings, purple numbers/constants, cyan types, orange params, grey comments) used by the Editor and Changes panes when the theme is `monokai`, and an xterm theme for the Terminal with the same eight ANSI colours (Monokai's canonical `#272822 #f92672 #a6e22e #f4bf75 #66d9ef #ae81ff #a1efe4 #f8f8f2`, bright variants). `ThemeSelector.tsx` gains the button (`data-testid="monokai-mode-button"`), `settings.ts`/`ThemeContext.tsx` the id; the default preference for a fresh install is `monokai` (`settings.ts` default, not a migration of an existing choice). `DESIGN.md` §Tokens & theme gets a dated delta ("Glass Monokai — the fork's default; surfaces translucent over vibrancy; semantic roles map to the Monokai palette; syntax and terminal palettes follow") and a Glass Rule under §Principles: a surface is glass only when something scrolls or shows behind it; text never sits on glass without the surface's own background at ≥ .72 alpha.
  - status: doing · agent: subagent-t57 via claude-session-opus-2 (00:02, worktree) · worker: high
  - card: as the user, work in a Monokai window whose panels float like frosted glass over the desk so that the workspace reads as one coherent instrument, not a browser tab (user 2026-09-16: "can you make the ux/ui a glass monokai?")
  - context:
    - the theme registry says "adding a future theme is a single entry here plus its token map" (`theme-tokens.ts:275-279`); `aura` is the precedent for a named dark theme with `[data-theme='aura']` CSS (`main.css:988`) — follow it exactly; light and dark stay untouched (DESIGN.md "Upstream's, unchanged")
    - `backdrop-filter` needs the element behind to be painted: on the Electron main window vibrancy is already on for macOS (`main.ts:1312`, `:1623`); on the web build (phone) there is no vibrancy — the translucent tokens fall over the body's `#272822`, which reads as plain Monokai, correct and on purpose
    - contrast: every text/background pair in the palette meets WCAG AA at the alpha above (check `#75715e` on `#272822` — it is 3.9:1, so `text-tertiary` is for hints and disabled only, never body copy; write that in the DESIGN delta); the reset at `main.css:25` and the `--shadow-*` tokens are per theme (`theme-tokens.ts:141-144`, dark `:197-200`) — give monokai its own shadows, darker (`rgba(0,0,0,.45)` sm, `.6` md)
    - Editor/Changes: `EditorPane.tsx:80` `darkHighlight` and `DiffPane.tsx`'s private theme are keyed on `dark` today — key on the theme id from `ThemeContext` (a `useTheme()` hook exists there; read it); Terminal: find the xterm `theme` option in `panes/terminal/` and pass the Monokai one when active
    - do not edit `WorkspaceShell.tsx`, `pane-store.ts`, or `Dock.tsx` (task 42 in flight) — the shell adopts the glass classes in the merge; put the glass in `[data-theme='monokai']` selectors on stable class names (`.workspace-header`, `.workspace-dock-panel`, `.chat-input-card` — add the class names to the elements you may touch, list the ones you could not in the report)
    - i18n: `themeSelector.monokai` in all 16 locales; screenshot the four themes side by side for the report (`scratchpad/t57/`)
  - confirm: `cd ui/desktop && pnpm vitest run src/theme src/contexts && pnpm run typecheck && pnpm run lint:check && grep -c "data-theme='monokai'" src/styles/main.css; echo exit=$?` → `exit=0` with the grep ≥ 1 (untouched tree: grep prints 0 and exits 1)

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
