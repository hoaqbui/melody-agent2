# OpenClaw's API — open-world research

Dated 2026-09-24. Question as asked: "Research their api" (after "what does having more persistent agents like OpenClaw look like — ones that talk to one another"). Sources are OpenClaw's docs and repository, fetched 2026-09-24; claims below cite them. Feeds a possible "companions come alive" milestone after headless Melody (task 299).

## The surprise

**OpenClaw speaks ACP in both directions, the same protocol Melody is built on.** `openclaw acp` exposes a Gateway session as an ACP server "over stdio/WebSocket", with session keys `agent:<agentId>:acp:<uuid>`; the other way, `sessions_spawn({ runtime: "acp" })` drives Claude Code, Cursor, Copilot, Gemini CLI, OpenCode and other acpx harnesses ([ACP agents](https://docs.openclaw.ai/tools/acp-agents)). So interop needs no port: an OpenClaw agent could be one more seat in goose, or Melody's desktop an ACP client of OpenClaw. The docs don't list which ACP methods the bridge supports, so that would need testing.

## Reframe trail

1. What's OpenClaw's API? > two layers: a Gateway WebSocket protocol for clients, and agent tools for agents > which one matters for "agents that talk"? The tools (`sessions_*`, `cron`, heartbeat); the Gateway protocol is their UI transport.
2. Port or borrow? > it speaks ACP both ways > interop is a seat or a client, not a fork.

## Layer 1 — the Gateway protocol (clients ↔ server)

- One WebSocket, "the single control plane and node transport"; JSON text frames `{type: "req"|"res"|"event"}`; the first frame must be `connect` ([protocol](https://docs.openclaw.ai/gateway/protocol); endpoint `ws://127.0.0.1:18789/ws` per [Mintlify mirror](https://openclaw-openclaw.mintlify.app/api/websocket), unverified against the primary docs).
- `connect` params: `minProtocol`/`maxProtocol` (4), `client {id, version, platform, mode}`, `role`, `scopes`, `caps`, `auth {token}`, `device {id, publicKey, signature, signedAt}`; reply `hello-ok` with `protocol`, `server {version, connId}`, granted `auth`, `policy {maxPayload: 26214400, tickIntervalMs: 15000}` ([handshake](https://docs.openclaw.ai/gateway/protocol/handshake)).
- Roles: `operator` (CLI/UI/automation), `node` (capability host: camera, screen, `system.run`), `worker` (cloud execution). Operator scopes: `operator.read · write · admin · approvals · questions · pairing · talk · talk.secrets`. Caps: `tool-events`, `inline-widgets`.
- Schema source of truth: TypeBox schemas in `packages/gateway-protocol/src/schema.ts`; an "N-1 node window" for version compatibility.
- Session control RPCs ([rpc-session-control](https://docs.openclaw.ai/gateway/protocol/rpc-session-control)): `sessions.list` (`sortBy: "activity"`, `ownerId`, `creatorId`, `involvingMe`), `sessions.subscribe`, `sessions.messages.subscribe`, `sessions.preview`, `sessions.describe`, `sessions.resolve`, `sessions.create` (`model`, `thinkingLevel`, `worktree`, `parentSessionKey`), `sessions.send`, `sessions.abort` (`runId`, `clearQueued`), `sessions.patch` (`expectedSessionId` guard), `sessions.patchMany`, `sessions.assignOwner` (a person or an agent), `sessions.reset`, `sessions.compact`, `sessions.delete`, `sessions.dispatch` / `move` / `reclaim` (move a session to a paired device or cloud profile), `sessions.groups.*`, `sessions.github.*`, `sessions.activitySummary.ensure`. `sessions.steer` is deprecated for `chat.send` with `queueMode: "interrupt"`.

## Layer 2 — agent tools (agents ↔ agents)

- Built-ins ([tools](https://docs.openclaw.ai/tools)) include `sessions_*`, `agents_list`, `agents_wait`, `subagents`, `session_status`, `get_goal`/`create_goal`/`update_goal`, `cron`, `heartbeat_respond`, `message`, `ask_user`, `progress_card`, `gateway`, `nodes`, `personal_instructions`.
- `sessions_send` ([session tools](https://docs.openclaw.ai/concepts/session-tool)): target by `sessionKey`, `label` or `agentId`; `timeoutSeconds` 0 = fire-and-forget, > 0 = wait inline; `mode` `resume · followup · steer · notify`; `watch: true` subscribes the sender to the target's state; returns `status`, `targetDisposition` (`queued`/`steered`), `delivery.status`. Reply-back: the two agents alternate up to a built-in limit, and the target can answer `REPLY_SKIP` to stop.
- `sessions_spawn`: `runtime` `subagent` (default) or `acp`; `model`, `thinking`, `runTimeoutSeconds`, `sandbox: "require"`, `context` `fork`/`isolated`, `visible: true` (a persistent dashboard session); returns `runId`, `childSessionKey`, `sessionUrl`.
- `sessions_history`: `includeTools`, `limit`, `offset`/`nextOffset`, `messageId`, `pendingInputs`; capped at 80 KB with `truncated`.
- Access: `tools.sessionVisibility` `self · tree · agent · all` (**default `all`**); `tools.agentToAgent` `{enabled, allow: [pairs]}` (**cross-agent on by default**); sandboxed callers clamped to their spawn subtree; incognito sessions hidden.
- Isolation ([multi-agent](https://docs.openclaw.ai/concepts/multi-agent)): each agent has its own workspace (`AGENTS.md`, `SOUL.md`, `USER.md`), `agentDir` and SQLite store at `~/.openclaw/agents/<agentId>/`; channel accounts map to agents through most-specific-match **bindings**.

## Layer 3 — heartbeat and automations

- Heartbeat ([heartbeat](https://docs.openclaw.ai/gateway/heartbeat)): a scheduled turn in the agent's main session; `every` (default `30m`), `target` (`owner · last · none · <channel>`), `activeHours`, `isolatedSession` and `lightContext` to cut token cost, `prompt`, `timeoutSeconds`; the model answers `NO_REPLY` or calls `heartbeat_respond {notify}`; a per-job "monitor scratch" checklist. If any agent has a heartbeat block, only those agents beat.
- Automations ([cron jobs](https://docs.openclaw.ai/automation/cron-jobs)): persistent jobs; schedule `at · every · cron`; payload `systemEvent` or `agentTurn`; session `main · isolated · current`; delivery to a channel, a webhook or nowhere; `openclaw automations` (alias `cron`) `create · list · get · runs`.

## The project

- MIT, TypeScript on Node 24.16+/26, pnpm monorepo (`packages/`, `apps/`, `extensions/`, `skills/`, `ui/`, and some `crates/`); about 390k stars, about 100k commits ([repo](https://github.com/openclaw/openclaw)).

## What it means for Melody

| Option | Owns | Trades away |
|---|---|---|
| A. Borrow the patterns into goose: heartbeat (`every`, `activeHours`, silent-unless-needed, isolated light context), `sessions_send` modes with a reply-back cap and `REPLY_SKIP`, `watch`, visibility scopes | the goose spine, loop parity and M1/M2 stay; design already proven at scale | building it ourselves |
| B. OpenClaw as a seat: goose delegates to `openclaw acp` like any adapter | channels, heartbeat and its skills without writing them | a second agent system with its own memory, auth and defaults (cross-agent `all`); ACP method coverage unverified |
| C. Port the backend to OpenClaw's Gateway | its whole feature set | throws away goose, `ARCHITECTURE.md`'s spine, M0–M1a's work and the ACP desktop contract; a second protocol for the desktop |

Pick: **A**, with B as a spike only if channels become a want. Reverse OpenClaw's defaults for Melody: visibility `tree`, cross-agent off with an allowlist, a round cap, every message in the ledger, never a blocking wait (plan v3's M2 rule).

## Unknowns

- Which ACP methods `openclaw acp` supports (permissions, `session/load`, config options). Cheap to test? Yes, one probe like `scripts/probe-approve.py`. Reversible? Yes.
- The default reply-back limit's value. Not stated in the docs read. Cheap to test? Yes.
