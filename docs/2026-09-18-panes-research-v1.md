# Panes — parity research map

Dated 2026-09-18 (cluster `panes`, UX-parity items 4, 6, 7, 9, 10, 12).
Question as asked: for each item — the Changes summary bar + Accept all, the
Files filter · context menu · git tints, many Terminals with links · search ·
send to chat, the Browser's screenshot + console to chat and dev-server
default, the Changes pane's file-level actions · ask · jump, and the Markdown
pane's edit toggle + TOC — what exists in the tree today, what is missing, what
to reuse, the options, and a UX test plan a Playwright walk can be derived
from.

Read this session in the worktree `agent-ab55af07a3721a9cd` at `d7d9406f2`.
The worktree carries no `node_modules`; package evidence is read from the main
checkout's hoisted store (`ui/pnpm-workspace.yaml` `nodeLinker: hoisted`, so
there is no `.pnpm` directory — the substitute evidence is
`/Users/hoaqbui/github/melody-agent2/ui/node_modules/<pkg>/package.json` plus
the `ui/pnpm-lock.yaml` line). Nothing in the main checkout was written.

## The surprise (lead finding)

**`ui/sidecar/src/fs.ts` has no containment guard at all.** Every `/git/*`
route resolves its cwd through `requestCwd` and answers `400` unless the
realpath is inside the spawn cwd's git toplevel or a `.worktrees/` sibling
(`git.ts:96-117`, the `ARCHITECTURE.md` §Invariants line). `/fs/list`,
`/fs/read` and `/fs/write` resolve with a bare `path.resolve(cwd, target)`
(`fs.ts:13`, `:17`, `:31`, `:35`) — behind the per-launch key, any path on the
Mac. Item 6 asks for `/fs/rename`, `/fs/delete`, `/fs/mkdir` "following the
`fs.ts` guard pattern": **the pattern does not exist**, and the three new
routes are the destructive ones. Nothing may be added to `fs.ts` before the
guard lands; the guard is task 1 of item 6 and its own confirm.

Two smaller ones, same shape — the plumbing is already there and the gap is
somewhere else than the item's wording suggests:

- xterm 6 ships `registerLinkProvider` (`xterm.d.ts:1102`, `ILinkProvider`
  `:1393-1402`, `ILink.activate` `:1425`), so `file:line` → `openFile(path,
  line)` needs **no addon**, and neither does an `http(s)` link. Only
  `@xterm/addon-search` is a real dependency ask.
- Goose has **no project-level config file at all**. `config/base.rs` reads
  `~/.config/goose/config.yaml` and `/etc/goose/config.yaml` (`:163`, `:168`);
  the only per-project `.goose/` readers are recipes
  (`recipe/local_recipes.rs:18`, `summon.rs:603`) and agents
  (`sources.rs:534`, `summon.rs:626`). PRD step 12's "the project's dev server
  if one is listed in `.goose` config" names a file nothing reads —
  `BrowserPane.tsx:75-77` already says so in a comment.

## Reframe trail

1. "add `/fs/rename|delete|mkdir` like the other `fs` routes" > the other `fs`
   routes have no guard (`fs.ts:13`) > "what guard must land *before* any
   write route, and does it apply to the existing three?"
2. "three items each want `/git/status`" > the shell already polls it every
   30 s, but only while the Changes pane is hidden (`WorkspaceShell.tsx:762`
   `diffHidden`) > "one poll, one source": widen the condition, keep the
   status in shell state, hand it to panes on `PaneContext` — the bar, the tab
   count, the dot and the Files tints all read the one value
3. "`file:line` in the terminal needs `addon-web-links`" > `addon-web-links`
   linkifies URLs only and never file paths; `registerLinkProvider` does both
   > "the one dependency is search, not links"
4. "Edit the markdown at the same scroll" > scroll position is not knowable
   across two different renderings > headings carry their **source line**
   (`react-markdown@10` `ExtraProps.node.position`, `lib/index.d.ts:59-68`),
   and `openFile(path, line)` already exists (`pane-context.ts:22`) > "the
   anchor is the heading's line, not the pixel"
5. "Discard = `git checkout -- <paths>`" > `checkout`/`restore --worktree`
   touches tracked files only and is irreversible, so task 50's Undo pattern
   cannot ride it > "`git stash push -u -m` is the only whole-tree discard
   with an Undo"

## Recorded decisions this cluster must not reopen

- The Changes pane's per-chunk Reject · Stage act with no confirm, and the
  pane keeps the last patch for **Undo in place** (DESIGN §Accessibility,
  amended 2026-09-16 task 50; `diff-store.ts:48-54` `lastApply`,
  `undoRequest`). A confirm dialog for a destructive pane action is settled
  against — Discard follows Undo, not a dialog.
- `git add -A` shapes are barred; Accept stages explicit paths (tasks.md
  §Waiting, task 53 product call).
- CodeMirror's own `acceptChunk`/`rejectChunk` are never invoked — the pane
  is `readOnly` and git does every write (`DiffPane.tsx:276-278`,
  `docs/2026-09-16-hunk-review-research-v1.md` §The surprise).
- `PANE_TITLES` is static message descriptors and `pane-store.ts` is pure
  layout (`:1-2`); the unseen dot rides `PaneLayout.unseen` (`:70`). A count
  on a tab is chrome, not layout.

## One poll, one source (spans items 4, 6, 10)

`WorkspaceShell.tsx:762-783` polls `POST /git/status` every
`CHANGES_POLL_MS` (30 s, `diff-store.ts:10`) **only while the Changes pane is
hidden**, keeps no status, and only calls `store.markUnseen('diff')` when the
fingerprint (`statusFingerprint`, `diff-store.ts:14-19`) moves off its
baseline. Three items want that same data on screen.

The reuse, stated once: widen the effect's condition from `diffHidden` to
`isWorkspaceRoute`, hold the last `GitStatusResponse` in shell state, keep the
baseline/dot logic exactly as it is (the dot still only arms while hidden),
and expose the value on `PaneContext` as `gitStatus: GitStatusResponse | null`
(`pane-context.ts`, beside `cwd`/`file`/`line`). The Changes bar, the Changes
tab's count, and the Files pane's tints then read one value from one call. A
second poll anywhere in this cluster is a bug.

---

## Item 4 — Changes summary bar + Accept all

### Inventory

- `ui/sidecar/src/git.ts:307-308` — `POST /git/status` runs `status
  --porcelain=v1 -b`; `parseStatus` (`:143-162`) returns `{branch, upstream,
  ahead, behind, entries[{path,index,worktree}]}` — task 66 added
  `ahead`/`behind` (`:150-156`). **No line counts**: porcelain carries letters,
  never `+`/`−`.
- `git.ts:311-326` — `POST /git/diff` builds `--no-color --no-ext-diff
  --src-prefix=a/ --dst-prefix=b/`, and accepts `staged`, `context`, `base`,
  `path`. There is no `--numstat` and no `--shortstat` path.
- `ui/desktop/src/workspace/panes/diff/diff-store.ts:10` `CHANGES_POLL_MS`,
  `:14-19` `statusFingerprint`; `WorkspaceShell.tsx:762-783` is the one caller.
- `unified-diff.ts:6` `FULL_CONTEXT`, `parseUnifiedDiff` → `DiffFile{added,
  removed}` (`:9-18`); `DiffPane.tsx:395-414` fetches the whole tree at full
  context on every mount, refresh and running→idle edge (`:432-436`). That
  fetch is the pane's, not the bar's — the bar must not trigger it.
- `git.ts:337-344` — `POST /git/stage` is `git add -- <paths>`; whole-path,
  takes an array. `git-state.ts:69-72` `actionablePath` picks the post-arrow
  half of a porcelain rename, which is what an explicit-paths Accept needs.
- `GitPane.tsx:566-580` — the commit box is a plain `<textarea
  data-testid="git-message">` bound to a per-cwd draft store (`draftFor(cwd)`,
  `:269`). **There is no imperative handle and no ref exported**: nothing
  outside the pane can focus it today. The established cross-pane pattern is
  the shell holding state that the pane reads as an effect — `openFile(path,
  line)` → `EditorPane.tsx:234-254` scrolls and places the cursor. A
  `focusCommit()` on `PaneContext` (shell bumps a counter, GitPane effects on
  it) is that pattern's second use.
- `WorkspaceShell.tsx:1114-1127` — `chatBody` is `SessionChipsSlot.Provider >
  NextChat.Provider > [RpiStrip] > [children + chat]`. The RPI strip is the
  precedent for a workspace strip inside the Chat column (task 29). The chat's
  input card is *inside* `chat` (`BaseChat.tsx:533-540` `ChatInputCard`), so
  `chatBody` cannot place anything above the input from outside.
- `ChatInput.tsx:44-49` — `SessionChipsSlot` is the fork's existing seam into
  the upstream input (task 60); `:1556-1571` renders `MessageQueue` above the
  `<form>`, inside the card — the exact place a strip above the input lives.
- `ChatInput.tsx:770-800` — `AppEvents.INSERT_INPUT_TEXT` lands text at the
  caret of the visible input (`constants/events.ts:15`).
- No `/git/checkout`, `/git/restore`, `/git/clean` or `/git/stash` route
  exists: `grep -c "POST /git/discard" ui/sidecar/src/git.ts` → `0`.
- `diff-store.ts:48-54` — `lastApply` + `undoRequest` is task 50's Undo shape:
  the pane keeps what it sent and offers the inverse in place.

### Options → pick

The three live questions: where the bar mounts, where `+40 −12` comes from,
and what Discard does.

| Option | Owns | Trades away |
|---|---|---|
| A — bar above the input via a second `ChatInput` slot (`ChangesBarSlot`, rendered where `MessageQueue` is), stats from `/git/diff {numstat:true}` on the shell's 30 s tick, Discard = `POST /git/discard` → `git stash push -u -m "goose discard <ts>"` with Undo = `stash apply <sha>` + `drop` | literally above the input as asked; one poll; a reversible Discard; the Into Rule reads (bar → Changes tab) | one more upstream-component edit (`ChatInput.tsx`, already fork-patched twice); one `--numstat` call per tick; a stash entry the user may meet in `git stash list` |
| B — bar as another chip group in the existing `SessionChipsSlot` | zero new seams | the chips row is one flex line (DESIGN §Frame) and already carries Runtime · Mode · model · directory · Worktree; five more controls break it at 600 px (task 60 hand check) |
| C — bar under the RPI strip at the top of the Chat column | zero upstream edits | not above the input; two stacked strips push the transcript down ~104 px; the user's eye is at the input, not the ceiling |
| D — Discard = `git restore --worktree -- <paths>` | no stash entry | tracked files only (a run that only creates files is untouched — the same gap task 53 hit), and irreversible, so task 50's Undo cannot ride it |

Pick: **A**.
- Stats: extend `/git/diff` with `numstat?: boolean` → push `--numstat` (one
  flag on an existing route, no new route, tiny output); a pure
  `parseNumstat(text)` in `changes-bar.ts` with a unit test.
- Discard uses `-u` so untracked files come too, and the toast/row keeps
  **Undo** until the next tree-changing action, as `lastApply` does.
- Accept all = `POST /git/stage` with the porcelain's explicit paths through
  `actionablePath`, then `openPane('git')` + `focusCommit()`.
- Into Rule: when the tree goes clean the bar shrinks toward the Changes tab
  (`animate-out zoom-out-95`, the `CLOSE_MOTION_MS` shape of
  `WorkColumn.tsx:73`); it grows out of it when the tree goes dirty.

### UX test plan

Setup: a scratch repo as `diff-pane.spec.ts:26-43` builds one (HOME pinned,
`git init`, one commit, then two files modified and one added), app opened on
it, Work column empty.

1. Wait for `[data-testid="workspace-shell"]`; assert
   `[data-testid="changes-bar"]` is visible within 35 s and carries
   `data-state="ready"`.
2. Assert its text matches `/^3 files · \+\d+ −\d+$/` on
   `[data-testid="changes-bar-summary"]`, and that
   `[data-testid="changes-bar-files"]` has `data-count="3"`.
3. Click `[data-testid="changes-bar-review"]` → `[data-testid="diff-pane"]`
   visible, `workspace-pane-button-diff[aria-pressed="true"]`.
4. Click `[data-testid="changes-bar-accept"]` → within 10 s
   `[data-testid="git-pane"]` is visible, `[data-testid="git-staged"]` lists 3
   `git-file` rows, `git-unstaged` empty, and `document.activeElement` is
   `[data-testid="git-message"]`.
5. Terminal-free git assertion (the walk shells out, as `diff-pane.spec.ts`
   does): `git diff --cached --name-only` prints the three paths.
6. Unstage (`git reset -q`), wait a tick; click
   `[data-testid="changes-bar-discard"]` → within 10 s the bar is gone from
   the DOM *and* `[data-testid="changes-bar-undo"]` is visible in the toast
   row; `git status --porcelain` prints nothing; `git stash list` has one
   entry.
7. Click `[data-testid="changes-bar-undo"]` → `git status --porcelain` prints
   three lines again; `git stash list` is empty.
8. Blocked state: with a tool call in flight (the walk's overlay, as
   `DiffPane`'s running gate is tested) assert
   `changes-bar-accept[disabled]` and `[data-testid="changes-bar-blocked"]`
   reading "… wait for the running tool call to finish".

States it must declare (`CHANGES_BAR_STATES` in `changes-bar.ts`, the DESIGN
§Shared component states rows plus `ready`):
- empty → the bar is **not mounted** (a clean tree has no strip; the Into Rule
  says it disappears into the Changes tab, so "empty" is absence, and the
  Changes tab is the starting action).
- loading → the bar is mounted with the counts as a skeleton the first tick
  after the tree goes dirty; layout preserved, no blank.
- partial → status resolved, numstat not (or refused): "3 files" alone, no
  `± `, one-line note on the missing half.
- running → Accept all · Discard disabled in place with the reason (never
  hidden), Review still live.
- error → git's stderr in place, the bar kept, the recovery named (Retry).
- unavailable → not a git repository: the bar never mounts.

Keyboard: the bar is a `role="toolbar"` between the transcript and the
textarea in DOM order, so Tab from the transcript reaches Review · Accept all
· Discard before the input; every control is a `<Button>`; after Accept all,
focus moves to the commit box (step 4 asserts it) and ⇧Tab returns to the bar.
Esc is cancel-turn (DESIGN §Accessibility) and must not dismiss the bar.

Phone (≤767 px): the Work column is folded away, so Review must switch the
rail to the Changes pane (`store.show('diff')`, `pane-store.ts:219`); the bar
drops the `±` and reads `3 files` with the three actions, one line, above the
input. Assert `[data-testid="changes-bar"][data-mode="phone"]` and that
Review leaves `workspace-tab-diff[aria-pressed="true"]`.

Human only: that the bar reads as *floating* over the transcript (Surfaces
float / Glass Rule — it sits over a scroller, so it is glass); that the
shrink-into-the-Changes-tab motion crosses the column seam legibly (the rail's
shared `layoutId` was retired with task 71, so this is a new cross-column
Into with no precedent); whether a stash entry named "goose discard" is
acceptable in the user's own `git stash list`.

### Scope

- in: `ui/sidecar/src/git.ts` (`numstat` flag on `/git/diff`; `POST
  /git/discard`, `POST /git/discard/undo` or one route with a `restore`
  flag), `ui/sidecar/src/git.test.ts`; `ui/desktop/src/native/sidecar.ts`
  (request/response types); `ui/desktop/src/workspace/ChangesBar.tsx` +
  `changes-bar.ts` (+ test); `WorkspaceShell.tsx` (the widened poll, the
  status in state, `focusCommit`, the slot provider); `pane-context.ts`;
  `components/ChatInput.tsx` (one slot, mirroring `SessionChipsSlot`);
  `GitPane.tsx` (consume `focusCommit`); `DESIGN.md` §Vocabulary (a row for
  the bar) and §States; `tests/e2e/changes-bar.spec.ts`.
- out: committing from the bar (the commit box is the one place a message is
  written); a per-file list in the bar (that is the Changes pane); Accept all
  archiving a run (task 53's open product call, not this bar's).
- protected: `crates/**` (nothing here reaches the spine); `agent.rs`,
  `state_machine/`; `pane-store.ts` stays pure layout; the existing
  `/git/status` response shape (the Board and the dot parse it,
  `BoardView.tsx` `reviewCwds`, `WorkspaceShell.tsx:771`); no second poll;
  upstream's `ChatInput` gains a slot and nothing else — no restyle (Upstream
  Rule).

### Unknowns

- Whether `+40 −12` should count staged changes too (the porcelain count does;
  `git diff --numstat` without `--cached` does not) — cheap to test? yes;
  reversible? yes. Product call.
- `stash push -u` in a repo with a `.gitignore`d build tree is fast, but on a
  large untracked tree it is not instant — no measurement taken. Cheap to
  measure? yes; reversible? yes.
- Whether Undo should survive a pane switch or a reload (task 50's `lastApply`
  lives in the pane's store, not localStorage). Cheap? yes; reversible? yes.
- Whether a second `ChatInput` slot is acceptable under the Upstream Rule or
  whether the user wants the strip at the top of the column (option C).
  User's call.

---

## Item 6 — Files: filter, context menu, git tints

### Inventory

- `panes/files/FilesPane.tsx:63-123` — the pane; `:73` `/fs/list` per
  directory; `:91` one `/fs/watch` socket on the cwd; `:115-123` a row click
  opens a dir or calls `openFile(row.path)`. `:182-213` `FileRow` — the
  `written` dot is `bg-text-info` with a `title` (`:207-211`), paired with
  text as DESIGN §Accessibility requires.
- `files-tree.ts:17-32` — `TreeState{root, dirs, expanded, current}`,
  `TreeRow{path,name,type,depth,expanded,load}`; `visibleRows` (`:117`) walks
  only **loaded** directories (`rowsOf`, `:99-101` returns `[]` for an
  unloaded dir). A filter over the tree therefore matches **only what has been
  expanded** — a fuzzy match over the whole repo would need a recursive listing
  the pane does not have and the sidecar does not offer (no `/fs/walk`).
- `paneState` (`files-tree.ts`, used at `FilesPane.tsx:110`) already reports
  `'empty' | 'loading' | 'partial' | 'error'` (`:10`) — this pane is the one
  that already declares a state type.
- ⇧⌘F: `WorkspaceShell.tsx:986-996` — `metaKey|ctrlKey` + `shiftKey` + `f`
  on a workspace route calls `store.openPane('files')`. It opens the pane and
  nothing more; there is no filter to focus.
- Right-click menu: there is **no `context-menu.tsx`** under
  `ui/desktop/src/components/ui/` (the directory listing has `dropdown-menu.tsx`
  and no context menu). `@radix-ui/react-context-menu@2.2.16` exists in the
  hoisted store only as a transitive of `@radix-ui/themes@3.3.0 → radix-ui@1.4.3`
  (`ui/pnpm-lock.yaml:10602-10607`, `:1996`) — importing it would be a phantom
  dependency. The fork's own right-click precedent is a **controlled
  `DropdownMenu`**: `WorkColumn.tsx:365-372` (`onContextMenu` →
  `setMenuTab(id)`) and `:405-441` (`<DropdownMenu open={menuTab === id}>` over
  an invisible trigger). Zero new deps.
- Reveal in Finder: `preload.ts:353` `openDirectoryInExplorer` →
  `main.ts:3176` `shell.openPath(path)`. `openPath` on a **file** opens it in
  its default application; it does not reveal it. `shell.showItemInFolder` is
  not wired anywhere (`grep showItemInFolder main.ts preload.ts` → nothing).
  So "Reveal in Finder" either reveals the **parent directory** with the
  existing IPC, or needs a new one.
- The web build: `shims/electron-web.ts:111` proxies every unimplemented
  `window.electron` method to a resolved no-op, so Reveal would silently do
  nothing on the phone — it must be hidden at `WEB_SHIM`
  (`WorkspaceShell.tsx:138-139`), as the session menu hides "Open in ▸"
  (DESIGN §Vocabulary, session menu).
- Add to chat: `AppEvents.INSERT_INPUT_TEXT` (`constants/events.ts:15`,
  consumed at `ChatInput.tsx:770-800`) is the seam; cluster `chat-panes` owns
  its shape. The call this item expects is
  `window.dispatchEvent(new CustomEvent(AppEvents.INSERT_INPUT_TEXT, {detail:
  "<repo-relative path>"}))` — the same call `BrowserPane.tsx:290-294` makes.
- Git tints: `/git/status` paths are **repo-root-relative**
  (`git.ts:159` `line.slice(3)`), the tree's paths are **absolute**
  (`fs.ts:28` returns the resolved `target`). Nothing exposes the git
  toplevel: `/git/status` does not return it. `DiffPane.tsx:155-160` already
  resolves it by calling `/git/worktree/list` and reading the first entry
  (`worktree.ts` `worktreePlace`), which is the available join.
- New routes: `fs.ts` has `list`, `read`, `write` only (`:15-40`) and **no
  containment check** (§The surprise). `mkdir` already happens inside
  `/fs/write` (`:36`).

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A — substring filter over `visibleRows`, controlled `DropdownMenu` as the context menu, tints joined via `/git/worktree/list`'s toplevel, `/fs/rename|delete|mkdir` **behind a new `requestPath` guard in `fs.ts`** | no new dependency; the guard closes the standing hole; every piece reuses a landed pattern | the filter only sees expanded directories; Delete is permanent (below) |
| B — fuzzy filter over the whole repo | the search users expect from ⇧⌘F | needs a recursive `/fs/walk` route + an ignore list + a matcher dependency (`fuse`/`cmdk` are not installed — `ui/node_modules` has neither) — three new things for one item |
| C — Radix `ContextMenu` primitive | the idiomatic component, long-press for free | a phantom dependency today, or a declared one with no second use; `WorkColumn` already proved the DropdownMenu shape |

Pick: **A**, with the filter's scope stated on the surface ("filters what is
open") and B queued as its own task once a `/fs/walk` has a second caller.
Delete: `fs.rm` is permanent and Electron's `shell.trashItem` is main-process
only (the sidecar is plain Node), so V1 offers Delete **only for files**, with
the file's bytes kept in memory and an in-place **Undo** (write them back
through `/fs/write`) — the task 50 shape again; a directory Delete is out of
scope until a trash mechanism is picked (Unknown 2).

Tints: `M` → `warning`, `A` → `success`, `?` (untracked) → tertiary text, `D`
→ `danger`, each as the row's **text colour plus its letter** in the row's
right gutter, never colour alone (DESIGN §Accessibility). DESIGN's semantic
roles have no M/A/?/D mapping today and the Monokai orange `#fd971f` has no
role (§Tokens) — this mapping is a DESIGN.md amendment the plan must land, and
the user's call.

### UX test plan

Setup: the `diff-pane.spec.ts` scratch repo plus one untracked file
(`untracked.txt`), one deleted tracked file, and a nested directory
`src/deep/`.

1. Press ⇧⌘F → `[data-testid="files-pane"]` visible and
   `document.activeElement` is `[data-testid="files-filter"]` (today the
   shortcut only opens the pane — this is the change).
2. Type `not` → `[data-testid="files-row"]` count is 1 and its `data-path`
   ends `notes.md`; `[data-testid="files-filter-count"]` reads "1 of N".
3. Type `zzz` → zero rows and `files-pane[data-state="empty"]` with the line
   "Nothing matches — clear the filter".
4. Esc in the filter clears it (and does **not** close the pane or cancel a
   turn: assert the pane is still visible and the row count is back to N).
5. Assert tints: the row for `notes.md` has `data-git="M"` and the row for
   `untracked.txt` has `data-git="?"`; each carries a visible letter in its
   gutter (`[data-testid="files-git-letter"]`).
6. Right-click the `notes.md` row → `[data-testid="files-menu"]` open with
   items `files-menu-new · -rename · -delete · -reveal · -copy-path ·
   -add-to-chat`; press Escape → menu closed, focus back on the row.
7. Rename: open the menu, click `files-menu-rename`, type `renamed.md`, press
   Enter → within 5 s a row with `data-path` ending `renamed.md` exists and
   none ends `notes.md`; `git status --porcelain` shows the rename.
8. Copy path → `navigator.clipboard.readText()` is the repo-relative path.
9. Add to chat → `[data-testid="chat-input"]` value contains the
   repo-relative path.
10. Delete a file → the row goes and `[data-testid="files-undo"]` is visible;
    click it → the row is back and `/fs/read` returns the original bytes.
11. Guard: a direct `POST /fs/read {path: "/etc/hosts"}` from the walk's page
    context answers `400` (this assertion fails today — the route answers
    `200`).

States (`FilesPaneState` already exists, `files-tree.ts:10`; add `ready`):
empty → "Nothing here" + the path, or "Nothing matches — clear the filter"
with Clear as the action; loading → the existing "Loading…", rows preserved;
partial → an unreadable directory keeps its `Lock` and its tooltip
(`FilesPane.tsx:206`), the rest of the tree live; error → the load error with
Retry (`:151-158`), unchanged; running → a menu action in flight disables the
menu's items in place with the reason, never hides them.

Keyboard: ⇧⌘F focuses the filter; ↓ from the filter moves into the tree;
`ContextMenu` key / ⇧F10 on a focused row opens the menu (the DropdownMenu's
trigger must be reachable, not only `onContextMenu`); Enter on a row opens the
file; Esc closes the menu, then clears the filter, and never closes the pane.

Phone: the pane is the drill-down list (`FilesPane.tsx:111-113`); the filter
sits under the path bar; the context menu opens on **long-press** (the same
`touch-none` + pointer-hold shape `WorkColumn.tsx:350` uses for tabs), and
Reveal in Finder is not rendered (`WEB_SHIM`). Assert
`files-menu` has no `files-menu-reveal` child in the web build spec
(`tests/e2e/web-build.spec.ts` is the existing home for this).

Human only: whether the four tints read as a tint rather than as an error at a
glance in Charcoal Monokai; whether long-press feels right against the tab
long-press on the same screen; that Reveal actually selects the file in Finder
(if a new `showItemInFolder` IPC is taken) rather than opening it.

### Scope

- in: `ui/sidecar/src/fs.ts` (`requestPath` guard first, then `POST
  /fs/rename`, `/fs/delete`, `/fs/mkdir`), `ui/sidecar/src/fs.test.ts` (new —
  there is none today), `http.test.ts` for the 400s;
  `ui/desktop/src/native/sidecar.ts`; `panes/files/FilesPane.tsx`,
  `files-tree.ts` (filter + git status join, pure, with tests),
  `WorkspaceShell.tsx` (⇧⌘F focuses the filter; the shared `gitStatus`),
  `DESIGN.md` §Vocabulary + §Tokens (the M/A/?/D mapping),
  `tests/e2e/files-pane.spec.ts`.
- out: a repo-wide fuzzy finder (option B, its own task); directory Delete;
  drag-and-drop move; a new `showItemInFolder` IPC unless the user wants true
  reveal (V1 reveals the parent directory).
- protected: `crates/**`; `components/ui/*` gains no new component — the menu
  composes `dropdown-menu.tsx`; no new dependency; `/fs/list` and `/fs/read`
  response shapes (the Markdown and Editor panes parse them); the `written`
  dot keeps `info` (DESIGN §Tokens says the Files dot stays `info`).

### Unknowns

- Whether the guard should also refuse the **existing** `/fs/read|write|list`
  outside the toplevel — it would be the correct fix, but a session opened in
  a subdirectory reads its own files by absolute path today and something may
  depend on reaching outside (nothing found in this session). Cheap to test?
  yes; reversible? yes, but it is a behaviour change on landed routes.
- Trash vs permanent delete vs in-memory Undo. Cheap? yes; reversible? yes.
  User's call.
- Whether the filter should match paths or names only (nested matches would
  need auto-expansion of collapsed directories). Cheap? yes; reversible? yes.
- The tint mapping is not in DESIGN; `warning`+`success`+`danger` on one tree
  may read as status noise. Human call.

---

## Item 7 — Terminal: many, links, search, send to chat

### Inventory

- `ui/sidecar/src/pty.ts:47` — `const sessions = new Map<string, PtySession>()`
  keyed by the **`?id=` query parameter** (`index.ts:128`, defaulting to a
  `randomUUID`). Several ptys per chat session already work: the renderer
  simply passes different ids. **No sidecar change is needed to have many.**
- `pty.ts:42-43` — `type ClientMessage = {input} | {resize}`. There is **no
  kill**: sessions outlive their clients by design (`:45-47`), and only
  `killAllPty()` on shutdown (`:113-117`) ever terminates one. Closing a
  terminal tab therefore leaks a live shell unless a `{type:'kill'}` message
  (or a `DELETE`-ish route) is added — the one sidecar change this item needs.
- `terminal-session.ts:77` — `const sessions = new Map<string,
  TerminalSession>()` keyed the same way, with `terminalSession(id, cwd)` as
  the accessor (`:88-95`); `reattachTerminals()` (`:98-100`) walks them all.
  The renderer's map is already N-capable.
- `WorkspaceShell.tsx:1057` — `const ptyId = sessionId || 'hub'`, one id per
  session; `:787-794` the Terminal dot subscribes and compares `id === ptyId`
  — that exact match breaks the moment ids are suffixed; it must become a
  prefix/set test.
- `TerminalPane.tsx:61-71` — the pane takes `ptyId` and `cwd` as props from
  the shell (`WorkspaceShell.tsx:1058-1060` `defaultPane`), so a tab strip
  inside the pane means the pane owns the id list; the shell keeps handing it
  the base id.
- Addons: only `@xterm/addon-fit@0.11.0` and `@xterm/xterm@6.0.0` are
  installed (`ui/node_modules/@xterm/` has exactly `addon-fit` and `xterm`;
  `ui/desktop/package.json:82-83`; lockfile `:3548`, `:11305`).
  `@xterm/addon-search` and `@xterm/addon-web-links` are **not present** —
  `grep -c "addon-search" ui/desktop/package.json` → `0`.
- xterm 6 API read this session (`ui/node_modules/@xterm/xterm/typings/xterm.d.ts`):
  `registerLinkProvider(ILinkProvider): IDisposable` (`:1102`), `ILinkProvider.provideLinks(line, cb)`
  (`:1393-1402`), `ILink{range,text,activate(event,text),hover,leave}`
  (`:1407-1451`), `getSelection()` (`:1168`), `hasSelection()` (`:1162`),
  `onSelectionChange` (`:996`), `attachCustomKeyEventHandler` (`:1072`).
  Everything the link and the send-to-chat halves need is core.
- Phone key bar: `TerminalPane.tsx:140-193`, rendered when
  `usePhoneWidth()`; it is a flex-wrap `role="toolbar"` at the bottom of the
  pane. A tab strip at the **top** of the pane does not collide with it, but
  at phone width both eat the terminal's height.
- The chat seam is again `AppEvents.INSERT_INPUT_TEXT` (`events.ts:15`).

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A — `+` strip inside the pane (ids `${ptyId}#<n>`), `registerLinkProvider` for both `file:line` and URLs, `@xterm/addon-search` as the one dependency, `getSelection()` → Send to chat, `{type:'kill'}` added to the pty protocol | N shells with one pane; zero addon for links; a real ⌘F; closed tabs actually die | one new dependency; the dot's id test must change; a `kill` message is a new destructive verb on the pty socket |
| B — one Terminal pane per pane id (a second `PaneId`) | no in-pane strip | breaks the One Dock Rule's two-pane limit immediately; `PANE_IDS` is a fixed union (`pane-store.ts:4-14`) |
| C — hand-rolled search over the buffer (`Terminal.buffer` API) instead of the addon | no dependency | re-implements decorations, wrap-around and highlight-all; a day of work against a maintained 8 KB addon whose only consumer is this pane |

Pick: **A**. The dependency ask is exactly one:
`@xterm/addon-search` (xterm 6-compatible line, to be resolved by `pnpm add`
in `ui/desktop`) — reason: ⌘F in a terminal needs match decoration and
wrap-around over a 5 000-line scrollback (`terminal-session.ts:48`), the addon
is the same project as the `@xterm/xterm` and `@xterm/addon-fit` already
declared, and the second concrete use is the phone (the same ⌘F/Find surface
is the only way to search a scrollback with no modifier keys).
**`@xterm/addon-web-links` is explicitly not taken** — one
`registerLinkProvider` regex covers `https?://…` (→ `window.electron.openExternal`)
and a second covers `(?:\.{0,2}/)?[\w./-]+\.\w+:(\d+)(?::\d+)?` (→
`openFile(path, line)`), and the addon cannot do the second one at all.

### UX test plan

Setup: the scratch repo; Terminal open as a full pane; a file `notes.md` at
the repo root.

1. Assert `[data-testid="terminal-tabs"]` with one tab
   `terminal-tab-0[aria-pressed="true"]` and `[data-testid="terminal-tab-new"]`.
2. Click `+` → two tabs, the new one pressed; type `echo one` + Enter in it,
   switch to tab 0, switch back → the scrollback of each tab is its own
   (assert the terminal's text contains `one` in tab 1 and not in tab 0).
3. Rename: double-click the tab (or its menu's Rename) → type `build` + Enter
   → `terminal-tab-1` has text `build`; it survives a pane close/reopen
   (Nothing Lost).
4. Close tab 1 → one tab left; assert the sidecar dropped the pty: reopening
   a tab with the same id shows a fresh shell (no replayed scrollback).
5. Links: run `printf 'notes.md:2\n'`; assert the rendered cell carries the
   link decoration, click it → `[data-testid="editor-pane"]` visible with
   `[data-testid="editor-file"]` ending `notes.md` and the cursor on line 2
   (the same assertion `review-pane.spec.ts` makes for `review-link`).
6. Search: press ⌘F → `[data-testid="terminal-search"]` focused; type `one` →
   `[data-testid="terminal-search-count"]` reads `1/1`; Enter wraps; Esc
   closes the search and returns focus to the terminal (and does not cancel
   the turn).
7. Send to chat: select text with a drag (or `term.selectAll()` through the
   walk), assert `[data-testid="terminal-send"]` becomes enabled, click it →
   `[data-testid="chat-input"]` value contains the selection inside a fenced
   block.
8. The dot: with the Terminal pane hidden, write to tab 1's shell → the
   Terminal tab carries `workspace-pane-dot-terminal` (this is the assertion
   that catches the `id === ptyId` regression).

States (`TERMINAL_PANE_STATES`, new, in `terminal-keys.ts`'s neighbourhood):
empty → never (a pane always has one tab); loading → the existing "Starting
shell…" (`TerminalPane.tsx:111`); partial → a tab whose socket is lost keeps
its buffer with the "…— Reconnect" row (`:125-137`) while the other tabs run;
error → `[exited <code>] — Restart` (`:112-124`), unchanged; running → a tab
being closed disables its × in place; unavailable → the sidecar unreachable:
the reason line with Reconnect.

Keyboard: ⌘F opens search, Esc closes it (never closes the pane, never
cancels the turn); ⌥⌘← / ⌥⌘→ move between terminal tabs when the terminal has
focus — but `attachCustomKeyEventHandler` (`xterm.d.ts:1072`) must let every
other key through to the shell, and ⌘1/⌘2/⌘3 must keep reaching the column
shortcut (task 60's hand check found Ctrl+1/2/3 leaking into the terminal —
the same trap).

Phone: the tab strip is the same row, scrollable, above the key bar; the key
bar stays pinned to the bottom (`TerminalPane.tsx:140`); search opens as a
one-line bar under the strip. With a strip, the status row and the key bar
the terminal keeps ≥ 8 rows at 812 px — assert
`[data-testid="terminal-pane"]` has a terminal element taller than 160 px at
phone width.

Human only: whether a real selection drag (not `selectAll`) enables Send;
whether links are clickable without stealing the shell's mouse reporting in
a full-screen TUI (`vim`, `htop`); whether closing a tab that is running a
long job is expected to kill it (it will).

### Scope

- in: `ui/sidecar/src/pty.ts` (a `kill` client message, closing clients and
  deleting the session) + its test; `panes/terminal/TerminalPane.tsx`,
  `terminal-session.ts` (id list, link providers, search addon, selection),
  a new pure `terminal-tabs.ts` (id minting, names, ordering) with a test;
  `WorkspaceShell.tsx` (the dot's id test); `ui/desktop/package.json` (one
  dependency, via `cargo`-style `pnpm add`, not a hand edit);
  `DESIGN.md` §Vocabulary (a terminal **tab** row, distinct from the Work
  column's tab) ; `tests/e2e/terminal-pane.spec.ts`.
- out: splitting a terminal pane; shell profiles; a terminal in the Chat
  column; `addon-web-links`; persisting tab names across app restarts (the
  ids are per session, the names live with them).
- protected: `crates/**`; the pty's scrollback replay contract
  (`pty.ts:91-94`) — a reattach must still replay; `killAllPty` on shutdown;
  the phone key bar's keys and order (PRD `:129-130`).

### Unknowns

- A relative `file:line` printed after the shell `cd`s elsewhere resolves
  against the session cwd and will miss; the pty's live cwd is not tracked
  anywhere. Cheap to test? yes; reversible? yes (resolve, and if `/fs/read`
  404s, do nothing).
- Whether `kill` should also apply on session delete/fork (today nothing
  reaps a session's pty until the sidecar exits). Cheap? yes; reversible? yes.
- The exact `@xterm/addon-search` version compatible with `@xterm/xterm@6.0.0`
  — not resolvable offline in this worktree (no `node_modules`). Cheap to
  test? yes (one `pnpm add`); reversible? yes.
- Whether Send to chat should send the selection or the whole last command's
  output (Codex sends the selection). Product call.

---

## Item 9 — Browser: screenshot + console to chat, dev-server default

### Inventory

- `panes/browser/BrowserPane.tsx:88-100` — the pane's hand-written
  `WebviewElement` interface (the pane cannot import `electron`,
  `ARCHITECTURE.md` §Invariants "the renderer runs in a browser"); it lists
  `getURL/getTitle/loadURL/reload/stop/goBack/goForward/canGoBack/canGoForward/executeJavaScript`.
- `:205-230` — the events wired today: `dom-ready`, `did-start-loading`,
  `did-stop-loading`, `did-navigate`, `did-navigate-in-page`,
  `page-title-updated`, `did-fail-load`. **`console-message` is not wired**
  (`grep -c "console-message"` over `ui/desktop/src` → `0`).
- Electron 43.4.0 (`ui/desktop/package.json:163`,
  `ui/node_modules/electron/package.json`): `WebviewTag.capturePage(rect?):
  Promise<NativeImage>` at `electron.d.ts:19994`; `console-message` listener
  at `:19811-19812` with `ConsoleMessageEvent{level:number, message, line,
  sourceId}` at `:21007-21022`; `NativeImage.toDataURL()` at `:9962`. Both
  halves are available to the renderer through the tag.
- `:280-295` — `onShare()` reads the title, pulls `document.body.innerText`
  through `executeJavaScript`, and dispatches
  `AppEvents.INSERT_INPUT_TEXT` with `sharedPage(title, url, text)`
  (`browser-state.ts:216`). The Share control is one button
  (`:410-419`, `data-testid="browser-share"`).
- **There is no image seam into the chat.** `INSERT_INPUT_TEXT` inserts a
  string at the caret (`ChatInput.tsx:783-792`). Images reach a message only
  through `pastedImages` (`ChatInput.tsx:250`, built in `handlePaste` from
  `clipboardData.files`, `:918-1018`, compressed to a data URL and turned into
  `ImageData` at `:851`). A screenshot therefore needs a new event from
  cluster `chat-panes` — the call this item expects is
  `AppEvents.INSERT_INPUT_IMAGE` with `detail: {dataUrl: string, name: string}`,
  handled beside `handleInsertInputText` and pushed into `pastedImages`.
- `PARTITION = 'persist:workspace-browser'` (`:86`), `HAS_WEBVIEW` by user
  agent (`:81`), the iframe fallback for the web build (`:465-472`) — a
  screenshot is desktop-only; the web build's Share already degrades to
  title+URL with a note (`:420-425`).
- Dev-server default: `DEFAULT_URL = ''` with the comment naming the gap
  (`:75-77`). Per-project state today lives in `localStorage`: the Browser's
  own history (`browser-state.ts:249-262`, keyed by cwd) and the dock/columns
  (`project-storage.ts:5-21`). The sidecar's `/config` answers
  `{GOOSE_WORKING_DIR, GOOSE_VERSION}` unkeyed (`index.ts:88-91`) and is the
  one open route. The sidecar has **no yaml dependency**
  (`ui/sidecar/package.json` dependencies: `chokidar`, `node-pty`, `ws`);
  `yaml` is a desktop dependency used by `main.ts:53`.
- Goose reads no project config (§The surprise).

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A — Share ▸ Page · Screenshot · Console (a `DropdownMenu` on the existing button), `capturePage().toDataURL()` → `INSERT_INPUT_IMAGE`, a ring buffer of `console-message` events → a fenced text block; dev-server default in `localStorage` per cwd (`project-storage.ts`), set from a "Set as default" item in the same menu | no new file format, no new route, no dependency; `project-storage.ts`'s second use | the default does not travel to a fresh clone or to the phone; a teammate gets nothing |
| B — the sidecar reads `<cwd>/.goose/workspace.json` and adds `dev_server` to `/config` | the default is in the repo and reaches the phone's web build; JSON needs no dependency | a new file convention this fork invents, in a directory that today means "recipes and agents"; `/config` is unkeyed, so the dev-server URL leaks to anything on the tailnet that can reach the port |
| C — the sidecar reads `package.json` scripts and guesses the port from a `dev` script | zero configuration | guessing (`vite` 5173, `next` 3000, `webpack` 8080…) is wrong often enough to be worse than empty; no evidence of a stable rule |

Pick: **A**, with B named as the follow-up once a second consumer (the phone,
or a shared team default) exists — that is exactly the "second concrete use"
rule. The menu item that sets it reads **"Use as this project's default"**,
and the empty state's line changes from "No dev server listed — enter a URL"
(`:57`) to the same words plus the action.

Console: buffer the last 200 `console-message` events per pane in
`browser-state.ts` (pure, testable), keep only `level ≥ 2`
(warning/error) by default with a "with logs" toggle, and share as
```` ```text\n[error] message (sourceId:line)\n… ```` ```` — the same
push-only shape as `sharedPage` (`browser-state.ts:216`; AGENTS.md: sources
are data, and the page's console is a source).

### UX test plan

Setup: the walk serves a fixture page (the e2e harness already runs a local
page for `browser-pane.spec.ts`) that logs one `console.error("boom")` on
load.

1. Open Browser, navigate to the fixture; assert
   `[data-testid="browser-frame"]` and `browser-pane[data-state="ready"]`.
2. Click `[data-testid="browser-share"]` → `[data-testid="browser-share-menu"]`
   open with `browser-share-page`, `browser-share-screenshot`,
   `browser-share-console`, and `browser-share-default`.
3. Click `browser-share-page` → chat input contains the title and the URL
   (today's behaviour, now behind the menu — the regression guard).
4. Click `browser-share-screenshot` → within 10 s
   `[data-testid="chat-input-image"]` (chat-panes' testid) exists and its
   `src` starts `data:image/png;base64,`; the input's text is unchanged.
5. Click `browser-share-console` → the chat input contains `[error] boom` and
   the fixture's source path.
6. Empty console: navigate to a page that logs nothing →
   `browser-share-console` is disabled with the title "Nothing in the console".
7. `browser-share-default` → reload the app, open Browser → the address bar
   is prefilled with the fixture URL and `browser-pane[data-default="set"]`.
8. Web build (`web-build.spec.ts`): the menu shows Page only; Screenshot and
   Console are absent and `[data-testid="browser-share-note"]` reads the
   existing "Share sends the address only from here".

States: empty → "No dev server listed — enter a URL" plus **Use as this
project's default** once a URL is loaded; loading → the existing Stop
affordance (`stopping`, `:426`); partial → a page that loaded with console
errors shows the count on the Share button
(`browser-share[data-console-count]`), the page itself live; error → the
existing `did-fail-load` line "{cause} — Refresh to try again" (`:64-67`);
running — a capture in flight disables the menu item in place with
"Capturing…"; unavailable → the web build (no webview): the two items are not
rendered, with the note.

Keyboard: the Share button opens the menu on Enter/Space; ↑↓ move, Enter
picks, Esc closes and returns focus to the button (Radix DropdownMenu gives
all of this — the same component the Work column's tab menu uses).

Phone: the menu is the same, minus Screenshot and Console (web build); a
loopback URL still shows the existing "not reachable from here" line
(`:441`), so the dev-server default is desktop-only by nature — assert the
phone spec still shows `browser-unreachable` for a `localhost` default.

Human only: that the screenshot is the visible page and not a blank frame on
a hardware-accelerated page; that the pasted image renders in the chat at a
useful size; whether a console dump is more useful with or without
`verbose`/`info` levels.

### Scope

- in: `panes/browser/BrowserPane.tsx` (the `WebviewElement` interface gains
  `capturePage`, the `console-message` listener, the Share menu),
  `browser-state.ts` (console buffer + formatter + the per-cwd default, pure,
  with tests), `workspace/project-storage.ts` (the default's key),
  `constants/events.ts` + `components/ChatInput.tsx` (the image event — owned
  by cluster chat-panes; this item consumes it),
  `tests/e2e/browser-pane.spec.ts`, `DESIGN.md` §Vocabulary (the browser
  toolbar row gains Share ▸).
- out: the sidecar `/config` change (option B) until a second consumer;
  reading `package.json` scripts; recording a video; a devtools panel;
  proxying `http://` for the phone (out by scope, task 31's note).
- protected: `crates/**`; the webview's `persist:workspace-browser` partition
  (`:86`) and `main.ts:1478-1484`'s sandboxed guest preferences — a screenshot
  must not need node integration; the push-only rule (the page reaches the
  chat only on a user click); `src/workspace` still never imports `electron`.

### Unknowns

- Whether `capturePage` works on a `<webview>` whose guest is not focused, and
  what it returns for a page taller than the frame (Electron captures the
  visible rect). Cheap to test? yes; reversible? yes.
- The image seam's exact shape is cluster chat-panes'; if it lands as a file
  path instead of a data URL, the screenshot must be written through
  `/fs/write` first. Cheap? yes; reversible? yes.
- Whether the console buffer should survive a pane unmount (the guest's
  history does not — task 56's hand check). Cheap? yes; reversible? yes.
- Whether the user wants the dev-server default in the repo (option B) rather
  than per machine. User's call.

---

## Item 10 — Changes: file-level actions, ask, jump, tab counts

### Inventory

- `DiffPane.tsx:754-788` — the file list: one `<button data-testid="diff-file"
  data-path=…>` per entry with the kind letter (`KIND_LETTERS`, `:113`) and
  `+added −removed`. **No hover actions.**
- `:496-500` `stageFile()` — a file-level Stage already exists, but only for
  the entries the chunk synthesizer cannot express (`fileLevel = binary ||
  renamed`, `:495`), rendered in the file's header bar (`:803-822`,
  `data-testid="diff-file-stage"`). Generalising it to every row is a move,
  not a new mechanism.
- `:445-461` `send()` — the one gate for `/git/apply` and `/git/stage`: sets
  `applying`, clears the action error, refreshes on success, puts git's stderr
  in `diff-action-error` (`:791-798`) on failure.
- `:464-483` — the chunk controls: `mergeControls` is CodeMirror's **function
  form**, called once per chunk to build a button (`:278-300`), with the chunk
  recovered from the click position via `getChunks(editor.state)` and
  `posAtDOM` (`:291-296`). Two more buttons ride the same factory — this is
  where "Ask about this" and "Open in Editor" belong.
- The hunk's first line is `editor.state.doc.lineAt(chunk.fromB).number`
  (`Chunk.fromB`, `@codemirror/merge` `dist/index.d.ts:115`; the pane already
  uses `fromB`/`endB` at `:293-294`).
- `chunk-patch.ts:1-8` — `chunkPatch({path, kind, old, new, chunk})` already
  renders a chunk as a unified patch; "Ask about this" can reuse it verbatim
  for the fenced block it inserts, so no second renderer.
- `pane-context.ts:22` — `openFile(path, line?)` exists and
  `EditorPane.tsx:234-254` already scrolls and places the cursor for
  task 70's `file:line` links; the Changes pane's "Open in Editor" is its
  second caller. `DiffPane.tsx:357` already holds `usePaneContext()` and can
  destructure `openFile` there.
- Undo for a file-level Reject: the same `/git/apply` reverse shape; a
  **whole-file** reject needs the file's full patch, which `parseUnifiedDiff`
  does not keep as text (it keeps the two rebuilt sides, `unified-diff.ts:9-18`).
  Either synthesize one chunk spanning the file (chunk-patch with
  `fromB=0,toB=doc.length`) or re-fetch `/git/diff {path}` for the raw text —
  the former needs no route call.
- The tab label: `WorkspaceShell.tsx:152-164` `PANE_TITLES` is a static
  message map; `:1040-1042` builds `chrome` **fresh on every render** from it
  and `PANE_ICONS`; `WorkColumn.tsx:55-58` `PaneChrome{title, Icon}` and
  `:332-336` render `title` plus the unseen dot. A count therefore needs
  `badge?: string` on `PaneChrome` and one line in the shell — **no
  `pane-store` change** (that file is pure layout, and the dot's `unseen` set
  is a boolean, not a number).

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A — row hover Stage · Discard (through `send()`), two more buttons from the existing `mergeControls` factory, `badge` on `PaneChrome` fed by the shared `gitStatus` | every piece is a second use of a landed mechanism; one render path for chunk and file actions | the file list rows get four controls at ~28 px row height; hover-only controls need a keyboard path |
| B — a per-row `DropdownMenu` (⋯ on the row) | room for more verbs later | one more click for the two verbs people actually use; the Changes pane is the dense surface where DESIGN asks for compact controls |
| C — `unseen`-style count in `pane-store` | the store already owns per-pane badge-ish state | `pane-store.ts` is "pure state, no React, no ACP" layout (`:1-2`); a git count there is a category error and drags the store into polling |

Pick: **A** — row hover controls with a `focus-visible` fallback (the tab's ×
does exactly this: `WorkColumn.tsx:390-399` `opacity-0 group-hover:opacity-100
focus-visible:opacity-100`), and `badge` on `PaneChrome`.

Discard on a file = the same `POST /git/discard {paths}` route item 4
introduces (stash-backed, Undo-able) — one route, two callers, which is what
makes it worth adding.

The tab reads `Changes 3` (the count of changed files, from the shared
`gitStatus`), with the label unchanged when the tree is clean; the count is
text beside the title, never colour alone.

### UX test plan

Setup: the `diff-pane.spec.ts` scratch repo (two files modified, one with two
separated chunks) — that walk already exists and this extends it.

1. Open Changes; assert `[data-testid="workspace-pane-button-diff"]` contains
   the text `Changes` **and** `[data-testid="workspace-pane-badge-diff"]` with
   text `3`.
2. Hover the `notes.md` row → `[data-testid="diff-file-stage"]` and
   `[data-testid="diff-file-discard"]` visible on that row; Tab to the row →
   the same two are visible (focus-visible path).
3. Click the row's Stage → within 10 s `git diff --cached --name-only` prints
   `notes.md`, the row leaves the Unstaged list, and the tab badge reads `2`.
4. Click another row's Discard → the row leaves, `git status --porcelain` no
   longer lists it, and `[data-testid="diff-undo"]` is visible; click Undo →
   the row is back and the file's content matches the pre-discard bytes.
5. Select `hunks.md`; assert each chunk's control row carries
   `diff-chunk-reject`, `diff-chunk-stage`, `[data-testid="diff-hunk-ask"]`
   and `[data-testid="diff-hunk-open"]`.
6. Click `diff-hunk-open` on the second chunk → `[data-testid="editor-pane"]`
   with `editor-file` ending `hunks.md`, and the editor's cursor line is the
   chunk's first line (9 in the fixture).
7. Click `diff-hunk-ask` on the first chunk → `[data-testid="chat-input"]`
   contains ` ```diff ` and the chunk's `@@` header and `+L2`.
8. Running gate: with a tool call in flight, the two row controls and the two
   new hunk buttons are disabled and `[data-testid="diff-blocked"]` shows the
   reason (the existing gate, `DiffPane.tsx:438-443`, now covering four more
   controls).

States: the pane already declares `DIFF_PANE_STATES` (`diff-store.ts:22-31`)
— empty stays "No changes vs {base}"; loading keeps the last list on screen
(`:395-414`); partial is a binary file (the existing `:801-822` bar) where the
row still offers Stage and Discard but no hunk buttons; running disables in
place with the reason; error is git's stderr in `diff-action-error` with the
list kept; the tab badge is absent in empty and unchanged during loading.

Keyboard: the file list is a list of buttons — Tab reaches the row, then its
Stage and Discard; the hunk buttons are real `<button>`s inside the editor
(CodeMirror widgets), so ⇥ from the file list reaches them in document order;
Enter activates. Nothing new is bound to a modifier, so ⌘F (item 7) and ⌘1/2/3
are untouched.

Phone: the file list is the same at phone width and hover does not exist —
the two row controls are **always visible** below `PHONE_MAX_WIDTH_PX`
(`pane-store.ts:31`); assert `diff-file-stage` is visible without hover in the
phone project.

Human only: whether four controls per row read as dense-but-fine or as noise
in Charcoal Monokai; whether Discard on a file with unsaved Editor buffer
should warn (the Editor keeps its own buffer, `EditorPane.tsx`); whether the
badge belongs on the tab or only in the pane header.

### Scope

- in: `panes/diff/DiffPane.tsx` (row controls, two more chunk buttons, the
  file-level discard), `chunk-patch.ts` (a whole-file range helper + test),
  `diff-store.ts` (nothing, unless the file-level Undo needs its own slot),
  `WorkColumn.tsx` (`badge` on `PaneChrome`, rendered beside the title),
  `WorkspaceShell.tsx` (fill `badge` from the shared `gitStatus`),
  `tests/e2e/diff-pane.spec.ts`, `DESIGN.md` §Vocabulary (the tab's count).
- out: a three-way index view; per-hunk Undo history beyond the last apply
  (task 50's decision); staging a directory; the Review pane's links (task 70,
  already landed).
- protected: `crates/**`; `pane-store.ts` stays layout-only; the `readOnly`
  editor and CodeMirror's own accept/reject stay unused
  (`DiffPane.tsx:276-278`); `/git/apply`'s all-or-nothing behaviour and the
  running gate; the Changes pane's id stays `diff` (DESIGN §Vocabulary).

### Unknowns

- Whether "Ask about this" should send the patch or a plain-English pointer
  (`path:line-range`) — the patch is precise but long; a 400-line chunk in the
  input is unpleasant. Cheap to test? yes; reversible? yes. Product call.
- Whether the badge counts files or hunks. Cheap? yes; reversible? yes.
- A whole-file reject synthesized as one chunk is untested against a file
  with no trailing newline (`unified-diff.ts:43-48` folds the marker). Cheap
  to test? yes (one fixture); reversible? yes.
- Whether the badge should also appear on the phone's tab rail (nine icons
  already, task 70's note). Cheap? yes; reversible? yes.

---

## Item 12 — Markdown: edit toggle + TOC

### Inventory

- `panes/markdown/MarkdownPane.tsx:48-91` — the pane renders
  `usePaneContext().file` read through `/fs/read` and re-read on every
  `/fs/watch` event (`:74-85`); `markdown-state.ts` holds the docs by absolute
  path with `paneState(doc)` reporting `empty|loading|partial|error|ready`
  (`markdown-state.ts`, used at `:55`). The header is the path alone
  (`:102-110`).
- `MarkdownView.tsx:13-32` — one `ReactMarkdown` with `remarkGfm` and a custom
  `a` component; the Editor's Preview and the Artifact pane compose the same
  view (`:1-2`).
- `react-markdown@10.1.0` (`ui/node_modules/react-markdown/package.json`) —
  `ExtraProps` gives every component `node?: Element`
  (`lib/index.d.ts:59-68`), and a hast `Element` carries `position.start.line`.
  So `components: {h1..h6}` can emit `id={slug}` and `data-line={line}`
  without any rehype plugin. `rehype-slug` and `rehype-autolink-headings` are
  **not installed** (`ui/pnpm-lock.yaml` has `rehype-katex` only,
  `ui/desktop/package.json:110`) — a six-line slug function avoids the ask.
- `pane-context.ts:22` `openFile(path, line?)`; `WorkspaceShell.tsx:797-804`
  sets the file and the line and opens the **Editor** pane. So "Edit" is
  `openFile(doc.path, lineOfTopHeading)` — one call, already wired end to end
  (`EditorPane.tsx:234-254` does the scroll).
- Scroll position across the two renderings is **not** knowable (different
  documents, different layout). The heading is: the topmost heading whose
  `offsetTop >= scrollTop` in the rendered view carries the source line.
- The Editor's own Preview (`EditorPane.tsx`, `showSource` at `:242-254`)
  already renders markdown, so "Edit" is a pane hop, not a mode inside this
  pane — and the reverse hop ("Preview") already exists there.

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A — Edit → `openFile(path, line)` at the topmost visible heading's source line; TOC from a pure `headings(text)` pass in `markdown-state.ts` (skipping fenced blocks), rendered as a collapsible list in the pane header; heading `id`+`data-line` via `components.h1..h6` | zero dependencies; one unit-testable pure function; the Editor keeps being the only editor (One Dock Rule friendly) | the TOC's line numbers come from a hand-rolled scan, which must agree with what remark rendered |
| B — TOC from the rendered DOM (`querySelectorAll('h1,h2,…')` after render) | always agrees with what is on screen | needs a ref + an effect + a mutation observer; nothing to unit test; fails while loading |
| C — an inline editor inside the Markdown pane | no pane hop | a second editor in the tree (the Editor pane exists, `EditorPane.tsx`), two buffers over one file, and a ⌘S the pane does not own — "less wins" says no |

Pick: **A**. The slug is lowercase, non-alphanumerics to `-`, deduped by a
counter — the GitHub rule, written once in `markdown-state.ts` and tested.
The heading index uses the same pure pass, so the TOC and the rendered
anchors cannot drift (option B's guarantee, without the DOM).

### UX test plan

Setup: the scratch repo with a `README.md` of three `##` headings, one `###`,
one fenced block containing a line that looks like a heading, and 200 lines of
filler so the pane scrolls.

1. Pick `README.md` in Files → `[data-testid="markdown-pane"]`
   `data-state="ready"`.
2. Assert `[data-testid="markdown-toc"]` lists exactly 4 entries
   (`markdown-toc-item`), in document order, with `data-level` 2,2,3,2 — the
   fenced pseudo-heading is **not** among them.
3. Click the third TOC entry → the rendered view scrolls so that
   `#<slug>` is at the top (assert the heading element's
   `getBoundingClientRect().top` is within 40 px of the scroller's top).
4. Click `[data-testid="markdown-edit"]` → `[data-testid="editor-pane"]`
   visible, `editor-file` ends `README.md`, and the editor's cursor line is
   the source line of that third heading (assert against the fixture's known
   line number).
5. Scroll the markdown view back to the top, click Edit again → the cursor is
   on line 1.
6. Non-markdown: pick a `.rs` file → the existing
   `[data-testid="markdown-not-markdown"]` bar shows, the TOC is absent, and
   Edit is still offered (it opens the file in the Editor).
7. Empty: with no file picked → "Nothing open — pick a file in Files"
   (`:99`), no TOC, no Edit.
8. The pane follows disk: append a `## New` heading through `/fs/write` from
   the walk → within 5 s the TOC has 5 entries (the existing watch,
   `:74-85`).

States: empty → the existing "Nothing open — pick a file in Files", the
starting action being the Files tab; loading → the existing "Loading…" with
the header kept; partial → the "Not markdown — shown as text" bar over raw
text (`:135-143`), TOC hidden; error → the read error with Retry
(`:117-133`), unchanged; ready → TOC + Edit.

Keyboard: Tab reaches the TOC disclosure, then its entries (real buttons),
then Edit; Enter on an entry scrolls; Enter on Edit hops to the Editor and
focus lands in the editor (`EditorPane`'s own behaviour). No new modifier is
bound — ⌘S stays the Editor's save (PRD `:61`).

Phone: the pane is one of the rail's tabs; the TOC is collapsed by default
(a `<details>`-shaped disclosure reading "Contents (4)"), and Edit switches
the rail to the Editor (`store.openPane('editor')` → `show` at phone width,
`pane-store.ts:192`). Assert `markdown-toc[data-open="false"]` at 375 px and
that Edit leaves `workspace-tab-editor[aria-pressed="true"]`.

Human only: whether landing the cursor on the heading rather than the exact
paragraph feels like "the same place"; whether the TOC belongs in the header
or a left gutter at desktop width; how a document with a single `#` title
reads (a one-entry TOC may be noise).

### Scope

- in: `panes/markdown/MarkdownPane.tsx` (header gains the TOC disclosure and
  Edit), `markdown-state.ts` (`headings(text)`, `slug(name)`, both pure, with
  tests in the existing `markdown-state.test.ts`), `MarkdownView.tsx`
  (`components.h1..h6` emitting `id` and `data-line`; the Editor's Preview and
  the Artifact pane inherit the anchors, which is the second use),
  `tests/e2e/markdown-pane.spec.ts` (new; there is no markdown walk today —
  `ls tests/e2e` has no `markdown-*.spec.ts`), `DESIGN.md` §Vocabulary
  (Markdown pane row gains Contents · Edit).
- out: editing in place; a table of contents for the Artifact pane's header
  (it composes `MarkdownView` and gets the anchors for free, but the surface
  is task 30's); `rehype-slug`; math/katex anchors.
- protected: `crates/**`; `MarkdownView` stays the one renderer (a second
  markdown renderer is a bug, `:1-2`); the pane stays read-only and keeps
  following disk; the Editor keeps ⌘S and its own buffer.

### Unknowns

- Whether `remark-gfm`'s heading parse and a hand-rolled scan agree on
  setext headings (`Title\n=====`) and on headings inside block quotes —
  untested. Cheap to test? yes (fixtures in the unit test); reversible? yes.
- `node.position` is present in react-markdown 10's `ExtraProps` type but the
  runtime value was not observed this session. Cheap to test? yes; reversible?
  yes (fall back to a line scan by heading text).
- Whether Edit should open the Editor in the other half (`dock('editor',
  'bottom')`) rather than wherever it last showed (`openPane`'s rule,
  `pane-store.ts:191-196`). Cheap? yes; reversible? yes.

---

## Plan skeleton

Tasks in dependency order. Ids assume the next free numbers after 71; the
plan assigns them. `confirm:` commands were run on the untouched tree in this
worktree at `d7d9406f2` and their output is pasted. The worktree has no
`node_modules` (`nodeLinker: hoisted`, deps live in the main checkout), so the
baselines are string-level; the vitest/walk form named beside each runs from
the main checkout when the task lands.

**P0 — `fs.ts` containment guard** (blocks 73; nothing else in the cluster
touches `fs.ts`)
- `requestPath(spawnCwd, body)` in `ui/sidecar/src/fs.ts` mirroring
  `git.ts:99-117`: realpath, inside the spawn cwd's toplevel or a
  `.worktrees/` sibling, else `400`. Applied to `list`, `read`, `write` and
  to every route added later.
- confirm: `grep -c "requestPath" ui/sidecar/src/fs.ts` → `1` or more
  (full form: `cd ui/sidecar && pnpm vitest run src/fs.test.ts`).
  Untouched tree: `grep -c "requestPath" ui/sidecar/src/fs.ts` → `0`, exit 1.
- worker: medium. Waits on: nothing.

**72 — one poll, one source** (blocks 73's tints, 76's badge; shares with 74)
- Widen `WorkspaceShell.tsx:762-783` from `diffHidden` to `isWorkspaceRoute`,
  keep the last `GitStatusResponse` in shell state, keep the dot's baseline
  rule, expose `gitStatus` on `PaneContext`.
- confirm: `grep -c "gitStatus" ui/desktop/src/workspace/pane-context.ts` →
  `1` or more. Untouched tree: `0`, exit 1.
- worker: medium. Waits on: nothing.

**73 — Changes summary bar + Accept all + `/git/discard`** (item 4)
- `/git/diff {numstat}` and `POST /git/discard` (stash-backed, with the
  reverse) in `ui/sidecar/src/git.ts` + `git.test.ts`;
  `ChangesBar.tsx` + `changes-bar.ts`; the `ChangesBarSlot` in
  `components/ChatInput.tsx`; `focusCommit` on `PaneContext` consumed by
  `GitPane.tsx`.
- confirm: `grep -c "POST /git/discard" ui/sidecar/src/git.ts` → `1`
  (full form: `just walk "changes bar"`).
  Untouched tree: `grep -c "POST /git/discard" ui/sidecar/src/git.ts` → `0`,
  exit 1.
- confirm (renderer): `grep -c "changes-bar-accept"
  ui/desktop/src/workspace/ChangesBar.tsx` → `1`. Untouched tree:
  `ugrep: warning: ui/desktop/src/workspace/ChangesBar.tsx: No such file or
  directory`, exit 2.
- worker: high (two surfaces, one new route, an upstream-component seam).
  Waits on: 72; cluster **chat-panes** owns the `ChatInput` seam conventions —
  the slot's shape must be agreed there first.

**74 — Files: filter, context menu, git tints, fs routes** (item 6)
- `POST /fs/rename`, `/fs/delete`, `/fs/mkdir` behind P0's guard; the filter
  in `files-tree.ts` + `FilesPane.tsx`; the controlled-`DropdownMenu` row
  menu; tints from `gitStatus` joined through `/git/worktree/list`'s toplevel;
  ⇧⌘F focuses the filter.
- confirm: `grep -c "POST /fs/rename" ui/sidecar/src/fs.ts` → `1`.
  Untouched tree: `0`, exit 1.
- confirm (renderer): `grep -c "files-filter"
  ui/desktop/src/workspace/panes/files/FilesPane.tsx` → `1` or more
  (full form: `just walk "files pane"`). Untouched tree: `0`, exit 1.
- confirm (tints): `grep -c "data-git=" ui/desktop/src/workspace/panes/files/FilesPane.tsx`
  → `1`. Untouched tree: `0`, exit 1.
- worker: high. Waits on: P0 and 72; the DESIGN §Tokens M/A/?/D mapping is a
  user call that must land in `DESIGN.md` first.

**75 — Terminal: tabs, links, search, send to chat** (item 7)
- `{type:'kill'}` in `ui/sidecar/src/pty.ts`; `terminal-tabs.ts` (pure, with
  a test); the strip, `registerLinkProvider` ×2, `@xterm/addon-search` added
  with `pnpm add` in `ui/desktop`; the shell's dot id test.
- confirm: `grep -c "terminal-tab-new"
  ui/desktop/src/workspace/panes/terminal/TerminalPane.tsx` → `1`
  (full form: `just walk "terminal pane"`). Untouched tree: `0`, exit 1.
- confirm (dependency): `grep -c "addon-search" ui/desktop/package.json` →
  `1`. Untouched tree: `0`, exit 1.
- worker: high. Waits on: nothing in this cluster; the Send-to-chat call is
  `AppEvents.INSERT_INPUT_TEXT`, which exists — no cross-cluster wait.

**76 — Browser: Share ▸ Page · Screenshot · Console, dev-server default**
(item 9)
- `capturePage` on the `WebviewElement` interface, the `console-message`
  listener + buffer in `browser-state.ts`, the Share `DropdownMenu`, the
  per-cwd default through `project-storage.ts`.
- confirm: `grep -c "browser-share-screenshot"
  ui/desktop/src/workspace/panes/browser/BrowserPane.tsx` → `1`
  (full form: `just walk "browser pane"`). Untouched tree: `0`, exit 1.
- worker: medium, **high** if the image seam lands here.
  Waits on: cluster **chat-panes** for `AppEvents.INSERT_INPUT_IMAGE` (the
  screenshot half is blocked until that event exists); the Console and the
  dev-server halves do not wait.

**77 — Changes: file-level actions, ask, jump, tab count** (item 10)
- Row hover Stage · Discard through `send()`; two more buttons from the
  `mergeControls` factory; `badge` on `PaneChrome` filled from `gitStatus`.
- confirm: `grep -c "diff-hunk-ask"
  ui/desktop/src/workspace/panes/diff/DiffPane.tsx` → `1`
  (full form: `just walk "diff pane"`). Untouched tree: `0`, exit 1.
- confirm (badge): `grep -c "badge" ui/desktop/src/workspace/WorkColumn.tsx`
  → `1` or more. Untouched tree: `0`, exit 1.
- worker: medium. Waits on: 72 (the badge's source) and 73 (`/git/discard`
  is shared; the row's Discard is its second caller).

**78 — Markdown: Contents + Edit** (item 12)
- `headings(text)` and `slug(name)` in `markdown-state.ts` (+ tests); the TOC
  disclosure and Edit in `MarkdownPane.tsx`; `components.h1..h6` in
  `MarkdownView.tsx`; a first `tests/e2e/markdown-pane.spec.ts`.
- confirm: `grep -c "markdown-toc"
  ui/desktop/src/workspace/panes/markdown/MarkdownPane.tsx` → `1`
  (full form: `just walk "markdown pane"`). Untouched tree: `0`, exit 1.
- confirm (edit): `grep -c "markdown-edit"
  ui/desktop/src/workspace/panes/markdown/MarkdownPane.tsx` → `1`.
  Untouched tree: `0`, exit 1.
- worker: low. Waits on: nothing.

Order: **P0 ∥ 72** first (disjoint files); then **74** (after P0 and 72) ∥
**75** ∥ **78**; **73** after 72 and the chat-panes seam; **77** after 73;
**76** last, or split so its Console and dev-server halves run beside 75 and
the screenshot half waits on chat-panes.

## Unknowns (cluster-wide)

1. The `fs.ts` guard's reach — new routes only, or the three landed ones too
   (a behaviour change on `/fs/read|write|list`). Cheap to test? yes;
   reversible? yes, but it is landed behaviour. **Security-shaped; user's
   call.**
2. `+40 −12` counting staged changes or not (item 4). Cheap? yes; reversible?
   yes. Product call.
3. A `git stash` entry named "goose discard" appearing in the user's own
   `git stash list` — acceptable or not. User's call.
4. The M/A/?/D → token-role mapping does not exist in DESIGN.md and the
   Monokai orange has no role. User's call, then a DESIGN amendment.
5. Delete in the Files pane: OS trash (needs a main-process IPC), a fork trash
   directory, or in-memory Undo for files only. Cheap? yes; reversible? yes.
6. Whether `/fs/*` should keep resolving absolute paths outside the toplevel
   for a session opened in a subdirectory — nothing in the tree was found to
   depend on it, but the sweep was not exhaustive.
7. The exact `@xterm/addon-search` version for `@xterm/xterm@6.0.0` — not
   resolvable offline here (no `node_modules` in the worktree).
8. Whether closing a terminal tab should kill a long-running job (with
   `{type:'kill'}` it will), and whether a session's ptys should be reaped on
   session delete/fork.
9. A relative `file:line` printed after the shell `cd`s — the pty's live cwd
   is tracked nowhere.
10. `capturePage` behaviour on an unfocused `<webview>` and on a page taller
    than the frame.
11. The image seam's shape (`dataUrl` vs a written file path) is cluster
    chat-panes'; the screenshot half of item 9 is blocked on it.
12. Whether the dev-server default belongs per machine (localStorage) or in
    the repo (a `.goose/workspace.json` the sidecar reads and `/config`
    publishes — which also publishes it to the tailnet unkeyed). User's call.
13. "Ask about this" sending the patch or a `path:line-range` pointer.
14. Whether the Changes badge counts files or hunks, and whether it shows on
    the phone's tab rail.
15. Setext headings and headings inside block quotes in the hand-rolled
    `headings(text)` scan; and whether `node.position` is present at runtime
    in react-markdown 10 (typed, not observed).
16. The cross-column Into motion (a Chat-column bar shrinking into a
    Work-column tab) has no precedent since task 71 retired the rail's shared
    `layoutId` — human verification only.
