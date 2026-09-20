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

- 103. Scope the clippy gate: in `Justfile`, the three `cargo clippy --all-targets -- -D warnings` lines (`check-everything`, `test`, `test-full`) become `cargo clippy --all-targets -- -D warnings -A clippy::result_large_err -A clippy::useless_format`, with one comment above the `test-full` line naming why (24 upstream lints under `agents/*` and `goose-provider-types` since the 1.98.1 move; `agents/agent.rs` is a protected path; the fork's own lints stay fatal).
  - status: todo · agent: — · worker: low
  - card: as the session, run the tranche-end gate to a verdict, so that "tests pass" is a run again and not a claim (AGENTS.md "Verification is run, not reported")
  - context:
    - the two allowed lints are the only ones red on the untouched tree (this session's `--keep-going` count); a third lint anywhere still fails the gate
    - no source file changes; `scripts/check-spine.sh` untouched
  - confirm: `grep -c "result_large_err" Justfile` → `3` (untouched: `0`); `cargo clippy --all-targets -- -D warnings -A clippy::result_large_err -A clippy::useless_format >/dev/null 2>&1; echo $?` → `0` (untouched, without the `-A`s: `101`)

- 104. Move the last three walks off `HOME`: `ui/desktop/tests/e2e/editor-pane.spec.ts`, `git-pane.spec.ts` (its first describe, `:55`) and `turn-undo.spec.ts` (`:32-33`, which sets both) open the window on their scratch repo through `GOOSE_TEST_DIR` alone, on the diff-pane walk's shape (`diff-pane.spec.ts:1-40` after task 94); the `HOME` / `HERMIT_STATE_DIR` juggling and the `Library` mkdir go.
  - status: todo · agent: — · worker: low
  - card: as the walk suite, open the app on the user's own config so that no walk lands on the Welcome screen for want of a provider (the diff-pane walk's 2026-09-19 finding, `tasks.md` §Waiting)
  - context:
    - the git-pane PR describe already uses `GOOSE_TEST_DIR` (`:162-197`); only the first describe changes
    - `turn undo` still needs a live seat to pass past setup — this task fixes its launch, not its walk
  - confirm: `grep -c "HOME = scratch" ui/desktop/tests/e2e/editor-pane.spec.ts ui/desktop/tests/e2e/git-pane.spec.ts ui/desktop/tests/e2e/turn-undo.spec.ts` → `0` `0` `0` (untouched: `1` `1` `1`); `just walk "editor pane"` → 1 passed (untouched, run 2026-09-20: 1 failed at 53 s, the shell never visible); `just walk "git pane"` → 1 passed — the pattern matches the first describe only, the `open pr` describe is its own walk (untouched, run 2026-09-20: 1 failed, the page snapshot reads "Welcome to goose")

- 105. Pin every recipe to hermit's toolchain with one line: `export PATH := justfile_directory() / "bin:" + env_var("PATH")` at the top of `Justfile` — `bin/` already holds hermit's `node`, `npm`, `pnpm` and `just` shims, so every recipe runs Node 24 whatever `/opt/homebrew` ships, and no recipe needs `source`; one comment names the Node 26 `localStorage` failure (`tasks.md` §Waiting "Node for the desktop suite"). In the same edit, `test-full`'s last line becomes `cd ui/desktop && pnpm exec playwright test --project=walks`, with a comment: `chromium` is upstream's suite and needs a Databricks provider and live MCP servers; `phone` needs the web build served on :3285 — both run by hand, neither is the fork's gate.
  - status: todo · agent: — · worker: low
  - card: as anyone running `just`, get the same 1198/1198 the session gets and a `test-full` that can reach green, so that a red suite means the code and not the shell or a missing provider
  - context:
    - `ui/desktop/package.json:7` already declares `"node": "^24.10.0"`; the export makes it true rather than warned
    - `walk` already runs the `walks` project (`Justfile:217-218`); `test-full` is the only recipe that ran all three
  - confirm: `grep -c 'export PATH := justfile_directory()' Justfile` → `1` (untouched: `0`); `just --evaluate PATH | tr ':' '\n' | head -1` → `/Users/hoaqbui/github/melody-agent2/bin` (untouched: whatever the shell gives); `grep -c "playwright test --project=walks" Justfile` → `2` (untouched: `1`, the `walk` recipe)

- 106. Record the walk-launch fixes in the tree: `Justfile`'s `fix-bins` recipe also creates `~/.skip-forge-system-check` when absent, with the one-line why (forge's package-manager check hung ~15 min per launch on 2026-09-19); `ui/desktop/tests/e2e/fixtures.ts`'s 5 s CDP-close bound keeps its comment; `tasks.md` §Waiting's two walk notes point at the recipe instead of the user's home.
  - status: todo · agent: — · worker: low
  - card: as the next machine that runs a walk, get the one-minute launch without reading a ledger note, so that the fix travels with the repo
  - context:
    - the flag is forge's own, undocumented on purpose in its source; the recipe's comment is the documentation here
    - `just walk` already runs `fix-bins` first (`Justfile:217`)
  - confirm: `grep -c "skip-forge-system-check" Justfile` → `1` (untouched: `0`); `rm -f ~/.skip-forge-system-check && just fix-bins && test -f ~/.skip-forge-system-check && echo ok` → `ok`

- 107. Revise `AGENTS.md` §Model routing on the evidence, one dated row under the table, naming the mechanism it governs: the evidence is from the session's Agent-tool worktree subagents (`model: haiku` for tranches 1–7's workers, `model: sonnet` for wave 3), not from the table's `claude -p --model haiku` CLI rung — 17/17 haiku diffs needed session corrections (`tasks.md` §Waiting "Worker routing evidence"), and three sonnet workers stalled on task 83 without a line while the Sonnet endpoint timed out (2026-09-19; whether the stall was the endpoint or the worktree isolation is untested — one worker on a trivial task once the endpoint answers would tell). The rule change proposed: the worker chain's first rung for `worker: medium` and above is a sonnet-class model, haiku keeps `worker: low`; a stalled worker that leaves an empty worktree is retried once, then the session implements (as 83 was); the row says which mechanism (Agent tool vs CLI) each rung names. Takes one advisor per lens (architect, PM) on runtimes other than the one that drafted it, per AGENTS.md; the row lands only with their verdicts quoted.
  - status: todo · agent: — · worker: —  (session; a rule change)
  - card: as the user paying for three seats, route work to the rung that lands it, so that the session stops redoing worker output
  - context:
    - `AGENTS.md` lives in `~/github/agent-workspace` (global rules), not this repo — the edit is there; this repo's `tasks.md` records the pointer
    - the advisor chain's first rung (`claude -p … --model opus`) is dark while the seat is out; the row waits on an advisor that answers, or on the user
  - confirm: `grep -c "2026-09-19" ~/github/agent-workspace/AGENTS.md` → `≥ 1` (untouched: `0`); `python ~/github/agent-workspace/scripts/check-reach.py` → PASS

- 108. Draft `ARCHITECTURE.md`'s promotion: a new dated paragraph at the top of §Bootstrap Status stating what the map now describes as built (every box marked **(new)** exists — `ui/sidecar`, `shims/electron-web`, `workspace`, `native`, the three spine files, `.agents/agents`), listing the three claims the section still gets wrong (the tree read for the map, "do not exist yet", the suspended drift flag), and ending with the sentence the user signs: "Sign-off deletes this section." No other line of the file changes.
  - status: todo · agent: — · worker: low
  - card: as the reader, trust the map's tense, so that the next plan's drift check runs against a description and not a proposal
  - context:
    - the deletion is the user's (`tasks.md` §Waiting "`ARCHITECTURE.md` — sign-off deletes"); this task only makes the sign-off a one-word answer
    - the four `DESIGN.md` §Open decisions that wait on a user test (`:212-215`) are listed beside it in `tasks.md` §Waiting as one hand-check row, so the look and the sign-off happen in one sitting
  - confirm: `grep -c "Sign-off deletes this section" ARCHITECTURE.md` → `1` (untouched: `0`; the current text says "sign-off deletes this section" in a different sentence — match the capitalised form); `bash scripts/check-spine.sh` → `spine clean`

Approval gate: tasks 103–108 wait on sign-off. Three are flagged for the user's eye:
103 loosens a gate (two lints allowed workspace-wide), 106 has a repo recipe write a
flag file into the user's home (`~/.skip-forge-system-check`), 107 changes a global rule.
Only the user can verify 108's sign-off and tranche 11's look at Light. Tranches 10–12 are not approved here: 10 is already in
`tasks.md`, 11 and 12 come back as their own plans at their gates. Approved → tasks
103–108 land in `tasks.md` under `### docs/2026-09-20-program-plan-v1.md — tranche 9`;
this section keeps only that pointer.
