# Melody main agent — research map

Dated 2026-09-23. Question as asked: "we shouldn't need an easy medium hard … you manage your own context, and mainly delegate into other project managers … we have the main melody agent session I can always access … all the other sessions … spawned by her or if I spawn it via the UI, she still knows about it" (2026-09-22), then "for other sessions managed by other 3 friends … show them in the left side rail" (2026-09-22). The visual design is settled in `docs/mockups/2026-09-22-melody-visual-design.html` (committed `08a3c1ebe`); this map covers what the tree can and can't do today.

## The surprise (lead finding)

**Nesting is refused by session *type*, not depth — so friends can delegate only if they are ordinary sessions, not `delegate` children.** `delegate` is refused when the caller is a `SubAgent` (`crates/goose/src/agents/platform_extensions/summon.rs:1622-1624`) and hidden from it (`:2609-2621`); a child is created as `SessionType::SubAgent` with `parent_session_id` set (`:837-865`). A `User`/`Acp` session keeps `delegate`. So Melody → friend → worker works only if Melody creates each friend as a normal session with a parent link — which today's `delegate` never does.

## Reframe trail

1. "Remove the Easy/Medium/Hard lever" > the lever's three stops differ in provider and mode, not just model (`ui/desktop/src/workspace/session-controls.ts:172-176`) > "who picks the setup instead?"
2. "Melody picks" > Melody must see and start sessions > "what can an agent on the `claude-code` seat reach?"
3. "Reuse the orchestrator extension" > it has `list_sessions`, `view_session`, `start_agent`, `send_message` (`agents/platform_extensions/orchestrator.rs:649-700`) but is off, hidden, unreachable from `claude-code`, and runs on a different agent manager > "a new, narrower Melody surface, reachable through the session bridge"
4. "Friends as delegate children" > children can't delegate and never list > "friends are normal sessions with Melody as parent"

## Inventory — read this session

UI (`ui/desktop/src`):
- `hooks/useNavigationSessions.ts:57-87` — the sidebar lists via ACP `session/list` with `_meta.types = ['user','scheduled']` (`acp/sessions.ts:161`, `:193-196`); first page only, 25 kept; polls every 300 ms for 10 s after `SESSION_CREATED` (`:106-138`)
- `crates/goose/src/acp/server/list_sessions.rs:48-75`, `acp/server.rs:145-150` — the server accepts only `user`/`scheduled`/`acp`; `sub_agent` never lists; sessions with no messages are hidden (`list_sessions.rs:207`)
- `workspace/sidebar-sessions.ts:60-77`, `:83-119` — grouping by repository, the repo chips and Elsewhere; `filterSessions` ignores `sessionType` (`:126-139`)
- `sessions.ts:28-37`, `:112-141` — `createSession(workingDir, opts)` → `session/new` with `_meta.client` → a `User` session (`new_session.rs:281-290`); no mode option — Orchestrate is the orchestrator role passed as a recipe (`WorkspaceShell.tsx:800-803`)
- `WorkspaceShell.tsx:885-899` — `pickStop` switches provider or starts a session; `applyStopModel` sets the model after `session/new` (`:776-794`)
- `workspace/panes/agents/AgentsPane.tsx:69-133` — children open read-only; `agents-state.ts:44-50` blocks opening a running child
- `workspace/panes/artifact/ArtifactPane.tsx:233-240` — "Open transcript" opens a child as a full `/pair` chat with a composer, no status check (a leak: a SubAgent can be messaged from the UI)
- `App.tsx:397-429`, `components/ChatSessionsContainer.tsx:20-38` — up to 10 sessions stay mounted; none is special; no pinned/home session exists
- `WorkspaceShell.tsx:1720-1764` — the layout is Sessions | Chat | Work; the Work column already has per-panel tab bars and top/bottom halves (`WorkColumn.tsx`, `pane-store.ts`; DESIGN.md §Vocabulary, tasks 117–120)
- `workspace/onboarding/RuntimesGate.tsx:51-59`, `:157-170` — Sign in opens a terminal with `claude login` / `codex login` / `cursor-agent login`; agy has none; Recheck is manual
- `components/onboarding/OnboardingGuard.tsx` — goose's API-provider onboarding still runs before the seats gate

Spine (`crates/goose/src`):
- `session/session_manager.rs:47-56` — `SessionType`: `User`, `Scheduled`, `SubAgent`, `Hidden`, `Terminal`, `Gateway`, `Acp`; `parent_session_id`, `project_id` (`:93-95`); `list_children` (`:495-506`); the type can be updated but only a test does (`:232-235`)
- `agents/platform_extensions/summon.rs:1626-1640`, `:2466-2596` — async delegation: task list in memory, 5 running by default, forgotten after 600 s, lost on restart; `load` gives up after 5 min (`:1468-1470`)
- `agents/platform_extensions/orchestrator.rs:421-426` — `start_agent` creates a `User` session **without** `parent_session_id`; it passes the parent's extensions to the provider (`:434`), but goose's own extension loading returns nothing without saved state (`agent.rs:1255`); `send_message` runs the target's loop inside the caller's tool call (`:558-599`) and fails if busy (`:537-546`) — corrected 2026-09-23 after Codex's review
- `agents/platform_extensions/mod.rs:183-193` — the orchestrator extension is `default_enabled: false, hidden: true`
- `agents/session_bridge.rs:282-286`, `:1-5` — the bridge *lists* only summon's tools, and is the only way a subscription seat (`claude-code`) delegates; but dispatch (`:307`) applies no matching allowlist and the credential is process-wide (`:141`) — discovery is not an authorization boundary; stdio/HTTP extensions are skipped when the provider manages its own context (`agent.rs:1273-1280`)
- `acp/server.rs:969` vs `execution/manager.rs:18,65-87` — the ACP server and the orchestrator extension hold different `AgentManager`s: the orchestrator **can** list persisted sessions (`orchestrator.rs:187`), but it doesn't own or stream the live agents the UI has open; and each ACP connection builds its own manager (`acp/server.rs:969`), so a reconnect restores a fresh agent and the running turn's stream is lost (task 181, `tasks.md:254`)
- `acp/server.rs:385-410`, `:1294-1320` — no "session created" or "list changed" notice; `DelegationUpdate` covers summon children only, on the parent's stream

Delegation today: the 63 s desktop timeout (`tasks.md:119-120`) was diagnosed the same day as the `claude-code` seat's ~60 s cap on a synchronous delegate call (`tasks.md:121`) and fixed by task 154 (`2f7a4010f`: the bridge carries a 5-min timeout and `claude_code.rs:559-565` passes it as `request_timeout_ms`; forced-sync `goose run` → SLEPT after 2:23; `just walk "rpi strip"` → 1 passed). Child stderr already logs at `info` (`acp/provider.rs:1581`). What remains is task 181: a reconnect mid-turn loses the reply (per-connection `AgentManager`, `acp/server.rs:969`, `:2784`).

Boundary check against `ARCHITECTURE.md`:
- "delegated work never nests" (`:118`) cites `summon.rs:1369`, `:2163-2170`; the checks now live at `summon.rs:1622-1624`, `:2609-2621` — stale citation; the rule itself (and `.agents/agents/orchestrator.md:61`) already forbids only *worker* nesting, so friends need no relaxation there — only `PRODUCT.md`'s parent/subagent wording needs clarifying
- "`agent.rs` and `state_machine/` are not edited in the fork" (`:119`) — the Melody surface must not need them
- `PRODUCT.md:84` ("star topology, enforced upstream"), `:121`, `:128` — clarify that a manager is an ordinary session that may delegate; `.agents/agents/orchestrator.md:61` ("SubAgent workers must never delegate") holds as written

## Recorded decisions

- the lever — rejected: polishing it (task 164's lever-words mockup, user 2026-09-22 "we shouldn't need an easy medium hard")
- Melody's place — rejected: a fourth column (user: "Keep to the 3 panel design"); she is a tab in Work
- friends — rejected: "a view, not an agent" (user 2026-09-23 picked real manager sessions)
- delegation — rejected: building Melody before the desktop delegation path works (user 2026-09-23: fix first)
- the orchestrator extension as Melody's surface — rejected here: wrong agent manager, drops the parent link, unreachable from `claude-code`

## Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A · A narrow Melody surface on the session bridge | a thin facade over the ACP server's own create · activate · run operations (`acp/server.rs:1386`, `:2426`) — `list_sessions` · `start_session(repo, task)` · `session_status` · later `send_to_session` — reachable from `claude-code` because the bridge already is; new sessions are `User` with `parent_session_id`; calls authorized on the server by caller role and target | shared execution plumbing across connections (task 181 first), server-side authorization, approval routing, and an ARCHITECTURE.md entry — more than one file; priced in the plan's M0 and M1a |
| B · Enable the orchestrator extension | code that exists | the agent-manager split (no streaming to the UI), the lost parent link, the bridge filter, "busy" failures |
| C · Melody in the renderer | the UI calls `session/new` and lists; Melody's model only proposes | Melody can't act on her own or while the app is closed; "she knows" becomes UI polling, not her context |

Pick: A (Codex's review, 2026-09-23: keep A; B keeps the orchestrator's defects, C misses Melody acting on her own)
- Melody and friends become ordinary sessions linked by `parent_session_id`; workers stay `delegate` children (star topology holds below the managers)
- the UI learns of new sessions from a new `SessionCreated` notice on `_goose/unstable/session/update`, replacing the 10 s poll
- `session/list` gains the parent link and whether a session is Melody or a friend, so the rail can draw pins

## Scope — in / out / protected

- in: `crates/goose/src/agents/platform_extensions/` (a Melody surface), `agents/session_bridge.rs` (expose it), `acp/server.rs` + `acp/server/list_sessions.rs` + `custom_notifications` (notice, list fields), `ui/goose-acp-client` (regenerated), `ui/desktop/src/{workspace,acp,components/Layout}` (Work tabbed panels, Melody tab, pin, rows, lever removal), `.agents/agents/` (a Melody role and a manager role), `PRODUCT.md`, `ARCHITECTURE.md`, `DESIGN.md`
- out: `agent.rs`, `state_machine/` (fork invariant); the phone build (desktop first); onboarding and Settings (later tranche); runtime colour palette (design task, later)
- protected: workers stay `SubAgent` and never delegate; a friend never edits another repository; Melody never edits files (she manages sessions)

## Conflicts with the memory PRD (parallel work, `docs/2026-09-22-agent-memory-prd-v1.md`)

Found by Codex's review, 2026-09-23; for the user and the PRD's author to settle before M2:
- companions start fresh each time (`:29`) and are capped at three (`:79`) — friends are long-lived, one per repository, with no cap
- companions write journals — this map's "Melody never edits files" means repository files; memory writes need an explicit, separate permission
- the PRD allows loop changes (`:80`) that `ARCHITECTURE.md:119` forbids — compaction integration must stay outside `agent.rs` and `state_machine/`
- idle Melody makes no model calls (`:73`) — keep that criterion for managers too

## Unknowns

- whether task 154's fix still holds on today's main — cheap? yes (`just walk "rpi strip"`); reversible? yes
- who owns approvals for a session Melody started when its chat isn't open — cheap? yes (approve / reject / disconnected cases, headless); reversible? yes
- whether a session created outside the UI streams to an open window — cheap? yes (create one from a script, watch the renderer); reversible? yes
- whether `claude-code` can call a new bridge tool without a restart — cheap? yes; reversible? yes
- how Melody's awareness survives compaction and restart — cheap? yes (force a compaction and a restart in a test, then check she rebuilds her session list from durable state); reversible? yes
- where Melody's session id is kept (settings key vs a session flag) — cheap? yes; reversible? yes
