# Automations over Goose's scheduler — research map

Dated 2026-09-16; tree at `e34fdf6b2`. Task 46 in `tasks.md`. Question as
asked: research surfacing Goose's scheduler as automations with a review
list — what the in-tree scheduler already does, what a scheduled run
produces (a session; where its result lands), and what a Codex-style
review queue would need (a list of finished runs with their Changes,
accept → commit, dismiss) — local-first only (PRODUCT.md §1: no control
plane, no cloud runs). Read-only: no source edits, no task claims.
Siblings referenced, not re-researched: task 44 (worktrees), task 45
(per-hunk accept).

## The surprise (lead finding)

**The "list of finished runs" already exists twice in the desktop, and
"its Changes" already half-works; what is missing is not a surface but
what a row knows.** The Sessions list groups `scheduled` sessions under
"Scheduled jobs" (`ui/desktop/src/components/sessions/SessionListView.tsx:517-542`,
`:1051-1071`; `src/acp/sessions.ts:145` asks for `['user','scheduled']`),
and Schedule Details shows a per-schedule grid of run sessions
(`components/schedule/ScheduleDetailView.tsx:465-505`) that opens a run as
`setView('pair', {resumeSessionId})` (`:153-158`). Once open in `pair`, the
Changes pane already offers "since session start" as `HEAD@{createdAt}`
for any resumed session (`workspace/panes/diff/DiffPane.tsx:46-70`,
`:140-143`). A row lacks four things the Codex inbox has: an outcome
(done / failed), a project, an unread mark, and accept / dismiss.

Consequences that reframe the plan:
- a run has **no recorded outcome** — `execute_job` sets `stream_error`
  on an `Err` from the agent stream (`crates/goose/src/scheduler.rs:1168-1183`)
  and still returns `Ok(session.id)` (`:1250`); the cron arm logs
  "completed" (`:411-418`). Upstream confirms: aaif-goose/goose#11051
  (open, read 2026-09-16).
- a run has **no project** — the session cwd is `std::env::current_dir()`
  (`scheduler.rs:1055`); `ScheduledJob` carries no working dir
  (`:229-248`); the provider is the global config's, not a runtime pick
  (`:1043-1047`), and the recipe carries no cwd either.
- PRODUCT.md §12 places "scheduling" in **Future** and "scheduled agents"
  under Could (§11); this task reopens it as Codex parity gap 3.

## Reframe trail

1. "What new surface holds the review list?" > two lists exist, one open
   path exists > "What does a row need to know, and who records it?"
2. "Where does a scheduled run's result land?" > a `Scheduled` session
   (`scheduler.rs:1052-1059`) whose last assistant text is already on the
   wire (`acp/response_builder.rs:47` `last_message_snippet`) and whose
   edits land in the live working tree of the serve process's cwd > "What
   is 'its Changes' when the tree is shared?" — exact only in a worktree
   (task 44), approximate as `HEAD@{createdAt}` on the shared cwd.
3. "Is the review list task 28's Agents pane?" > Agents rows are
   per-open-session, keyed by child session id, live-pushed (task 27's
   pick); a scheduled session is driven by `execute_job`'s own `Agent`
   (`scheduler.rs:1037-1047`) and never registers with an ACP connection,
   so nothing pushes it > **two surfaces, one row shape** (see §Options).

## Inventory — read this session

Scheduler (`crates/goose/src/scheduler.rs`):
- `:229-248` — `ScheduledJob { id, source, cron, last_run, currently_running,
  paused, current_session_id, process_start_time, parameters,
  recipe_base_dir }`; no working dir, no run history, no outcome.
- `:156-159`, `:251-263` — state is one `schedule.json` in the data dir,
  rewritten whole on every change.
- `:342-358` — the cron callback checks only `paused` before firing;
  `:668-736` — `sync_from_storage` registers every job on disk into this
  process on every `list_scheduled_jobs` (`:737-748`).
- `:1037-1047` — the run's `Agent` is `GooseMode::Auto`,
  `GoosePlatform::GooseCli`, provider/model from `Config::global()`;
  `:1052-1059` — session `SessionType::Scheduled`, name
  `"Scheduled job: {id}"`, cwd `current_dir()`; `:1140-1146` — the
  session gets `schedule_id` and the recipe via the update builder.
- `:1112-1122`, `:1230-1246` — telemetry only; no event a client can
  subscribe to.
- `:802-868` — `run_now` awaits `execute_job` inline; the ACP request
  (`acp/server/schedule.rs:286-297`, status `Completed`) is held open for
  the whole run.
- `:779-800` — `sessions(sched_id, limit)` = `list_sessions()` filtered by
  `schedule_id`, newest first.
- `:949-983` — `kill_running_job` cancels the token; the cron path then
  reports `Ok`.
- `scheduler_trait.rs:9-46` — the trait the ACP layer sees; no event
  sink, no run history.

Wiring:
- `acp/server_factory.rs:23`, `:48-66` — one `Scheduler` per
  `goose serve --enable-scheduler` process, over `data_dir/schedule.json`;
  `create_agent_with_session_cwd:87-91` calls `list_scheduled_jobs` (sync)
  on every agent creation.
- `ui/desktop/src/gooseServe.ts:363-373`, `:337`, `:395` — the desktop
  passes `--enable-scheduler` and runs `goose serve` in the window's
  `workingDir`; `main.ts:1199-1214` spawns one per `createChat` window;
  `main.ts:1264` gives the sidecar the same cwd. So on the desktop a
  scheduled run edits the open project's checkout — and N windows are N
  schedulers firing the same cron (upstream #11695, open; fix PR #11694
  open, unmerged as of 2026-09-16).
- `agents/platform_extensions/scheduler.rs:25-36`, `:53-70` — the
  `scheduler__manage_schedule` tool: the agent can create/list/run
  schedules from chat when the context has a scheduler.
- `acp/server/schedule.rs:112-123` — `ScheduledJobDto`: id, source, cron,
  last_run, currently_running, paused, current_session_id, job_start_time;
  `:150-164` — `schedules/sessions` returns `SessionInfo`s built by
  `build_session_info`; `:166-222` — create writes the recipe YAML to
  `scheduled_recipes/{id}.yaml`.
- `goose-sdk-types/src/custom_requests/schedule.rs:43-47` —
  `CreateScheduleRequest { id, recipe, cron }`; a new field or method
  needs the client regen (`justfile:169-177`, per task 27).
- `acp/response_builder.rs:30-48` — `SessionMeta` has `archived_at`,
  `session_type`, `provider_id`, `model_id`, `last_message_snippet`;
  **no `schedule_id`** — a row from `session/list types=[scheduled]`
  cannot name its schedule without a wire addition.
- `acp/server/list_sessions.rs:52-74`, `:196-207` — `scheduled` is an
  ACP-visible type; archived sessions are not filtered server-side.
- `acp/server/manage_sessions.rs:265-289` — `archive` / `unarchive`
  exist; `session/session_manager.rs:91`, `:242`, `:300` — `archived_at`
  and `extension_data` are settable through the update builder.
- `providers/claude_acp.rs:70-91` — the adapter's permission mode comes
  from the **global** `GOOSE_MODE`, not the session's `Auto`
  (`scheduler.rs:1039`, `:1077`); upstream #11164 bug 1 is the same
  class.
- `ui/sidecar/src/git.ts:38-78` — `/git/diff` takes `base`, `/git/stage`
  takes `paths`, `/git/commit` takes a message; all against the one cwd
  from `args.ts:30`.
- `components/schedule/SchedulesView.tsx:255-291` — polls
  `schedules/list` every 15 s; `ScheduleDetailView.tsx:116-126` — fetches
  20 sessions per schedule on open; `:162-170` — "Run now" toasts the
  session id when the blocking request returns.

Codex desktop and Cowork (web, read 2026-09-16):
- https://learn.chatgpt.com/docs/automations?surface=app (OpenAI, primary)
  — desktop runs execute in "local projects or isolated Git worktrees";
  the Scheduled view is the inbox, with an "unread indicator" when runs
  need attention; runs can be archived; frequent schedules "create many
  worktrees over time".
- https://codex.danielvaughan.com/2026/04/08/codex-desktop-automations/
  (commentary) — per-run actions Approve (stage, commit, optionally PR),
  Revise (continue the thread), Reject (discard); "runs with no results
  are automatically archived".
- https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork
  (Anthropic, primary) — scheduled tasks "run remotely"; that is the
  "minus the cloud" in the card.

## Recorded decisions

- Cloud or remote execution of scheduled runs — rejected: PRODUCT.md §1
  ("no control plane"), §12 (cloud execution is Future); Cowork's model
  is the counter-example, not the target.
- A new run-history store beside `schedule.json` — rejected: the session
  already is the run record (`schedule_id`, `created_at`, `archived_at`,
  `extension_data`); one more JSON file is a second source of truth.
- A live push for run completion via `_goose/unstable/session/update` —
  rejected for this tranche: the scheduled session is registered with no
  connection (`scheduler.rs:1037-1047`) and the trait has no event sink
  (`scheduler_trait.rs`); the desktop already polls (`SchedulesView.tsx:283-291`).
- Reviving the review list inside task 28's Agents pane — rejected:
  different key (schedule × run, not parent × child), different source
  (poll, not the bridge broadcast), different home (global, not the open
  session).

## Options → pick

Axes: where the run executes (shared cwd vs a worktree) × where the list
lives (hub route vs workspace pane vs sessions list).

| Option | Owns | Trades away |
|---|---|---|
| **(a) Runs inbox on the Schedules route, staged** — A1 on the shared cwd: `execute_job` records the outcome on the session (`extension_data["scheduler"] = {status: done \| failed \| killed, error}`, and returns `Err` on `stream_error`); `schedules/runs` (or `schedule_id` + outcome in `SessionMeta`) lists runs across schedules newest first; a row = schedule · started · outcome · snippet · unread (client-side, `updatedAt` vs a local last-seen); Open → `pair?resumeSessionId` with Changes at "since session start"; Dismiss → `session/archive`; Accept → `/git/stage paths` from the diff since `HEAD@{createdAt}` + `/git/commit`, enabled only when the run's cwd equals the sidecar cwd. A2 when task 44 lands: the job runs in its own worktree; Accept becomes merge/commit of that branch; Dismiss deletes the worktree | the card in two increments, first one with no new process and no schema migration; Codex's inbox shape (unread, archive) on the existing route; the same open path task 28 uses | A1's Accept cannot exclude a user's pre-run edits to the same files — nothing records the tree at run start (`scheduler.rs:1052-1059` records only cwd); the row is polled (≤15 s late); one wire addition + client regen |
| (b) Promote the Sessions list's "Scheduled jobs" group | zero new routes; upstream lists already there (`SessionListView.tsx:1051-1071`) | edits upstream `components/` the fork keeps, not rewrites (ARCHITECTURE §Modules); no outcome, no actions, no per-schedule grouping; the group collapses out of sight |
| (c) A "Runs" workspace pane beside Agents (task 28) | one shell, one tab rail on the phone | runs are global, the workspace lives only under `pair` (`App.tsx:660`); a pane per window shows the same global list N times; nothing to show while no session is open |
| (d) Worktree-first: block on task 44, then build the inbox over run branches | exact Changes, safe Accept, Codex's actual model | ships nothing until 44 lands and merges; duplicate-fire and outcome bugs stay untouched meanwhile |

Pick: **(a)**, A1 then A2. A1 fixes what a row knows (outcome, schedule,
unread, dismiss) on today's shared cwd; A2 is the worktree hand-off from
task 44 and turns Accept from "commit these paths" into "merge this
branch". One pane or two: **two surfaces, one row component** — the
Agents pane (task 28) stays the per-session live tree; the Runs inbox is
the global polled list on the Schedules route; both open a session in
`pair` with Changes.

- consequence: `execute_job` returning `Err` on stream error changes the
  cron arm's telemetry and `run_now`'s response (`scheduler.rs:411-418`,
  `:856-867`) — the desktop's "Run now" toast starts reporting failure,
  which is the fix upstream #11051 asks for.
- consequence: "Run now" from the inbox holds a blocking ACP request for
  the run's duration (`schedule.rs:286-297`); the inbox row must come
  from the poll, not from the response.
- consequence: the scheduled run's runtime is the global default
  (`scheduler.rs:1043-1047`), not a role's `runtimes:`; a per-schedule
  provider is out of this pick (a recipe field, later).
- consequence: A1's unread mark is per client (local storage), not on the
  wire; Codex's is server-side. Acceptable for one user, one Mac.

## Scope — in / out / protected

- in (plan skeleton, dependency order): `crates/goose/src/scheduler.rs`
  (outcome into `extension_data` via the builder at `:1140-1146`; `Err` on
  `stream_error` at `:1168-1183`, `:1250`; `killed` from the cancel token);
  `crates/goose/src/acp/server/schedule.rs` + `goose-sdk-types/src/custom_requests/schedule.rs`
  (a runs list across schedules carrying `schedule_id`, outcome,
  `archived_at`, cwd, snippet) and `just generate-acp-types`;
  `ui/desktop/src/acp/schedules.ts` (the one ACP call site);
  `ui/desktop/src/components/schedule/` (a `runs/` directory: inbox list,
  row, unread store; composed into `SchedulesView.tsx`, not rewriting it);
  `ui/desktop/src/workspace/panes/diff/DiffPane.tsx` (Accept: stage the
  diff's paths + commit through `src/native/sidecar`, guarded by cwd
  equality); `PRODUCT.md` §12 (scheduling moves out of Future for the
  local case). A2 adds task 44's worktree hooks and nothing else new.
- out: cloud or remote runs (PRODUCT.md §1); webhook/event triggers
  (Codex's web-only ones); a live completion push (poll suffices, see
  §Recorded decisions); per-hunk accept (task 45); per-schedule runtime
  choice; editing upstream `SessionListView.tsx`; the scheduler's
  duplicate-fire fix (upstream #11694 — track, do not fork it unless the
  hand check below reproduces on the desktop); any edit to `agent.rs` /
  `state_machine/`.
- protected: an unattended run on the fork's default runtime takes its
  permission mode from the global `GOOSE_MODE` (`claude_acp.rs:70-91`),
  not the session's `Auto` — the plan either passes the session mode
  into the ACP provider or the inbox states the run's mode on the row;
  `bypassPermissions` on the user's live checkout is the Codex "use with
  caution" case, so A1's row names its cwd and A2 moves runs off the
  checkout. Accept commits only paths in the run's diff, never `git add
  -A`. The spine touch stays inside `scheduler.rs` and the ACP schedule
  route; `scripts/check-spine.sh` stays `spine clean`.

## Unknowns

- Do two desktop windows fire one cron twice on this Mac (code says yes:
  `main.ts:1199-1214` × `scheduler.rs:342-358`; upstream #11695 says
  yes) — not run here. cheap to test? yes (two windows, cron
  `* * * * * *`, count `scheduled` sessions); reversible? yes.
- Does a headless `claude-acp` run under global `GOOSE_MODE=approve`
  stall at the first tool call (`claude_acp.rs:70-91`)? — not run here.
  cheap to test? yes (`goose schedule run-now`); reversible? yes.
- Is `HEAD@{createdAt}` a sound base when the run itself commits (the
  reflog moves)? Probably yes (the base is HEAD *before* the run) — a
  finding, not a fact. cheap to test? yes; reversible? yes.
- Is a run-level unread mark per client acceptable, or must it ride the
  session (`extension_data`) so the phone and the desktop agree? cheap to
  test? n/a (product call); reversible? yes.
- Whether the scheduled session's cwd on a packaged desktop is the
  project (`gooseServe.ts:395` says yes; not observed here). cheap to
  test? yes (`session.cwd` on the row); reversible? n/a.
- Whether the `scheduler__manage_schedule` tool
  (`platform_extensions/scheduler.rs:53-70`) is exposed on `claude-acp`
  sessions at all — the handoff notes ACP providers do not receive
  Goose's tools (tasks.md §Handoff); if not, schedules are created only
  from the route. cheap to test? yes; reversible? n/a.
