# UX pass — research v1

Dated 2026-09-22. User: "can you do a full ux pass on melody-agent2? what are like mvp parity ux things you think we are must and we don't have? … is the ux flow tight and works end to end?" Research only: nothing in `tasks.md` changes until the user picks. Neighbours: `PRODUCT.md` §2 (the outcome that says it worked), §11 (Must / Should); `DESIGN.md`; `docs/2026-09-18-ux-parity-plan-v1.md` (the last parity read).

## Verdict

- **Direct loop: works end to end, with friction.** Prompt → edit → Changes bar → Review → Accept → Commit landed in one window: `ac7e317` in the scratch repo, 49 s from launch, one Sonnet turn.
- **Orchestrate loop: fails whenever a worker runs past about 60 s.** A synchronous `delegate` from a `claude-code` orchestrator returns "The operation timed out". The child keeps running; the orchestrator answers without its result. So the RPI walk stalls at Research whenever research is slow (task 154, reproduced twice on 2026-09-22; `rpi-strip.spec.ts:67`). That is the product's central promise (`PRODUCT.md` §2: "prompt → delegated work → reviewed diff → commit … which runtime did each step").
- **The second half of that promise is weak too.** Even when the loop works, the transcript doesn't name what the agent touched. Tool rows read `Edit`, `Terminal`, `Read file` with no path or command.
- **Parity:** most of the §11 Must list is present. The gaps are in how the loop wraps up (the commit, errors, approvals across sessions), not in missing panes.

## What ran (evidence)

- `just smoke` → 9 passed, 1 failed (3.1 min). The failure is spec drift, not a UX bug: `sidebar.spec.ts:45` expects the repo chips whenever sessions exist, but `NavigationPanel.tsx:568` shows them only for `chips.length > 2`.
- A scratch tour walk (deleted after the run) on a fresh git repo, 1440×900, one live Easy turn, screenshots in `docs/2026-09-22-ux-pass/`. The timings are from its log:
  - the turn settled 19 s after send
  - the Changes bar appeared **5.8 s after the turn ended**
  - Review → Accept all → Commit → `ac7e317`
- An Explore sweep of the renderer for 21 capability rows (§Parity table). Its headline claims were re-read by hand: `RpiStrip.tsx:106`, `ArtifactPane.tsx:146`, `RuntimesGate.tsx:40-46,124-132`, `DESIGN.md:111`.
- Not run: the `@seat` walks (`rpi strip`, `agents pane`, `review pane`). Task 154 already records today's `rpi strip` failure and its cause, and one Sonnet turn was spent in total.

## Must-haves missing (P0: the loop isn't trustworthy without them)

1. **Delegation completes.** Task 154: the sync `delegate` hits a cap of about 60 s. Fix (a) there, `async: true` in `orchestrator.md`, needs no code. Until it lands, Hard / Orchestrate in the UI is a coin toss.
2. **The transcript names what the agent touched.**
   - Tool rows show the adapter's first title only (`09-turn-done.png`: "Edit", "Terminal"). The adapter sends `Edit ${path}` or the command once the input streams in (`claude-agent-acp/dist/tools.js`, `title: displayPath ? \`Edit ${displayPath}\` : "Edit"`). "Read file" isn't a string that adapter builds (`"Read " + displayPath`), so the label probably comes from the ACP `kind` or from a different adapter version. The cause isn't confirmed.
   - Claude Code desktop and Codex both name the path on the row. (The inline diff card, task 93, is P1: the Changes path covers the need.)
3. **Change state and wording are accurate.**
   - Review opens Changes with nothing selected: "Select a file to see its changes", even with one file (`11-review-diff.png`).
   - "Accept all" only stages. It opens Git with an empty message box (`ChangesBar.tsx:91-100`), but `DESIGN.md:111` says it "commits, the message drafted from the turn". The label and the doc should match what it does. (Drafting the message is P1.)
   - A run that only creates files can't be Accepted (`tasks.md:294`). New files are an ordinary MVP journey.
   - After staging and after the commit, the bar reads **"0 files · +0 −0 · Review · Accept all · Discard"** (`14-after-commit.png`). It hides only when `gitStatus.entries` is empty (`ChangesBar.tsx:33`), and that value comes from the 30 s poll. The number itself comes from an unstaged-only numstat. Staged work is still uncommitted, so the bar should say "staged · Commit", not hide.
   - Esc mid-tool-call leaves Commit disabled (`tasks.md:296`): stopping work is ordinary, and afterwards the loop can't finish.
4. **"Needs you" is visible across sessions.**
   - Sidebar rows have streaming / error / unread / idle, and no waiting-for-approval state (`NavigationPanel.tsx:248-259`).
   - Notifications fire on turn and worker end, never on an approval ask (`notifications.ts:1-47`).
   - With routines and background sessions, an Approve-mode ask stalls silently. That's also the open hand-check at `tasks.md:295`.
5. **Failure has a next step.**
   - A failed turn is a toast, "Couldn't send message", with no Retry (`useChatSession.ts:102`).
   - No UI exists for a rate limit or a closed quota window; a grep for 429 / rate limit / quota finds nothing.
   - There's no Regenerate.
   - `PRODUCT.md` §13 promises "a closed quota window fails over instead of stalling", and the user can't see whether that happened.
6. **First touch doesn't break.**
   - On the Hub, the `/` and `@` popovers render inside the composer card and are clipped to one row, hiding the input (`05-at-mention.png`: "2 items found", one visible).
   - Mentions show absolute `/private/var/…` paths.
7. **Hard says what it does.**
   - The lever is three unlabelled dots (`01-first-paint.png`). Its words are screen-reader-only by design (task 123).
   - The Agents empty state says "when a session in Orchestrate delegates", a word Easy never shows. A user can't choose orchestration without knowing it's there.
8. **The Runtimes gate tells the truth.**
   - agy's Sign in types the sentence "sign in through \`agy\` once in a terminal" into the shell (`RuntimesGate.tsx:44`).
   - Install opens hard-coded pages, and Codex's is `https://codex.withexo.com` (`:128`), which is not an OpenAI domain. It should be verified or replaced.

## Friction (P1: works, reads rough)

- **Diff cards and a drafted commit message** (task 93; `DESIGN.md:110-111`): parity items, moved here from P0 on the advisor's read.
- **Keyboard-only completion** (`DESIGN.md:198`): not walked this pass, and the loop has no keyboard path verified from prompt to commit.
- **Hub placeholder.** "⌘↑/⌘↓ to navigate messages" (`keyboardShortcuts.ts:18`) sits where the invitation to type a task should be.
- **Surface sprawl.**
  - There are 11 panes (`06-pane-add-menu.png`), and three of them do one job, "look at what changed": Changes, Git and Review.
  - The Work panel's tab bar overflows with a scrollbar at 4 tabs (480 px).
  - The rail ⋯ menu has 22 items mixing panes, session actions and app settings (`16-rail-more-menu.png`).
  - The Work panel takes about a third of the Hub while it reads "No tabs — add one with +".
- **Two timestamp styles per message.** Sans "4:44 PM" under tool rows and mono "4:44 PM" under text (`09-turn-done.png`).
- **The send disc's usage ring reads as a spinner** after the turn ends (`14-after-commit.png`).
- **Revise… doesn't focus the composer.** `RpiStrip.tsx:106` and `ArtifactPane.tsx:146` query `chat-input-field`, but the textarea is `chat-input` (`ChatInput.tsx:1677`).
- **Narrow window.**
  - At 390 px the empty composer fills the lower half.
  - No pane tab rail was visible, although `PRODUCT.md` §11 says one pane at a time behind a tab rail (`17-phone-width.png`).
  - After resizing back to 1440, the tour's click on the Chats tab timed out (30 s). That's plausible, not confirmed; `phone.spec.ts` covers the web build, not a narrowed Electron window.
- **`DESIGN.md:177` is garbled** (two edits interleaved character by character, "Task 697: the sidession menubar's Boarowsd…"). This is committed at HEAD.

## Already logged, still undecided (`tasks.md` §Notes and hand checks)

- The recipe-trust prompt on the fork's own roles (`:297`): every fresh profile's first Hard turn asks, so it's a first-run hit.
- Routines inherit the session's mode and stall on the first ask (`:295`), which is P0 item 4 above.
- Esc → Commit disabled (`:296`) and Accept ignoring untracked files (`:294`) moved into P0 item 3.

## Parity table (Claude Code desktop · Codex desktop → melody)

| Capability | melody | Evidence |
|---|---|---|
| Streaming, tool rows, thinking | ✓ (rows untitled, see P0-2) | `GooseMessage.tsx:162` |
| Stop, queue while busy, edit & resend | ✓ | `ChatInput.tsx:2023`, `MessageQueue.tsx`, `UserMessage.tsx:401` |
| Retry / regenerate | ✗ | none found |
| Copy a reply that has tool calls | ✗ (text-only replies) | `GooseMessage.tsx:135-137` |
| @files, /commands, images, attach | ✓ (popover clipped on Hub) | `ChatInput.tsx:909,1017,1936` |
| Approve card, per-session mode | ✓ (mode in Advanced only) | `ToolApprovalButtons.tsx:153`, `SessionControls.tsx:102` |
| Plan mode | partial (a prompt rule, walk 96 unrun) | `RpiStrip.tsx:169-194` |
| Diff, per-hunk stage/reject | ✓ (unified only) | `DiffPane.tsx:316-386` |
| Line comments sent to the agent | partial ("Ask about this" per hunk) | `DiffPane.tsx:343` |
| Commit · drafted message | ✓ · ✗ | `GitPane.tsx:586`; `ChangesBar.tsx:91` |
| Push · PR · CI checks | via "Push and open PR…" only · ✓ · ✓ | `GitPane.tsx:404,656,604` |
| Branch switch | ✗ | `GitPane.tsx:481` display-only |
| Worktree per session, merge back | ✓ (Advanced) | `SessionChips.tsx:165`, `DiffPane.tsx:767` |
| Terminal, editor, files, markdown, browser | ✓ (files: name filter, no content search) | `panes/*` |
| Session search titles + transcripts | partial (two surfaces, each half) | `sidebar-sessions.ts:131`, `session_manager.rs:364` |
| Pin · unarchive | ✗ · ✗ | none found; `useSessionActions.ts:291` |
| Status: needs approval | ✗ | `NavigationPanel.tsx:248` |
| Context ring, compact, cost | ✓ (plan limits never passed) | `UsageRing.tsx:46,171` |
| Undo a turn | ✓ (one turn, no checkpoint list) | `UserMessage.tsx:377` |
| Subagent tree, transcript drill-down | ✓ (no artifact link, `TODO(task 30)`) | `AgentsPane.tsx:155` |
| Palette · shortcut help | ✓ · partial (fork keys missing) | `CommandPalette.tsx`; `KeyboardShortcutsSection.tsx` |
| Routines, runs inbox, board | ✓ | `RoutineSheet.tsx`, `RunsInbox.tsx` |
| Phone web build | ✓ | `static.ts`, `pane-store.ts:33` |

## Options

| | What | Buys | Costs |
|---|---|---|---|
| **A · Close the loop** | P0 1–8 as one tranche: 154 (a), tool-row titles, Review auto-selects, Accept that matches its label and includes new files, a staged state on the bar, Esc → Commit, a needs-approval dot + notification, Retry on a failed turn + a quota line, the Hub popover, the lever's words, the Runtimes gate strings | The §2 outcome, prompt → delegated work → reviewed diff → commit with the runtime named, becomes demonstrable | About 8 tasks, 2 of them `@seat` walks; the quota line needs to know what each adapter reports |
| B · Parity sweep | P1 table rows: regenerate, copy, pin/unarchive, branch switch, push, unified session search, shortcut help | Checklist parity with Claude Code / Codex | Leaves Orchestrate broken; none of it is the thesis |
| C · Declutter | Hub placeholder, fold Review into Changes, trim ⋯ to session actions, tab overflow | A calmer first run | Cosmetic while the loop still drops the delegation |

- **Recommend A.** The promise fails at two points today: the delegation times out, and the transcript doesn't show what changed. Everything in B and C is polish on a loop that doesn't close.
- **Assumption that flips it:** if the user's real daily use is Direct (Easy / Medium) and Orchestrate is a demo, run A minus item 1, then C.
- **Advisor (UX lens, Codex `gpt-6-astra`, 2026-09-22):** agreed with A. It moved diff cards and message drafting to P1, promoted new files, Esc → Commit and Hard's discoverability to P0, and bounded the Orchestrate claim to the 60 s case. All of that is taken above. It also asked that each A task's walk cover new files, cancel and recovery, a background approval, and async delegation through a reviewed commit.
- **Missing before planning:** whether a quota or rate-limit event reaches the desktop from any adapter at all (read `acp/errors.ts` and one adapter's error shape); which `claude-agent-acp` the spawn in `providers/claude_acp.rs` actually runs; then how `ToolCallWithResponse` picks its label, `kind` vs `title`.
