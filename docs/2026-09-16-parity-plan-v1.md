# Parity with Codex desktop — plan

<!-- Downstream of docs/2026-09-16-worktrees-research-v1.md,
     docs/2026-09-16-hunk-review-research-v1.md and
     docs/2026-09-16-automations-research-v1.md (all picks recorded
     2026-09-16); upstream of implement. The task list is the approval
     surface. -->

Dated 2026-09-16. Companion: the three research docs above, `DESIGN.md`,
`docs/2026-09-15-workspace-prd-v1.md`. Closes the three gaps named in
the parity comparison — worktree-per-task, accept/reject per hunk, a
review list for scheduled runs — local-first > three PRs, one per unit.

## Approach

- **Worktrees: the sidecar owns lifecycle; the spine tells the truth
  about cwd first.** Git already lives in `ui/sidecar/src/git.ts` and
  both shells reach it, so `/git/worktree/{add,list,remove}` and
  `/git/merge` go there (research 44 §Options, pick A), worktrees under
  `<toplevel>/.worktrees/<slug>` on branch `wt/<slug>`, every `/git/*`
  body taking `cwd` (default: the sidecar's spawn cwd). A "Use worktree"
  toggle on new chat points `session/new` at the worktree; Changes gains
  Merge / Remove. Before any of that lands, one spine call: a delegated
  child's provider is built from the `goose serve` process cwd
  (`summon.rs:2023` `entry.create`) instead of the session's — so
  `delegate working_dir` is not honoured by ACP children today. Fixing
  it (`create_with_working_dir`) makes parallel workers in sub-worktrees
  a prompt-level choice with no second mechanism (research 44 option C
  left open). Spine-created worktrees per `delegate` (option B) wait
  until merge-back has been used by hand.
- **Hunks: one atomic route, the pane synthesizes the patch.**
  `POST /git/apply {patch, reverse?, cached?}` runs `git apply --recount`
  with the patch on stdin (research 45 pick A); git's all-or-nothing apply
  turns the mid-review race into a refusal, never a clobber. The pane
  fetches full-context diffs, so there is no git hunk to reuse: a pure
  synthesizer turns a CodeMirror chunk plus its two docs into a 3-line-
  context patch. `acceptChunk`/`rejectChunk` ignore `readOnly`, so
  `mergeControls` is a function that calls the sidecar, never
  CodeMirror's action. Accept = stage (`cached`) and Changes gains an
  Unstaged · Staged scope — Codex's shape (stage · unstage · revert);
  Reject = `reverse` with an in-place Undo (apply the same patch forward)
  instead of a confirm. Renamed and binary entries get file-level actions
  only.
- **Automations: a Runs inbox on the existing Schedules route, staged.**
  A1 on today's shared cwd (research 46 pick a): `scheduler.rs` records
  the outcome on the run's session and returns `Err` on stream error
  (upstream #11051's ask); a runs list across schedules goes on the
  ACP schedule route; the desktop composes an inbox into
  `SchedulesView.tsx` — row = schedule · started · outcome · snippet ·
  unread; Open → `pair?resumeSessionId` with Changes at "since session
  start"; Dismiss → archive; Accept → stage the run's diff paths +
  commit through the sidecar, only when the run's cwd equals the
  sidecar's. A2 after the worktree unit: a run per worktree, Accept =
  merge, Dismiss = remove. Two surfaces, one row component: task 28's
  Agents pane is the per-session live tree, the inbox is the global
  polled list. No cloud, no control plane (PRODUCT.md §1).
- **Order.** Wave 1: 47 (spine cwd, Rust summon) ∥ 48 (sidecar git:
  cwd + worktrees + apply) ∥ 51 (scheduler outcome, Rust) — disjoint
  files. Then 49 (worktree UI, after 48 and after ledger tasks 40 and 42
  land, since it edits the shell header they rewrite) ∥ 50 (hunk
  controls, after 48; `DiffPane.tsx` is untouched by task 16) ∥ 52
  (runs on the wire, after 51) → 53 (inbox) → 54 (runs in worktrees,
  after 48, 49, 53) → 59 (save session as routine, after 53 and ledger 58) → 55 (docs). 48 carries both the worktree routes
  and `/git/apply` so one task owns the `cwd` guard every route shares.

## Out of scope

- Cloud or remote runs, webhook/event triggers (PRODUCT.md §1; Codex's
  web-only triggers).
- Spine-created worktrees per `delegate` (research 44 option B) — after
  merge-back is exercised; the orchestrator can already do it by prompt
  once 47 lands.
- A per-schedule runtime choice (a recipe field, later); the scheduler's
  duplicate-fire fix (upstream #11694 — tracked, not forked, unless the
  hand check reproduces on the desktop).
- Hunk actions in the side-by-side view (unified only until split has a
  reason); the `-C` matching mode; editing upstream `SessionListView.tsx`.
- Any edit to `crates/goose/src/agents/agent.rs` or `state_machine/`
  (`scripts/check-spine.sh`).

## Tasks

- 47. Build a delegated child's provider in the child's working directory: in `crates/goose/src/agents/platform_extensions/summon.rs` replace `entry.create(...)` at `:2023` with `create_with_working_dir(&name, extensions, effective_working_dir)` (the value `build_task_config` already resolves), and let `resolve_working_dir`'s containment (`:2479-2499`) accept any path under the session cwd's `git rev-parse --show-toplevel`, so `.worktrees/<slug>` is reachable from a session opened in a subdirectory; test `subagent_provider_working_dir_is_the_childs` (a stub registry entry that records the working dir it was created with).
  - status: todo · agent: — · worker: high
  - card: as the orchestrator, send a worker into a directory and have it edit there so that `delegate working_dir` means what it says on every runtime (research 44 §The surprise: today an ACP child edits the launch checkout)
  - context:
    - the negative check the research made: no `restore_provider_from_session` caller on the subagent path, so the spawn cwd is the only cwd an ACP child gets (`provider_registry.rs:77-79`, `base.rs:27-29`)
    - hand check first, before the edit: delegate to a `claude-acp` child from a session moved with DirSwitcher and see which checkout it wrote to — record it in the commit message
    - upstream-shaped: file a Ready issue; do not wait on it
  - confirm: `source bin/activate-hermit && cargo test -p goose --lib subagent_provider_working_dir 2>&1 | grep -E 'test result: ok\. 1 passed'; echo exit=$?` → `exit=0` (untouched tree: 0 tests, `exit=1`); and `bash scripts/check-spine.sh` → `spine clean`

- 48. Make the sidecar's git routes cwd-aware and add worktree and apply routes in `ui/sidecar/src/git.ts` (+ tests): every `/git/*` body takes `cwd?` (default the spawn cwd; refused with `400` unless it is inside the spawn cwd's toplevel or a `.worktrees/` sibling of it); `POST /git/worktree/add {slug}` → `git worktree add -b wt/<slug> <toplevel>/.worktrees/<slug>` returning `{path, branch}`; `POST /git/worktree/list`; `POST /git/worktree/remove {slug, force?}` (refused when dirty or locked unless `force`); `POST /git/merge {slug}` → `git -C <toplevel> merge --no-ff wt/<slug>` returning `{sha}` or `409` with the conflict list; `POST /git/apply {patch, reverse?, cached?}` → `git apply --recount [-R] [--cached] -` with the patch on stdin (a stdin-capable variant of the `git()` helper at `:7-16`), `{}` on success, `500` with git's stderr on refusal; `.worktrees/` joins `WATCH_IGNORED` in `fs.ts:11`; `src/native/sidecar.ts` gains the request/response types.
  - status: todo · agent: — · worker: high
  - card: as the panes, run git in the session's own checkout — a worktree or the main one — and apply one hunk atomically so that parallel work and partial review are the sidecar's, not the model's (research 44 pick A; research 45 pick A)
  - context:
    - toplevel from `git rev-parse --show-toplevel` of the request cwd, never the cwd itself (research 44, #10272's review point); `.worktrees/` is gitignored by the fork (add the line)
    - cleanup policy lives here: never remove a dirty or locked tree without `force`; keep the newest N (Codex keeps 15) is a later policy, not this task
    - `MAX_BODY_BYTES` (`http.ts:16`) bounds a patch; patch paths are repo-root-relative as `git diff` emits them — the route runs `git -C <toplevel>`, so a session opened in a subdirectory still applies
    - `slug` is interpolated into a branch name and a path: validate `^[a-z0-9][a-z0-9-]{0,63}$` before any git call, `400` otherwise — a `../` slug walks out of `.worktrees/`
    - the `cwd` guard resolves `fs.realpath` before the prefix check against the toplevel — symlinks and `..` escape a string compare; the sidecar is unauthenticated on the tailnet (ARCHITECTURE invariant), so these two guards are what stands between a tailnet peer and arbitrary git on the Mac
    - tests in `git.test.ts` against a temp repo: add/list/remove/merge round trip; merge conflict → 409; apply forward, reverse, refuse on drift (tree untouched after refusal), `cached` stages; cwd outside the toplevel → 400; symlinked cwd out of the toplevel → 400; slug `../x` → 400
  - confirm: `cd ui/sidecar && pnpm run typecheck && pnpm vitest run src/git.test.ts; echo exit=$?` → `exit=0` with ≥ 10 tests (untouched tree: no such file, exit 1)

- 49. Add "Use worktree" to new chat and worktree actions to Changes: a toggle beside the Runtime/Mode controls in `ui/desktop/src/workspace/WorkspaceShell.tsx` that, when on, calls `/git/worktree/add` with a generated slug (`wt-<yyyymmdd>-<4 hex>`; the cwd is fixed at `session/new`, which task 11's shell sends on the Runtime pick before any prompt, so no prompt-derived name is possible) and starts the session with that path as cwd (`session/new` cwd, `src/acp/sessions.ts`); the Changes and Git panes pass `session.working_dir` as `cwd` on every git call; Changes gains "Merge into <main branch>" and "Remove worktree" when the session cwd is a worktree, with the branch name in the pane header; Files and Terminal already follow `working_dir`.
  - status: todo · agent: — · worker: high
  - card: as the user, start a task in its own checkout and merge it back from the Changes pane so that two agents on the same repo never touch each other's files (Codex parity gap 1; reopens PRD §Scope "worktree-per-task", dated amendment)
  - context:
    - the session's cwd is the worktree, so every pane follows it for free (research 44 §Inventory: Files/Terminal use absolute paths; only git was pinned); the toggle's default is off — a fresh chat is chat in the checkout
    - a Rust worktree rebuilds `target/` unless `CARGO_TARGET_DIR` is shared — the Terminal starts with the session cwd; note it in the toggle's tooltip, not more
    - DESIGN.md §Vocabulary: "worktree" and "main checkout" rows; the branch name is mono (machine text)
    - `/git/merge` → `409` is the pane's Error state: list the conflicting paths, keep Merge enabled for a retry, never auto-resolve — the user resolves in the Editor or the Terminal
  - confirm: `cd ui/desktop && pnpm run typecheck && pnpm exec playwright test -g "worktree"; echo exit=$?` → `exit=0` (walk: toggle on, send a prompt, header shows `wt/<slug>`, Terminal `pwd` ends in `.worktrees/<slug>`, Changes offers Merge; Merge → main checkout's log has the merge commit)

- 50. Hunk controls in the Changes pane (`ui/desktop/src/workspace/panes/diff/`): a pure `chunk-patch.ts` (+ test) that turns a CodeMirror `Chunk` and the two docs into a unified patch with 3 context lines, real line numbers, `--- a/P` / `+++ b/P` (`/dev/null` for added/deleted), and the no-newline marker; `mergeControls` as a function rendering Reject and Stage per chunk that call `/git/apply` (`reverse` / `cached`) then `refresh()`; a scope selector Unstaged · Staged beside the base selector (Staged = `--cached` diff); Undo in place of a confirm (re-apply the last patch forward); buttons disabled with the reason while any tool call is `in_progress`; renamed and binary entries show file-level Stage only.
  - status: todo · agent: — · worker: high
  - card: as the user, keep the good half of an agent's change and drop the rest, then commit, without leaving the window so that review ends in git, not in a manual edit (Codex parity gap 2; reverses PRD decision 5 "view-only at V0", dated amendment; DESIGN.md `:125` "Destructive: none in V0" → in-place Undo)
  - context:
    - `acceptChunk`/`rejectChunk` ignore `EditorState.readOnly` (`merge/dist/index.js:1653-1690`) — never let CodeMirror's default action run; unified view only (`revertControls` stays off)
    - after every apply `refresh()` remounts CodeMirror and loses the in-file scroll (research 45 Unknown 9) — restore it by line after refresh, or accept and say so
    - a staged hunk still shows under "vs HEAD"; that is what the Unstaged scope is for — default scope stays "vs HEAD, unstaged"
    - tests: synthesizer cases from `unified-diff.test.ts`'s recorded shapes (added, deleted, no-newline, top-of-file chunk); the running gate is pure — test it
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/diff && pnpm run typecheck && pnpm exec playwright test -g "hunk"; echo exit=$?` → `exit=0` (walk: a file with two separated edits; Reject the first → file shows only the second; Stage the second → Staged scope lists it; Undo → back)

- 51. Record a scheduled run's outcome in `crates/goose/src/scheduler.rs`: after `execute_job` finishes, write `extension_data["scheduler"] = {status: done | failed | killed, error?}` on the run's session through the update builder (`:1140-1146`), return `Err` on `stream_error` (`:1168-1183`, `:1250`) and `killed` from the cancel token; test `scheduler_run_outcome_is_recorded`.
  - status: todo · agent: — · worker: medium
  - card: as the user, know whether an unattended run finished, failed or was killed so that a review list can say so instead of listing every run as success (research 46 §Inventory; upstream #11051 open)
  - context:
    - the cron arm's telemetry and `run_now`'s response change with the `Err` — the desktop's "Run now" toast starts reporting failure, which is the point
    - `scheduler.rs` is not on the spine deny list; `agent.rs` / `state_machine/` untouched — `check-spine` stays clean
    - upstream-shaped: file a Ready issue referencing #11051
  - confirm: `source bin/activate-hermit && cargo test -p goose --lib scheduler_run_outcome 2>&1 | grep -E 'test result: ok\. 1 passed'; echo exit=$?` → `exit=0` (untouched tree: 0 tests); and `bash scripts/check-spine.sh` → `spine clean`

- 52. Put a runs list on the wire: a `schedules/runs` custom request in `crates/goose/src/acp/server/schedule.rs` and `crates/goose-sdk-types/src/custom_requests/schedule.rs` returning runs across schedules newest first — `session_id`, `schedule_id`, `started_at`, `outcome` (from task 51), `working_dir`, first-line snippet, `archived_at` — regenerate with `just generate-acp-types`, and expose it in `ui/desktop/src/acp/schedules.ts` (the one ACP call site); test `schedule_runs_list_orders_newest_first`.
  - status: todo · agent: — · worker: medium
  - card: as the inbox, read one list instead of walking every schedule so that the row has what it shows (research 46 §Scope)
  - context:
    - `run_now` holds the ACP request for the whole run (`scheduler.rs:802-868`, `schedule.rs:286-297`) — the list is polled by the client, never derived from that response
    - `ui/goose-acp-client` is generated, never hand-edited (ARCHITECTURE.md)
  - confirm: `source bin/activate-hermit && cargo test -p goose --lib schedule_runs_list 2>&1 | grep -E 'test result: ok\. 1 passed'; echo exit=$?` → `exit=0`; and `cd ui/desktop && pnpm run typecheck; echo exit=$?` → `exit=0`

- 53. Add the Runs inbox to the Schedules route: `ui/desktop/src/components/schedule/runs/` (list, row, an unread store keyed by `updated_at` vs a local last-seen in `localStorage`) composed into `SchedulesView.tsx`; row = schedule · started · outcome · snippet · unread; Open → `pair?resumeSessionId=<id>` with Changes selected at "since session start"; Dismiss → `session/archive`; Accept → stage the paths of the diff since `HEAD@{started_at}` + `/git/commit` through `src/native/sidecar`, enabled only when the run's `working_dir` equals the sidecar's cwd, with the cwd shown on the row; poll every 15 s while the route is open.
  - status: todo · agent: — · worker: high
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

Approval gate: tasks 47–55 and 59 wait on sign-off. Four decisions the
list reverses or settles: (1) worktree-per-task comes into scope (PRD
§Scope had it out); (2) per-hunk stage/revert replaces "view-only at
V0" (decision 5), with Accept = **stage** (Codex's shape) rather than a
non-durable mark; (3) local scheduling leaves PRODUCT.md §12 Future;
(4) task 47 widens `delegate working_dir` containment from "under the
session cwd" to "under the repo toplevel" — a session opened in
`repo/sub/` can then delegate into `repo/other/`.
What only the user can verify: task 47's before-fix hand check (which
checkout an ACP child wrote to), and research 46's two hand checks —
two desktop windows firing one cron twice, and a headless `claude-acp`
run stalling under global `GOOSE_MODE=approve`. Approved → the list
lands in `tasks.md` and this section keeps only that pointer.
