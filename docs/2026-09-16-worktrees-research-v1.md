# Worktree-per-task — research map

Dated 2026-09-16. Question as asked (tasks.md 44): how a Goose session
(or a delegated child) can run in its own git worktree of the project —
creation on session start or on `delegate`, the cwd the adapter and the
sidecar see, the Changes/Git panes against that worktree, merge-back
into the main checkout, cleanup — against the tree as it is and against
how Codex desktop does it. Card: run several agents on the same repo at
once without them stepping on each other's files.

## The surprise (lead finding)

**A delegated child on an ACP runtime never runs where its session
says it does.** `delegate` already takes a `working_dir` parameter and
stores it on the child *session* (`summon.rs:93`, `:1807-1818`, `:720`),
but the child's *provider* is built with `entry.create(extensions)`
(`summon.rs:2023`) → `ProviderDef::from_env` → `current_working_dir()`
= `std::env::current_dir()` of the `goose serve` process
(`provider_registry.rs:77-79`, `providers/base.rs:27-29`,
`claude_acp.rs:56`). That process is spawned in the window's launch
directory (`gooseServe.ts:337`, `:395`; `main.ts:1201-1203`), and the
adapter opens its ACP session there (`acp/provider.rs:1574`
`NewSessionRequest::new(config.work_dir)`). So today a Codex or Claude
worker delegated from a session that moved (DirSwitcher) or that sits
in a worktree edits the *launch* checkout. The parent's own provider is
correct — it is rebuilt with `session.working_dir`
(`agent.rs:3670-3674`, `server_factory.rs:102`). Any worktree design
starts with this one-call fix: `create_with_working_dir(extensions,
effective_working_dir)` (`provider_registry.rs:81-92`), which means
computing `effective_working_dir` before `resolve_rolled_provider`
(`summon.rs:1790-1809`, order swap).

Second surprise: upstream Goose already lists and switches worktrees
(`main.ts:258-297` `git worktree list --porcelain`;
`DirSwitcher.tsx:113`, `:131-150` → `_goose/session/update_working_dir`,
`manage_sessions.rs:4-56`) but closed creation as "not planned"
(#11567, 2026-08-26: "Users can already create worktrees themselves or
ask agent to create it"). The fork owns creation, or nobody does.

## Reframe trail

1. Who owns worktree lifecycle — `goose serve`, the sidecar, or the
   shell? > the spine has no git module (`rg worktree crates/` hits only
   prompts, tests, and `hints/import_files.rs`), the sidecar already
   shells `git` (`git.ts:7-9`), and the shell path (upstream PR #10272's
   Electron IPC) fails the "renderer runs in a browser" invariant
   (ARCHITECTURE.md §Invariants) > **the sidecar creates; ACP only
   points a session at the path.**
2. Session-level or delegate-level? > the card names parallel
   *delegation*, the Codex parity gap names one worktree per *thread*
   (session); `delegate` already carries `working_dir`, confined to the
   parent's directory (`summon.rs:2479-2499`) > **both levels ride one
   in-repo layout** (`<toplevel>/.worktrees/<name>` passes the
   containment check; a `$CODEX_HOME`-style sibling would not).
3. Do the panes follow? > Files and Terminal already send absolute
   paths the sidecar resolves as-is (`files-tree.ts:175`,
   `FilesPane.tsx:91`, `fs.ts:13` `path.resolve(cwd, absolute)` =
   absolute; `index.ts:92` `/pty?cwd=`); only the git routes are pinned
   to the sidecar's spawn cwd (`git.ts:38` `gitRoutes(cwd)`,
   `index.ts:36`, `:43`; `DiffPane.tsx:1-3` says so) > **the Changes
   pane needs one `cwd` field on `/git/*`, nothing else.**
4. Merge-back — Codex's way or git's? > Codex worktrees are detached
   HEAD and return by "hand off to local" / snapshot; this project's own
   orchestrator merges worker *branches* into main (`git log`:
   `a8c430894`, `c5156f381` "Merge branch 'worktree-agent-…'") > a
   branch per worktree, merged by a Changes-pane action, is the
   human-in-the-loop upstream asked for (#3557, wclausen-square).

## Inventory — read this session

- `crates/goose/src/agents/platform_extensions/summon.rs:93`, `:872-875` —
  `working_dir` param and its schema ("Must be within the parent
  session's working directory"); `:1478` async delegates run as
  background tasks (parallel delegation exists); `:1807-1809`
  `effective_working_dir`; `:1812-1818` into `TaskConfig`; `:720` the
  child session is created with it; `:2023` provider built without it
  (the surprise); `:1540-1547` a sync `delegate` returns the child's
  last text plus `_meta.subagent_session_id` — no path, no branch;
  `:2479-2499` `resolve_working_dir` canonicalizes and requires
  `starts_with(parent)`.
- Negative check on the surprise: `subagent_handler.rs:143` hands the
  prebuilt provider to `update_provider`, which stores it as given
  (`agent.rs:3577-3595`; the registry lookup there only normalizes the
  model config); `restore_provider_from_session` is called from
  `gateway/handler.rs:509`, `execution/manager.rs:217` (evicted-session
  restore) and `manage_sessions.rs:45` — none on the child's path.
- `crates/goose/src/providers/provider_registry.rs:77-92`, `:138` — two
  constructors; only `create_with_working_dir` reaches
  `from_env_with_working_dir`. `claude_acp.rs:56`, `:89` — `work_dir`
  becomes the adapter's cwd; `codex_acp.rs` is the same shape.
- `crates/goose/src/acp/server/new_session.rs:44-47`, `:60` —
  `session/new` takes any absolute existing dir (`server.rs:824-836`);
  a host `session_cwd` override exists for roaming
  (`server_factory.rs:22`, `:74-83`). `manage_sessions.rs:4-56` —
  `update_working_dir` rebuilds the provider and extension manager in
  place. `session_manager.rs:64`, `:1023` — one `working_dir` column
  per session; `list_sessions.rs:179` filters by cwd only when asked
  and the desktop asks with `{}` (`ui/desktop/src/acp/sessions.ts:153`),
  so worktree sessions stay listed.
- `ui/sidecar/src/index.ts:36`, `:43`, `:92`, `:104`; `args.ts:29` — one
  cwd from `--cwd`, bound into `fsRoutes`/`gitRoutes` at start;
  `main.ts:1264` passes the window's dir. `git.ts:38-78` — status,
  diff, rev-parse, stage, unstage, commit; no worktree verbs.
- `ui/desktop/src/workspace/WorkspaceShell.tsx:131` — pane cwd =
  `session.working_dir`; `:280` Terminal gets it; `DiffPane.tsx:57`
  "since session start" = `HEAD@{createdAt}` reflog, `:157` diff base.
- `ui/desktop/src/main.ts:258-297`, `preload.ts:184`, `:347` — upstream's
  `list-git-worktree-dirs` IPC (Electron-only; the phone cannot reach it).
- `.gitignore:100` `.claude/worktrees/`; `git worktree list` → 8 entries,
  every agent of this session in `.claude/worktrees/agent-<id>` on
  branch `worktree-agent-<id>`, locked: the in-repo layout is already
  how this repo is worked.
- Local cost, this repo: `git worktree add --detach … HEAD` → `real
  0.64` s, `du -sh` → `349M` (checked-out files, no `node_modules`, no
  `target/`; the main checkout's `target/` is `39G`).
- PRD `docs/2026-09-15-workspace-prd-v1.md:219-221` — worktree-per-task
  out at V0 "Goose sessions share the cwd"; `PRODUCT.md:405` — Should.
- Upstream tracker (`gh`, 2026-09-16): #3557 closed 2026-07-25 (session
  vs subagent granularity debated; "cleanup should be enforced outside
  of LLM control"; "the merge point is a good place for human review");
  #8450 merged the DirSwitcher; #10272 closed (worktree path derived
  from cwd, not `rev-parse --show-toplevel`); #9858 closed; #11567
  closed 2026-08-26 not planned — "Desktop is now the reference client
  and our focus is GDK".
- Codex app docs, https://learn.chatgpt.com/docs/environments/git-worktrees
  (redirect of developers.openai.com/codex/app/worktrees, read
  2026-09-16): worktrees under `$CODEX_HOME/worktrees` (configurable),
  detached HEAD at the chosen branch's HEAD, uncommitted changes applied
  on create, `.worktreeinclude` copies ignored files (`.env`,
  `AGENTS.override.md` automatic), "hand off to local" / "hand back"
  moves a thread between worktree and checkout, keeps the 15 most
  recent managed worktrees, deletes on archive after a snapshot,
  pinned/in-progress/permanent worktrees protected. Commentary
  (verdent.ai guide, read 2026-09-16, secondary): ~0.8 s per create,
  ~120 MB per worktree, `.codex/setup.sh` runs after create; its "never
  auto-delete" claim contradicts the primary doc — primary wins.

## Recorded decisions

- Worktree-per-task out at V0 — the PRD's reason was "sessions share
  the cwd" (`prd-v1.md:220`); this note finds the cwd is already
  per-session and the block is the sidecar's fixed git cwd plus the
  child-provider bug, so the reason no longer holds.
- Sidecar is the only machine-side path for panes; no Electron-only IPC
  for new features (ARCHITECTURE.md §Invariants, "the renderer runs in
  a browser") — rejects the upstream #10272 shape.
- `agent.rs` / `state_machine/` untouched; `summon.rs` is a listed fork
  file (ARCHITECTURE.md §Modules) — the cwd fix lands there.

## Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A. Sidecar-owned, session-level — `/git/worktree/{add,list,remove}` in `git.ts`, path `<toplevel>/.worktrees/<slug>` on branch `wt/<slug>`; a "Use worktree" toggle on new chat → `session/new` cwd = the worktree; git routes take `cwd`; Changes pane gains "Merge into `<main branch>`" (sidecar: `git -C <main> merge --no-ff wt/<slug>`) and "Remove worktree" | Parity with Codex threads; phone and desktop alike; lifecycle and cleanup outside the model; Changes/Terminal/Files follow the session | Children of one session still share its worktree — parallel delegation inside a session is not yet isolated; a Rust worktree rebuilds `target/` unless `CARGO_TARGET_DIR` is shared |
| B. Spine-owned, delegate-level — `summon.rs` runs `git worktree add` per `delegate` (flag or per-role), child cwd = worktree, result meta carries the branch | Isolates exactly the parallel children the card names; no UI needed to start | Git logic enters the spine (the fork's third summon touch grows), creation cost × N children in a large repo (#3557's objection), cleanup falls to the parent session's end, the panes still need A's `cwd` field to show a child's tree |
| C. Orchestrator-driven — no lifecycle code: the role prompt says `git worktree add .worktrees/<task>` then `delegate working_dir=".worktrees/<task>"`; the child provider fix lands | Zero UI, works the day the one-call fix lands; the worker's edits land on a branch | Lifecycle in the model's hands (upstream's stated no); nothing on screen until the panes take `cwd`; `resolve_working_dir` canonicalizes, so a symlinked `.worktrees` fails |
| D. Shell-owned — Electron IPC `create-git-worktree` as PR #10272 | Smallest code, reuses `listGitWorktreeDirs` | Electron-only: the phone shell has no IPC; breaks the browser invariant |

Pick: **A, with the `summon.rs:2023` cwd fix landed first and C's
path left open by it** — A puts lifecycle where git already lives and
where both shells reach it, and the fix makes `delegate working_dir`
truthful, so an orchestrator can send parallel workers into
sub-worktrees under the session's own worktree without a second
mechanism. B waits until A's merge-back has been used by hand.
- consequence: the sidecar becomes cwd-aware per request (`cwd` on
  every `/git/*` body, defaulting to its spawn cwd) — the Changes pane
  passes `session.working_dir` and a child's tree is one click from its
  agent row (`_meta.subagent_session_id` → session → `working_dir`).
- consequence: branches, not detached HEAD — merge-back needs a ref;
  Codex's snapshot-and-hand-off is the price of detached.
- consequence: the toplevel comes from `git rev-parse --show-toplevel`
  of the session cwd, never from the cwd itself (#10272's review point);
  `.worktrees/` is gitignored by the fork and excluded from the
  parent's watch (`fs.ts:11` `WATCH_IGNORED` grows one entry).
- consequence: cleanup is a policy in the sidecar, not a model action —
  remove on session delete, keep the newest N (Codex: 15), never remove
  a dirty or locked tree.

## Scope — in / out / protected

- in (sidecar): `ui/sidecar/src/git.ts` — `cwd` on every route,
  `worktree add|list|remove`, `merge`; `ui/sidecar/src/fs.ts:11` ignore
  `.worktrees`; `ui/desktop/src/native/sidecar.ts` mirrors the bodies.
- in (spine): `crates/goose/src/agents/platform_extensions/summon.rs`
  `:1790-1818` and `:2023` — build the child provider with
  `effective_working_dir`; one unit test beside
  `test_resolve_working_dir_*` (`:2644-2680`).
- in (shell/renderer): `ui/desktop/src/workspace/WorkspaceShell.tsx`
  (pane cwd already there), `panes/diff/DiffPane.tsx` (pass `cwd`,
  merge and remove actions), the new-chat composer's toggle (which
  component owns it is the plan's call — Hub or ChatInput,
  `Hub.tsx:184`, `ChatInput.tsx:1721`); `.gitignore` `+ .worktrees/`.
- out: spine-created per-delegate worktrees (B) — after A is used;
  Codex-style `.worktreeinclude` / setup script — an Unknown below
  decides; hand-off of a *running* session between trees — Goose's
  `update_working_dir` rebuilds the provider mid-session
  (`manage_sessions.rs:30-52`) and that is a separate journey; a
  worktree picker for the phone beyond the toggle.
- protected: `agent.rs`, `state_machine/` (dual-path rule); the ACP
  `session/new` contract — cwd stays a plain absolute path, no worktree
  meta in ACP; `DirSwitcher` keeps listing and switching worktrees
  unchanged; the sidecar's spawn cwd stays the default so every route
  behaves as today without `cwd`; no new sidecar process or table.

## Unknowns

- Build artefacts per worktree: this repo's `target/` is 39G and
  `node_modules` is absent in a fresh tree — does a worker in a worktree
  need `CARGO_TARGET_DIR` shared and `pnpm install` run, and is that the
  sidecar's job (a `.worktreeinclude`/setup-script equivalent) or the
  role's? — cheap to test? yes (one worktree, one `cargo build`);
  reversible? yes.
- Does `claude-agent-acp` accept an ACP `cwd` inside a nested
  `.worktrees/` without tripping its own worktree or nested-session
  detection (`claude_acp.rs:87` already strips `CLAUDECODE`)? — cheap to
  test? yes (one delegate after the fix); reversible? yes.
- Merge on a dirty main checkout: `git merge` refuses when the main tree
  has overlapping uncommitted edits — surface as a Changes-pane error or
  offer `--squash` into a staged state for hunk review (task 45)? —
  cheap to test? yes; reversible? yes (a design line).
- "Since session start" in a worktree: `HEAD@{createdAt}` reads the
  worktree's own reflog (`DiffPane.tsx:57`), which starts at creation —
  probably correct, unverified — cheap to test? yes; reversible? yes.
- Cleanup policy numbers (keep N, remove on delete vs archive) and
  whether a session's worktree survives the desktop restart with the
  session pointing at it — Goose keeps the path (`session_manager.rs:64`)
  and #10643 shows a deleted dir breaks `session/load` — cheap to test?
  yes; reversible? no (a deleted tree is gone; snapshot first, as Codex).
- Containment vs a subdirectory cwd: `<toplevel>/.worktrees/x` passes
  `resolve_working_dir` only when the session cwd *is* the toplevel; a
  chat started in `ui/desktop` (#10272's case) is refused. Relax the
  check to the repo toplevel (a second line in the same `summon.rs`
  touch) or accept that C needs a toplevel session? — cheap to test?
  yes; reversible? yes.
- Nested sub-worktrees: workers under a session worktree land at
  `.worktrees/a/.worktrees/b`; git permits it, `rev-parse
  --show-toplevel` inside `a` returns `a`, and `a`'s Files pane and
  `git status` see `b` unless the fork's `.gitignore` and `WATCH_IGNORED`
  cover `.worktrees/` at every depth — cheap to test? yes; reversible?
  yes.
- The one-call fix changes behaviour for every ACP child today (they
  would start following DirSwitcher moves) — desired, but a hand check
  on task 9's delegate proof is owed.
