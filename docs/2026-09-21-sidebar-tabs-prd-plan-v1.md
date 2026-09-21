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

## Journey (C)

1. [Rail] · P0 — **three tabs** under the traffic lights: **Chats · Library · Automate**;
   Settings stays at the foot. The tab is remembered per app (localStorage). Roving arrows
   move between tabs (ARIA tabs); a tab's panel is one list.
2. [Chats] · P0 — a header row: **New chat** (`+`, ⌘N — the old first nav row), a **search**
   field (filters as you type on title and project; `/` focuses it; Esc clears), a **sort**
   menu — **Recent** (default) · **Name** · **Project**.
3. [Chats] · P0 — sessions **grouped by repository**: a worktree's sessions fold under its
   repo with a `wt/<slug>` tag on the row (mono, machine text); scratch and temp dirs
   (`$TMPDIR`, `/var/folders`, `/tmp`) fold into one **Elsewhere** group at the foot; groups
   collapse and the collapse is remembered; a single group shows no heading. Under Name and
   Project the list is flat (Project sorts by repo label then recency).
4. [Chats] · P1 — **Show all** at the foot opens `/sessions` (upstream's Session History; it
   leaves the nav as a row).
5. [Library] · P0 — Recipes · Skills · Apps (when the extension is on) · Extensions, the
   existing routes as rows with their icons.
6. [Automate] · P0 — Board · Scheduler, likewise.
7. [Phone] · P1 — the same rail; the tabs fit 375 px.

## Rules

- Nothing new to learn: the routes, icons (lucide, upstream's rail set) and rows are the
  ones there today, re-homed. The only new controls are the tabs, the search field and the
  sort menu.
- Search never leaves the tab; an empty result reads "No chats match".
- Test ids: `sidebar-tab-chats|library|automate`, `sidebar-search`, `sidebar-sort`,
  `sidebar-group-<label>`, `sidebar-session-<id>`, `sidebar-new-chat`.

## Out of scope

Renaming, pinning or archiving chats; the rail's width and collapse behaviour (task 60);
upstream's Session History page itself; the walks' sessions in the list (task 147, first).

## Plan

- Pure logic first: `src/workspace/sidebar-sessions.ts` — `repositoryOf(workingDir)`
  (folds `.worktrees/<slug>` to the repo and names the slug; temp roots → `elsewhere`),
  `groupByRepository(sessions)`, `sortSessions(sessions, mode)`, `filterSessions(sessions,
  query)` — with `sidebar-sessions.test.ts`. `projectSessions.ts` stays for upstream's pages.
- Then the rail: `NavigationPanel.tsx` gains the tab strip and three panels; `NAV_ITEMS`
  gains a `tab` field (`library` | `automate`) and loses `home` and `sessions` as rows;
  `useNavigationSessions.ts` unchanged.
- Then the Chats header (search, sort, `+`) and the grouped list with the `wt/<slug>` tag.
- One walk, seat-free: the tabs, the panels' rows, the search field's empty state, the sort
  menu — `tests/e2e/sidebar.spec.ts`, tagged `@smoke`. Grouping and sorting are unit-tested.
- `DESIGN.md` §Vocabulary: **tab** (rail), **Elsewhere**; i18n extract + seed.

## Tasks

Approved → `tasks.md` under `### docs/2026-09-21-sidebar-tabs-prd-plan-v1.md`; this section
keeps only that pointer.
