# Team memory and growth — program plan

Dated 2026-09-23. **Approved 2026-09-23 (user: "continue" on decision 1's settlements and decision 2's recommendations: 2a Work tabs first, 2b Team health + Usage; 2c stays open).** **v2** follows Codex's review of v1 (gpt-6-astra, read-only, verdict APPROVE WITH CHANGES: a narrower dependency graph, split permissions, split decision 2, T1's job identity and outcome rules, falsifiable gates, a much smaller T2). User: "long-term what is the ideal solution?" → "ok plan it out". Companions: `docs/2026-09-22-persistent-memory-research-v1.md` (the field; its 2026-09-23 correction), `docs/2026-09-23-agent-memory-options-furps-v1.md` (pick 1, the notebook — user: "Let's do notebook for now"), `docs/2026-09-22-agent-memory-prd-v1.md` (the walk). Mockups: `docs/mockups/2026-09-23-melody-home.html`, `2026-09-23-team-context.html`, `2026-09-23-usage-versions.html` (D), `2026-09-23-team-health-panel.html`. Runs beside `docs/2026-09-23-melody-program-plan-v3.md` (M0 → M4 → A); where they touch, v3's order wins. **Nothing here blocks v0.9 alpha**; T0 and T1 ship with it if they are done in time. Only T0's tasks are drafted here.

## Where it ends

The team's knowledge and skills are data the user owns in one git repository (`~/Melody/`), improved by a measured loop Melody runs and the user approves, independent of any model or vendor:

- memory: plain markdown — `memories/` shared (OKF v0.2), each member's private charter, `MEMORY.md` and journal; later served to every seat over MCP
- evaluation: every job gets an outcome from the ledger; judged jobs become each friend's test set; scores are DORA-style delivery, pass^k reliability, METR-style time horizon and tokens per clean job
- improvement: failures → lessons → charter or skill deltas → the test-set gate → the user's yes; autonomy levels earned by the scorecard; routing learned from it
- no fine-tuning: the seats are subscriptions; if an open-weight model ever joins, the judged jobs and corrections are its training data

## Decisions (the user's)

1. **The four conflicts** in `docs/2026-09-23-melody-main-agent-research-v1.md` §Conflicts — proposed settlements:
   - **Friends are long-lived manager sessions**, one per repository, no cap (v3, the user's direction). "Fresh context per job" applies to the workers a friend delegates to. A friend's continuity is its folder, re-read whenever its seat compacts or restarts.
   - **Two permissions, not one.** Melody and the managers write memory only inside `~/Melody/` (their own folder; drafts in `memories/`) and never edit repository files. Workers keep their role's repository permissions and write no memory. Charters stay the user's to accept; private folders stay private (`~/Melody/AGENTS.md` §What I don't edit, §Privacy).
   - **No loop changes.** The notebook pick dropped the PRD's flush-in-both-loops; `agent.rs`, `state_machine/` and goose's compaction stay untouched (`ARCHITECTURE.md:119`).
   - **Idle means no model call**, for Melody and every manager (v3 P1) — amended by one exception: the nightly tidy-up (T3), on a fixed budget (≤ 20 k tokens a night), on the cheapest seat with room (agy by default), counted in v3's combined limit on running managers and workers, skipped when that seat's window has < 20 % left.
2. **Melody's surfaces** — three separate choices:
   - **2a. Navigation.** Her own home (pin → Sessions · her work · her chat) amends v3's M1b slice and the settled design (§4, §8, §20), so it needs a v3 and design amendment before T2. **Recommended: existing Work surfaces first** — her tab stays in Work, the tools below are ordinary Work tabs.
   - **2b. Which tools become tabs.** Recommended for T2a: Team health and Usage only; the rest later.
   - **2c. Tabs in the titlebar row** (the folded 72 px strip, lights inside it). A §4 amendment; independent of 2a.

## Tranches and their dependencies

```
T0 (now) ──► T1 (beside M1a) ──► T4 (after M2, with trustworthy outcomes)
   └────────► T3 (after M1b; independent of T2)
T2a (after M1b + M3, decision 2) ──► T2b (after use)
T5 (research first, after T4 has months of history)
```

- **T0 — the notebook, live (now; no code).** Commit `~/Melody/`; add the weekly health check and the lifecycle rules to its `AGENTS.md`; revise the memory PRD to v2 on the notebook and decision 1; a small script that measures the week of use. The user starts Melody's chats in `~/Melody/` until M1b binds her session there.
- **T1 — outcomes the scorecard can trust.** On the work ledger (`ui/desktop/src/native/ledger.ts`, `ui/sidecar/src/ledger.ts`):
  - **job identity:** a job is a delegated worker run, keyed by its `workerSessionId`, with its parent session, parent tool call, member, charter version (the charter's git sha) and a task pointer
  - **landing evidence:** a new `land` kind — the commit that took the job's files (from the Changes bar's commit, sha and paths)
  - **outcome precedence:** failed > blocked > undone > reworked > corrected > landed > unknown; a job with no landing and no failure after 7 days is **unknown**, never clean
  - **rework:** only when the user or Melody links a later job or commit to it ("fixes <job>"); file overlap alone is offered as a suggestion, never counted
  - **dedup:** events keyed by (kind, sessionId, workerSessionId, messageId); a reconnect's replay writes nothing twice
  - **the user's verdict:** one tap on a worker row (good · fixed it · wrong + optional why), a `verdict` kind
  - **known gap:** the ledger is written by the renderer, so nothing is captured while the app is closed; T1 records a `gap` marker on the next launch; server-side capture is a T5 question if gaps matter
- **T2a — two tabs.** Team health (the numbers, the reminders, the check-in entry) and Usage (mockup D), as Work tabs per decision 2; Melody's notebook is opened with the existing Files, Editor and Changes panes. Needs its own short PRD; gated on M1b and M3.
- **T2b — later, after use.** Team Context as a rich editor (suggestions, margin comments, presence, `/` tags), Reminders, Clean-up, Companions, Routines tabs, and Melody's home if decision 2a changes. Before any of it: direct writes (journals, `MEMORY.md`) vs suggestions (charters, verified `memories/` pages) as the written rule, and what happens when two saves collide (each save is a commit; a stale save stops and asks).
- **T3 — lifecycle routines** on the existing scheduler (task 59): the weekly check-in, the nightly tidy-up (promote on two days, corrections overwrite, ≤ 25 % dropped, `DREAMS.md`, on the budget in decision 1), the cap check at chat start, the monthly journal archive, the worktree sweep, the backup push; reminders from `stale_after` and pending proposals. Headless; independent of T2.
- **T4 — friend growth (B, then C).**
  - **B:** each friend's test set in `~/Melody/<name>/tests/` — a task needs a judged job (the user's verdict) and its expected result; a friend with < 3 judged jobs has no test set yet. A charter proposal reruns the set on the old and new charter: each task in a fresh worktree at the task's base commit, three runs each, graded by the task's grader (its tests, or the Reviewer's rubric); **pass^3 = all three pass**. The Scorecard: throughput, lead time, change failure rate, rework rate, tokens per clean job.
  - **C** (from ≥ 20 judged jobs per friend): job sizes, the time-horizon line, the autonomy ladder (suggest → worktree with review → merge after Reviewer PASS → larger jobs; two failures in a row drop a level).
- **T5 — later, research first.** An MCP memory server over `memories/`, shared skills distilled from recurring lessons, an offline charter/skill optimizer tested on held-out tasks, learned routing by clean rate per cost and quota runway, auto-merge at the level the user allows, server-side ledger capture.

## Gates — each a command with a failure it must catch

- **T0 done:** `git -C ~/Melody log --oneline | wc -l` ≥ 1; **recall:** a fresh `claude -p` in `~/Melody` asked "what are the five steps of the weekly health check?" names all five with no tool use; **the week script on a fixture** (`scripts/fixtures/notebook-week/`: 4 sessions in `~/Melody`, journal commits during 3 of them) prints `4 · 3 · 1` and exits non-zero when the fixture's journal is missing.
- **T1 → T4:** `pnpm vitest run ledger-outcome` over fixtures — a correction reads corrected; a linked later fix reads reworked; file overlap alone does not; BLOCKED is never clean; a job with no land after 7 days reads unknown; a replayed reconnect writes no duplicate; `just walk "job verdict"` writes one `verdict` event.
- **T3:** a tidy-up run on a fixture notebook leaves every journal file byte-identical, drops ≤ 25 % of `MEMORY.md`, writes one `DREAMS.md` entry, and **stops at the budget** when the fixture's budget is set below one pass; a scheduler clock advanced one idle hour shows no model call.
- **T2a:** its PRD approved; `just walk "team health"` — both tabs open from + with fixture data; a Usage seat past its projection shows the closing time.
- **T4 (B):** a fixture proposal that fails a task v2 passed is shown as "scores lower on <task>"; a friend with 2 judged jobs shows "not enough history"; each test run's worktree is removed after scoring.
- **T4 (C), T5:** planned at their gates.

## Out of scope

- `agent.rs`, `state_machine/` and goose's compaction (`ARCHITECTURE.md:119`).
- Fine-tuning any model.
- Vector search before the notebook outgrows grep (T5 decides).
- Obsidian as the editor (it can't be embedded; it may open `~/Melody` as a vault on the side).
- Syncing `~/Melody` between machines — a git remote is the user's to add.

## Tasks

T0 moved to `tasks.md` under `### docs/2026-09-23-team-memory-program-plan-v2.md — T0` as 202–205; this section keeps only that pointer. Later tranches' tasks are written at their gates.
