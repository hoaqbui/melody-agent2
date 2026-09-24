# PRD — Team health and Usage as Work tabs (T2a)

Dated 2026-09-23. **v1, draft for the user's approval** (task 270). The plan owns the order and the gate: `docs/2026-09-23-team-memory-program-plan-v2.md` T2a (`:44`), gate `:57`, decision 2a — Work tabs first, 2b — these two tabs only (`:22-23`). The walk behind the tabs is `docs/2026-09-22-agent-memory-prd-v2.md` (steps 5–6, the notebook layout). Mockups: `docs/mockups/2026-09-23-team-health-panel.html` (content only — its 1·1·2 layout is decision 2a's rejected option), `2026-09-23-usage-versions.html` **version D** (the merged one), `2026-09-23-melody-home.html` (the tab row). Names and states cite `DESIGN.md`. Downstream: tasks 271 (routes), 272 (seat windows), 273 (Team health), 274 (Usage) build to §Data sources and §Criteria below.

## Problem

- Whether the team is healthy is asked of Melody, never shown: memory against its cap, which chats left a note, what waits on the user, and which jobs landed clean live in `~/Melody` (git), goose's sessions and the work ledger, with no surface that reads all three.
- The Telemetry pane folds one ledger — the sidecar's spawn root's (`ui/sidecar/src/ledger.ts:164-183`) — and nothing reads `~/Melody` unless the app happened to launch on the home directory.
- The quota wall arrives unannounced: goose folds every rate limit into `CreditsExhausted` with no reset (`crates/goose/src/acp/provider.rs:183-207`); the send disc's ring was built for plan windows but no caller passes any (`UsageRing.tsx:46`, `:57`; the one caller `ChatInput.tsx:2071-2078` passes none).
- Outcome that says it landed: on a Tuesday the user opens Usage and reads "Codex weekly · closes Thu 11:00" in time to move work; opens Team health and sees 170 / 200 memory lines and a check-in due, and one click starts it in Melody's tab.

## Users

- **The user (Hoa)** — one person running Melody and her companions across several repositories on one Mac, desktop first at ~1440 px (the Work column ~752 px, usage mockup frame); glances several times a day (Usage), weekly in depth (Team health, the check-in).
- **Melody** — not a reader of the tabs; she receives "check-in" from **Start check-in**. Companions and workers never read either tab.

## Behaviour — Team health

1. [Work column, + menu] · P0
   - does: pick **Team health** from + (a Work tab like any other: `PaneId` `'team-health'` beside `pane-store.ts:4-16`, label and icon beside `WorkspaceShell.tsx:195-221`)
   - rule: the tab reads on open, on show and on **Refresh**; nothing is read while it is hidden (idle does no work)
   - → [Team health, loading] → [ready]
2. [Team health, ready] · P0
   - shows: header "Melody's team · <range> · last check-in <N> days ago"; range **This week** (default) · **Last week** · **30 days**; **Start check-in**
   - five tiles (task 273's list), each with a one-line "why" on hover like Telemetry's numbers:
     - **Memory** — `MEMORY.md` lines / 200, the count `melody-routines.py` cap-check uses (all lines, `scripts/melody-routines.py:85-102`, cap `:47`, warn past 160 `:46`); sub-line "full in ~N weeks" from the 8-week line, "—" with fewer than two weeks of history
     - **Chats with a note** — sessions whose `workingDir` is the notebook (the ACP session list, `ui/desktop/src/acp/sessions.ts:41`, `:44-45`) with a commit touching `journal/` between the chat's first message and ten minutes after its last — the week script's rule (`scripts/melody-notebook-week.py:25-49`, `:81`); sub-line the change on the previous range
     - **Waiting on you** — "yours": pending proposals (`proposals/YYYY-MM-DD-<name>.md`, the convention in `melody-routines.py:17-23`) plus jobs reading `unknown` with no verdict; "together": stale notes plus chats without a note, when a check-in is due (≥ 7 days, `melody-routines.py:52`, `:174-181`); sub-line "N yours · N together"
     - **Jobs done clean** — jobs in range with `outcomeOf(…).clean`, over all jobs (`ui/desktop/src/workspace/panes/telemetry/ledger-outcome.ts:90-102`); sub-line the corrected / reworked count and the member
     - **Stale notes** — `memories/**` pages past `stale_after` (the reminders rule, `melody-routines.py:183-197`) only; the notebook's other refresh rule, lines older than 30 days (`~/Melody/AGENTS.md` §Lifecycle, the mockup's "older than 30 days"), stays the check-in's Memory step, not a tile
   - the note strip: one cell per day of the range, noted · no note · no chat
   - memory over 8 weeks: `MEMORY.md` line count at the last commit of each week against the 200 line
   - member cards: **Melody** (chats in `~/Melody`, journal lines written) and one card per (repository, `member`) from the ledgers — until M2 `member` is the delegation role (`ledger-events.ts:173-178`; the live ledger holds only `implementer`), so a card reads "implementer · melody-agent2"; M2's companion names replace the role with no change to the tab; each card: jobs done / total, corrected, last job, and **Open** → that member's latest session
   - → [check-in]; tile click → the list behind it inside the tab (read-only)
3. [Team health, check-in] · P0
   - does: **Start check-in**
   - rule: sends "check-in" to Melody's session (M1b) and focuses her tab; the tab itself writes nothing, anywhere
   - → [Melody's tab, step 1 · Pulse] (`~/Melody/AGENTS.md` §Weekly health check)

## Behaviour — Usage (mockup D)

1. [Work column, + menu] · P0
   - does: pick **Usage** (`PaneId` `'usage'`); header "Usage · this week · <N> seats · now <ddd HH:mm>"; **Today** · **Week** · **Month** scope the team table only
2. [Usage, ready] · P0 — top to bottom, D's order (saturation, then rate and unit cost, then notes):
   - **Seat cards**, one per signed-in runtime (`/runtimes/probe`, `ui/sidecar/src/runtimes.ts:59`): each reported window as a bar — solid used, hatched projected — and one line:
     - projected under max: "~P% by <reset>"
     - projected over max before reset: amber card outline, "closes <ddd HH:mm> · resets <ddd>"
     - one reading only: "resets <when>", no projection
     - no window reported: the bar reads "not reported by this seat" (every seat until 272)
   - the projection (pure `usage-projection.ts`): pace = the change in `used` between the oldest reading in the last 24 h of the same window (same `resetsAt`) and now; projected = used + pace × (reset − now); when that crosses max, closes = now + (max − used) / pace. The fixture: Codex weekly 76 % Mon 15:30, 84 % Tue 14:00, resets Fri 09:00 → **closes Thu 11:00**
   - **The team** table over 8 weeks: member · jobs · corrected · tokens per clean job; tokens per clean job = the tokens of all the member's jobs in range (each job's child session, `acp/sessions.ts:33-34`, `:53-55`) ÷ its clean jobs, "—" with none; Melody's row counts chats. Worker turns are not in the ledger today (only `who: 'session'` lines, `ledger-events.ts:34`), so the child session is the only per-job token source
   - **Three notes at most**, each ending in one action that navigates and never changes anything: a closing window → **Show sessions on <seat>**; the costliest non-clean job → **Open job**; the largest tokens-per-clean-job change → **Open member**; none that apply → no notes
3. [Usage, any] · P1
   - rule: the send disc's ring receives the same windows (`ChatInput.tsx:2071` gains `planLimits` for the session's seat), no second source

## States

The rows are `DESIGN.md:137-152`'s; Telemetry is the precedent (`DESIGN.md:156`, `telemetry-state.ts:6`). Each tab declares its list — `TEAM_HEALTH_STATES`, `USAGE_STATES`: `empty · loading · partial · stale · error · ready`.

- **Team health**
  - empty → no notebook at the root: "No notebook at ~/Melody — start a chat there and Melody sets it up" (the notebook PRD's `BOOTSTRAP.md` step); a notebook but no ledger lines: the job tiles read 0 with "No delegated work yet"
  - loading → tiles keep their frames with skeletons, "Reading the notebook and ledgers…"
  - partial → the notebook isn't a git repository: the note strip, the 8-week line and "last check-in" read "—" under a bar "~/Melody isn't a git repository"; a ledger that fails to read is named in a bar, the rest shown; no chats in the notebook: Chats with a note reads "—"
  - stale → the last read is older than 5 minutes when the tab shows: the picture stays with "as of HH:mm" and re-reads at once (no `/fs/watch` exists for a second root)
  - error → the sidecar is unreachable or a route refuses: its cause, then **Retry**; the last good picture kept
- **Usage**
  - empty → no seat signed in: "No seats yet — sign one in from Settings", the runtimes probe's line per seat
  - loading → seat cards keep their frames; "Reading seats and ledgers…"
  - partial → a seat with no window: "not reported by this seat"; a window with one reading: no projection; a member with no clean job: "—"
  - stale → a reading older than one hour greys its bar with "as of HH:mm"; a reading whose reset has passed reads "reset — no reading since"
  - error → as Team health

## Data sources — three decisions

### 1. How the tabs read `~/Melody` (read only)

The sidecar has one root, fixed at spawn: `cwd: workingDir` (`ui/desktop/src/main.ts:1315-1317`), where `workingDir` is `--dir`, else the most recent directory, else home (`main.ts:2596-2599`, `utils/workingDir.ts:55-59`); `/fs/*` answers 400 outside that root's toplevel (`ui/sidecar/src/fs.ts:28-67`). Launched on home, `~/Melody` is inside it today, but writable and gone the next time the app opens on a repository.

- **A. A second, read-only root in the sidecar** — `MELODY_NOTEBOOK` (default `~/Melody`, realpath at spawn), three routes beside `ledgerRoutes` (`ui/sidecar/src/index.ts:80-85`): `/notebook/list {dir}`, `/notebook/read {path, rev?}`, `/notebook/log {path?, since?}`; resolved like `requestPath`, `..` and symlink escapes 400; no write route exists; git as fixed argv (`log --format`, `show <sha>:<path>`, `rev` a 40-hex sha from `/notebook/log`). Cost: an `ARCHITECTURE.md` amendment (text below). Works in the browser build and on the phone behind the same key.
- **B. Widen `/fs/*`** — breaks the notebook PRD's protected line "containment is not widened" (`docs/2026-09-22-agent-memory-prd-v2.md` §Scope) and opens writes.
- **C. Electron IPC from main** — breaks "the renderer runs in a browser" (`ARCHITECTURE.md:113`); no phone.
- **D. One summary route** that runs the rules sidecar-side — one call, but product logic in the machine layer (`ARCHITECTURE.md:93`), and a second copy of the rules.
- **Recommended: A.** It is a new root, not a wider one; the rules stay in pure renderer folds tested against the scripts' fixtures. `/notebook/log` is needed, not optional: chats-with-a-note, last check-in and the 8-week line all come from git (`melody-notebook-week.py:41-49`, `melody-routines.py:174-181`); file mtimes are rewritten by any checkout.
- The amendment 271 applies to `ARCHITECTURE.md` §Modules (sidecar) and §Invariants: "Amended <date> (task 271): a second, read-only root — the notebook (`MELODY_NOTEBOOK`, default `~/Melody`, realpath at spawn) — served by `/notebook/list`, `/notebook/read {path, rev?}` and `/notebook/log`, each refused 400 outside it; no route writes it; git runs only `log` and `show <sha>:<path>`, never a shell. `/ledger/list` and `/ledger/read {name}` read any `*.jsonl` in the ledger dir by bare name, read-only. `/fs/*` and `/git/*` unchanged."

### 2. How the tabs read every repository's ledger

- Found: the ledger file is keyed on the **spawn root**, not the request's repository (`ledger.ts:164-183`, `return ledgerFileFor(ledgerDir, toplevel)` with `toplevel` the spawn's). Launched on home, every repository writes `hoaqbui-ab0aab68.jsonl` (49 lines, last 20:33 today); launched in a repository, that one only (`melody-agent2-36784d33.jsonl`). Events carry no cwd, and a file name is a basename plus a hash (`ledger.ts:62-66`), not reversible.
- Fixed 2026-09-23 (`aa248e49e`, `defaultLedgerDir` roots at `<GOOSE_PATH_ROOT>/state/ledger` when set; sidecar ledger tests 104 passed). Found: the walks wrote into the user's real ledger dir — `defaultLedgerDir()` reads `XDG_STATE_HOME` (`ledger.ts:53-58`) while the walk profile sets only `GOOSE_PATH_ROOT` (`ui/desktop/tests/e2e/fixtures.ts:130`); 72 of the 76 files in `~/.local/state/goose/ledger/` are walk temp dirs (29 `goose-approve-mode-*`). goose itself roots state at `<GOOSE_PATH_ROOT>/state` (`crates/goose/src/config/paths.rs:8-13`).
- **A. `/ledger/list` + `/ledger/read {name}` over the ledger dir**, the dir rooted at `<GOOSE_PATH_ROOT>/state/ledger` when that is set; the tab unions every file, dedups by the one key (`ledger.ts:99-113`), and attributes a job to a repository by `sessionId` → the session list's `workingDir` → `repositoryOf` (`ui/desktop/src/workspace/sidebar-sessions.ts:62`), falling back to the file's basename. Two basenames that collide stay two rows.
- **B. The renderer passes the known repositories; the sidecar hashes each and reads those files** — no junk, but misses the home-rooted file that holds most of the history.
- **C. One sidecar per repository** — a process per project for a read.
- **Recommended: A**, with the `GOOSE_PATH_ROOT` fix in 271 so walks stop adding files, and 271 keys `fileFor` on the request cwd's toplevel when that is a repository inside the boundary, so new lines land one file per repository as `ARCHITECTURE.md:93` states; the read-side join covers the home-rooted history. The 72 existing walk files are a one-time clean-up (open question 2); until then any that hold jobs show as extra repository rows named after their temp dir.

### 3. Where seat plan windows come from

`UsageLimit` has no machine-readable reset — `resets` is the seat's own words (`ui/desktop/src/components/bottom_menu/usage-ring.ts:4-12`); the desktop drops `usage_update` in one adapter (`sessionNotificationAdapter.ts:109-110`) and reads only context and token totals in the other (`acp/adapter/gooseSessionNotifications.ts:12-27`); claude-agent-acp's `rate_limit_info` and codex-acp's `resetsAt` are never forwarded (task 182, `tasks.md:265`).

- **A. Forward the seats' own windows through the spine (272)** — goose passes each window on as a session notification; `UsageLimit` gains `resetsAt` (ISO), `windowMs` and `observedAt`, keeping `resets` as the label. Real numbers, including use outside Melody (the same Max plan in Claude Code). Lands with or after 182; readings arrive only when a seat answers a turn.
- **B. The sidecar reads each CLI's local files** — vendor-private formats; no seat is known to publish its windows that way. Not verified, not recommended.
- **C. The user types each plan's windows and caps** — bars with a max but no honest "used"; never "closes Thu".
- **Recommended: A**, with C's honesty until it lands: every seat card is partial ("not reported by this seat") and the team table and notes still work from the ledger. Readings persist per seat in the renderer's `localStorage` (the `project-storage.ts:60-76` pattern, try/catch, 7 days) so a relaunch keeps the pace; see open question 3.

### 4. What fixture the `team health` walk loads

- **A. Built fixtures, pointed at by env** — the walk sets `MELODY_NOTEBOOK` to a throwaway git repository built by `build_fixture()` (`melody-routines.py:238-250`, day offsets so it never drifts) from a new `scripts/fixtures/notebook-team-health/spec.json` (170 memory lines, one page past `stale_after`, a proposal 5 days old, journal commits on 3 days, a check-in 10 days ago); copies two ledgers (two repositories: one job landed, one corrected, one `unknown`) into `<GOOSE_PATH_ROOT>/state/ledger/`; seeds the seat readings the same way task 200's walk reaches a module (`tasks.md:327`: `import('/src/…')` in the page, dev walk only).
- **B. Stub the sidecar's answers with Playwright routing** — fast, but proves none of 271's routes.
- **C. The user's own `~/Melody` and ledgers** — private and never the same twice.
- **Recommended: A.** Chats-with-a-note needs sessions in the notebook, which the walk profile doesn't have; its fold is proven by vitest on `scripts/fixtures/notebook-week/` (4 · 3 · 1) and the walk expects "—" there.

## Scope

- out: Team Context, Reminders, Clean-up, Companions and Routines tabs, and every write to the notebook from a tab (T2b, task 275); Melody's home (2a) and tabs in the titlebar (2c); dollar prices, API-equivalent value (mockup C) and plan prices (no source); **Move <member>** and any routing change (M2); charter proposals and test-set scores in notes (T4); a Routines row in the team table (task 280); the 1·1·2 layout and the For you list of the team-health mockup
- protected: the notebook is never written by a tab or a `/notebook/*` route; `/fs/*` and `/git/*` containment unchanged; `USER.md` is never read by either tab; the ledger is read-only here — no new kinds; idle means no reads while a tab is hidden; `agent.rs` and `state_machine/` untouched (`ARCHITECTURE.md:119`)

## Open questions for the user

1. **"Waiting on you"** — recommended: yours = pending proposals + `unknown` jobs with no verdict; together = stale notes + chats without a note, counted only when a check-in is due. Or count only yours?
2. **The 72 walk ledgers already in `~/.local/state/goose/ledger/`** — delete them once after 271 lands (recommended; every name is a walk's temp dir, `goose-<spec>-<random>`), or leave them?
3. **Seat readings across relaunches** — `localStorage` per seat (recommended: per viewer, lost with site data, enough for pace), or a ledger kind (durable and on the phone, but an `ARCHITECTURE.md` kind amendment)?
4. **Opening the notebook from a tile** — Files and Editor can't reach `~/Melody` when the app opens on a repository (`fs.ts:63-64`), though the plan says they open it (`plan v2:44`). T2a: tiles open a read-only list in the tab, plus "Open in editor" on the desktop (`main.ts:2199`). Is that enough until T2b's Team Context?
5. **Plan prices** on seat cards ("$200 / mo") — leave out (recommended; nothing reports them), or a setting you fill in?

## Criteria

- [ ] given a sidecar spawned in a repository and `MELODY_NOTEBOOK` at a fixture, `/notebook/read {path: 'MEMORY.md'}` returns it, `../x` and a symlink out answer 400, `/notebook/log` lists the fixture's journal commits, and no `/notebook/*` route writes — `cd ui/sidecar && pnpm vitest run notebook`
- [ ] given two ledgers in the ledger dir, `/ledger/list` names both and `/ledger/read {name}` returns each; a name with `/` or `..` answers 400 — `cd ui/sidecar && pnpm vitest run notebook`
- [x] given `GOOSE_PATH_ROOT` set, `/ledger/append` writes under `<root>/state/ledger/` and nothing under `XDG_STATE_HOME` — `cd ui/sidecar && pnpm vitest run ledger`
- [ ] given `scripts/fixtures/notebook-week/`, the tab's note fold reads 4 · 3 · 1, as `python3 scripts/melody-notebook-week.py --fixture scripts/fixtures/notebook-week` prints — `cd ui/desktop && pnpm vitest run team-health`
- [ ] given a fixture tree like `scripts/fixtures/notebook-routines/spec.json` (170 lines, one page past `stale_after`, proposals 5 and 0 days old), Memory reads 170 / 200 warm and Stale notes 1, the same counts `python3 scripts/melody-routines.py all --fixture scripts/fixtures/notebook-routines` prints; Jobs done clean counts `landed` only (`corrected`, `unknown` and `blocked` never clean) — `cd ui/desktop && pnpm vitest run team-health`
- [ ] given Codex weekly readings 76 % Mon 15:30 and 84 % Tue 14:00 resetting Fri 09:00, the projection reads "closes Thu 11:00"; one reading reads no projection; a window under max reads "~P% by <reset>" — `cd ui/desktop && pnpm vitest run usage-projection`
- [ ] given a claude `rate_limit_info` and a codex `resetsAt`, each reaches the client as a window with `resetsAt` and `windowMs` — `cargo test -p goose --lib acp:: -- seat_window`
- [ ] given each tab's state list, every state renders its line from §States — `cd ui/desktop && pnpm vitest run team-health usage-projection`
- [ ] given the built fixtures, both tabs open from +, Team health's tiles read the fixture (170 / 200, 1 stale, jobs 1 of 3 clean), **Start check-in** puts "check-in" into Melody's tab, and Usage shows "closes Thu 11:00" on the seeded Codex card — `just walk "team health"`
- [ ] given the same walk, the fixture notebook's `git status --porcelain` is empty and its HEAD unchanged afterwards, and no file under `~/Melody` or `~/.local/state/goose/ledger` changed — `just walk "team health"`
