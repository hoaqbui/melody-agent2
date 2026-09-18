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

Approved 2026-09-18 (user: "can you do those things for me", taking the four waiting-on-you items, the first being the 17 decisions) → moved to `tasks.md` under `### docs/2026-09-18-ux-parity-plan-v1.md` as tranche 7 — 25 tasks, three waves, the order in §Approach. This section keeps only that pointer.

## Decisions this plan needs (the approval gate)

Decided 2026-09-18, on the user's delegation: every recommendation below as written; 17 → **Permissions** for the server's `mode` option (auto · ask · chat), Mode stays Direct · Orchestrate; 6 → the CLT is already at 27.0 (`pkgutil`, 2026-09-18, no update offered by `softwareupdate`) and the failure reproduced (`libsqlx_macros-….dylib`: "mis-aligned LINKEDIT string pool", 2026-09-18); a rebuild of the dylib with the current CLT linker fails the same way (2026-09-18 15:00), so the `RUST SKIPPED` marker landed in the Justfile and a `stable`-channel probe runs; task 77 and every Rust `confirm:` wait on it, recorded in `tasks.md` under 77.


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

The list landed in `tasks.md` as tranche 7 (25 tasks, three waves); wave 1 started 2026-09-18 (eight tasks, disjoint files — 77 gated on decision 6).
