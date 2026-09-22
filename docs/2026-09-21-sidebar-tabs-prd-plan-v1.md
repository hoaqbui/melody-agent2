# Sidebar tabs — PRD + plan

Dated 2026-09-21. User, on the Sessions rail: "organize this left side a bit. reduce the amount
of needed groups. add search and sorting" → options A (one list per repo) · B (flat list) · C
(sidebar tabs) → **C**. One document: the rail is small enough that the PRD and the plan fit
on a page.

## What the rail is today (read this session)

- `NavigationPanel.tsx` (upstream's, fork-touched): eight nav rows from `useNavigationItems.ts`
  `NAV_ITEMS` — New Chat · Recipes · Skills · Apps (when the extension is on) · Scheduler ·
  Extensions · Board · Session History — then a **Chats** section, then Settings.
- Chats: `useNavigationSessions.ts` lists the 25 most recent sessions and
  `projectSessions.ts` `groupSessionsByProject` groups them **per working directory**, so
  every worktree (`<repo>/.worktrees/<slug>`) and every scratch dir is its own heading. No
  search, one order (recent).
- The walks' sessions land in the same list (task 147 — the dev app and the user's app share
  one profile and one `sessions.db`); the rail in the user's screenshot is half test rows.

## Problem

Eleven headings before the first chat; the chats then split into as many groups as there are
checkouts; nothing to type into; one order. The rail is the app's first column and reads as
an index of everything rather than a way to the conversation.

## Journey (C3 — picked 2026-09-22 from the mockups, after C1 for a minute)

1. [Rail] · P0 — a **bottom tab bar**: **Chats · Library · Automate · Settings**, icon over a
   10 px label, the active one in the accent; the tab is remembered per app (localStorage);
   roving arrows move between tabs (ARIA tabs). Settings is a tab, not a foot row.
2. [Chats] · P0 — **search first**: the field sits under the traffic lights with **+ New
   chat** (⌘N) beside it; it filters as you type on title, repo and slug; `/` focuses it;
   Esc clears; an empty result reads "No chats match".
3. [Chats] · P0 — a row of **repo chips** under the search: **All · <repo> … · Elsewhere**,
   each with its count; one is pressed; a worktree's sessions count under their repo;
   scratch and temp dirs (`$TMPDIR`, `/var/folders`, `/tmp`) are **Elsewhere**. The chip
   row scrolls sideways when it overflows; the pressed chip is remembered.
4. [Chats] · P0 — a **flat list grouped by day** — Today · Yesterday · a weekday within the
   week · a date after — each row a title line (time at the right, the unread dot before it)
   and a meta line naming its **repo** and, for a worktree, `· wt/<slug>` (mono, machine
   text). A **sort** control on the first day heading: **Recent** (default) · **Name** ·
   **Project**; under Name and Project the day headings give way to one flat list.
5. [Chats] · P1 — **Show all** at the list's foot opens `/sessions` (upstream's Session
   History; it leaves the nav as a row).
6. [Library] · P0 — Recipes · Skills · Apps (when the extension is on) · Extensions, the
   existing routes as rows with their icons.
7. [Automate] · P0 — Board · Scheduler, likewise; a one-card summary above them (routines
   and next run, the board's running and needs-review counts) when the data is there.
8. [Phone] · P0 — the same rail; the bottom bar is the phone pattern and fits 375 px.

## Rules

- Nothing new to learn: the routes, icons (lucide, upstream's rail set) and rows are the
  ones there today, re-homed. The new controls are the tab bar, the search field, the repo
  chips and the sort control.
- Search and chips compose: the list is the pressed repo's sessions that match the text.
- Test ids: `sidebar-tab-chats|library|automate|settings`, `sidebar-search`,
  `sidebar-chip-<repo>` (`sidebar-chip-all`, `sidebar-chip-elsewhere`), `sidebar-sort`,
  `sidebar-day-<label>`, `sidebar-session-<id>`, `sidebar-new-chat`, `sidebar-show-all`.

## Out of scope

Renaming, pinning or archiving chats; the rail's width and collapse behaviour (task 60);
upstream's Session History page itself; the walks' sessions in the list (task 147, first).

## Plan

- Pure logic first: `src/workspace/sidebar-sessions.ts` — `repositoryOf(workingDir)`
  (folds `.worktrees/<slug>` to the repo and names the slug; temp roots → `elsewhere`),
  `repoChips(sessions)` (label, key, count; All first, Elsewhere last), `dayOf(updatedAt,
  now)` (Today · Yesterday · weekday · date), `groupByDay`, `sortSessions(mode)`,
  `filterSessions(sessions, { repo, query })` — with `sidebar-sessions.test.ts`.
  `projectSessions.ts` stays for upstream's pages.
- Then the rail: `NavigationPanel.tsx` gains the bottom tab bar and four panels; `NAV_ITEMS`
  gains a `tab` field (`library` | `automate`) and loses `home` and `sessions` as rows;
  Settings becomes the fourth tab; `useNavigationSessions.ts` unchanged.
- Then the Chats panel: search + `+`, the chip row, the day-grouped list with the meta line
  and the sort control, Show all.
- One walk, seat-free: the four tabs and their panels, the search empty state, the chip
  row's All, the sort control, ⌘N — `tests/e2e/sidebar.spec.ts`, tagged `@smoke`. Grouping,
  chips, days and sorting are unit-tested.
- `DESIGN.md` §Vocabulary: **tab bar** (the rail's), **repo chip**, **Elsewhere**; i18n
  extract + seed.

## Mockups

Three takes on C, 2026-09-22: https://claude.ai/artifact/2qqzGXfxNM8UmHS7hvHt9j — C1 (segmented
tabs on top, one heading per repo, worktrees folded with a `wt/` tag), C2 (icon rail), C3
(bottom tabs, repo chips, flat by day). User: "c1", then "wait, c3" — **C3**; the journey above is C3's.

## Tasks

Approved 2026-09-22 (user: "c1" → "wait, c3") → `tasks.md` under `### docs/2026-09-21-sidebar-tabs-prd-plan-v1.md`;
this section keeps only that pointer.
