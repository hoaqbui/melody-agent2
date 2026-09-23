# UX Must + Should — plan v1

Dated 2026-09-22. Companion: `docs/2026-09-22-ux-pass-research-v1.md` (option A plus the Shoulds; MoSCoW in chat, 2026-09-22). User: "queue those all up in a plan with tasks, and orchestrate" → "focus on must and shoulds". This plan ships the Must and Should rows. Could and Won't are out.

## Approach

- **Design first, where design is open.** Three mockup sheets, drafted by the session: 155 the lever's words, 156 the failed-turn card and quota notice, 157 a sheet of states (the Changes bar, the sidebar's "needs you" row and notification, a transcript match in search). They follow `docs/mockups/`'s pattern: one standalone HTML per sheet on the Studio light tokens (`theme-tokens.ts` `lightColorTokens`), options side by side. 164–168 and 171 wait on the user's pick.
- **Everything else starts now, in waves of disjoint files.**
  - The adapter title fix (158) lands before task 93's diff cards, since both read the same toolRequest.
  - The Changes bar work (166) lands before the drafted commit message (168) and the keyboard walk (176).
- **Workers edit; the session reruns every `confirm:`.** Chain per AGENTS.md §Model routing: `claude -p --model haiku` first, `codex exec -s workspace-write -m gpt-5.6-sol` next (agy is parked). The session commits one task per commit after rerunning its confirm.
- **Walks share port 7788**, so one walk at a time; vitest runs in parallel.

## Out of scope

- Could and Won't rows from the MoSCoW: pane consolidation, the ⋯ trim, tab overflow, timestamps, pin and unarchive, branch switch, line comments, checkpoints, the narrowed-window layout, runtime colour, one icon set (user: "focus on must and shoulds").
- Task 96's plan-gate walk and ten Hard runs. They're tranche 10's and need a signed-in seat window; 154 unblocks them.
- Upstream issues for any of this (task 33, parked by the user).

## Tasks

Moved to `tasks.md` under `### docs/2026-09-22-ux-must-should-plan-v1.md` on 2026-09-22 (user: "queue those all up … and orchestrate"). Existing tasks carried in order, not duplicated: **154** (delegation, Must 1) first; **93** (transcript diff cards, Should) after 158.

Approval gate:
- 164–168 and 171 wait on the user's pick from 155–157.
- 177 and 178 are the user's decisions, with a recommendation each, under §Waiting on the user.
- 174 changes the Hub placeholder wording (from "⌘↑/⌘↓ to navigate messages" to "Describe a task…" when the chat is empty). Flag it if the words should differ.
- 164 reverses task 123's screen-reader-only lever word; that reversal is the point of 155.
