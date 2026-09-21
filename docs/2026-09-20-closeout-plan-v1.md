# Closeout — plan

Dated 2026-09-20. User: "orchestrate and plan and task out the submission, merging, and
pushing and closing of all these branches and workstreams". Ships a clean tree on one branch,
on GitHub, with every workstream either landed, handed to its owner, or named as waiting >
one tranche.

## What the tree holds (read this session)

- 23 worktrees: main + 22 `.claude/worktrees/agent-*`; every agent branch is merged into
  main (`git branch --no-merged main` → 0), every worktree clean, no process runs inside
  one, 58 GB of copied `node_modules`. One stash: none.
- The fork exists — https://github.com/hoaqbui/melody-agent2 (public, from
  aaif-goose/goose), remote `origin`; nothing pushed (the classifier refuses pushes from
  this session, twice). `origin/main` = upstream's current main, 29 commits newer than the
  fork point a23a8cd5; ours has 394 commits on top of that point.
- Open ledger items: 33 (user, upstream issues), 88 · 89 (walks need a live Claude seat),
  93 · 96 (todo, live seat), 107 (user pastes the AGENTS.md row), 133 (the telemetry
  session, in flight, one untracked spec in the main checkout).
- Tag `melody-v0.9-beta` at b3b1247d9; main is 30 commits past it.

## Approach

- **One branch, one remote.** Our history becomes the fork's `main`; upstream's 29 newer
  commits are merged in as a separate task after the push, with the full suite behind it,
  never in the same move. Tags travel with the push.
- **Delete what is merged.** Every agent worktree and branch is merged and clean; they go
  in one sweep, freeing 58 GB. The main checkout is the only checkout after that; a second
  session in this repo works in a worktree it makes for itself.
- **Hand off what only the user can do.** The push (classifier), the AGENTS.md row (107),
  the upstream issues (33), the live-seat walks (88, 89, 93, 96): each gets its one line
  under §Waiting on the user with the exact command.
- **Order.** 134 (worktrees) → 135 (ledger + release note) → **user pushes** → 136
  (upstream merge, on the pushed base) → 137 (retag + rebuild + push tag).

## Out of scope

- A PR to upstream (the fork is a product; upstream wants a Ready issue per PR; 33 parked).
- Finishing 88 · 89 · 93 · 96 (tranche 10, the seat) or 133 (the telemetry session's).
- Signing, notarizing, an update feed (the distribution tranche, not planned yet).

## Tasks

Approved 2026-09-20 (user: "orchestrate and plan and task out the submission, merging, and pushing and closing of all these branches and workstreams") → moved to `tasks.md` under `### docs/2026-09-20-closeout-plan-v1.md`; this section keeps only that pointer.
