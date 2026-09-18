# Chat ↔ panes — research map

Dated 2026-09-18. Question as asked: the UX-parity list's items 1 (panes →
chat: "Add to chat" everywhere), 2 (chat → panes: `file:line` in any message
opens the Editor), 5 (inline edit diffs in the transcript) and 11 (turn-level
undo) — what exists, what is missing, and what each would cost, against the
fork as landed through task 70.

Every `file:line` below was read this session in
`/Users/hoaqbui/github/melody-agent2/.claude/worktrees/agent-aadf7af9ef66f0921`
unless the path says `ui/node_modules` (the main tree's pnpm store, read-only).
Commands were run this session and their untouched-tree output is pasted.

## The surprise (lead finding)

**No structured diff ever reaches the desktop, and the thing that would fix
item 5 is the same primitive item 11 needs — so 5 does not feed 11, 11 feeds
5.** ACP has a `diff` tool-call content variant
(`ui/node_modules/@agentclientprotocol/sdk/dist/schema/types.gen.d.ts:226-232`,
`Diff` `:522-534`) and goose's own fs tools emit it
(`crates/goose/src/acp/fs.rs:183`, `:236`), but it is dropped three independent
times on the way to the renderer: a vendor adapter's Diff is flattened to a
text blob at `crates/goose/src/acp/provider.rs:2080-2088`; goose→client content
is rebuilt from rmcp blocks that have no diff variant at
`crates/goose/src/acp/server/tool_calls/conversion.rs:229-269`; and the client
adapter skips every content item whose `type !== 'content'` at
`ui/desktop/src/acp/adapter/tools.ts:239-243`. The fork's own editing tools
(`developer` `write {path,content}` / `edit {path,before,after}`,
`crates/goose/src/agents/platform_extensions/developer/edit.rs:20-31`) return
one line of prose, not a diff.

The old text therefore has to come from the disk, and a pre-turn snapshot is
the cheapest way to hold it. Verified this session in a scratch repo: a
temp-index `git add -A` + `write-tree` takes a whole-tree snapshot **without
touching the real index**, `git diff T0..T1` yields a patch that includes
files created during the turn, and `git apply --recount -R` of that patch
restores the tracked edits, deletes the created files, and is refused whole
(tree untouched) once a later turn has touched the same file. The sidecar
already has the apply half (`ui/sidecar/src/git.ts:454-464`) — turn undo costs
**one** new route.

## Reframe trail

1. "read the ACP `diff` blocks for item 5" > three drop points, none in fork
   code > "where does old text come from at all?" — the disk, at turn start
2. "turn undo = per-file `git checkout -- path`" > that reverts to HEAD, not to
   the pre-turn state, and cannot delete a created file > "snapshot + reverse
   patch" — and `/git/apply` already exists, so undo is one route away
3. "the depcruiser forbids `src/components` → `src/workspace`" > it does not:
   all seven rules start `from: ^src/(workspace|native|acp)/`
   (`ui/desktop/.dependency-cruiser.cjs:9,21,34,46,57,68,80`) and
   `src/components/board/board-state.ts:12` already imports
   `../../workspace/worktree` > "the real constraint is the Upstream Rule, and
   its crossing is the `SessionChipsSlot` context pattern"
4. "add a `text` renderer to react-markdown for `file:line`" > `Components` is
   keyed by `JSX.IntrinsicElements`
   (`ui/node_modules/react-markdown/lib/index.d.ts:68`), so no text renderer
   exists > "a hand-rolled rehype plugin, like upstream's own
   `rehypePerBlockDirection` (`MarkdownContent.tsx:129-134`)"

## Recorded decisions carried in

- The Upstream Rule (`DESIGN.md:9`) — chat, tool rows and the transcript are
  upstream's, composed not forked. Every item below touches an upstream file by
  **one** slot or handler and keeps its behavior in `src/workspace`.
- Push, never pull (task 56, `BrowserPane.tsx:278-279`) — a pane's content
  reaches the chat only by a click, and lands in the input for the user to read
  before ⌘Enter. Item 1 keeps that rule.
- No confirm on a destructive pane action; Undo in place instead (task 50,
  `DESIGN.md` §Accessibility "Destructive"; `diff-store.ts:49-54`
  `lastApply`/`undoRequest`). Item 11 copies it.
- Sidecar owns git and is the only machine path (`ARCHITECTURE.md:81`,
  `:100-101`); `src/acp` never calls it (`.dependency-cruiser.cjs:34-50`).

---

## 1. Panes → chat: "Add to chat" everywhere

### Inventory

- **The bus exists, text only.** `src/constants/events.ts:15`
  `INSERT_INPUT_TEXT = 'insert-input-text'`, typed
  `CustomEvent<string>` at `src/vite-env.d.ts:61`. The handler is
  `src/components/ChatInput.tsx:781-799`: it ignores inputs failing
  `checkVisibility()` (so only the on-screen session takes it), splices at the
  caret, sets `hasUserTyped`, and focuses the box.
- **One producer today**: `src/workspace/panes/browser/BrowserPane.tsx:280-296`
  (Share with agent) dispatching `sharedPage(title, url, text)` —
  `panes/browser/browser-state.ts:216-222`, capped by `SHARE_TEXT_CAP`. That
  function is the model for a shared quoting helper.
- **Images cannot be handed in at all.** ChatInput's `pastedImages` is private
  state (`:250`, type `PastedImage {id,dataUrl,isLoading,error}` `:72-77`) with
  three private writers: `handlePaste` (`:918-1018`, `clipboardData.files`
  filtered to `image/*`, `compressImageDataUrl`, cap
  `MAX_IMAGES_PER_MESSAGE = 10` at `:91`), the file picker
  (`:1304-1345`), and `useFileDrop` (`src/hooks/useFileDrop.ts:35-60`, which
  calls `window.electron.getPathForFile(file)` — an Electron-only path a pane
  cannot synthesize). No event, prop or context reaches them.
- **A dataUrl is the whole currency.** `convertImagesToImageData`
  (`ChatInput.tsx:850-880`) parses `^data:([^;]+);base64,(.+)$` into
  `{data,mimeType}`; `messageToAcpPromptContent` (`src/acp/prompt.ts:50-57`)
  emits `{type:'image',data,mimeType}`; `goose serve` advertises
  `prompt_capabilities.image(true)` (`crates/goose/src/acp/server.rs:1928-1930`).
- **Browser screenshot is available in the renderer.** Electron 43.4.0
  (`ui/desktop/package.json:163`) types `WebviewTag.capturePage(rect?):
  Promise<NativeImage>` (`ui/node_modules/electron/electron.d.ts:19736` opens
  `interface WebviewTag`, `capturePage` at `:19994`) and
  `NativeImage.toDataURL()` at `:9962` → `data:image/png;base64,…`. The pane
  may not import `electron` (`.dependency-cruiser.cjs:52-63`), but it already
  declares a structural subset interface `WebviewElement`
  (`BrowserPane.tsx:90-101`) — one more method line. `HAS_WEBVIEW`
  (`:81`) is false on the web build, whose Share already degrades with a note
  (`:53`, `:421-424`).
- **Which panes can select text today**
  - Terminal: xterm 6 has `hasSelection()` / `getSelection()` /
    `onSelectionChange` (`ui/node_modules/@xterm/xterm/typings/xterm.d.ts:1162`,
    `:1168`, `:996`) but `TerminalSession`
    (`panes/terminal/terminal-session.ts:29-46`) exposes none — the interface
    grows one method; the `Terminal` instance is private to
    `createTerminalSession` (`:101-109`).
  - Editor: `viewRef` holds the `EditorView`
    (`panes/editor/EditorPane.tsx:115`, `:204-205`) → `view.state.selection`
    and `doc.lineAt()` give both text and the line range.
  - Changes: `ChangeView` builds its views inside an effect with no ref out
    (`panes/diff/DiffPane.tsx:299-316`); `EditorState.readOnly.of(true)`
    (`:262`) does not block selection. A hunk is already resolvable — the
    `mergeControls` factory finds the `Chunk` under a button
    (`:278-299`) and `chunkPatch()` (`panes/diff/chunk-patch.ts:98`) already
    turns one into a patch.
  - Markdown / Artifact / Review: plain DOM under `.markdown-body`
    (`src/workspace/MarkdownView.tsx:19`) → `window.getSelection()`.
  - Files: rows are `<button data-path data-type>`
    (`panes/files/FilesPane.tsx:182-211`); no context menu anywhere in the
    pane. The precedent for adding one is the tab's right-click menu —
    `onContextMenu` + a zero-height `DropdownMenuTrigger` anchor
    (`WorkColumn.tsx:365-372`, `:401-420`), on `@radix-ui/react-dropdown-menu`
    via `components/ui/dropdown-menu.tsx:4`.
- **No new dependency needed** for any of it.

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| **A. one `insertIntoChat({kind,text?,dataUrl?,source})` in `src/workspace/chat-insert.ts` over `INSERT_INPUT_TEXT` + a new `INSERT_INPUT_IMAGE`** | one quoting shape for every pane, testable pure (`quotedBlock()` beside `sharedPage`'s precedent); images get the same one-way push; upstream gains one handler mirroring `:781-799` | a second event name and a second `vite-env.d.ts` row; ChatInput grows ~20 lines |
| B. widen `INSERT_INPUT_TEXT`'s detail to `string \| {text} \| {image}` | one event id | breaks the typed `CustomEvent<string>` contract (`vite-env.d.ts:61`) and every existing dispatcher's type; the handler branches on shape at runtime |
| C. a React context slot (`SessionChipsSlot` shape) handing panes an `insert()` | no globals, typed end to end | panes are mounted outside the chat's provider on the phone (`WorkColumn`/rail); the event already crosses that gap and task 56 proved it |

**Pick: A.**
- `chat-insert.ts` owns the block shape; nothing else does. Shape for a text
  quote, matching `sharedPage`'s two-part head/body: a first line
  `src/workspace/pane-store.ts:42-48` (a bare `path:line` or `path:from-to`,
  so item 2 turns it into a live link), then a fenced block tagged by the
  file's extension holding the selected text.
  Terminal has no path → `Terminal — <cwd>`; Browser text → `sharedPage`'s
  existing head, unchanged.
- Images ride `INSERT_INPUT_IMAGE` with `CustomEvent<string>` (the dataUrl);
  ChatInput's handler mirrors `:781-799`, runs `compressImageDataUrl`, and
  honours `MAX_IMAGES_PER_MESSAGE` with the same error tile it already renders
  (`:956-968`, `:1627-1660`).
- Affordances, one per pane, all labelled **Add to chat** (imperative, sentence
  case — `DESIGN.md` §Vocabulary): Files row right-click menu (WorkColumn's
  menu pattern); Terminal — enabled only while `hasSelection()`, on the pane's
  key bar row at phone width and a right-click menu on desktop; Changes — a
  third `mergeControls` button beside Stage/Reject, disabled by the same
  running gate; Editor and Markdown — a header button enabled while a selection
  exists; Browser — the existing Share button gains a split "Add screenshot"
  entry, disabled with its reason on the web build.

### UX test plan

*Setup*: a git scratch repo with `src/sample.ts` (≥ 20 lines) and one committed
change so Changes has a file; the window at 1400×900; `emptyDock()`; a session
started (the walks' `provisionRoleRepo()` fixture is not needed — nothing here
talks to a runtime).

1. Open Files, right-click `src/sample.ts` → a menu `[data-testid="files-row-menu"]`
   with an item `[data-testid="files-add-to-chat"]` reading "Add to chat".
2. Click it → `[data-testid="chat-input"]` has value containing
   `src/sample.ts` and the box is focused (`document.activeElement`), within
   1 s. Nothing is sent (no new `message-container`).
3. Open the Editor on that file, select lines 3–5 (CodeMirror
   `dispatch({selection})` via the pane's own button path — the walk drags),
   press the header's `[data-testid="editor-add-to-chat"]` → the input now also
   contains `src/sample.ts:3-5` and a fence opening ```` ```ts ````.
4. Open Terminal, `echo hello`, select the output line, press
   `[data-testid="terminal-add-to-chat"]` → input contains `hello`; with no
   selection the button carries `disabled` and a `title` saying why.
5. Open Changes, hover a chunk → `[data-testid="diff-chunk-add"]` beside the
   existing `diff-chunk-stage` / `diff-chunk-reject`; click → the input holds
   that chunk's patch text under `src/sample.ts:<from>-<to>`.
6. Open Browser on `about:blank`-equivalent local page, press
   `[data-testid="browser-add-screenshot"]` → within 5 s an image tile appears
   in the chat card (`[data-testid="chat-input"]`'s sibling preview list holds
   one `img[src^="data:image/png;base64,"]`).

**§Shared component states** (the surface is a control on an existing pane, so
the pane's states stand; the control declares):
empty → no selection: the button is present and `disabled` with its reason in
`title` ("Select text to add it to the chat"); loading → only Browser's
screenshot, ≤ 5 s, the button reads a spinner and stays in place; partial →
Browser on the web build: enabled for the address only, its note reads "Share
sends the address only from here" (existing `browser-share-note`); error →
`capturePage` rejects or the image cap is reached: the cause in the chat card's
existing error tile (`ChatInput.tsx:1641-1647`), the pane unchanged; ready →
the normal enabled button.

**Keyboard**: every affordance is a real `<button>` in tab order; the Files
context menu opens with Shift+F10 / the menu key as radix's
`DropdownMenuTrigger` does in `WorkColumn`. No new global shortcut — ⌘Enter
still sends and Esc still cancels the turn (`DESIGN.md` §Accessibility).

**Phone width**: no right-click. Files' affordance is a long-press on the row
(the same `onContextMenu` radix trigger fires on long-press in Electron; a
touch desktop is already an open hand check from task 71), Terminal's sits on
the existing key bar (`TerminalPane.tsx:145`), Browser's screenshot is
**Unavailable** (no webview) and says so in the row.

**Only a human can verify**: that the quoted block reads well in a real
conversation (line count, truncation point); that a screenshot of a page taller
than the pane captures what the user meant; whether the Files menu's long-press
feels right on a phone.

### Scope — in / out / protected

- in: `src/constants/events.ts`, `src/vite-env.d.ts`,
  `src/components/ChatInput.tsx` (one handler + one dispatcher-free image
  path), new `src/workspace/chat-insert.ts` + test, `panes/files/FilesPane.tsx`,
  `panes/terminal/{TerminalPane.tsx,terminal-session.ts}`,
  `panes/editor/EditorPane.tsx`, `panes/diff/DiffPane.tsx`,
  `panes/markdown/MarkdownPane.tsx`, `panes/browser/BrowserPane.tsx`,
  `tests/e2e/chat-insert.spec.ts`; a `DESIGN.md` §Vocabulary row for **Add to
  chat**.
- out: pulling context automatically (the Push rule); an attachment tray of its
  own (the chat card already has one, `ChatInput.tsx:1623-1700`); dragging a
  file onto the chat (upstream's `useFileDrop` owns that); the Review, Agents,
  Artifact and Git panes (no ask yet — second use rule).
- protected: `agent.rs`, `state_machine/`, every `crates/*` file (nothing here
  is spine); ChatInput's existing paste/drop paths unchanged; the web build's
  Share text stays byte-identical (`browser-state.test.ts`).

### Unknowns

- `capturePage()` on a webview whose pane is parked out of its slot (mounted
  but not shown — the Nothing Lost Rule, `DESIGN.md:12`) may return an empty or
  stale image. Cheap to test? yes (one hand check); reversible? yes.
- Whether a chunk's quote should be the patch text or the `+` side only. Cheap?
  yes; reversible? yes. User's call.
- Long-press as a context-menu trigger on the phone build is untested here
  (task 71 left the same question open for tabs).
- The image cap interaction: a screenshot pushed while 10 images are attached
  shows the existing error tile — acceptable or should the button disable?
  Cheap? yes.

---

## 2. Chat → panes: `file:line` in any message opens the Editor

### Inventory

- **The linker exists, scoped to the Review pane.**
  `panes/review/review-parse.ts:46-48` `FILE_LINE` (a path with a slash or an
  extension, then `:line`, optional `:col` / `-line`, optional wrapping
  backticks, with lookarounds that keep URLs out), `:50` `MARKDOWN_LINK`,
  `:142-170` `fileLinks(item)` returning `{link,text,start,end}` spans in
  order, `:172-175` `resolveLinkPath(path,cwd)` (absolute passthrough, else
  `cwd` + path with `./` stripped).
- **Its consumer**: `panes/review/ReviewPane.tsx:120-145` — a `<button
  data-testid="review-link" data-path data-line>` calling
  `openFile(resolveLinkPath(link.path,cwd), link.line)`.
- **The target**: `pane-context.ts:26` `openFile(path, line?)`, implemented
  `WorkspaceShell.tsx:797-804` (setFile/setLine + `store.openPane('editor')`);
  `EditorPane.tsx:234-254` jumps once per `${file}:${line}` ask, clamps past
  the last line, and centres via `EditorView.scrollIntoView`.
- **Where assistant markdown renders**: `components/MarkdownContent.tsx`, used
  by `GooseMessage.tsx:117` (assistant bubble) and `UserMessage.tsx:333` (user
  bubble), plus ThinkingContent, ToolCallWithResponse, recipes.
- **The renderer's hook points**: ReactMarkdown 10.1.0 (`package.json:105`)
  with `urlTransform` (`:321`, `customUrlTransform` `:255-266`), remark plugins
  `[remarkGfm, remarkBreaks, remarkMath]` (`:322`), rehype plugins
  `[rehypeKatex, rehypePerBlockDirection]` (`:323-333`), and
  `components={{a, code}}` (`:334-352`).
- **Two facts that decide the shape**:
  - `Components` is `{ [Key in keyof JSX.IntrinsicElements]?: … }`
    (`ui/node_modules/react-markdown/lib/index.d.ts:68`) — **there is no `text`
    renderer and no custom tag name**; a link rule must be a plugin producing
    a real element.
  - `customUrlTransform` strips `BLOCKED_PROTOCOLS`
    (`src/utils/urlSecurity.ts:7-16`), which includes `file:` — a `file:` href
    is emptied before the `a` component sees it. An unknown scheme or a
    `data-*` property survives.
  - Upstream already ships a hand-rolled rehype plugin with a locally declared
    `HastNode` shape and no `@types/hast`
    (`MarkdownContent.tsx:59-65`, `:116-134`) — the precedent to copy, and the
    reason no dependency is needed (`unist-util-visit` is present in the store
    but unused here).
- **The boundary**: `.dependency-cruiser.cjs` has **no** `src/components` →
  `src/workspace` rule (all seven rules are `from: ^src/(workspace|native|acp)/`
  — `:9`, `:21`, `:34`, `:46`, `:57`, `:68`, `:80`), and
  `src/components/board/board-state.ts:12` and `board/BoardView.tsx:23` already
  import `../../workspace/*`. The binding constraint is the Upstream Rule, and
  its established crossing is a context defined in the upstream file and
  provided by the shell: `SessionChipsSlot` at `ChatInput.tsx:48`, provided at
  `WorkspaceShell.tsx:1115` (and `NextChat` at `Hub.tsx:58`, `:87`).
- **cwd** is in `pane-context.ts:12` and in `WorkspaceShell`'s scope where the
  transcript is composed (`:1113-1127`).

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| **A. `rehypeFileLinks` plugin + a `FileLinkSlot` context in `MarkdownContent`; the existing `a` component branches on `data-file`** | upstream file changes by one context, one array entry and one `if`; off by default, so Hub and every non-workspace surface render exactly as today; the regex and resolver are reused, not re-written | a context read on every markdown render; the `a` props need one cast to read `data-*` |
| B. plugin only; `MarkdownContent` imports `openFile` from a workspace module singleton | no context | a module singleton for per-session state (cwd, which shell) — the thing `SessionChipsSlot` exists to avoid; upstream file gains a hard workspace dependency |
| C. no plugin: a workspace wrapper around the rendered container that delegates clicks and decorates text nodes in a `useEffect` | upstream file untouched | re-implements the renderer's escaping and re-runs on every stream tick; breaks React's ownership of the DOM it mutates |

**Pick: A.**
- The plugin visits text nodes, skipping `pre` subtrees (fenced code) and `a`
  elements, and **does** linkify inside inline `code` — models write
  `` `src/x.ts:12` `` far more often than bare prose, and the Review pane's
  parser already treats a backticked ref as a link
  (`review-parse.ts:155-166`). It replaces a match with
  `{type:'element', tagName:'a', properties:{'data-file':…, 'data-line':…,
  className:['file-link']}}`.
- `MarkdownContent`'s `a` handler (`:335-350`) gains a first branch: if
  `data-file` is present and the slot is non-null, render a button that calls
  `slot.openFile(resolveLinkPath(path, slot.cwd), line)`; otherwise fall
  through to today's `openExternal`. The slot is `null` outside the workspace,
  so the plugin is not even added there.
- Move `FILE_LINE`, `MARKDOWN_LINK`, `fileLinks`, `resolveLinkPath` and
  `FileLink` to `src/workspace/file-links.ts`; `review-parse.ts` re-exports
  them so `review-parse.test.ts` and `ReviewPane.tsx` are untouched.
- Consequence to state in the plan: the user bubble renders `MarkdownContent`
  too (`UserMessage.tsx:333`), so item 1's `source: path:line` headers become
  live links the moment this lands — a free win, and the reason item 1's header
  should be `path:line`, not prose.

### UX test plan

*Setup*: the scratch repo from item 1; a session whose last assistant message
is seeded through the test overlay (`tests/e2e/test-overlay.ts`) with a body
containing: `` see `src/sample.ts:12` `` in prose, a fenced block containing
`src/sample.ts:12`, a markdown link `[the call](src/sample.ts:5)`, and a URL
`https://example.com/a.ts:3`.

1. Open the transcript → the prose ref renders as
   `[data-testid="chat-file-link"][data-path="src/sample.ts"][data-line="12"]`.
2. The fenced block contains **no** `chat-file-link` (assert count inside
   `pre` is 0) and the URL is still an `<a href^="https://">`.
3. Click the link → the Work column shows the Editor
   (`[data-testid="workspace-pane-editor"]` visible within 1 s),
   `[data-testid="workspace-editor-file"]` reads `src/sample.ts`, and the
   active line is 12 (assert `.cm-activeLine` text equals the file's line 12).
4. Click the markdown-link form → same, line 5, and the link's text still reads
   "the call".
5. Open the Hub route (no workspace shell) and render the same markdown →
   count of `chat-file-link` is 0 and the text is plain (upstream unchanged).

**§Shared component states**: the link is an inline control inside an existing
surface. empty → a message with no ref renders exactly as today (the state to
assert is absence); loading → none (parsing is synchronous, per render);
partial → a ref whose path does not resolve under cwd still renders as a link,
and the Editor's own error state takes it ("Nothing here" + path,
`EditorPane` load error) — the transcript never pre-checks the disk; error →
the Editor's, not the link's; ready → the link is underlined, mono, and carries
a `title` reading "Open <path> at line <n>" (the Review pane's copy,
`ReviewPane.tsx:133`).

**Keyboard**: the link is a `<button>` in tab order inside the bubble; Enter
and Space open it; focus then lands in the Editor's source view (the same jump
effect the Review pane's links already exercise).

**Phone width**: the Editor opens into the tab rail's Editor tab, replacing the
chat (the existing `show()` path, `pane-store.ts:219`); the link's tap target
gets the same min height as the Review pane's.

**Only a human can verify**: whether linkifying inside inline code is right or
noisy in real transcripts; whether a long ref wraps acceptably in the user's
right-aligned bubble; false positives on prose that looks like `word:12`.

### Scope — in / out / protected

- in: new `src/workspace/file-links.ts` (moved code) + its test,
  `src/workspace/rehype-file-links.ts` + test,
  `panes/review/review-parse.ts` (re-export only),
  `src/components/MarkdownContent.tsx` (a context, a conditional plugin entry,
  one branch in `a`), `WorkspaceShell.tsx` (the provider),
  `tests/e2e/chat-links.spec.ts`.
- out: linkifying inside fenced code; opening a `file:line` in an external
  editor (the session menu's Open in ▸ owns that, task 69); `file:line` in tool
  rows' Output pane (second use rule — revisit with item 5); a hover preview of
  the file.
- protected: `urlTransform` and `BLOCKED_PROTOCOLS` unchanged (no new scheme is
  introduced by the pick); `rehypePerBlockDirection` and the KaTeX plugin order
  unchanged; `review-parse.test.ts` passes untouched; Hub and non-workspace
  routes render byte-identically (the slot is null).

### Unknowns

- Whether `data-*` props survive `hast-util-to-jsx-runtime` into the `a`
  component's props object in react-markdown 10.1.0 — read from the typings
  only, not run (no `node_modules` in this worktree). Cheap to test? yes (one
  vitest render); reversible? yes (fallback: a `goose-file:` href, which
  `customUrlTransform` does not block).
- Streaming cost: the plugin runs on every markdown re-render of a streaming
  message (upstream already throttles at
  `GooseMessage.tsx:29-30`, `MAX_STREAMING_MARKDOWN_LENGTH`). Cheap to measure?
  yes; reversible? yes.
- Relative paths when the session's cwd is a subdirectory of the repo while the
  model cites repo-root-relative paths — `resolveLinkPath` will miss. Cheap?
  yes; reversible? yes. Probably needs a second try against the git toplevel.

---

## 5. Inline edit diffs in the transcript

### Inventory

- **The ACP diff variant exists and never arrives** — see §The surprise:
  `types.gen.d.ts:226-232`, `:522-534`; dropped at
  `crates/goose/src/acp/provider.rs:2080-2088`,
  `crates/goose/src/acp/server/tool_calls/conversion.rs:229-269`, and
  `ui/desktop/src/acp/adapter/tools.ts:239-243`.
- **What does arrive for an edit**:
  - `metadata.locations` — `tools.ts:205-207` copies `update.locations` into
    tool-request metadata; server side
    `conversion.rs:308-322` includes them when the tool is not ACP-aware, and
    `extract_tool_locations_from_request` (`:184-212`) gives `developer`
    `write`/`edit` line 1 and `read` its `line` argument.
    Nothing in the renderer reads `locations` today (grep over
    `src/components` and `src/types/message.ts`: only the type).
  - The raw arguments, through `toolRequest.toolCall.value.arguments`
    (`tools.ts:44-49`, rendered by `ToolCallArguments.tsx`).
- **The fork's editing tools** are `write {path,content}` and
  `edit {path,before,after}`
  (`crates/goose/src/agents/platform_extensions/developer/edit.rs:20-31`,
  registered at `developer/mod.rs:111`, `:123`), returning one prose line
  ("Wrote X (N lines)", `edit.rs:92-95`; "Edited X (a lines -> b lines)",
  `:155-158`).
- **Upstream's row has a dead branch**: `ToolCallWithResponse.tsx:605-618`
  switches on a `text_editor` tool with `args.command`; the only `"text_editor"`
  left in the tree is a doc comment (`src/utils/toolIconMapping.tsx:107`), so a
  `write`/`edit` row falls through to the generic label plus "Tool details"
  (`:913-927`) and "Output" (`:1006-1048`).
- **A diff renderer already exists, un-exported**: `ChangeView`
  (`panes/diff/DiffPane.tsx:229-319`) builds `unifiedMergeView` / `MergeView`
  from two strings with `EditorState.readOnly`, `lineNumbers()`,
  `collapseUnchanged {margin:3}` and an optional per-chunk control factory. It
  is a local function in the pane's file, not a module.
  `@codemirror/merge` ^6.12.2 (`package.json:64`) is already a dependency.
- **"Open in Changes" hop**: `diffStore` is module-private
  (`DiffPane.tsx:115`); the store's `select(path)` exists
  (`diff-store.ts:62`, `:106`) but the only cross-module entry is
  `presetDiffBase` over the `liveStores` set (`:74-80`). A `presetDiffPath`
  mirrors it in five lines. Bases are `'head' | 'session'` only (`:35`), so a
  turn's snapshot is **not** a selectable base — the hop lands on the file, not
  on the turn.
- **`/git/diff` takes any rev string**: `ui/sidecar/src/git.ts:311-326` pushes
  `body.base` through unmodified and supports `context` and a `path` filter.
  Verified this session that a tree-to-tree form works:
  ```
  $ git diff --no-color bb4dd449..3a732427 -- t.txt
  diff --git a/t.txt b/t.txt
  index 197dc48..71304f3 100644
  --- a/t.txt
  +++ b/t.txt
  @@ -1,3 +1,3 @@
   a
  -ZZZ
  +TURN
   c
  ```

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| **A. card built from the call's own arguments — `edit` → `before` vs `after`, `write` → the content as an added file — rendered by an extracted `ChangeView`** | no sidecar, no spine, no snapshot: it lands alone; exact for `edit`, which is the common case; the diff on screen is what the model asked for, not what the disk now holds | `write` has no old side (a rewrite of an existing file shows as all-new); a `shell` edit (`sed`, `>`) shows nothing |
| B. card built from item 11's snapshot pair: `/git/diff base=<T0>..<T1> path=<p> context=FULL` | true old/new for **every** writer, shell included; one source for the card and for undo; no route change (`git.ts:311-326` already passes `base` through) | waits on item 11's snapshot route and on both edges firing; a card is empty for a file outside the repo or under `.gitignore`; the diff is "over the whole turn", so two edits to one file collapse into one card |
| C. repair the spine so `ToolCallContent::Diff` survives | the protocol's own answer; helps ACP adapters too | three files across `crates/`, one of them the ACP provider; upstream-issue shaped (AGENTS.md §Contribution Workflow); still silent for `shell` edits |

**Pick: A now, B as the upgrade the same component absorbs.** One
`TurnDiffCard` taking `{path, old, new, kind}`: A fills it from arguments, B
later fills it from the sidecar when a snapshot exists for that turn, with no
change to the card. C is filed as an upstream issue, not built.
- Extract `ChangeView` from `DiffPane.tsx` into
  `panes/diff/ChangeView.tsx` unchanged (same props, same tests) so both the
  pane and the card compose it — the Upstream Rule's spirit applied inside the
  fork.
- The card mounts through a slot: `ToolCallWithResponse` (upstream) gains a
  `ToolCardSlot` context, defined in that file and provided by
  `WorkspaceShell`, consulted before the generic details/output rows. Null
  outside the workspace ⇒ upstream unchanged.
- The card's header carries the path (mono, machine text — `DESIGN.md`
  §Typography) and two actions: **Open in Editor** (`openFile(path, line)`,
  using `metadata.locations[0].line` when present) and **Open in Changes**
  (`presetDiffPath(path)` + `openPane('diff')`).
- Collapsed by default when the change is over ~40 lines; `collapseUnchanged`
  handles the interior.

### UX test plan

*Setup*: the scratch repo; a session seeded through the test overlay with one
assistant message carrying a `developer__edit` tool request
(`{path:'src/sample.ts', before:'const a = 1;', after:'const a = 2;'}`) and its
success response, and a second with `developer__write`.

1. Open the transcript → the edit row shows
   `[data-testid="turn-diff-card"][data-path="src/sample.ts"]` with the
   CodeMirror merge view inside (`.cm-editor` present) and one deletion and one
   insertion line visible.
2. `[data-testid="turn-diff-open-editor"]` → the Editor opens on
   `src/sample.ts` (`workspace-editor-file` reads it) at the call's line.
3. `[data-testid="turn-diff-open-changes"]` → the Changes pane opens
   (`[data-testid="diff-pane"]` visible) and its selected file row
   (`[data-testid="diff-file"][aria-selected="true"]` or `data-selected`) is
   `src/sample.ts`.
4. The `write` row's card carries `data-kind="added"` and shows only `+` lines,
   with a one-line bar reading "Whole file written — no previous version
   recorded".
5. A tool row for `shell` shows **no** card (assert count 0) — the honest gap A
   trades away.
6. Collapse/expand: a card over 40 changed lines starts collapsed
   (`[data-testid="turn-diff-card"][data-collapsed="true"]`) with a summary
   "+N −M"; clicking expands it.

**§Shared component states**: empty → a tool call that edited nothing renders
no card (the row is upstream's, unchanged); loading → while the call is
`in_progress` the card shows the merge view's skeleton height with the row's
existing spinner, never a blank; partial → the `write` case above (the bar
naming what is missing, per the Partial row's "one bar naming what is
missing"); running → the card's two buttons stay enabled (they only navigate);
error → a failed tool call keeps upstream's error output and shows no card;
ready → the merge view.

**Keyboard**: the two actions are buttons in the row's tab order; the merge
view is `readOnly` and focusable for scrolling only; collapse toggles on Enter.

**Phone width**: the card renders at full width with the unified view only
(never split — matching the pane's own default), and the two actions become
icon buttons with `aria-label`s.

**Only a human can verify**: that a long diff inside the transcript does not
make scrolling feel wrong; the Monokai palette inside a bubble against the
bubble's own background; whether "Open in Changes" landing on the file (not the
turn) confuses.

### Scope — in / out / protected

- in: `panes/diff/ChangeView.tsx` (extraction), `panes/diff/DiffPane.tsx`
  (import it), `panes/diff/diff-store.ts` (`presetDiffPath`), new
  `src/workspace/transcript/TurnDiffCard.tsx` + a pure
  `turn-diff.ts` (arguments → `{path,old,new,kind}`) + test,
  `src/components/ToolCallWithResponse.tsx` (one context + one branch),
  `WorkspaceShell.tsx` (the provider),
  `tests/e2e/transcript-diff.spec.ts`; a `DESIGN.md` §Vocabulary row for the
  **diff card**.
- out: making the ACP `diff` variant survive (option C — an upstream issue
  under AGENTS.md §Contribution Workflow, filed with task 33's batch); editing
  from the card (accept/reject lives in Changes, task 50); diffs for `shell`
  writes until B lands; a card in the Agents pane's read-only child transcripts
  (second use rule).
- protected: `crates/goose/src/acp/provider.rs`,
  `crates/goose/src/acp/server/tool_calls/conversion.rs`,
  `src/acp/adapter/tools.ts` — untouched by the pick; `agent.rs`,
  `state_machine/`; `DiffPane.tsx`'s behavior identical after the extraction
  (`diff-pane.spec.ts` and `chunk-patch.test.ts` pass unchanged).

### Unknowns

- Two edits to one file in one assistant message produce two cards; whether
  they should merge is a product call. Cheap? yes; reversible? yes.
- `metadata.locations` for a `developer` edit is always line 1
  (`conversion.rs:210`) — so "Open in Editor" lands at the top, not at the
  hunk. Computing the line from `before`'s offset in the file is cheap but
  needs the file read. Cheap to test? yes; reversible? yes.
- Whether the card should appear for a delegated child's edits shown in the
  Agents pane (read-only transcripts) — unscoped here.
- Non-UTF-8 or very large `content` in a `write` call (the card would render
  megabytes). Needs a cap like `SHARE_TEXT_CAP`. Cheap? yes.

---

## 11. Turn-level undo

### Inventory

- **What a turn touched** comes from the transcript, not from ACP diffs (see
  §The surprise): the assistant messages' tool requests
  (`getToolRequests`, `src/types/message.ts:369-373`) filtered to `developer`
  `write` / `edit` by their `path` argument, plus item 5's card data. Turn
  grouping already exists: `deriveMessageRowContexts` /
  `identifyConsecutiveToolCalls` mark tool-call chains
  (`src/components/messageRowContext.ts:33-45`, `isInToolCallChain`
  `:22`). **But a `shell` write leaves no argument to read** — which is the
  second reason the snapshot, not the message list, must be the source of
  truth.
- **A pre-turn snapshot is free and side-effect-free.** Verified this session
  in a scratch repo (`.../scratchpad/r-chat-panes/snap`):
  ```
  $ GIT_INDEX_FILE=<tmp> git add -A .
  $ GIT_INDEX_FILE=<tmp> git write-tree
  bb4dd4492911f4f7123b3c90d8084207896f6f59
  $ git status --porcelain          # the real index is untouched
   M t.txt
  ?? u.txt
  ```
- **One patch reverses a whole turn, created files included.** After a
  simulated turn (edit `t.txt`, create `n.txt`), a second snapshot `T1` and:
  ```
  $ git diff --no-color --src-prefix=a/ --dst-prefix=b/ T0 T1
  diff --git a/n.txt b/n.txt
  new file mode 100644
  --- /dev/null
  +++ b/n.txt
  @@ -0,0 +1 @@
  +made by the turn
  diff --git a/t.txt b/t.txt
  --- a/t.txt
  +++ b/t.txt
  @@ -1,3 +1,3 @@
   a
  -ZZZ
  +TURN
   c
  $ git apply --recount -R turn.patch ; echo $?
  0
  $ ls           # n.txt is gone, t.txt is back
  t.txt u.txt v.txt
  ```
- **A later turn on the same file makes it refuse, atomically** — no
  bookkeeping needed, git does it:
  ```
  $ printf 'a\nTURN\nLATER\n' > t.txt
  $ git apply --recount -R turn.patch ; echo $?
  error: patch failed: t.txt:1
  error: t.txt: patch does not apply
  1
  $ ls n.txt
  n.txt          # nothing was applied — all-or-nothing
  ```
- **Redo is the same patch forward** — the exact shape the Changes pane already
  keeps: `lastApply` + `undoRequest` flipping `reverse`
  (`panes/diff/diff-store.ts:49-54`, `:63`).
- **Routes that exist**: `POST /git/apply {patch, reverse?, cached?}` →
  `git apply --recount [-R] [--cached] -` at the repo toplevel with the patch
  on stdin, all-or-nothing (`ui/sidecar/src/git.ts:454-464`; renderer pair
  `GitApplyRequest` in `src/native/sidecar.ts`); `POST /git/diff` with a free
  `base` string, `context`, `path` (`git.ts:311-326`); `POST /git/rev-parse`
  (`:327-336`); `POST /fs/write` whole-file, last writer wins
  (`ui/sidecar/src/fs.ts:34-38`). **Route that is new**: a snapshot route
  (temp index `add -A` + `write-tree` → `{tree}`); grep of `git/snapshot` in
  `ui/sidecar/src/git.ts` → `0`.
- **`git restore --source=<tree>` is the tempting alternative and is worse**:
  it clobbers rather than refusing, and it errors for a path the snapshot does
  not contain — i.e. exactly the created files:
  ```
  $ git restore --source=bb4dd449 --worktree -- v.txt
  error: pathspec 'v.txt' did not match any file(s) known to git
  ```
- **Where the control goes**: the user bubble's hover action row —
  `UserMessage.tsx:350-379` already holds the timestamp, Edit
  (`onMessageUpdate` gated, so read-only transcripts get none) and
  `MessageCopyLink`. `GooseMessage`'s copy bar only renders when the message is
  text-only (`GooseMessage.tsx:128-140`), so it is not a home.
- **Who takes the snapshot**: not `src/acp` — `.dependency-cruiser.cjs:34-50`
  forbids `src/acp` → `src/native` both ways. `WorkspaceShell` already holds
  the session snapshot and cwd (`:829-836`) and is where the idle→streaming
  edge is observable.
- **Never `git stash`** — the stash stack is shared with the main checkout and
  other worktrees (this environment's own rule); the temp-index snapshot writes
  no refs and no stash entries.

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| **A. two snapshots per turn (`POST /git/snapshot`, temp-index `write-tree`), undo = `/git/diff base=T0..T1 → /git/apply reverse`** | one new route, everything else reused; covers shell writes, created files and renames alike; the patch is **frozen at turn end**, so a later change makes it refuse instead of clobbering; Redo for free (the same patch forward) | two `add -A` passes per turn (rehashing cost — mitigable by seeding the temp index from `.git/index`); nothing outside the repo or inside `.gitignore` is covered; a turn whose end edge is missed has no `T1` and no undo |
| B. per-file `git restore --source=<T0> --worktree -- <paths>` from the message's tool arguments | no patch synthesis | clobbers a later turn's work silently; cannot delete a created file (probe above); blind to `shell` writes |
| C. remember the pre-text per `write`/`edit` call in the renderer, undo via `/fs/write` | no sidecar change at all | last-writer-wins over a concurrent agent write (`fs.ts:34-38`) — the race becomes a silent clobber; nothing for `shell`; lost on reload |

**Pick: A.**
- Route shape mirroring the existing ones:
  `POST /git/snapshot {cwd}` → `{tree}`; runs
  `git add -A` and `git write-tree` with `GIT_INDEX_FILE` set to a temp path
  under the sidecar's own temp dir, at the repo toplevel (`toplevelOf`, the
  same containment `/git/apply` uses, `git.ts:455-456`), and `400` outside the
  cwd roots exactly as every `/git/*` route does today
  (`ARCHITECTURE.md:81`).
- **Two snapshots, not one**: `T0` on the send/streaming edge and `T1` on the
  streaming→idle edge. A single tree is not enough — verified this session,
  `git diff <T0>` against the working tree neither sees a file created during
  the turn nor keeps the ones untracked in the real index:
  ```
  $ git status --porcelain
   M t.txt
  ?? n.txt
  ?? u.txt
  ?? v.txt
  $ git diff --no-color bb4dd449 --stat      # T0 vs the working tree
   t.txt | 4 ++--
   u.txt | 1 -
   v.txt | 1 -
   3 files changed, 2 insertions(+), 4 deletions(-)
  ```
  `n.txt` (created by the turn) is absent, and `u.txt`/`v.txt` read as
  deletions. Re-taking `T1` at undo time is worse still: the patch would
  absorb whatever the user changed since and reverse-apply cleanly — the
  silent clobber options B and C were rejected for. The patch must be frozen
  at turn end, which is what `T0..T1` gives.
- The renderer keeps `{turnId → {start, end}}` per session in the workspace's
  project storage (`src/workspace/project-storage.ts`) so an app restart keeps
  undo for the current session's turns; both tree objects survive in `.git`
  until gc.
- Undo = `/git/diff {base: "<T0>..<T1>", context: FULL_CONTEXT}` → the turn's
  patch → `/git/apply {patch, reverse:true}`. The `A..B` form passes straight
  through `body.base` (`git.ts:311-326`) and was verified above, so the route
  is unchanged. The bubble keeps that patch and offers **Redo** in place
  (`undoRequest`'s flip), no confirm — task 50's pattern, `DESIGN.md`
  §Accessibility "Destructive".
- Failure is the Error row: git's stderr verbatim ("t.txt: patch does not
  apply") plus the recovery in place — "A later change touched these files.
  Open Changes to review." The button stays; nothing is hidden.
- Only the **last** turn offers Undo by default (a per-turn button on every
  bubble invites exactly the refusals above); older turns show the control
  disabled with the reason. That is a product call worth confirming.

### UX test plan

*Setup*: scratch git repo, one commit, a session in it; the walk drives a real
turn that writes one file and creates another (the existing `provisionRoleRepo`
+ a cheap runtime seat, as `review-pane.spec.ts:19-24` does), or seeds the
transcript through the overlay while performing the same file changes on disk.

1. Before the turn: `[data-testid="turn-undo"]` is absent from every bubble.
2. Send the prompt; when the turn ends, hover the user bubble → `turn-undo`
   appears reading "Undo this turn", beside Edit and Copy.
3. Click it → within 3 s the two files are back (assert via the Changes pane:
   `[data-testid="diff-files"]` no longer lists them) and the button now reads
   "Redo this turn" (`[data-testid="turn-undo"][data-mode="redo"]`).
4. Click Redo → the files are back as the turn left them; the button returns to
   "Undo this turn".
5. Edit one of the files by hand (the Editor, ⌘S), then Undo → the row shows
   `[data-testid="turn-undo-error"]` containing `does not apply`, the files are
   untouched (assert the hand edit survived), and the button stays.
6. An older turn's bubble carries `turn-undo` `disabled` with a `title` naming
   why.

**§Shared component states**: empty → a turn that wrote nothing has no button
(nothing to undo, and the snapshot diff is empty); loading → while the snapshot
or the patch fetch is in flight the button shows a spinner in place and stays
the same width; partial → a session whose cwd is not a repo, or outside the
sidecar's roots: the button is absent and the bubble is unchanged (the Board's
precedent for a refused cwd, `DESIGN.md` §States, task 67); running → while the
agent is writing, the button is disabled with the reason, never hidden (the
same `in_progress` gate the Changes pane's Stage/Reject use,
`DiffPane.tsx` `diff-blocked`); error → git's stderr then the recovery, the
button kept (step 5); ready → "Undo this turn" / "Redo this turn".

**Keyboard**: the button is in the bubble's tab order beside Edit; no global
shortcut (⌘Z belongs to the focused editor). After an undo, focus stays on the
button, which now reads Redo — the state change is announced by its own text.

**Phone width**: the hover row is always visible on touch (the bubble's actions
already are, since hover never fires); the label shortens to "Undo" with the
full text as `aria-label`.

**Only a human can verify**: that undoing a real multi-file turn feels safe;
the rehash cost of `add -A` on a large repo at every turn start; that a
long-running turn's snapshot is taken before the first write and not after.

### Scope — in / out / protected

- in: `ui/sidecar/src/git.ts` (`POST /git/snapshot`) + `git.test.ts` smoke on a
  temp repo, `ui/desktop/src/native/sidecar.ts` (the request/response pair),
  new `src/workspace/transcript/turn-undo.ts` (pure: turn id, the patch
  round-trip, the Redo flip) + test, `src/workspace/project-storage.ts` (the
  per-session map), `src/components/UserMessage.tsx` (one slot in the existing
  action row), `WorkspaceShell.tsx` (snapshot on the turn edge, the provider),
  `tests/e2e/turn-undo.spec.ts`; `DESIGN.md` §Vocabulary rows for **Undo this
  turn** / **Redo this turn** and a §Accessibility "Destructive" amendment.
- out: undoing a single file inside a turn (the whole-turn patch is
  all-or-nothing; per-file slicing is a follow-up); undoing across a commit
  (the patch will refuse); anything outside the repo; undoing a turn's
  non-file effects (a `shell` that hit the network); a confirm dialog.
- protected: `agent.rs`, `state_machine/`, all `crates/*`; `/git/apply`'s body
  shape and atomicity unchanged; the sidecar's cwd containment
  (`ARCHITECTURE.md:81`) applies to the new route unchanged; the real git index
  is never written by a snapshot (the probe above is the check); no stash, ever.

### Unknowns

- Snapshot cost on a large repo: `add -A` into a fresh temp index rehashes
  everything, twice per turn; seeding the temp index by copying `.git/index`
  first makes it incremental. Cheap to measure? yes (one `time` run on this
  repo); reversible? yes.
- When exactly to snapshot: the idle→streaming edge in `WorkspaceShell` can
  fire after the model's first tool call on a fast runtime. Cheap to test?
  yes; reversible? yes. Probably needs `T0` on send, not on the first update.
- `add -A` honours `.gitignore`, so a turn that writes into an ignored path
  (build output, `.env`, a generated lockfile) is outside the snapshot and
  outside undo. Cheap to test? yes; reversible? yes — but the fix (`-f`) would
  pull the whole ignored tree into every snapshot, so probably it stays a
  stated limit.
- The sidecar's `git()` helper takes args and stdin only
  (`ui/sidecar/src/git.ts:12`); `GIT_INDEX_FILE` needs an `env` parameter it
  does not have today — the snapshot task's first edit, and the only change to
  a shared helper in this cluster. Cheap? yes; reversible? yes.
- Whether older turns should offer Undo at all (they mostly refuse). Cheap?
  yes; reversible? yes. **User's call.**
- Tree objects are unreferenced and a `git gc` can prune them mid-session,
  making an old undo fail with "bad object". Cheap to test? yes; reversible?
  yes (write a ref under `refs/goose/snapshots/` instead — but that writes to
  the repo, which the pick avoids).
- A turn in a worktree (`wt/<slug>`) — the snapshot must run at that worktree's
  toplevel, which `toplevelOf` gives, but this is unverified against the
  `.worktrees/` containment rule (task 48).

---

## §Plan skeleton

Order: **2 → 1** (2 makes item 1's `path:line` header a live link, so building
1 first would ship a dead string); **11 → 5B**; **5A** is independent of both
and can run in parallel with 2. Every confirm below was run in this worktree
against the untouched tree; its output is pasted.

1. **`file-links.ts` — move the linker out of the Review pane**
   (`FILE_LINE`, `fileLinks`, `resolveLinkPath`; `review-parse.ts`
   re-exports). `worker: low`. Waits on: nothing.
   `confirm: test -f ui/desktop/src/workspace/file-links.ts && grep -c "from '../../file-links'" ui/desktop/src/workspace/panes/review/review-parse.ts` → `1`
   *(untouched tree: `test -f` exits 1, nothing printed.)*
2. **`rehypeFileLinks` + `FileLinkSlot` — `file:line` in any message**
   (the plugin + its test; `MarkdownContent.tsx` gains the context, the
   conditional plugin entry and the `a` branch; `WorkspaceShell` provides it).
   `worker: medium`. Waits on: task 1 above.
   `confirm: cd ui/desktop && grep -c "FileLinkSlot" src/components/MarkdownContent.tsx` → `2` *(untouched tree: `0`)*
   plus `just walk "chat links"` green.
3. **`chat-insert.ts` + `INSERT_INPUT_IMAGE` — the one insertion path**
   (the pure quoting helper and its test; the ChatInput image handler; the
   `vite-env.d.ts` row). `worker: medium`. Waits on: nothing (but ships after
   2 so the headers are live).
   `confirm: cd ui/desktop && grep -c "INSERT_INPUT_IMAGE" src/constants/events.ts src/components/ChatInput.tsx` → `1` and `1`
   *(untouched tree: `src/constants/events.ts:0`, `src/components/ChatInput.tsx:0`)*
4. **"Add to chat" in the six panes** (Files right-click, Terminal selection +
   the `TerminalSession.getSelection()` method, Editor, Changes chunk button,
   Markdown, Browser screenshot via `WebviewElement.capturePage`).
   `worker: medium`. Waits on: task 3.
   `confirm: cd ui/desktop && grep -c "getSelection" src/workspace/panes/terminal/terminal-session.ts` → `2` *(untouched tree: `0`)*
   and `confirm: cd ui/desktop && grep -c "capturePage" src/workspace/panes/browser/BrowserPane.tsx` → `1` *(untouched tree: `0`)*
   plus `just walk "add to chat"` green.
5. **Extract `ChangeView` + `presetDiffPath`** (no behavior change; the pane
   imports the component, the store gains the module-level preset).
   `worker: low`. Waits on: nothing.
   `confirm: cd ui/desktop && grep -c "presetDiffPath" src/workspace/panes/diff/diff-store.ts` → `1` *(untouched tree: `0`)*
   plus `just walk "diff pane"` green (unchanged behavior).
6. **`TurnDiffCard` + `ToolCardSlot` — inline edit diffs (option A)**
   (`turn-diff.ts` pure mapping from `write`/`edit` arguments + test; the card;
   one context and one branch in `ToolCallWithResponse.tsx`; the two hops).
   `worker: medium`. Waits on: task 5.
   `confirm: cd ui/desktop && grep -c "ToolCardSlot" src/components/ToolCallWithResponse.tsx` → `2` *(untouched tree: `0`)*
   plus `just walk "transcript diff"` green.
7. **`POST /git/snapshot` in the sidecar** (temp-index `add -A` + `write-tree`,
   toplevel containment, the `git.test.ts` smoke asserting the real index is
   untouched). `worker: medium`. Waits on: nothing.
   `confirm: grep -c "git/snapshot" ui/sidecar/src/git.ts` → `1` *(untouched tree: `0`)*
   and `cd ui/sidecar && pnpm vitest run` green.
8. **"Undo this turn" on the user bubble** (both snapshots — `T0` on the
   send/streaming edge, `T1` on streaming→idle — in `WorkspaceShell`, the
   `{turnId → {start,end}}` map in `project-storage.ts`, the pure
   `turn-undo.ts` + test, the slot in `UserMessage.tsx`'s action row, the Error
   and Redo states). `worker: high`. Waits on: task 7.
   `confirm: cd ui/desktop && grep -q "turn-undo" src/components/UserMessage.tsx && echo ok` → `ok` *(untouched tree: nothing printed, exit 1)*
   plus `just walk "turn undo"` green.
9. **Upgrade the diff card to the snapshot source (option B)** — the card takes
   `/git/diff base=<T0>..<T1>` when the turn has a snapshot pair, so `shell`
   and whole-file writes show real old text. `worker: medium`. Waits on: tasks
   6 and 8.
   `confirm: cd ui/desktop && grep -q "snapshot" src/workspace/transcript/turn-diff.ts && echo ok` → `ok` *(untouched tree: the file does not exist, nothing printed, exit 2)*
10. **DESIGN.md amendments** — §Vocabulary rows for **Add to chat**, the
    **diff card**, **Undo this turn** / **Redo this turn**; §Accessibility
    "Destructive" amended for turn undo (no confirm, Redo in place, task 50's
    pattern). `worker: low`. Waits on: tasks 4, 6, 8.
    `confirm: grep -q "Add to chat" DESIGN.md && echo ok` → `ok` *(untouched tree: nothing printed, exit 1)*

**Cross-cluster waits**: none known. The 2026-09-18 UX-parity list is not in
the tree — `grep -rn "parity" tasks.md docs/` returns only
`docs/2026-09-16-parity-plan-v1.md:11`, `tasks.md:67`, `:69`, `:71`, `:82`,
`:95` (the 2026-09-16 plan and tranche 6) — so the numbering above is this
cluster's own and the coordinator owns any dependency on other clusters'
items. The one cross-item coupling inside this cluster is item 2 → item 1's
quoted-block header, and item 11 → item 5's upgrade.

**Baselining note**: this worktree has no `ui/desktop/node_modules`
(`ls -d ui/desktop/node_modules` → `No such file or directory`), so the
vitest, typecheck and Playwright confirms above were **not** run here — only
the `grep`/`test -f` halves were, and their untouched-tree output is pasted.
The implementer runs `just test-light` plus the named walk per task.
