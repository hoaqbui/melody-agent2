# UX parity — plan v1

<!-- Downstream of docs/2026-09-18-chat-panes-research-v1.md,
     docs/2026-09-18-approve-mode-research-v1.md,
     docs/2026-09-18-panes-research-v1.md and
     docs/2026-09-18-plan-mode-research-v1.md (all read 2026-09-18);
     upstream of implement. The task list is the approval surface: every
     task carries the UX test plan its research wrote, as the walk the
     confirm names. -->

Dated 2026-09-18. Closes the 14 interaction-level gaps named in the
2026-09-18 parity read (chat ↔ panes, approve mode, the five right-side
panes, plan mode, onboarding, palette). Companion: the four research docs,
`DESIGN.md`, `docs/2026-09-15-workspace-prd-v1.md`.

## Approach

- **Two arrows first.** Everything on the right becomes sendable into the
  chat through one insertion path (`chat-insert.ts` over the existing
  `INSERT_INPUT_TEXT` plus a new `INSERT_INPUT_IMAGE`), and every
  `file:line` in any message becomes a live link into the Editor through
  the Review pane's linker moved to `file-links.ts`. The link ships before
  the insert so a quoted block's `path:line` header is live on day one.
- **One poll, one source.** Task 69's 30 s git-status poll widens to the
  whole workspace route and lands on `PaneContext.gitStatus`; the Changes
  bar, Files tints and the Changes tab badge all read it. No second poll.
- **Guard before widening.** The sidecar's `/fs/*` routes have no path
  containment (`fs.ts:13` is a bare `path.resolve`) while every `/git/*`
  route has one (`git.ts:96-117`). Files rename/delete/mkdir land only
  behind a `requestPath` guard; the guard also covers today's
  `list/read/write` (decision 1 below).
- **Approve mode is a truth-up, not a fix.** The session's goose mode
  already reaches the three ACP seats (`on_set_mode` → `update_mode` →
  `session/set_config_option`) and the Allow · Always · Deny card is wired
  end to end; live probes show the *seats* mostly do not ask. The work is
  to make the label true: agy refuses non-Auto, Cursor's mapping says what
  it does, the card carries the adapter's tool name and diff, Session
  controls names the seat's behaviour, and a re-runnable probe pins the
  matrix.
- **Turn undo owns the diff.** No structured diff reaches the desktop (the
  ACP `diff` variant is dropped three times); a pre/post-turn temp-index
  snapshot (`/git/snapshot`) is the one primitive behind both "Undo this
  turn" and the transcript's diff cards.
- **Plan gate at the prompt level.** A rule in `orchestrator.md` plus a
  recipe line makes the orchestrator end its turn after the Planner;
  "waiting for you" is *derived* (Plan done ∧ Implement dim ∧ chat idle),
  never parsed; Accept · Revise… live on the RPI strip's Plan chip and the
  Artifact pane. A spine gate is the named escalation if a live walk shows
  the model overrunning more than once in ten runs.
- **Compose upstream, add nothing.** No `cmdk` (absent from the lockfile —
  the palette composes `dialog.tsx` + `input.tsx`); no context-menu
  package (the controlled-`DropdownMenu` right-click pattern from
  `WorkColumn.tsx:365-372`); xterm 6 ships `registerLinkProvider`, so the
  terminal's `file:line` links need no addon. The tranche's one dependency
  ask is `@xterm/addon-search` (search in scrollback has no in-tree
  substitute).
- **Order.** Wave 1 (disjoint files): 73 fs guard ∥ 74 one poll ∥ 75
  file-links ∥ 76 chat-insert ∥ 77 approve truth-up (Rust) ∥ 78 snapshot
  route ∥ 79 plan-gate rule ∥ 80 runtimes probe ∥ 81 palette state.
  Wave 2: 82 `file:line` links (75) ∥ 84 Changes bar (74, 76) ∥ 85 Files
  (73, 74, 76) ∥ 86 Terminal (76) ∥ 87 Browser share (76) ∥ 88 turn undo
  (78) ∥ 89 approve card + note (77) ∥ 90 RPI gate bar (79) ∥ 91 runtimes
  gate (80) ∥ 92 palette (81). Wave 3: 83 Add to chat — Editor, Markdown
  and the integration walk (82, 85, 86, 87, 94) ∥ 93 transcript diff cards
  (88) ∥ 94 Changes actions + badge (74, 84) ∥ 95 Markdown TOC + Edit ∥
  96 plan-gate walk (90) ∥ 97 docs. Each pane's own "Add to chat"
  affordance is owned by that pane's task, so no two wave-2 workers edit
  one pane file. Every `confirm:` was baselined on the untouched tree — by
  the research workers in their worktrees (the walk and vitest halves) or
  by the session (the grep/test halves, `d0f4313c5`); the untouched-tree
  result is in parentheses.
- **Blocker.** No cargo build completes on this Mac today: the built
  `sqlx-macros` proc-macro dylib fails `dlopen` ("mis-aligned LINKEDIT
  string pool"; reproduced after deleting the artifact and again under
  `RUSTFLAGS=-C link-arg=-ld_classic`; `rustc 1.96.1`, Darwin 27.0.0 — the
  OS update, not staleness). Consequences: (a) `just test-light` opens
  with `cargo test`, so every merge's light suite fails on line one until
  it is fixed or that line is made non-fatal with a loud `RUST SKIPPED`
  marker; (b) the dev `goose` binary predates this tranche, so task 89's
  walk steps 3 (the forwarded diff row) and 6 (agy refusing Approve) —
  and task 96's live runs — cannot pass until 77 is built into it. Task
  77 implements now and confirms when the toolchain builds (decision 6).

## Tasks

- 73. Contain the sidecar's file routes: `requestPath(spawnCwd, body)` in `ui/sidecar/src/fs.ts` mirroring `git.ts:99-117` (realpath; inside the spawn cwd's toplevel or a `.worktrees/` sibling; else `400`), applied to `list`, `read`, `write` and every route added later; `fs.test.ts` gains the outside-toplevel and symlink-escape `400` cases.
  - status: todo · agent: — · worker: medium
  - card: as the user, know that a tailnet peer with the key can only touch files inside the project, as it can only run git there, so that the fs and git doors have one lock (panes research §The surprise)
  - context:
    - the guard also covers the three landed routes (decision 1); a session opened in a subdirectory keeps working because containment is the *toplevel*, as git's is
    - headless — no UX plan
  - confirm: `cd ui/sidecar && pnpm vitest run src/fs.test.ts 2>&1 | grep -E 'Tests ' && grep -c "requestPath" src/fs.ts` → `Tests` ≥ 6 passed and `≥ 1` (untouched: no `fs.test.ts` exists — vitest exits 1 "No test files found"; grep `0`)

- 74. One poll, one source: widen task 69's status poll (`WorkspaceShell.tsx:762-783`, gated on `diffHidden`) to `isWorkspaceRoute`, hold the last `GitStatusResponse` in shell state, keep the Changes dot's baseline rule, expose `gitStatus` on `PaneContext` (+ the `pane-context` test).
  - status: todo · agent: — · worker: medium
  - card: as every pane, read one git status instead of polling my own, so that the bar, the tints and the badge agree (panes research §One poll, one source)
  - context: headless — no UX plan; the Changes dot must behave exactly as before (`session menu` walk stays green)
  - confirm: `grep -c "gitStatus" ui/desktop/src/workspace/pane-context.ts` → `≥ 1` (untouched: `0`); `just walk "session menu"` → 1 passed

- 75. `file-links.ts`: move `FILE_LINE`, `fileLinks`, `resolveLinkPath` out of `panes/review/review-parse.ts` into `ui/desktop/src/workspace/file-links.ts` (+ test); `review-parse.ts` re-exports; a second try against the git toplevel when a repo-root-relative path misses under a subdirectory cwd.
  - status: todo · agent: — · worker: low
  - card: as the transcript and the panes, share one `file:line` linker so that a path reads the same everywhere (chat-panes research §2)
  - context: headless — no UX plan; `review branch` walk unchanged
  - confirm: `test -f ui/desktop/src/workspace/file-links.ts && grep -c "from '../../file-links'" ui/desktop/src/workspace/panes/review/review-parse.ts` → `1` (untouched: `test -f` exits 1)

- 76. `chat-insert.ts` + `INSERT_INPUT_IMAGE`: the one insertion path — a pure `quoteForChat({kind, text, source: {path, lines?}})` producing a fenced block with a `path:line` header (+ test); `AppEvents.INSERT_INPUT_IMAGE` (`src/constants/events.ts`) handled in `ChatInput.tsx` as an attachment beside the existing image paste path (`vite-env.d.ts` row); `insertIntoChat(...)` on `PaneContext`.
  - status: todo · agent: — · worker: medium
  - card: as any pane, hand the chat a quote or a picture through one door, so that "Add to chat" means the same thing everywhere (chat-panes research §1)
  - context: headless — no UX plan (the panes' buttons are task 83); a screenshot while 10 images are attached hits the existing error tile (decision 4)
  - confirm: `cd ui/desktop && grep -c "INSERT_INPUT_IMAGE" src/constants/events.ts src/components/ChatInput.tsx` → `1` and `1` (untouched: `0`, `0`); `pnpm vitest run src/workspace/chat-insert` → ≥ 4 passed (untouched: no file)

- 77. Approve mode truth-up, spine half: `AgyProvider::update_mode` returns `ProviderError::RequestFailed` for Approve/SmartApprove/Chat ("agy runs `--dangerously-skip-permissions`; it cannot ask"); `cursor_acp.rs:70-103` maps Approve → `plan` and its comment says what the capture showed (decision 2); the permission update carries `_meta.goose.toolCall.toolName` and a forwarded `diff` content block instead of dropping it (`acp/provider.rs:2107-2147`, `acp/server/tool_calls/conversion.rs:136-156`), and `default_tool_title` stops re-titling a title that is already one; tests `update_mode_refuses_non_auto`, `action_required_carries_adapter_tool_name`. `scratchpad`'s `probe3.py` lands as `scripts/probe-approve.py` — the re-runnable matrix.
  - status: todo · agent: — · worker: medium
  - card: as the user, have Approve mean what the seat can do — ask, ask-outside-the-workspace, plan-only, or unavailable — instead of a label that writes files (approve-mode research §The surprise)
  - context:
    - headless — no UX plan; delegated children stay Auto by design (bridge plan §Out of scope); `agent.rs` / `state_machine/` untouched; `check-spine` stays the gate
    - the Rust confirm waits on the toolchain (decision 6); implement now, confirm then
  - confirm: `source bin/activate-hermit && cargo test -p goose --lib -- update_mode_refuses_non_auto action_required_carries_adapter_tool_name 2>&1 | grep -E 'test result: ok\. 2 passed'; echo exit=$?` → `exit=0` (untouched: 0 tests — and today no cargo build completes); `bash scripts/check-spine.sh` → `spine clean`; `grep -c "fn update_mode" crates/goose/src/providers/agy.rs` → `1` (untouched: `0`)

- 78. `POST /git/snapshot {cwd}` in `ui/sidecar/src/git.ts`: `add -A` into a temp index (`GIT_INDEX_FILE` — the `git()` helper gains an `env` parameter) + `write-tree`, returning `{tree}`; toplevel containment; `git.test.ts` asserts the real index is untouched and that a created, an edited and a deleted file all appear in `diff <tree0> <tree1>`.
  - status: todo · agent: — · worker: medium
  - card: as the workspace, freeze what the tree looked like before and after a turn, so that undo and the diff card have a truth to read (chat-panes research §11)
  - context: headless — no UX plan; `.gitignore`d paths are outside the snapshot, and so outside undo (decision 5)
  - confirm: `grep -c "git/snapshot" ui/sidecar/src/git.ts` → `1` (untouched: `0`); `cd ui/sidecar && pnpm vitest run src/git.test.ts` → ≥ 24 passed (untouched: 21)

- 79. Plan-gate rule: `.agents/agents/orchestrator.md` §Task sizing — Normal and Unknown tiers end the turn after the Planner returns and implement only after the user's Accept (Tiny has no plan, no gate); `orchestratorRecipe(role, { planGate })` appends the same line; a per-project setting `workspace.planGate` (default on in Orchestrate) in `settings.ts` + `main.ts` allowlist; `session-controls.test.ts` "plan gate" cases.
  - status: todo · agent: — · worker: low
  - card: as the user, be asked before implementation starts, in Orchestrate, by default (plan-mode research §8 pick (i))
  - context: headless — no UX plan; the recipe line is fixed at `session/new` (the `claude-code` system prompt is baked at first spawn); a routine saved from an Orchestrate session must NOT carry the gate line — `routine.ts` strips it (decision 3)
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/session-controls.test.ts -t "plan gate" 2>&1 | grep -E 'Tests'` → contains `2 passed` (untouched: `11 skipped`); `grep -c "end your turn after the Planner" .agents/agents/orchestrator.md` → `1` (untouched: `0`; the file already says "Accept" once, in §Reconcile)

- 80. `POST /runtimes/probe` on the sidecar: `execFile` of `claude auth status --json`, `codex login status`, `cursor-agent status`, `agy models` (5 s timeout each) → `{seat: {installed, signedIn, detail}}`, keyed like every route; `src/native/runtimes.ts` client; `src/workspace/onboarding/seat-state.ts` (`RUNTIMES_GATE_STATES`, `seatState`) + test.
  - status: todo · agent: — · worker: medium
  - card: as the workspace, know whether each seat is installed and signed in — today the only probe is a binary lookup and `claude-code` always reads available (plan-mode research §13 surprise)
  - context: headless — no UX plan; a Security lens at the gate: the sidecar spawns four fixed argv arrays, never a shell, never user input
  - confirm: `cd ui/sidecar && pnpm vitest run src/runtimes.test.ts 2>&1 | grep -E 'Tests'` → contains `4 passed` (untouched: `No test files found`); `cd ui/desktop && pnpm vitest run src/workspace/onboarding` → ≥ 5 passed (untouched: no dir)

- 81. Palette state: `src/workspace/palette/palette-state.ts` (`commands` from `PANE_IDS`, sessions, schedules with Run now, the lever's stops, routes, task 69's session actions; `filterCommands`; `PALETTE_STATES`) + `src/utils/fuzzy.ts` lifted from `ProviderSelector.tsx:97-103` (its second use) + tests.
  - status: todo · agent: — · worker: low
  - card: as the palette, have one list of everything the workspace can do, ranked by a match the app already uses (plan-mode research §14)
  - context: headless — no UX plan
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/palette 2>&1 | grep -E 'Tests'` → contains `4 passed` (untouched: `No test files found`)

- 82. `file:line` in any message opens the Editor: a `rehypeFileLinks` plugin (+ test) over task 75's linker, a `FileLinkSlot` context the shell provides (`components/MarkdownContent.tsx` gains the context, the conditional plugin and the `a` branch — depcruise-clean, the `SessionChipsSlot` precedent), paths resolved against the session cwd then the toplevel; `openFile(path, line)`.
  - status: todo · agent: — · worker: medium
  - card: as the user, click a path the agent wrote and land on that line, so that reading a reply and reading the code are one motion (chat-panes research §2)
  - UX test plan (walk `chat links`): setup — a session in a scratch repo with `src/a.ts` (12 lines); steps — (1) ask "tell me the path and line 7 of src/a.ts as path:line" → the reply's `src/a.ts:7` renders as a link (`data-testid="chat-file-link"`, `href` `goose-file:`), (2) hover → title is the resolved absolute path, (3) click → Editor tab active, `workspace-editor-file` reads the path, the cursor/active line is 7 (`data-line="7"`), (4) keyboard: Tab to the link, Enter → same, (5) a URL `https://x.y/a:1` and a time `12:30` in the same reply are NOT links; states — empty n/a · loading n/a · partial: a path that does not exist renders as plain text with a title "not in this project" · error n/a · ready; phone: same link, Editor opens in the one-pane stage; human-only: streaming re-render cost on a 200-line reply
  - confirm: `cd ui/desktop && grep -c "FileLinkSlot" src/components/MarkdownContent.tsx` → `2` (untouched: `0`); `just walk "chat links"` → 1 passed (untouched: no spec)

- 83. "Add to chat" in the Editor and Markdown panes, and the integration walk: Editor (a selection → a toolbar button; the quote's header is `path:line-range`), Markdown (a selection → the same button); then one walk `add to chat` that exercises every pane's affordance over task 76's door — the per-pane buttons belong to their panes' tasks (85 Files, 86 Terminal, 87 Browser, 94 Changes) and this task runs after them.
  - status: todo · agent: — · worker: medium
  - card: as the user, put what I'm looking at into the conversation with one click, from every pane, so that the right side feeds the chat as it does in Claude Code desktop (chat-panes research §1)
  - UX test plan (walk `add to chat`): setup — scratch repo, session open; steps — (1) Editor: open `notes.md`, select lines 1–2, click Add to chat (`editor-add-to-chat`) → the input holds a fenced block headed `notes.md:1-2`; (2) Markdown: open `doc.md`, select a sentence → Add to chat → a fenced block headed `doc.md`; (3) Terminal (86's pill): `echo hello-t83`, select, Send to chat → a `terminal` block with `hello-t83`; (4) Files (85's menu): right-click `notes.md` → Add to chat → a `notes.md` path line; (5) Changes (94's button): a hunk's Ask about this → a block headed `notes.md:1-3` with the `+` lines; (6) Browser (87's Share ▸ Screenshot) → one image tile; (7) ⌘Enter is NOT pressed by any of these — the input still holds everything; Esc keeps the text; states — each button: ready with a selection · partial (no selection → disabled, title "Select text first") · error (capture failed → toast); phone: Editor/Markdown buttons in the pane toolbar; human-only: long-press menus
  - confirm: `cd ui/desktop && grep -c "editor-add-to-chat" src/workspace/panes/editor/EditorPane.tsx` → `1` (untouched: `0`); `just walk "add to chat"` → 1 passed (untouched: no spec)

- 84. Changes summary bar + Accept all + `/git/discard`: `/git/diff` gains `numstat?: boolean` (`--numstat`); `POST /git/discard {cwd}` → `git stash push -u -m "goose discard <ts>"` returning `{stash}` with the reverse `POST /git/discard/undo {cwd, stash}` (`stash apply` + `drop`); `ChangesBar.tsx` + pure `changes-bar.ts` (`parseNumstat`, the bar's state) in a `ChangesBarSlot` rendered where `MessageQueue` is in `ChatInput.tsx`; `3 files · +40 −12 · Review · Accept all · Discard`; Accept all = `/git/stage` the porcelain's paths then `openPane('git')` + `focusCommit()` on `PaneContext`; Discard keeps Undo until the next tree change (task 50's `lastApply` shape); Into Rule: the bar shrinks toward the Changes tab when the tree goes clean.
  - status: todo · agent: — · worker: high
  - card: as the user, see what the agent changed and accept or discard it from where my eyes are — above the input — so that review starts where the conversation is (panes research §Item 4 pick A; Codex desktop's bar)
  - UX test plan (walk `changes bar`): setup — scratch repo, clean, session open; steps — (1) no bar (`changes-bar` count 0); (2) ask the agent to append two lines to `notes.md` and create `new.txt` → within 35 s the bar reads `2 files · +3 −0` (`changes-bar-stats`); (3) click Review → Changes pane opens (Full or its slot), `notes.md` selected; (4) click Accept all → Git pane opens, both files under Staged, the commit box focused (`document.activeElement` is the textarea); (5) unstage both (Git pane), click Discard → tree clean, bar shows `Discarded · Undo` for ≥ 5 s; (6) click Undo → both files back, bar reads `2 files` again; (7) keyboard: the bar's three controls reachable by Tab in order; states — empty (hidden) · loading (stats pending: `…`) · partial (a numstat row for a binary: `bin` instead of counts) · error (discard failed → the bar shows git's stderr + Retry) · ready; phone: the bar sits above the input in the chat stage, controls wrap to a second row under 400 px; human-only: the Into motion toward the Changes tab; a `git stash list` entry the user may meet (decision 5)
  - confirm: `grep -c "POST /git/discard" ui/sidecar/src/git.ts` → `1` (untouched: `0`); `grep -c "changes-bar-accept" ui/desktop/src/workspace/ChangesBar.tsx` → `1` (untouched: no file); `just walk "changes bar"` → 1 passed (untouched: no spec)

- 85. Files: filter, context menu, git tints, fs routes: `POST /fs/rename|delete|mkdir` behind task 73's guard (`fs.test.ts` cases); a filter box in `FilesPane.tsx` (substring over `files-tree.ts` paths, ⇧⌘F focuses it — task 69 wired the shortcut to the pane; it now lands in the box); a controlled-`DropdownMenu` right-click row menu: New file · New folder · Rename · Delete · Reveal in Finder (`openDirectoryInExplorer`) · Copy path · Add to chat (task 83's door); Delete moves to a fork trash dir `<toplevel>/.goose-trash/` with Undo for the session (decision 7); tints from `gitStatus` (task 74) joined through the toplevel: M `warning`, A/? `success`, D `danger` as `data-git` (decision 8, DESIGN §Tokens amendment).
  - status: todo · agent: — · worker: high
  - card: as the user, find a file by typing, act on it where it is, and see at a glance what changed, so that Files is a tree I work in, not a list I read (panes research §Item 6)
  - UX test plan (walk `files pane`, extended): setup — scratch repo with 6 files, one modified, one untracked; steps — (1) ⇧⌘F → the filter box has focus; type `not` → the tree shows only `notes.md` (`files-row` count 1); Esc clears; (2) `notes.md` row carries `data-git="M"` and the untracked one `data-git="?"`; (3) right-click `notes.md` → menu rows in order (`files-menu-*` testids); (4) New file → inline name box → `x.ts` Enter → row appears, Editor opens it; (5) Rename `x.ts` → `y.ts` → row renamed, Editor tab follows; (6) Delete `y.ts` → row gone, toast `Deleted · Undo`; Undo → row back; (7) Copy path → clipboard holds the absolute path; (8) keyboard: arrow keys move the row focus, Enter opens, Shift-F10 opens the menu; states — empty ("Nothing here") · loading (skeleton) · partial (unreadable subtree lock icon — existing) · error (an fs route 400/500 → row toast with the message) · ready; phone: long-press for the menu (human), filter box at the top of the stage; human-only: long-press, Reveal in Finder
  - confirm: `grep -c "POST /fs/rename" ui/sidecar/src/fs.ts` → `1` (untouched: `0`); `grep -c "files-filter" ui/desktop/src/workspace/panes/files/FilesPane.tsx` → `≥ 1` (untouched: `0`); `grep -c 'data-git=' ui/desktop/src/workspace/panes/files/FilesPane.tsx` → `1` (untouched: `0`); `grep -c "files-menu-add-to-chat" ui/desktop/src/workspace/panes/files/FilesPane.tsx` → `1` (untouched: `0`); `just walk "files pane"` → 1 passed

- 86. Terminal: tabs, links, search, send to chat: `{type:'kill'}` in `ui/sidecar/src/pty.ts`; pure `terminal-tabs.ts` (+ test) keyed `{sessionId, n}` over the existing `/pty?id=`; a `+` tab strip inside the pane (close ×, rename on double-click; closing kills the pty — decision 9); `registerLinkProvider` ×2 (URLs → external; `file:line` → `openFile(path, line)` resolved against the shell's start cwd); `@xterm/addon-search` (`pnpm add` in `ui/desktop` — the tranche's one dependency) behind ⌘F with a find bar; select → "Send to chat" pill over task 76's door (owned here; task 83's walk exercises it).
  - status: todo · agent: — · worker: high
  - card: as the user, run more than one thing, click a path the shell printed, and find what scrolled by, so that the Terminal is the terminal I would otherwise alt-tab to (panes research §Item 7)
  - UX test plan (walk `terminal pane`, extended): setup — session in a scratch repo; steps — (1) Terminal opens with one tab `zsh 1`; (2) `+` → second tab, active, its own prompt; `pwd` in each → both print the cwd; (3) close tab 2 (×) → one tab, the pty is gone (sidecar `/pty` count via a debug read or the process list — human if not observable); (4) `echo src/a.ts:3` → the printed path is underlined on hover; click → Editor at `src/a.ts` line 3; (5) `seq 1 200`, ⌘F, type `150` → the find bar shows `1 of 1`, the row is highlighted; Esc closes; (6) select `hello-t86` output → the pill → the input holds a fenced `terminal` block; states — empty (prompt) · loading ("starting shell…") · partial (`[exited 0] — Restart` per tab) · error (spawn error with PATH — existing) · ready; phone: the tab strip sits above the key bar, `+` present, ⌘F not offered (no hardware keys); human-only: link after a `cd` (the live cwd is not tracked — decision 10), pty kill observable
  - confirm: `grep -c "terminal-tab-new" ui/desktop/src/workspace/panes/terminal/TerminalPane.tsx` → `1` (untouched: `0`); `grep -c "getSelection" ui/desktop/src/workspace/panes/terminal/terminal-session.ts` → `2` (untouched: `0`); `grep -c "addon-search" ui/desktop/package.json` → `1` (untouched: `0`); `just walk "terminal pane"` → 1 passed

- 87. Browser: Share ▸ Page · Screenshot · Console, dev-server default: `capturePage` typed on the `WebviewElement` interface; a `console-message` listener + a 200-line ring buffer in `browser-state.ts` (errors first); the Share button becomes a `DropdownMenu` (Page = today's text share; Screenshot = `capturePage` → task 76's `INSERT_INPUT_IMAGE`; Console = the buffer quoted as a `console` block); the dev-server default is per project in `project-storage.ts` (`goose.browser.home:<cwd>`), set from the address bar's "Set as home" (decision 11 — no repo file, nothing on `/config`).
  - status: todo · agent: — · worker: medium
  - card: as the user, hand the agent what the page looks like and what it logged, and land on my dev server when I open the pane, so that the Browser is a lens for the agent, not only for me (panes research §Item 9)
  - UX test plan (walk `browser pane`, extended): setup — sidecar `/health` and a scratch page at the sidecar's static root that logs `console.error('t87-boom')`; steps — (1) load the scratch page; Share ▸ Console → the input holds a fenced `console` block containing `t87-boom`; (2) Share ▸ Screenshot → one image tile in the input; (3) Share ▸ Page → the existing `Page:` block; (4) address bar → "Set as home" → reload the app → Browser opens on that URL; (5) keyboard: the Share menu opens with Enter, items by arrows; states — empty (no home: "Enter a URL, or set one as home") · loading · partial (web build: Screenshot and Console disabled with "desktop only") · error (capture failed → toast) · ready; phone: Screenshot/Console disabled with the reason; human-only: `capturePage` on a page taller than the frame (viewport only, by design)
  - confirm: `grep -c "browser-share-screenshot" ui/desktop/src/workspace/panes/browser/BrowserPane.tsx` → `1` (untouched: `0`); `grep -c "capturePage" ui/desktop/src/workspace/panes/browser/BrowserPane.tsx` → `1` (untouched: `0`); `just walk "browser pane"` → 1 passed

- 88. Undo this turn: the shell takes `T0` = `/git/snapshot` on send and `T1` on streaming→idle, keeps `{turnId → {T0, T1}}` per project in `project-storage.ts`; pure `turn-undo.ts` (+ test): the turn's file set from `diff --name-status T0 T1`, refused when a later turn's set intersects it; Undo = `/git/diff T1..T0` applied through `/git/apply` (task 48), created files removed, with **Redo** in place (the reverse patch, task 50's pattern); a slot in `UserMessage.tsx`'s action row ("Undo this turn" / "Redo this turn").
  - status: todo · agent: — · worker: high
  - card: as the user, take back everything one turn did to the tree without hunting for the files, so that letting the agent try costs nothing (chat-panes research §11; Codex desktop's undo)
  - UX test plan (walk `turn undo`): setup — scratch repo, `notes.md` committed; steps — (1) ask the agent to append `t88-a` to `notes.md` and create `made.txt`; wait for idle; (2) hover the user bubble → "Undo this turn" (`turn-undo`) enabled; (3) click → `notes.md` matches HEAD, `made.txt` gone, the control now reads "Redo this turn", a divider under the turn says "turn undone"; (4) Redo → both back; (5) send a second turn that edits `notes.md` again → the first turn's Undo is disabled with title "a later turn changed notes.md"; (6) keyboard: the control is in the bubble's action row Tab order; states — ready · partial (turn has a `T0` but no `T1` — still streaming — disabled "in progress") · error (apply refused → the row shows git's stderr, Redo hidden) · empty (a turn with no file changes shows no control); phone: the action row shows on tap (existing behaviour); human-only: snapshot cost on a large repo (`add -A` twice per turn — decision 12), `git gc` pruning an unreferenced tree mid-session
  - confirm: `cd ui/desktop && grep -q "turn-undo" src/components/UserMessage.tsx && echo ok` → `ok` (untouched: exit 1); `just walk "turn undo"` → 1 passed (untouched: no spec)

- 89. Approve mode, desktop half: `ToolCallConfirmation.tsx` gains testids (`tool-confirmation`, `tool-confirmation-diff`, `tool-approval-allow-once|always-allow|deny`), a diff row rendering task 77's forwarded `diff` block through `unified-diff.ts`, a partial bar ("waiting for <seat>") and `TOOL_CONFIRMATION_STATES`; Session controls gains one line under the Mode radios naming what the current seat does with Approve (`workspace-config-mode-note`: Claude asks for risky actions · Codex asks outside the workspace · Cursor plans without editing · agy cannot ask) and the Error row when a seat refuses the change (`sessionConfig.ts:65-72` surfaced).
  - status: todo · agent: — · worker: medium
  - card: as the user, see exactly what the seat wants to do — the file and the diff, by the tool's real name — and know before I pick Approve what that seat will actually do with it (approve-mode research §Options pick A + C's copy)
  - UX test plan (walk `approve mode`, on `claude-acp`): setup — Advanced on, scratch repo; steps — (1) Session controls → Mode → Approve; the note under the radios reads "Claude asks for risky actions"; (2) prompt "create probe.txt containing HELLO using your file-write tool"; (3) a card appears (`tool-confirmation`) titled `Write probe.txt` with a diff row showing `+HELLO`; (4) click Deny (`tool-approval-deny`) → the card collapses to `Write probe.txt · Denied once`, `probe.txt` does not exist, the reply names the refusal; (5) repeat the prompt, click Allow once → the file exists; (6) switch Runtime to agy → the Mode row shows the Error state "agy cannot ask — Approve unavailable" and Mode stays Auto; (7) keyboard: the three buttons by Tab, Enter; states — empty (no pending call) · loading (card up, waiting on the user — the partial bar names the seat) · partial (a seat that never asks: the note says so) · error (refused mode change) · ready; phone: the card is the same component in the chat stage; human-only: a real Deny mid-edit on Codex (`read-only` asks only outside the workspace), Always Allow on an ExitPlanMode prompt flipping the seat to `auto` (approve-mode research unknowns)
  - confirm: `cd ui/desktop && pnpm vitest run src/components/ToolCallConfirmation.test.tsx -t "renders the adapter diff" 2>&1 | grep -E 'Tests'` → contains `1 passed` (untouched: `0` matching); `grep -c "workspace-config-mode-note" src/workspace/SessionControls.tsx` → `1` (untouched: `0`); `just walk "approve mode"` → 1 passed (untouched: no spec)

- 90. RPI gate bar: `rpi-strip-state.ts` gains an `awaiting` state (`gateState(views, chatState, gateOn)` = latest Plan run done ∧ Implement dim ∧ chat idle ∧ Orchestrate ∧ gate on) and stamps `startedAt` on rows so Revise → re-plan reads `Plan ×2`; the strip's Plan chip carries a bar "Plan ready — waiting for you" with **Accept** (`prompt(sessionId, 'Plan accepted — implement it.', cwd)` — `review-session.ts`'s `prompt` lifted to `src/workspace/prompt.ts`, its second use) and **Revise…** (`INSERT_INPUT_TEXT` "Revise the plan: " + focus); the Artifact pane's header mirrors both on a Plan artifact; an overrun bar (`warning`, "Implement started without your Accept" + Stop) when Implement lights while the gate is armed; Session controls row "Wait for plan acceptance" (`workspace-config-plan-gate`, task 79's setting).
  - status: todo · agent: — · worker: medium
  - card: as the user, read the plan and say yes or say what to change before anything is built, from the strip or the plan itself, so that Hard is a conversation with a gate, not a launch (plan-mode research §8; Claude Code's plan mode)
  - UX test plan (walk `plan gate`, task 96 writes it): setup — scratch role repo (`provisionRoleRepo`), gate on; steps — (1) Hard → "Plan a one-line change to notes.md: append the word gated. Delegate research and planning; do not implement until I accept."; (2) Research lights then done; Plan lights then done; (3) within 10 s of idle the strip shows the bar `rpi-gate` with Accept · Revise…, Implement still `dim` (`data-status="dim"` asserted BEFORE Accept — an Implement row lighting first fails the walk); (4) Revise… → the input holds "Revise the plan: "; type "also mention why" ⌘Enter → Plan reads `×2` when the second planner row lands; (5) Accept → the bar goes, Implement lights, `notes.md` gains `gated`; (6) Advanced → "Wait for plan acceptance" off → a new Hard session runs through without the bar; (7) keyboard: Tab to Accept/Revise, Enter; states — empty (no plan yet: nothing) · loading (Plan active) · partial (`awaiting` — the bar) · error (overrun bar, Stop) · ready (accepted); phone: the bar under the strip in the chat stage; human-only: how often Opus overruns the rule (ten live runs; >1 → the spine gate, decision 13), the Artifact pane's mirrored buttons on a real plan
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/rpi-strip -t "awaiting" 2>&1 | grep -E 'Tests'` → contains `3 passed` (untouched: `14 skipped`); `grep -c 'data-testid="rpi-accept"' src/workspace/rpi-strip/RpiStrip.tsx` → `1` (untouched: `0`); `grep -c 'plan-gate' src/workspace/SessionControls.tsx` → `≥ 1` (untouched: `0`)

- 91. Runtimes gate: `RuntimesGate.tsx` at `#/runtimes` — one screen, four rows Claude · Codex · Cursor · agy with Installed / Signed in / Ready and an Install (opens the install page) or Sign in (opens the Terminal pane with the login command typed, not run: `claude login`, `codex login`, `cursor-agent login`; agy: "sign in through `agy` once in a terminal") affordance, Recheck (task 80's probe), Done → Hub; shown on launch when no seat is Ready (a wrapper beside `OnboardingGuard` in `App.tsx`) and from Settings › App "Runtimes…"; the lever and the chips read `seatState` so a stop whose seat is not Ready shows "— Sign in" instead of `needsInstall`'s Install alone; the phone build shows the desktop's URL instead of installs.
  - status: todo · agent: — · worker: medium
  - card: as a new user, see which of my four seats are ready and fix the ones that aren't from one screen, so that the first minute is setup, not archaeology (plan-mode research §13)
  - UX test plan (walk `runtimes gate`): setup — `GOOSE_PATH_ROOT` copy whose config has no provider; the sidecar's probe answers from a fake `PATH` (as task 66's fake `gh`): claude Ready, codex installed-not-signed-in, cursor missing, agy Ready; steps — (1) launch → `#/runtimes` (`runtimes-gate`), four rows with `data-seat-state` ready/signed-out/missing/ready; (2) Codex row → Sign in → Terminal pane opens with `codex login` in the input line, not executed; (3) Cursor row → Install → external URL opened (asserted via the `open-external` IPC spy); (4) Recheck → rows re-probed (spinner then states); (5) Done → Hub; the lever's Hard stop tooltip reads "Claude Code · … · Orchestrate"; (6) Settings › App → Runtimes… → the same screen; (7) keyboard: rows and buttons by Tab; states — empty n/a · loading (probing: row spinners) · partial (installed, not signed in) · error (probe timed out → row shows "couldn't check" + Recheck) · ready; phone: the screen shows "Set up seats on your Mac: <URL>" and Done; human-only: the real Install/Sign-in flows, `claude auth status --json` stability across releases
  - confirm: `grep -c 'runtimes-gate' ui/desktop/src/App.tsx` → `≥ 1` (untouched: `0`); `just walk "runtimes gate"` → 1 passed (untouched: no spec)

- 92. Command palette ⌘K: `CommandPalette.tsx` on `dialog.tsx` + `input.tsx` over task 81's state (grouped rows: Panes · Sessions · Routines · Stops · Go to · Session); ⌘K in the shell (and the Terminal pane lets it through — decision 14), a ⋯ menu row "Command palette ⌘K", the phone rail's search tab; Into Rule: opens from the ⋯/rail, closes into it; Glass over the transcript per DESIGN.
  - status: todo · agent: — · worker: medium
  - card: as the user, do anything the workspace can do by typing four letters, so that the panes, sessions and routines are one keystroke away (plan-mode research §14; Claude Code's palette)
  - UX test plan (walk `command palette`): setup — a session, a saved routine, two sessions in the list; steps — (1) ⌘K → the dialog (`command-palette`) with the input focused, groups visible; (2) type `term` → the first row is "Open Terminal"; Enter → Terminal opens, palette closed; (3) ⌘K, type the other session's title → Enter → `/pair?resumeSessionId=` of it; (4) ⌘K, type `run` → the routine's "Run now" row → Enter → Schedules shows the run; (5) ⌘K, `hard` → the Hard stop row (disabled with its reason when no orchestrator role); (6) Esc closes and returns focus to what had it; (7) arrow keys move the selection, ⌘K from inside the Terminal pane still opens it; states — empty ("Type to search…" with the groups collapsed) · loading (sessions fetching: a skeleton row) · partial (a group with no matches is hidden; no matches at all → "Nothing matches") · error n/a · ready; phone: a search tab on the rail opens the same dialog full-screen; human-only: the glass treatment over a busy transcript
  - confirm: `grep -c 'command-palette' ui/desktop/src/workspace/WorkspaceShell.tsx` → `≥ 1` (untouched: `0`); `just walk "command palette"` → 1 passed (untouched: no spec)

- 93. Transcript diff cards: extract `ChangeView` from `DiffPane.tsx` and add `presetDiffPath` to `diff-store.ts` (no behaviour change; `diff pane` walk unchanged); a `ToolCardSlot` context in `ToolCallWithResponse.tsx` (one branch) that the shell provides; `TurnDiffCard` renders a `write`/`edit` tool call as a collapsible unified diff (`+3 −1` in the header, "Open in Changes" → `openPane('diff')` + `presetDiffPath`, "Open in Editor" → `openFile(path, line)`); when the turn has task 88's snapshot pair the card reads `/git/diff T0..T1 -- <path>` so whole-file writes and `shell` edits show real old text (option B), else it renders from the tool's arguments (option A).
  - status: todo · agent: — · worker: medium
  - card: as the user, see what each edit changed where the agent said it changed it, so that I read the transcript instead of hopping to Changes for every write (chat-panes research §5; both products' inline diffs)
  - context: the tranche's longest single task — the `ChangeView` extraction (no behaviour change, `diff pane` walk unchanged) may land as its own commit first; split into 93a/93b at claim time if the worker asks
  - UX test plan (walk `transcript diff`): setup — scratch repo, `notes.md` committed; steps — (1) ask the agent to replace line 2 of `notes.md` with `t93`; (2) the edit tool row shows a card (`turn-diff-card`) headed `notes.md · +1 −1`, collapsed by default, expandable to a unified diff with `-two` and `+t93`; (3) Open in Changes → Changes pane, `notes.md` selected; (4) Open in Editor → Editor at `notes.md` line 2; (5) a `shell` edit (`sed -i`) in the next turn also shows a card (snapshot-sourced) with the real old line; (6) two edits to one file in one turn → two cards (decision 15); states — ready · partial (a write whose old text is unknown and no snapshot: `+N` only, header says "new content") · loading (streaming: card fills when the call completes) · error (diff fetch failed → the row's existing error style) · empty (a tool call that touched no file: no card); phone: same card, narrower; human-only: cards inside the Agents pane's read-only child transcripts
  - confirm: `cd ui/desktop && grep -c "presetDiffPath" src/workspace/panes/diff/diff-store.ts` → `1` (untouched: `0`); `grep -c "ToolCardSlot" src/components/ToolCallWithResponse.tsx` → `2` (untouched: `0`); `just walk "transcript diff|diff pane"` → 3 passed

- 94. Changes: file-level actions, ask, jump, tab badge: row hover Stage file · Discard file (`/git/stage {paths}`, `/git/discard` — task 84's — scoped to one path via `git stash push -u -- <path>`); the hunk header's "Ask about this" (the hunk's `+` side quoted with a `path:line-range` header through task 76's door — decision 4) and "Open in Editor" at the hunk's first line (`openFile(path, line)`); `PaneChrome` gains a `badge` prop the Work column's tab bar renders (`WorkColumn.tsx`), filled from `gitStatus` as `3 · +40 −12` (files, then task 84's numstat) — decision 16.
  - status: todo · agent: — · worker: medium
  - card: as the user, act on a whole file from its row, ask about a hunk, and see how much changed from the tab itself, so that Changes reads as a review, not a viewer (panes research §Item 10)
  - UX test plan (walk `diff pane`, extended): setup — scratch repo, two files edited; steps — (1) the Changes tab's badge reads `2 · +N −M` (`workspace-tab-badge-diff`); (2) hover a row → Stage file → it moves to Staged scope; Discard file on the other → it leaves the list, toast with Undo; Undo → back; (3) open a file, a hunk header shows "Ask about this" and "Open in Editor"; Open in Editor → Editor at the hunk's first `+` line; (4) keyboard: row actions by Tab when the row has focus; states — existing pane states; the badge: hidden when clean · `…` while stats load · count only when numstat fails (partial); phone: badge on the tab rail's Changes icon (a dot, not the text — decision 16); human-only: the badge's live update within 30 s while the pane is hidden
  - confirm: `grep -c "diff-hunk-ask" ui/desktop/src/workspace/panes/diff/DiffPane.tsx` → `1` (untouched: `0`); `grep -c "badge" ui/desktop/src/workspace/WorkColumn.tsx` → `≥ 1` (untouched: `0`); `just walk "diff pane"` → 2 passed

- 95. Markdown: Contents + Edit: `headings(text)` and `slug(name)` in `markdown-state.ts` (+ tests; ATX headings, fences ignored); `MarkdownView.tsx` gains `components.h1..h6` with ids; a collapsible Contents list in `MarkdownPane.tsx` (shown when ≥ 3 headings) whose rows scroll to the heading; an Edit button → `openFile(path)` at the heading nearest the current scroll (line from the heading's position); a first `tests/e2e/markdown-pane.spec.ts`.
  - status: todo · agent: — · worker: low
  - card: as the user, jump around a long doc and step into editing it from where I'm reading, so that Markdown is a reader with a door, not a dead end (panes research §Item 12)
  - UX test plan (walk `markdown pane`): setup — scratch repo with `doc.md` (5 headings, 120 lines); steps — (1) open it in Files → Markdown pane renders; Contents (`markdown-toc`) lists 5 rows; (2) click the 4th → the pane scrolls so that heading is at the top (its `id` is the nearest to `scrollTop`); (3) Edit (`markdown-edit`) → Editor opens `doc.md` at that heading's line; (4) a `README.md` with 2 headings → no Contents; (5) keyboard: Contents rows by Tab/Enter; states — existing (empty · loading · partial "Not markdown" · error · ready), Contents hidden below 3 headings; phone: Contents as a collapsed disclosure at the top; human-only: scroll-to-heading with images loading late
  - confirm: `grep -c "markdown-toc" ui/desktop/src/workspace/panes/markdown/MarkdownPane.tsx` → `1` (untouched: `0`); `grep -c "markdown-edit" ui/desktop/src/workspace/panes/markdown/MarkdownPane.tsx` → `1` (untouched: `0`); `just walk "markdown pane"` → 1 passed (untouched: no spec)

- 96. The plan-gate walk and the live overrun count: `tests/e2e/plan-gate.spec.ts` per task 90's UX test plan (steps 1–7 + phone width); then ten live Hard runs on `claude-code` with the gate on, recorded in `docs/2026-09-18-plan-gate-runs-v1.md` (overrun count, wall clock, the model); > 1 overrun in ten → the spine gate (plan-mode research option (ii)) becomes a task — decision 13.
  - status: todo · agent: — · worker: medium
  - card: as the user, know the gate holds in practice, not only in a rule (plan-mode research §8 "the walk catches the overrun")
  - context: the walk needs a signed-in `claude`; the ten runs cost ten Hard turns on Claude Max — the seven-day utilization read 0.87 (`allowed_warning`) during the approve-mode probes on 2026-09-18, so schedule them after the window resets
  - confirm: `just walk "plan gate"` → 1 passed (untouched: no spec); `test -f docs/2026-09-18-plan-gate-runs-v1.md && grep -c '^| ' docs/2026-09-18-plan-gate-runs-v1.md` → `≥ 11` (untouched: no file)

- 97. Amend the documents: `DESIGN.md` §Vocabulary rows Add to chat · diff card · Undo this turn / Redo · Changes bar · Contents · palette · runtimes gate · plan gate; §Tokens the git-tint mapping (M `warning`, A/? `success`, D `danger`); §Shared component states "waiting on the user" mapped to Partial (task 90's shape) and `TOOL_CONFIRMATION_STATES`; §Accessibility Destructive amended for turn undo and Discard (no confirm, Undo/Redo in place); `docs/2026-09-15-workspace-prd-v1.md` steps 16–19 (dated): Add to chat, plan gate, runtimes gate, palette; `ARCHITECTURE.md` §Modules sidecar line: `/fs/*` contained like `/git/*`, `/git/snapshot`, `/git/discard`, `/runtimes/probe` (one refusal-shaped clause each); `scripts/probe-approve.py` named under §Invariants as the approve-mode reference.
  - status: todo · agent: — · worker: low
  - card: as a reader, find the map and the PRD saying what the tree does so that the next plan does not re-argue these picks
  - context: headless — no UX plan; dated amendments, no rewrites
  - confirm: `grep -c "Add to chat" DESIGN.md` → `≥ 1` (untouched: `0`); `grep -c "requestPath\|/fs/\* contained" ARCHITECTURE.md` → `≥ 1` (untouched: `0`)

## Decisions this plan needs (the approval gate)

1. **`/fs` guard reach** — recommend: the guard covers the three landed routes too (`list/read/write`), not only the new ones. A behaviour change on landed routes, but the git routes already behave this way and nothing in the tree depends on absolute paths outside the toplevel (panes research, unknown 6, sweep not exhaustive).
2. **Cursor + Approve** — recommend: Approve → Cursor's `plan` mode ("it cannot edit without telling me") over "Approve unavailable on Cursor". The alternative is honest but leaves Cursor with one mode.
3. **Routines and the plan gate** — recommend: a routine saved from an Orchestrate session never carries the gate line (an unattended run would stall). Ties to task 63's open call: routines force Auto.
4. **"Ask about this" quote** — recommend: the hunk's `+` side with a `path:line-range` header (not the raw patch) — readable to a human, enough for the model to locate it.
5. **Discard as a stash** — recommend: yes; the user may meet a `goose discard <ts>` entry in `git stash list`; it is what makes Discard undoable and covers untracked files.
6. **Rust toolchain** — the `sqlx-macros` dylib fails `dlopen` on Darwin 27 (`rustc 1.96.1`); `-ld_classic` did not help, so it is the toolchain against the new OS. Recommend, in order: update Xcode Command Line Tools; then a newer hermit Rust (`rustup` is the hermit package — `rustup update` inside the hermit env); then `cargo clean`. Until it builds: make `test-light`'s cargo line non-fatal with a `RUST SKIPPED` marker (one Justfile edit at wave 1), task 77 lands with "confirm pending toolchain", and the session reruns every Rust confirm the day it works. Your machine — the CLT update is yours to run.
7. **Files › Delete** — recommend: a fork trash dir (`<toplevel>/.goose-trash/`) with session Undo, over OS Trash (needs a main-process IPC the phone cannot reach) or hard delete; the sidecar excludes it through `.git/info/exclude` (never the user's `.gitignore`), so it does not show as `?` in their repo.
8. **Git tint colours** — recommend: M `warning`, A/? `success`, D `danger`; Monokai's orange stays unassigned (DESIGN says runtime identity has no colour; a fourth tint would need one).
9. **Closing a terminal tab kills its job** — recommend: yes, with the tab's × showing "running" (a spinner) when the pty has a foreground job, so the kill is visible.
10. **Terminal `file:line` after `cd`** — accept the gap: links resolve against the shell's start cwd; a relative path printed after a `cd` may miss (the live cwd is not tracked).
11. **Browser home URL** — recommend: per project in localStorage (`goose.browser.home:<cwd>`), set from the address bar, over a repo file (`.goose/workspace.json` would also publish it on the unkeyed `/config`).
12. **Snapshot cost** — accept: `add -A` into a temp index twice per turn; seed it from `.git/index` so it is incremental; measure on this repo in task 88 and record.
13. **Plan-gate escalation** — the prompt-level gate ships; > 1 overrun in ten live runs (task 96) promotes the spine gate to a task.
14. **⌘K inside the Terminal** — recommend: the pane passes ⌘K through to the shell's binding (xterm `attachCustomKeyEventHandler`), so the palette opens from anywhere.
15. **Two edits, one file, one turn** — recommend: two cards (one per tool call), the second reading "also" — merging hides which call did what.
16. **Changes badge** — recommend: files count + numstat on the desktop tab, a dot only on the phone rail.
17. **Two words called "Mode"** — Advanced shows the server's `mode` option (auto · approve · chat) and the Direct · Orchestrate chip, both labelled Mode (`DESIGN.md:18`, `:73`, `:89`, `:108`; approve-mode research unknowns). Task 89 writes copy under the first; it needs a name before then. Options: rename the server one **Permissions** (auto · ask · chat) and keep Mode for Direct · Orchestrate — recommended, it is what the option governs; or rename the chip **Role** and keep Mode for the permission mode. Your vocabulary.

Approval → the list lands in `tasks.md` as tranche 7 (25 tasks, three waves)
and this section keeps only the pointer; wave 1 starts at once (nine tasks,
disjoint files — the Rust one subject to decision 6).
