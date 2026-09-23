# Melody rename — PRD and plan

Dated 2026-09-22. Companion: `docs/2026-09-22-melody-rename-research-v1.md` (pick A, confirmed).
Ships the desktop app as Melody: its name everywhere a person reads it, Melody.app with its own
bundle ID, its own app folder migrated once, the updater off, and the agent calling itself Melody
> one commit per task on `main`.

## Problem

Every surface of the fork still says Goose: the dock, the menu bar, the window title, 92 English
strings, 15 locales, and the agent's own answer to "who are you". The emblem is already Melody's
(`c574bad2c`). Outcome: after one relaunch the user reads "Melody" everywhere the app speaks, and
their theme, window layout, workspace state and recipe trust are all still there.

## Journey

1. [Goose.app running] · P0
   - does: quit it, open the rebuilt `Melody.app`
   - rule: if `~/Library/Application Support/Melody` is absent and `.../Goose` exists then its
     contents are copied in before the window opens; `.../Goose` is left untouched
   - → [Melody window, the user's theme and layout]; fail(copy error) → [Melody window on a fresh
     profile, the error in `main.log`, `.../Goose` intact]
2. [Melody window] · P0
   - does: read the dock, the app menu, the window title, the chat's welcome and placeholders
   - rule: if the text names the product then it says Melody; if it names a real goose thing
     (`.goosehints`, `goose://`, `GOOSE_*`, `.goose/`, the `goose` CLI) then it keeps its name
   - → [every brand word reads Melody]
3. [Melody window] · P0
   - does: open the app menu
   - → [About Melody · Settings… · Hide Melody · Quit Melody]
4. [chat on a goose-native provider] · later
   - does: ask "what is your name?"
   - → [the agent answers Melody]
5. [Melody running] · P0
   - does: nothing, for a day
   - rule: the updater is off, so no upstream release is offered or installed
   - → [no update prompt, no tray update badge]

## States

- first launch: empty (no Goose folder) → a fresh profile, no copy; partial (a copy interrupted)
  → the next launch sees `.../Melody` present and does not copy again (P0 accepts this: the Goose
  folder stays for a manual redo); error → as step 1's fail.
- walk profile (`GOOSE_USER_DATA` set): no migration, ever.
- macOS permissions: microphone and Automation are asked once more under the new bundle ID.
- Browser pane: its site logins may be gone (the cookie key is named after the app).

## Criteria

- [ ] given `GOOSE_USER_DATA` is set, when the app starts, then nothing is copied.
- [ ] given `.../Melody/settings.json` exists, when the app starts, then nothing is copied.
- [ ] the copy skips Chromium's `Singleton*` lock files and regenerable caches, so a copied
  profile is never "in use" and the first launch copies ~15 MB, not 1.9 GB.
- [ ] `.../Goose` is byte-identical after the copy.
- [ ] the backend folders (`~/.config/goose`, `~/.local/{share,state}/goose`), the keychain service
  `goose` and the `goose://` scheme are unchanged.

## Out of scope

- Backend folders, keychain service, `goose://`, crate and binary names, `GOOSE_*` (research pick A,
  depth rule).
- "goose is compacting the conversation…" from the backend (`agents/agent.rs:87`,
  `state_machine/ops_compaction.rs:26`): ARCHITECTURE.md §Invariants forbids fork edits there. The
  desktop's own indicator copy (`LoadingGoose.tsx:31`) does change.
- Upstream `documentation/`, GitHub workflows, scenario-test recordings (keyed by messages, not
  the system prompt — `providers/testprovider.rs:78`).
- Component and file names (`Goose.tsx`, `LoadingGoose`, `persist:goose`, test ids): identifiers,
  not words a person reads.
- Goose drawings: `FlyingBird` (goose-flight frames while a turn streams), `Geese.tsx` (the recipe
  modal) and `Rain` (the logo's hover). A rename changes words; new artwork is design work, and
  DESIGN.md §Iconography (2026-09-22) left them as upstream's. Listed for the user below.
- Deleting `~/Library/Application Support/Goose`: the user's call after the hand check.

## Approach

- **Identity** — packaging names, bundle ID, build scripts; ships alone, nothing reads the new name.
- **Migration** — one pure helper plus its call before `SETTINGS_FILE`; lands before the identity
  task (task 183 is blocked by task 184), since it is a no-op while the name is still Goose.
- **Commits** stage only the task's named paths: `ui/desktop/src/workspace/Lever.tsx` carries the
  user's uncommitted lever change and is not this plan's.
- **Words** — main process, renderer, English messages, locales, backend strings, prompts; each
  independent.
- **Build** — last: the packaged app, the smoke walks, the user's hand checks.

## Tasks

Moved to `tasks.md` §Tasks, tasks 183–193 (approved 2026-09-22).

Approval gate: tasks 1–10 wait on sign-off. Task 2 is the only one that touches user data; it
copies and never deletes. Only the user can verify, after task 10: the first launch keeps their
theme, layout and workspace; the app menu shows Settings…; the microphone prompt names Melody;
whether the Browser pane's logins survived; whether `goose://` links open Melody (the old
`out/Goose-darwin-arm64/Goose.app` still claims the scheme — move or delete it if they open Goose);
whether the goose drawings should get Melody artwork (a design task, not in this plan). Approved → the list lands in `tasks.md`; this section
keeps only that pointer.
