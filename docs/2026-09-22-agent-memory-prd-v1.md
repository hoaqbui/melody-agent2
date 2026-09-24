# PRD — Melody remembers (agent memory)

Dated 2026-09-22. Upstream: `docs/2026-09-22-persistent-memory-research-v1.md` (pick B; user: "continue" → the recommendation taken on decisions 1 and 2, decision 3 open below). User's words: "allow the agents to keep persistent context and manage it themselves. eg their own markdown repo. melody will be the main one. we'll give her 3 friends and she'll slowly learn to have them specialize and improve them." Names and states cite `DESIGN.md`; the Melody pane itself has no entry there yet — the mockup `docs/mockups/2026-09-22-melody-main-agent.html` and memory `melody-main-agent-direction` carry it, and this PRD exposes that missing row. Finding: `PRODUCT.md:419` lists persistent named agents and agent memory under Future; the user's direction of 2026-09-22 moves them into this walk.

> **Correction 2026-09-23.** The claim below that `claude-acp` gets goose's compaction is wrong. Every ACP seat returns `manages_own_context() == true` (`crates/goose/src/acp/provider.rs:966`) — `claude-acp`, `codex-acp` and `cursor-acp` all — as do `claude-code`, `agy` and `gemini_cli`. goose's compaction runs on none of the seats in use. The sessions DB agrees: 316 sessions from 2026-09-16 to 2026-09-23, **0 compactions**, 0 sessions active on more than one day, and the 147 real user sessions have at most 16 messages (`~/.local/share/goose/sessions/sessions.db`, read-only query). The `claude-acp` adapter loads `CLAUDE.md` and settings from user, project and local (`claude-agent-acp/dist/acp-agent.js:4040` `settingSources`), so seat-native memory reaches the seat the user runs. The summary-of-summary defect is real in goose's code and has no impact on this user.

> **Pick 2026-09-23 (user: "Let's do notebook for now").** Option 1 of `docs/2026-09-23-agent-memory-options-furps-v1.md`: `~/Melody/` in OpenClaw's layout, read natively by the seats, no goose code. P0 is now steps 1–3 and 9, delivered by files; step 4's flush is out (no hook reaches the model on the seats in use, and none of them has compacted). Folder location decided: `~/Melody/`.



## Problem

- Melody is meant to be one agent who is always there and knows every session (`melody-main-agent-direction`), but a goose session forgets in two ways: at 80 % of the window it replaces its history with a summary, and the next time it does that it summarises the summary (`crates/goose/src/context_mgmt/mod.rs:340-346`, `:137-143`); and a new session starts from nothing, since the only memory today loads every saved note into the prompt at startup (`crates/goose-mcp/src/memory/mod.rs:143-170`), which stops fitting after weeks.
- People who ran this shape for months hit the same wall: a rejected plan stored as approved, a region migrated in February cited in March, a 34 KB index silently cut so the newest rules were the ones lost (research §Practitioners). Every one of them kept the markdown; every one of them stopped letting the agent promote its own writes.
- A companion today is a subagent that starts blank and returns its last message or its whole text stream (`crates/goose/src/agents/subagent_handler.rs:93-148`): it can't get better at anything, and everything it says lands in Melody's own window.
- Outcome that says it landed: the user opens Melody on a Monday, asks "where were we on the export bug?", and she answers from Friday's work without the user re-explaining; a week later a companion does the same job in fewer turns than the first time, and the user can read why in that companion's own folder.

## Journey

1. [Melody, first open] · P0
   - does: open the Work column with no pane, or press ⌘J
   - rule: if Melody has no folder yet then one is made for her with her charter, an empty index and today's journal, and she says so in one line; else she boots from her charter and index and yesterday's and today's journal only
   - → [Melody, ready]; fail(folder unreadable) → [Melody, ready on nothing, an `error` line naming the path and **Retry**]
2. [Melody, ready] · P0
   - does: type a task or a question
   - rule: if the answer needs something not in what she booted with then she reads the note by name before answering, and says which note; she never asks the user to repeat what a note already holds
   - → [Melody, answering]; a note she cites doesn't exist → [Melody, answering without it, the missing name said]
3. [Melody, answering] · P0
   - does: work with her through the turn
   - rule: anything worth keeping — a decision, a preference, a fact the user stated, a correction — goes to today's journal as it happens, each line dated and tagged with where it came from (`stated`, `observed`, `inferred`); the journal is append-only
   - → [Melody, ready]; the window nears its limit → step 4
4. [Melody, near her limit] · P0
   - does: nothing — she notices
   - rule: before anything is summarised she takes one turn to write what must survive to the journal; the summary is then made from the original messages, never from an earlier summary; the user sees a `compaction` row in the transcript that names how many lines she saved
   - → [Melody, ready, lighter]; the flush fails → [the summary still happens, the row says the flush failed]
5. [Melody, ready — a job for a companion] · next
   - does: ask for something a companion owns ("review this diff", "research X")
   - rule: the companion starts a fresh session from its own folder — charter, index, its journal — never from Melody's transcript; it appears in the Agents pane as a worker row with the `info` dot; it finishes with a report (what it did, what it decided, which files, and a pointer to its full record), and only the report reaches Melody
   - → [Melody, ready, the report in her transcript as a card with **Open** to the companion's session]; fail(companion's folder missing) → [Melody says which companion has no folder yet and offers to make it]; the companion's seat is out of quota → [the `warning` dot, "waiting on <seat>", per the fail-over rule]
6. [a companion, working] · next
   - does: nothing — the user may open its session from the Agents pane and talk to it
   - rule: the companion journals like Melody does (step 3) and flushes like Melody does (step 4) in its own folder; it may not edit its charter or its index's cap
   - → [companion, done, the report sent]
7. [Melody, ready — she wants a companion to change] · next
   - does: nothing — after a companion's job, or when the user says "she should always check X first"
   - rule: Melody writes the change as a small edit to that companion's charter with one line saying why, and it shows as a change the user reviews — never applied on its own; until it is accepted the companion runs on its old charter
   - rule: before the change reaches the user, Melody reruns that companion's **test set** — about five fixed tasks taken from its own past jobs, each with a result the user already judged — on the old charter and the new one, and the diff shows both scores side by side; a change that scores lower on any task says which, and Accept still works but says "scores lower on <task>"
   - → [Changes on the companion's folder: the diff, **Accept** / **Discard**]; the user accepts → [the companion's next job boots with it]; discards → [Melody notes the refusal in her journal]
8. [Melody, idle — a day has passed] · later
   - does: nothing
   - rule: when she is idle and the day has turned, she reads the journals since the last pass and moves what recurs into her topic notes: a fact stated twice on two days becomes a note line; a correction overwrites the line it corrects; a lesson becomes a standing note only after it has shown up on two separate days; nothing is written to a charter; the index is rewritten to one line per note
   - → [Melody, ready, the index current]; the pass would push the index over its cap → [she merges or drops the oldest entries first and says what she dropped in the journal]
9. [the user, curious what she knows] · P0
   - does: open her folder in the Files pane, or ask her "what do you know about X?"
   - rule: the folder is plain markdown in a git repository the user can read, edit and revert; every write she made is one commit with a message; a user edit to any note or charter is picked up on her next boot
   - → [Files: `charter.md` · `INDEX.md` · `journal/` · `notes/`]; the user edits a note → [her next turn reads the edit]
10. [Melody, on another seat] · later
    - does: switch her runtime in Session controls
    - rule: her memory is the folder, so a seat change loses nothing; where the seat's own CLI compacts (`claude-code`, `agy`, `gemini_cli`), step 4's flush runs through that CLI's own hook and the row still shows
    - → [Melody, ready on the new seat, the same notes]

## States

- Melody pane: empty → "Melody has no notes yet — talk to her and she'll start a journal"; loading → the charter and index read, a skeleton reply; partial → she answers with "(from memory as of <date>)" when the note she relies on is older than seven days; error → the folder's cause in an `error` line with **Retry**, and she still answers from the window
- Compaction row: empty → never shown before the first flush; loading → "saving notes…"; partial → "saved <n> lines; <m> couldn't be written" ; error → "summary made without a flush" in `warning`
- Companion report card: empty → "no report — the companion ended without one" and **Open** to the session; loading → the worker row's `info` dot; partial → a report with no pointer reads the same, **Open** disabled with the tooltip "no record"; error → the `danger` dot and the companion's last line
- Charter change: empty → nothing (no change proposed); loading → the diff computing; partial → a diff whose why-line is missing is shown with "no reason given" and Accept disabled; error → the folder's cause, the old charter kept
- Consolidation: empty → "nothing to consolidate since <date>"; loading → runs only when idle, never during a turn; partial → "index at <n>% of its cap" as a `warning` line over 80 %; error → the pass's cause in the journal, the notes untouched

## Criteria

- [ ] given a session whose history has been compacted twice, the second summary was made from messages that are not themselves a summary (the prior summary is excluded from the summariser's input)
- [ ] given a compaction fires, exactly one journal write happens before the summary is made, and the transcript shows one `compaction` row naming the line count
- [ ] given Melody boots, the text loaded from her folder is her charter, her index, and at most yesterday's and today's journal — no topic note is loaded that she did not ask for by name
- [ ] given an index over 200 lines or 25 KB, the write succeeds, the loader takes the first 200 lines, and a `warning` line says so; at 80 % of either cap the line already shows
- [ ] given a companion runs a job, no message from Melody's transcript is in the companion's first prompt, and the text that reaches Melody is the report alone, under 2,000 tokens, with a session id the Agents pane can open
- [ ] given a journal line, it carries a date and one of `stated` · `observed` · `inferred`; a note line carries the same plus the journal entry it came from
- [ ] given a charter, no commit to it is authored by an agent process; every agent proposal to it is a diff the user accepted
- [ ] given a proposed charter change, the review shows the companion's test-set results for the old and the new charter, one row per task, run within the last hour; a companion with fewer than three judged tasks shows "not enough history to test" instead of scores
- [ ] given the test set, every task in it is a past job whose outcome the user marked (landed · corrected · failed) and whose correction, if any, is its expected result; no task is written by an agent
- [ ] given a consolidation pass, the raw journal files are byte-identical before and after
- [ ] given Melody idle, no model call is made and nothing in her folder is read, except one consolidation pass per day on a fixed budget (step 8) — idle costs nothing beyond that pass
- [ ] given the user reverts a commit in her folder, her next boot reflects the reverted state with no cache in the way
- [ ] both loops: every criterion above that touches compaction holds with `GOOSE_STATE_MACHINE=1` and without (AGENTS.md §Agent Loop Migration)

## Scope

- out: fine-tuning any model (the seats are subscriptions; improvement happens in memories, charters, the test sets and routing); Melody's knowledge of every session (the ledger of what is running and what needs the user — the Melody pane's own PRD, not memory's); semantic or vector search over notes (grep matched embeddings at 1/100th the cost on real sessions — research §Axes); a companion editing its own charter, or Melody applying a charter change without the user (nothing shipped does this safely — research §Self-improvement); memory shared between agents (each folder is private; Melody reads a companion's folder by path, and that is the only sharing); a nightly job on a paid seat with no budget (the $227 incident); syncing folders across machines (one Mac; git remote is the user's to add); a fourth companion or a companion picker (three, named in their charters); a rewrite of the memory extension (`goose-mcp/src/memory` stays for what it does today)
- protected: the raw journal is never rewritten by any process, agent or pass; `charter.md` is never agent-written; sessions in SQLite stay the full record (`session_manager.rs:456`) — the folder is derived from them, never the other way; `agent.rs` and `state_machine/` change together or not at all; `/fs/*` and `/git/*` containment (`ARCHITECTURE.md` §Modules · ui/sidecar) is not widened — a folder the panes show is one a session's cwd can reach; the One Dock Rule (Melody lives in the Work column, no new column)

## Open decision (the user's)

- **Where the folders live.** (a) **one git repository at `~/Melody/`**, a folder per agent inside it (`melody/`, one per companion) — plain markdown in home, browsable in Finder and pushable; Melody's session cwd is the toplevel, so the Files, Changes and Git panes reach her notes *and* every companion's charter within the containment already built (`/fs/*`, `/git/*` are held to the session cwd's toplevel — a repo per agent would put a companion's charter out of reach, and step 7's diff would never show) — recommended, because steps 7 and 9 then ride the panes already built, with no new surface; (b) `~/Library/Application Support/Melody/agents/<name>/` — beside the profile, hidden from Finder by default, and outside every session cwd, so steps 7 and 9 need their own pane. The P0 walk is the same either way.

## Tranches

- **P0 — Melody alone remembers:** steps 1–4 and 9; the folder, the boot, the journal, the flush-then-summarise-from-originals in both loops, the index cap. The outcome's first half ("she answers from Friday's work").
- **next — companions and charters:** steps 5–7; a companion's folder and fresh boot, the report card, the charter diff through Changes. The outcome's second half. Planned at its own gate on what P0 supplies.
- **later:** steps 8 and 10.
