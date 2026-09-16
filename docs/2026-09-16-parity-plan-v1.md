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

Approved 2026-09-16 (user: "approved all recommendations"). The task list moved to `tasks.md` §Parity with Codex desktop and Claude Cowork; this document keeps the approach and the out-of-scope list.

Approved 2026-09-16. Four decisions the list reversed or settled: (1) worktree-per-task comes into scope (PRD
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
