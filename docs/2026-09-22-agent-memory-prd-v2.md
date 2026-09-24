# PRD — Melody remembers (agent memory)

Dated 2026-09-23. **v2**, on the notebook pick (user: "Let's do notebook for now", `docs/2026-09-23-agent-memory-options-furps-v1.md`) and the settlements of `docs/2026-09-23-team-memory-program-plan-v2.md` §Decisions (user: "continue"). Supersedes v1, which planned a flush inside both agent loops — dropped: every seat in use manages its own context (`crates/goose/src/acp/provider.rs:966`) and none compacted in a week (316 sessions, 0 compactions). Research: `docs/2026-09-22-persistent-memory-research-v1.md`. Names and states cite `DESIGN.md`; Melody's own tab and pin are `docs/2026-09-23-melody-program-plan-v3.md` M1b's. Mockups: `docs/mockups/2026-09-23-team-health-panel.html`, `2026-09-23-team-context.html`, `2026-09-23-usage-versions.html`.

## Problem

- Every chat with Melody starts blank: 147 real sessions in a week, none picked up on a later day, at most 16 messages each (`~/.local/share/goose/sessions/sessions.db`, read-only). She can't be the one who "knows every session" (v3) without memory that outlives a chat.
- People who ran markdown memory for months kept it, and all of them stopped letting the agent promote its own writes; the failure is confident staleness — a rejected plan stored as approved, a moved region cited weeks later (research §Practitioners).
- Companions (Harmony, Tempo, Chord — v3 M2) are long-lived managers; without their own memory they relearn each repository, and without scores nobody can say whether one is getting better.
- Outcome that says it landed: on Monday the user asks Melody "where were we on the export bug?" and she answers from Friday's notes without re-explaining; a month later a companion's change failure rate and tokens per clean job are lower, and the user can read why in its folder.

## Journey

1. [a chat opened in `~/Melody/`, first time] · P0
   - does: open a chat whose folder is `~/Melody/` (until M1b binds Melody's session there)
   - rule: if `BOOTSTRAP.md` exists then she asks four short questions one at a time, writes the answers to `USER.md` tagged `[stated]`, deletes `BOOTSTRAP.md` and commits
   - → [Melody, ready]; the folder isn't a git repository → [she says so and answers without writing anything]
2. [Melody, ready] · P0
   - does: type a task or a question
   - rule: at the start of a chat she has read `SOUL.md`, `USER.md`, `MEMORY.md`, yesterday's and today's journal and `memories/index.md` — nothing else; when an answer needs more she reads that one note and names it; if nothing lists it she searches the folder's text before saying she doesn't know
   - → [Melody, answering]; a note she relied on is older than seven days → [the answer says "as of <date>"]
3. [Melody, answering] · P0
   - does: work with her through the chat
   - rule: a decision, a preference, a stated fact or a correction becomes one journal line as it happens — `HH:MM [stated|observed|inferred] what — safe to act on: …`; "sounds good" is not approval; the journal is append-only; each write is one commit
   - → [Melody, ready]; the chat closes mid-thought → [only what was written survives]
4. [the user, curious what she knows] · P0
   - does: open `~/Melody/` in the Files pane (or Finder, or an editor), or ask "what do you know about X?"
   - rule: plain markdown in git; a user edit is true from her next chat on; a revert is honoured with no cache in the way; `AGENTS.md` and `SOUL.md` change only when the user says yes
   - → [the folder: `AGENTS.md` · `SOUL.md` · `USER.md` · `MEMORY.md` · `journal/` · `memories/` · `notes/`]
5. [a week has passed] · P0
   - does: say "check-in", or open the first chat after seven days without one
   - rule: the five steps in order — Pulse · Memory · Gaps · Companions · Next week (`~/Melody/AGENTS.md` §Weekly health check); one yes or no from the user per item; a step with nothing in it is one line; the check-in ends in one journal line and one commit
   - → [Melody, ready, the index current]; the user stops halfway → [the next chat offers to resume at the step reached]
6. [Melody, ready — a job in a repository] · next (v3 M2, T1)
   - does: ask for work in a repository a companion manages
   - rule: the companion is a long-lived manager session for that repository (v3); the workers it delegates to start fresh; its continuity is its own folder `~/Melody/<name>/` (charter, `MEMORY.md`, journal), re-read whenever its seat compacts or restarts; each finished job leaves an outcome in the ledger (landed · corrected · reworked · failed · blocked · undone · unknown) and the user can mark a verdict in one tap
   - → [Melody reports the job with its outcome]
7. [Melody, ready — a companion should change] · next (T4)
   - does: nothing — after a correction, or when the user says "Tempo should always run the smoke walk"
   - rule: Melody proposes a small charter edit with one line of why; before it reaches the user she reruns the companion's test set (tasks drawn from its judged jobs) on the old and new charter, three runs each; the proposal shows both scores per task; nothing is applied without the user's yes
   - → [the diff with its scores, **Accept** / **Edit** / **Discard**]; fewer than three judged jobs → ["not enough history to test"]
8. [anyone learns a fact about a project] · next (T0 rules, M2)
   - does: nothing — Melody or a companion finds, for example, where the export code lives
   - rule: facts about the world and the projects go to `memories/` (OKF v0.2), one page per concept; an agent's write is `generated`, `status: draft`, with `sources`; only the user adds `verified`; every change is a `log.md` line and a commit; agents read verified pages as fact and drafts as hints
   - → [the page, draft until the user verifies it]
9. [night, nobody working] · later (T3)
   - does: nothing
   - rule: the tidy-up routine promotes lines seen on two days, lets corrections overwrite, drops at most a quarter of `MEMORY.md`, archives journal days past 90, writes a `DREAMS.md` entry, and stops at its budget (≤ 20 k tokens, the cheapest seat with room)
   - → [Melody, ready next morning, the index current]

## States

- The notebook: empty → `BOOTSTRAP.md` runs the first chat; partial → a missing file is named and skipped, the rest still read; error → not a git repository: she answers and writes nothing, saying why
- Journal writes: error → the commit fails: she says so in the reply, the line is kept for the next write
- `MEMORY.md`: partial → past 160 lines (80 % of the cap) she says so at the start of a chat and offers the check-in's Memory step; over 200 → she merges or drops, never more than a quarter at once
- Check-in: partial → paused at a step, resumed next chat; empty → "nothing to review since <date>"
- Charter proposal: partial → no why-line → not shown; error → the test run failed to start: the proposal waits, the old charter stays
- Tidy-up: error → its cause in `DREAMS.md`, the notebook untouched; budget reached → stops, says where

## Criteria

- [ ] given a fresh chat in `~/Melody/`, the seat answers from `SOUL.md`, `USER.md`, `MEMORY.md`, two journal days and `memories/index.md` with no tool call, and from nothing else
- [ ] given a journal line, it carries a time and one of `stated` · `observed` · `inferred`; a `notes/` line carries the same plus its date
- [ ] given `AGENTS.md` or `SOUL.md`, no commit to it is authored by an agent without the user's yes in that chat
- [ ] given any pass over the notebook, every past journal day is byte-identical before and after
- [ ] given a `memories/` page written by an agent, it has `generated`, `status: draft` and at least one `sources` entry, and no `verified` entry
- [ ] given Melody or a manager idle, no model call is made, except the nightly tidy-up within its budget
- [ ] given a charter proposal, the review shows the test-set result for the old and new charter per task, run within the last hour; fewer than three judged jobs shows "not enough history to test"
- [ ] given the test set, every task is a past job the user judged, with its correction (if any) as the expected result; no task is written by an agent
- [ ] given the user reverts a notebook commit, the next chat reflects it
- [ ] given the week script on its fixture (4 chats in `~/Melody/`, journal commits during 3), it prints `4 · 3 · 1`

## Scope

- out: changes to `agent.rs`, `state_machine/` or goose's compaction (`ARCHITECTURE.md:119`); fine-tuning any model; vector search before grep fails (T5); Obsidian as the editor (a vault view on the side is fine); syncing between machines (a git remote is the user's); the rich Team Context editor and the other tabs (T2b); a companion or worker writing repository memory — workers write no memory
- protected: the journal is append-only for every process; `AGENTS.md`, `SOUL.md` and every companion's charter change only on the user's yes; Melody and managers write memory only inside `~/Melody/` and never edit repository files; workers keep their role's repository permissions; `USER.md` and `MEMORY.md` are never loaded by a companion; the sessions DB stays the full record — the notebook is derived from chats, never the other way; `/fs/*` and `/git/*` containment is not widened

## Layout

```
~/Melody/                 one git repository
  AGENTS.md SOUL.md USER.md MEMORY.md BOOTSTRAP.md CLAUDE.md   Melody
  journal/  notes/                                               Melody, private
  memories/  index.md log.md <concept>.md                        shared, OKF v0.2
  <companion>/  charter.md MEMORY.md journal/ tests/                each companion, private (M2, T4)
```

## Tranches

The plan owns the order (`docs/2026-09-23-team-memory-program-plan-v2.md`): steps 1–5 are T0 (files, no code); 6 is v3 M2 with T1's outcomes; 7 is T4; 8's rules are T0 and its companions M2; 9 is T3.
