# The rest of the program — program plan

Dated 2026-09-20. Companion: `docs/2026-09-20-program-rest-research-v1.md` (pick B).
Four tranches, walked one at a time; only tranche 9's tasks are drafted here — each
later tranche is planned at its own gate, on the facts the tranche before it supplies.

## Approach

- **Tranche 9 — build health (headless, now).** Make the tranche-end gate runnable
  without a model: scope clippy to what the fork can own, move the three walks that still
  move `HOME` onto `GOOSE_TEST_DIR`, pin the desktop recipes to hermit's Node, record the
  forge flag where the walk recipe lives, revise the worker-routing row on the evidence,
  and draft the `ARCHITECTURE.md` sign-off. Ships alone; every confirm runs today.
- **Tranche 10 — seat-gated closeout.** The four open tasks as written (88, 89, 93, 96
  in `tasks.md`) plus the `rpi strip` walk's pre-existing red at 'Research active'
  (`tasks.md:121`) — nothing new to plan; re-enter `tasks.md` at [approved] the moment a
  Claude seat answers. Its output is data: 96's overrun count, 89's live card, the
  approve matrix rerun through `scripts/probe-approve.py`.
- **Tranche 11 — Studio finish.** After the user's one look at Light (`tasks.md`
  §Waiting, "Tranche 8 landed"): the two board behaviours not built (idle tabs shrinking
  to icon + kind; the file line's amber bar), the three cheap unknowns (vibrancy under
  white, `tnum`, MCP apps under light), and whatever the look adds. Small; PRD-shaped
  because it is user-facing; planned from `docs/2026-09-18-studio-theme-research-v1.md`
  §Unknowns and the look's notes.
- **Tranche 12 — V1: the spine behind the surfaces.** Its own research first
  (`PRODUCT.md:417`; `docs/2026-09-15-goose-spine-bridge-plan-v1.md:95-116`'s out list):
  approval forwarding to delegated children, a `waiting` producer for the worker row,
  fail-over beyond one re-roll, summary handoffs, and — only if 96 shows > 1 overrun in
  ten — the spine plan gate. Needs the Rust gate green (tranche 9) and live seats for
  every proof (tranche 10's precondition).
- **Order and gates.** 9 → [`just test-full` runs to its Playwright line without a
  model] → 10 → [four confirms green on main, 96's count recorded] → 11 → [the user has
  looked at Light] → 12 → [research doc confirmed, plan approved]. 11 may run before 10
  if the seat stays dark and the user has looked.

## Out of scope

- Fixing upstream's 24 lints in `agents/*` and `goose-provider-types` (22 ×
  `result_large_err`, 2 × `useless_format`, measured this session with `--keep-going`)
  — one file is a protected spine path and the rest are upstream's; the fork carries
  fewer patches, not more (AGENTS.md §Contribution Workflow). The gate allows the two
  lints instead.
- Anything in `PRODUCT.md` §12 Future (cloud, remote workers, iOS/Android shells,
  persistent agents, memory).
- Task 33 (filing upstream issues) — the user's action, parked by the user 2026-09-16.
- Deleting `ARCHITECTURE.md` §Bootstrap Status — tranche 9 drafts the promotion; the
  deletion is the user's sign-off (`tasks.md` §Waiting).
- A new dependency of any kind; a component copy (The Upstream Rule).

## Tasks

Approved 2026-09-20 (user: "Ok orchestrate it") → moved to `tasks.md` under `### docs/2026-09-20-program-plan-v1.md — tranche 9`; the session takes 103–106 and 108 directly (one-file edits, AGENTS.md router's trivial line), 107 goes to advisors per lens. This section keeps only that pointer.
