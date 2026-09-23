# Melody, the main agent — program plan

Dated 2026-09-23. v2 after Codex's review (gpt-6-astra, read-only, verdict REWORK: "retain option A, but rebase M0 and specify session execution, recovery, and approval contracts before approving M1"). Companions: `docs/2026-09-23-melody-main-agent-research-v1.md` (pick A), the design `docs/mockups/2026-09-22-melody-visual-design.html` (`08a3c1ebe`; §20 all settled), and the memory PRD from parallel work, `docs/2026-09-22-agent-memory-prd-v1.md` (untracked; it owns what Melody and her friends remember; the research lists four conflicts with this plan). Six tranches, walked one at a time; only M0's tasks are drafted here.

User direction (2026-09-23): a vertical slice first; friends are real manager sessions; fix desktop delegation first; the design questions answered.

## Approach

- **M0 — delegation that survives the desktop.** The 63 s timeout the user asked about is already fixed (task 154, `2f7a4010f`). M0 re-proves it on today's `main`, then does task 181: one `AgentManager` shared across ACP connections, and a load re-attaching to an in-flight run, so a reconnect during a long delegated turn neither duplicates the agent nor loses the reply (`acp/server.rs:969`, `:2784`; `load_session.rs:461-483`). Melody's turns are long; this is the floor under everything after.
- **M1a — the plumbing, proved headless.** Research pick A as a thin facade over the ACP server's shared create · activate · run operations, exposed through the session bridge:
  - `list_sessions`, `start_session(repo, task)`, `session_status`; sessions Melody starts are `User` with `parent_session_id`, with an explicit mode, provider/model, extensions and role consent set at creation (never a silent Auto)
  - authorization on the server by caller role (Melody · manager · none) and target repository/session — hiding a tool is not a boundary (`session_bridge.rs:307`, `:141`)
  - durable role metadata and canonical repository identity; one manager per repository, created idempotently
  - a `SessionCreated` notice plus list reconciliation after a reconnect; `session/list` carries the parent link and role; an empty manager and one older than the recent page both still show
  - approvals raised by a session Melody started reach the user even when its chat is closed
  - restart and compaction: identity is durable, live execution is not; an interrupted task is never reported complete; Melody rebuilds what she knows from durable state
- **M1b — the smallest real Melody.** Her tab in Work bound to her session (id kept in settings), her pin and her row pinned at the top of Today, the Work toggle and ⋯ in the Chat header with the collapse rules, and the lever removed (composer attach · send; a new Easy session starts in the orchestrator setup, direct Opus without a role). One minimal repository manager, so the slice proves Melody → manager → worker end to end. The pane picker, tab keyboard control and overflow move to M3 (Codex #7); the lever stays in M1b because the user's slice includes it.
- **M2 — friends.** Names and marks (Melody proposes, the user renames), friend rows and the friend view, "Started by Tempo", `send_to_session` with busy · retry · cancel (never a synchronous manager-to-manager wait), aggregate limits on managers and workers, and the manager role file. Starts only after the memory PRD's four conflicts are settled (research §Conflicts).
- **M3 — the visual language and Work polish.** `DESIGN.md` amendments (ink tokens; teal focus + activity; amber needs you; blue links; green/red outcomes; the hover rule; card outlines; **Needs you** replacing **Needs review**); the Heroicons 16 solid sweep; the runtime colour palette (designed first, avoiding teal, amber, green, red and blue); the teal tint on Melody's tab; teal progress and "on"; the eight locked motion picks; the pane picker, tab keyboard and overflow. Runs beside M2; shared files are listed at M2/M3's planning gate.
- **M4 — first run and Settings.** The walkthrough (welcome · seats · projects · meet Melody), seats signing in through a Terminal tab that closes into its row and rechecks by itself, API providers behind "Use an API key instead", the Settings route, the phone's tab order.

## Gates — each a named, runnable check with a failure it must catch

- **M0 → M1a:** `just walk "rpi strip"` → 1 passed on `main`; task 181's walk (a Hard turn with a 60 s delegate, `reconnectAcpAfterSystemResume()` mid-turn) → 1 passed, with one agent for the session (not two) and the reply landing.
- **M1a → M1b** (headless, `cargo test -p goose --test melody_*`): Melody starts a session whose tokens reach an already-open client · a session the UI started is named by Melody on her next turn without its id · a direct call from a non-Melody session is refused · approve, reject and client-disconnected approvals each resolve · two concurrent starts in one repository make one manager · a forced restart reports the interrupted task as interrupted · a resumed `claude-code` session finds and calls the new bridge tools.
- **M1b → M2 ∥ M3:** `just walk "melody starts a session"`: ask Melody to start work in a repository → the session appears in the rail with her as parent, its manager delegates to a worker, and she reports it done; and a session the user starts from the UI shows in her next answer.
- **M2 → M4:** `just walk "friend"`: a friend is reused on the second request in its repository, delegates, is reachable as an ordinary session, and a worker's attempt to delegate is refused.
- **M3 → M4:** `DESIGN.md`'s checks green; `theme-tokens.test.ts` green; screenshot checks of the settled design's window states (§4) at 1512 px in both themes.
- **M4 done:** a fresh profile walks first run → seats (one signed in) → Melody's first message.

## Out of scope

- `agent.rs` and `state_machine/` (`ARCHITECTURE.md:119`) — compaction integration for memory must stay outside them.
- What Melody and friends remember — the memory PRD's, once its conflicts are settled.
- The phone beyond its tab order; cloud and remote workers (`PRODUCT.md` §12 Future).
- Filing upstream issues for the spine changes — the user's call.

## Documents amended along the way

- `PRODUCT.md` §12: **persistent named agents** move from Future to now (M1b); `:84`, `:121`, `:128` clarify that a manager is an ordinary session that may delegate. `.agents/agents/orchestrator.md:61` holds as written.
- `ARCHITECTURE.md`: the Melody surface as a module entry (M1a); `:118`'s stale summon citations → `summon.rs:1622-1624`, `:2609-2621`.
- `DESIGN.md`: M3.

## Tasks

Approved 2026-09-23 (user: "approved and start ochestrating") → moved to `tasks.md` under `### docs/2026-09-23-melody-program-plan-v2.md — Melody, the main agent: M0` — 196 (M0-a, re-prove 154) and 181 (M0-b, already in the ledger; appended there).
