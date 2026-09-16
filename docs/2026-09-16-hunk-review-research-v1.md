# Hunk review in the Changes pane — research map

Dated 2026-09-15 (task 45). Question as asked: accept/reject per hunk in
the Changes pane — applying or reverting a single hunk of the working tree
(`git apply --cached` / `git apply -R` on a hunk patch, or `git checkout
-p`-style), what `@codemirror/merge` exposes for per-chunk accept
(`mergeControls`, `acceptChunk`/`rejectChunk`), the sidecar route shape, and
how "since session start" interacts (a reverted hunk vs a base that is not
HEAD) — against `ui/desktop/src/workspace/panes/diff/*` and
`ui/sidecar/src/git.ts` as landed by task 14.

## The surprise (lead finding)

**There is no git hunk to apply.** The pane fetches every diff at
`context: FULL_CONTEXT` (`DiffPane.tsx:157`, `unified-diff.ts:6`), so git
emits one `@@` per file — verified: a file with changes on lines 2 and 9
gives `2` hunks at `-U2` and one header `@@ -1,10 +1,10 @@` at
`--unified=1000000000` (scratch repo, this session). The "hunks" on screen
are CodeMirror `Chunk`s built from the two rebuilt documents
(`unified-diff.ts:61-64`; `Chunk.build`, `merge/dist/index.d.ts:174`), with
char offsets `fromA/toA/fromB/toB` (`:103-119`), not git's. The reverse path
is therefore *synthesize a unified-diff hunk from a chunk plus the two full
docs* and hand it to `git apply`, not "apply git's hunk N".

A second surprise: `acceptChunk`/`rejectChunk` never consult
`EditorState.readOnly` (`merge/dist/index.js:1653-1690`; the facet is only
"consulted by commands and extensions", `state/dist/index.d.ts:1230-1236`),
so the pane's `readOnly` (`DiffPane.tsx:100-102`) does not protect it:
flipping `mergeControls: true` today would edit an in-memory doc that
nothing writes back.

## Reframe trail

1. "apply git's hunk" > one hunk per file at FULL_CONTEXT > "turn a
   CodeMirror chunk into a patch git accepts"
2. "does `git apply` tolerate a synthesized header?" > `--recount` infers
   counts; `find_pos` searches by offset (`Hunk #1 succeeded at 9 (offset -1
   lines)`, this session) > "what still fails?" — a chunk at line 1 must
   match at the file start (`apply.c` `match_beginning`), and a moved tree
   fails atomically, never half-applies
3. "accept = what?" > Codex's review pane has *stage / unstage / revert* per
   hunk and scopes Unstaged · Staged · Commit · Branch · Last turn, no
   "accept" (https://learn.chatgpt.com/docs/code-review?surface=app,
   2026-09-15) > "is accept a git action or a decoration?" — a decision for
   the user, priced in §Options
4. "since session start" > revert is base-independent (its preimage is the
   `+` side = the working tree); stage is base-dependent (its preimage is
   the base) — verified both ways below

## Inventory — read this session

- `ui/sidecar/src/git.ts:7-16` — `git()` is `execFile('git', args)` with no
  stdin; every route is args-only (`:38-79`). `git apply` takes the patch on
  stdin or a file, so a hunk route needs a stdin-capable helper variant.
- `git.ts:42-57` — `/git/diff` fixes prefixes `a/` `b/` and `--no-ext-diff`;
  a synthesized patch must use the same `--- a/P` `+++ b/P` shape.
- `git.ts:68-75` — `/git/stage` and `/git/unstage` are whole-path; the
  file-level fallbacks for renames/binaries already exist on one side.
- `ui/desktop/src/native/sidecar.ts:52-81` — request/response types mirror
  the routes; `sidecarFetch` posts JSON (`:108-116`). A new route needs its
  pair here.
- `ui/sidecar/src/fs.ts:34-37` — `/fs/write` writes whole content, last
  writer wins; the alternative to a patch route, priced below.
- `unified-diff.ts:43-48`, `:100-102` — `\ No newline at end of file` is
  folded into the rebuilt docs (trailing `\n` stripped); a synthesizer must
  re-emit the marker or `git apply` rejects the last line.
- `unified-diff.ts:135-152` — `kind` is kept but `new file mode`, `deleted
  file mode`, `rename from/to` and `index` lines are dropped; a synthesized
  patch cannot carry mode or rename headers.
- `DiffPane.tsx:43-71` — the session base is `HEAD@{<created_at>}` from
  the reflog; `:141-142` — `baseRev` is that sha or `HEAD`; `:157` — one
  full-context fetch; `:183` — `refresh` bumps `attempt`; no watch, no
  auto-refetch after a write.
- `DiffPane.tsx:94-130` — split view is `MergeView` (`revertControls` off by
  default, `merge/dist/index.d.ts:215`); unified is `unifiedMergeView({
  mergeControls: false })` (`:122`).
- `diff-store.ts:5-14` — `running` already exists in `DIFF_PANE_STATES`;
  `:22-26` — selection is base · view · path, nothing per-chunk.
- `merge/dist/index.d.ts:362` — `mergeControls?: boolean | ((type:
  "reject" | "accept", action) => HTMLElement)` (function form since
  6.11.0, `CHANGELOG.md:39`); installed 6.12.2 (`package.json`, main
  tree's `ui/node_modules/@codemirror/merge`).
- `merge/dist/index.js:1553-1572` — the default buttons call
  `acceptChunk(view, view.posAtDOM(dom))` / `rejectChunk(...)` on
  `mousedown`; the function form receives the same `action` and may ignore
  it.
- `merge/dist/index.js:1653-1671` — `acceptChunk` rewrites the *original*
  (A side) to match the chunk and dispatches `updateOriginalDoc` — on this
  pane that only un-highlights; nothing on disk corresponds to "A".
  `:1674-1690` — `rejectChunk` dispatches `changes` on the editor doc (the
  working-tree side), `userEvent: "revert"`.
- `merge/dist/index.js:1425-1441` — split `revertClicked` copies a chunk
  between editors by dispatching `changes`; same in-memory-only problem.
- `merge/dist/index.d.ts:188-192` — `getChunks(state)` returns the chunks
  and side; `:303` — `MergeView.chunks`; enough to map a button to a
  `Chunk` and a chunk to line ranges via `doc.lineAt`.
- `tasks.md:124-125` — task 16 (Git pane, `doing`) gates Commit while a
  tool call is `in_progress` by subscribing to the chat's tool-call state;
  a hunk action needs the same gate.
- `DESIGN.md:125` — "Destructive: none in V0 (view-only diff, PRD :202)"
  — drift: the PRD's scope line is `:219`, not `:202`;
  `:64` — labels are imperative verbs; `:82` — Error state shows git's
  stderr then the recovery.
- `docs/2026-09-15-workspace-prd-v1.md:63-68` — step 5: default base = vs
  HEAD, second selector "since session start"; `:219` — accept/reject per
  hunk out at V0 "the plan gate needs the pane first" (now landed).
- `ARCHITECTURE.md:81`, `:100-102` — the sidecar is the only process that
  runs git; `native` never does ACP; nothing in the spine is touched.
- https://git-scm.com/docs/git-apply (2026-09-15) — `--cached` "just the
  index, without touching the working tree"; `-R` reverse; `--recount` "do
  not trust the line counts"; `-C<n>` context to match; `--check`;
  atomicity: "fails the whole patch and does not touch the working tree
  when some of the hunks do not apply".
- https://raw.githubusercontent.com/git/git/master/add-patch.c
  (2026-09-15) — `git add -p` is `apply --check` + `apply --cached`;
  `checkout -p` (worktree) is `apply -R`; `reset -p` is `apply -R
  --cached`. The interactive tools are a UI over the same primitive, so
  "`git checkout -p`-style" collapses into the apply option.
- https://raw.githubusercontent.com/git/git/master/apply.c (2026-09-15) —
  `find_pos()` searches backward/forward from the header line; a hunk with
  `oldpos <= 1` must match at the beginning unless `--unidiff-zero`.
- Scratch repo, this session (git 2.55.0): a chunk patch with a bogus
  `@@ -1,0 +1,0 @@` header passes `apply --recount --check -R`;
  `apply --recount --cached` stages one of two chunks (`diff --cached
  --stat` 1/1, `diff --stat` 1/1 remaining); after the file gained a line
  at the top, the mid-file chunk reverts with `offset -1 lines`, the
  top-of-file chunk fails `patch does not apply` and the tree is untouched.
- Scratch repo, base ≠ HEAD: with `b→B` committed after the session-start
  commit, `apply --recount --cached` of that chunk is refused (`while
  searching for: a b c` — the index holds `B`); `apply --recount -R` of the
  same chunk succeeds and `git diff HEAD` then shows `-B +b` — the revert
  is a new uncommitted change.

## Recorded decisions

- View-only diff at V0 — rejected: per-hunk actions until the pane landed
  (PRD `:219`; DESIGN `:125`). Task 14 landed the pane; this research
  reopens the line, and DESIGN `:125` must change with the plan.
- Full-context single fetch — chosen over per-path fetches to keep rename
  pairing (`DiffPane.tsx:150-152`). Consequence: git's hunks are unusable
  as review units; the chunk→patch synthesizer is the price.
- Fixed prefixes, no external diff driver (`git.ts:40-41`) — the same
  reasoning fixes the synthesized patch's header shape.
- Sidecar owns git (`ARCHITECTURE.md:81`) — rejected: any renderer-side
  `node:*` or a spine route for hunks.

## Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A. `POST /git/apply {patch, reverse?, cached?}`; the pane synthesizes the chunk patch (N context lines from its own docs, `--recount`); Reject → `reverse`, Accept → `cached` (stage) | git's atomic check as the race guard ("does not apply", tree untouched); partial-file staging, so review really ends in Commit; one route serves stage / unstage (`-R --cached`) / revert like `add -p`, `reset -p`, `checkout -p`; Codex parity (stage · unstage · revert) | a staged hunk still shows under "vs HEAD" — the pane needs an Unstaged scope (worktree vs index) or a staged marker, which reopens PRD step 5's default base; Accept under "since session start" is refused for hunks committed since (verified) |
| B. Same route, `reverse` only; Accept = CodeMirror `acceptChunk` (un-highlight, no git effect) | the smallest pane change; no new base scope; Reject has the same atomic guard as A | Accept is not durable — Refresh, a base switch or a remount brings the chunk back; no partial staging: Commit stages whole files (`/git/stage`), so "keep half of a file" needs the other half reverted, never parked |
| C. No new route: `rejectChunk` then `/fs/write` of the whole editor doc | zero sidecar work; the editor already holds the post-reject text | last-writer-wins over an agent's concurrent write (`fs.ts:34-37`) — the race the card names becomes a silent clobber; rebuilt docs lose the no-newline marker and non-UTF-8 bytes; cannot revert an added or deleted file |
| D. Sidecar re-diffs at `-U3` and applies git's hunk by index (`/git/apply-hunk {path, base, n}`) | git-native units, no synthesizer, mode/rename headers intact | the units on screen are CodeMirror chunks, so the buttons would not match what is highlighted unless the pane rendered git hunks itself — a second diff renderer beside the merge view (Upstream Rule cost) |

Pick: **A**, with the route landing whole and the pane's Accept semantics
gated by the user (Unknowns 1–2).
- The route is the primitive `git add -p` / `checkout -p` already use
  (add-patch.c) and its atomicity answers the mid-review race by refusal
  rather than clobber — the one property C cannot offer.
- `cached` costs the route nothing; if the user picks B's Accept for the
  pane, the route is unchanged and A is a pane-side follow-up.
- Route shape: body `{ patch: string; reverse?: boolean; cached?: boolean }`
  → runs `git apply --recount [-R] [--cached] -` with the patch on stdin,
  `--check` implied by atomicity (no separate check call); success `{}`,
  failure `500` with git's stderr (the existing `HttpError` shape,
  `git.ts:11`), which the pane shows as its Error state then Refresh. The
  helper gains a stdin parameter; `MAX_BODY_BYTES` (`http.ts:16`) bounds the
  patch. Paths inside the patch are repo-root-relative, as `git diff`
  emits them and `git apply` reads them; identical to the sidecar's cwd
  only when that cwd is the repo root (Unknown 8).
- Pane side: `mergeControls` as a *function* (`index.d.ts:362`) that
  renders the two buttons and calls the sidecar, never CodeMirror's
  `action`; on success `refresh()` refetches (the store keeps base · view ·
  path, `diff-store.ts:22-26`, so the Nothing Lost Rule holds). Split view:
  keep `revertControls` off; hunk actions are unified-only until the split
  view has a reason.
- Synthesizer (pure, testable beside `unified-diff.test.ts`): chunk →
  line ranges via `lineAt`; N = 3 context lines from the same docs (git's
  offset search needs context; `-C` not used); header from the real line
  numbers so a top-of-file chunk matches at the start; re-emit `\ No
  newline at end of file` when a side lacks the trailing `\n`; `--- a/P`
  `+++ b/P`, with the unprefixed `/dev/null` side for `added` / `deleted`
  kinds — the string the parser itself matches (`unified-diff.ts:25`).
- Entries the synthesizer cannot express — `renamed` and `binary` — get
  file-level actions only: stage = existing `/git/stage`; revert = a
  `restore --source=<base> --worktree -- <path>` route (and the rename's
  old path), or nothing at V1 (Unknown 4).
- Running gate: the buttons are disabled with the reason while any tool
  call is `in_progress` (DESIGN `:81` Running row; PRD `:79`; the same
  subscription task 16's Commit uses); `running` is already in
  `DIFF_PANE_STATES`. After every apply `refresh()` hands `ChangeView` a
  new `file` object and remounts CodeMirror (`DiffPane.tsx:127`), so the
  scroll position inside the file is lost per click (Unknown 9).
- Undo: `-R` is undone by applying the same patch forward; the pane can
  keep the last patch string and offer Undo in place of a confirm
  (DESIGN `:125` decision, Unknown 3).

## Scope — in / out / protected

- in: `ui/sidecar/src/git.ts` (stdin-capable helper; `POST /git/apply`;
  optionally `POST /git/restore` for file-level revert), `ui/sidecar/src/
  http.test.ts` or a `git.test.ts` smoke on a temp repo; `ui/desktop/src/
  native/sidecar.ts` (`GitApplyRequest`); `ui/desktop/src/workspace/panes/
  diff/` — a `chunk-patch.ts` synthesizer + test, `DiffPane.tsx`
  (`mergeControls` function, running gate, refetch after apply, Error
  copy), `diff-store.ts` only if an Unstaged scope is added; `ui/desktop/
  tests/e2e/diff-pane.spec.ts` (one walk: reject a chunk, the file's counts
  drop; stage a chunk if A's Accept is picked); `DESIGN.md:125` and PRD
  `:219` amended by the plan.
- out: the split view's `revertControls` (no write-back path, no ask);
  per-chunk actions on renamed/binary entries (headers dropped at
  `unified-diff.ts:143-152`); a three-way HEAD · index · worktree view; any
  `crates/*` or ACP change — the spine sees none of this; `git checkout
  -p` driving (interactive, and the same primitive underneath);
  whole-document writes from the diff pane (C).
- protected: the pane still reaches git only through `src/native/sidecar`
  (`ARCHITECTURE.md:100-101`); `/git/diff` output shape unchanged, the
  parser's tests keep passing; a failed apply leaves the tree untouched
  (git's atomicity — the plan's smoke asserts it against a shifted file);
  hunk buttons obey the same `in_progress` gate as Commit; `readOnly`
  stays and CodeMirror's default `action` is never invoked, so the editor
  doc never diverges from disk.

## Unknowns

1. Accept semantics — stage (A, Codex parity, needs an Unstaged scope or a
   staged marker) or keep-only (B, cosmetic, not durable); reopens PRD step
   5's default base. Cheap to test? yes (either is a day); reversible? yes
   (route unchanged). User's call.
2. Accept under "since session start" — stage is refused for hunks already
   committed since the session base (verified); hide Accept under that base,
   or surface git's stderr as the Error state. Cheap? yes; reversible? yes.
3. Destructive gate — DESIGN `:125` "none in V0" changes; confirm dialog vs
   in-place Undo (forward apply of the kept patch). Cheap? yes;
   reversible? yes. User's call.
4. File-level revert for renamed/binary entries — a `restore` route now, or
   "not offered" at V1. Cheap? yes; reversible? yes.
5. Non-UTF-8 files and CRLF — `git()` returns a UTF-8 string
   (`git.ts:14`), the docs are rebuilt from it, and the patch goes back
   through the same encoding; CRLF survives as line text, other encodings
   probably do not. Cheap to test? yes (one fixture); reversible? yes.
6. Chunk at line 1 after the tree shifted — fails by design
   (`match_beginning`); acceptable as an Error + Refresh, or the pane
   auto-refetches and retries once. Cheap? yes; reversible? yes.
7. Refetch cost after every apply — one full-context diff of the whole
   tree per click (`DiffPane.tsx:157`); fine at repo sizes seen so far,
   probably. Cheap to measure? yes; reversible? yes (path-filtered refetch
   loses rename pairing, `:150-152`).
8. Sidecar cwd below the repo root — patch paths are root-relative while
   `/fs/*` paths resolve against the cwd (`fs.ts:13`); whether any pane
   already assumes cwd = root is unchecked. Cheap to test? yes;
   reversible? yes.
9. Scroll position after an apply — the remount loses it; scroll to the
   next chunk on refetch (`goToNextChunk`, `index.d.ts:195`) or keep the
   view and dispatch `updateOriginalDoc`. Cheap? yes; reversible? yes.
