# Emdash + ACP as the melody-agent2 foundation — research map

> **Dropped 2026-09-15 (user decision):** melody-agent2 forks Goose Desktop
> (`ui/desktop`) and adds the missing workspace on top; Emdash is not the
> shell. Kept as the record of what Emdash has and why it was not used.
> Direction now lives in `2026-09-15-goose-fork-research-v1.md` §Options.

<!-- Upstream of rpi plan > implement. Supersedes the direction half of
     docs/2026-09-15-goose-fork-research-v1.md (the Goose inventory there
     still holds). Anchors, read this session, cloned read-only:
       ~/github/emdash        generalaction/emdash@04b11fe   2026-09-14
       ~/github/tuicommander  sstraus/tuicommander@e6b7ff0   2026-09-15
       ~/github/goose         aaif-goose/goose@a23a8cd5      2026-09-14
     melody-agent2 is still empty: ARCHITECTURE.md boundary check N/A,
     bootstrap.md runs before the first plan gate. -->

Dated 2026-09-15. Question as asked: research Emdash and ACP — with
Emdash as the workspace, what does the architecture look like, what
does Emdash already do, and what is left to build?

## The surprise (lead finding)

**Emdash already ships everything in PRD §22–24 and runs all four ACP
runtimes structurally (Claude, Codex, Cursor, Goose over ACP stdio). The
one seam is one line in Goose: its ACP server tags every tool call
`ToolKind::default()` (Other), so `delegate` renders in Emdash as a
generic tool row instead of a subagent. The §25 agent-activity view is
one Emdash enrich hook away — Claude's `Agent` tool already gets exactly
that treatment (`impl/claude/acp-transform.ts:52-61`). That hook is the
whole build for V0.5.**

## Reframe trail

1. Does Emdash do ACP or just PTYs? > 23 of 37 providers are ACP
   (`agents/integrations/providers.md`), a full ACP runtime in
   `packages/core/src/runtimes/acp/`, a dedicated renderer in
   `packages/chat-ui/` > so where does orchestration live?
2. Emdash has no delegation engine — `subagent` in its reducer is
   rendering of an agent's own spawn tool (`item-fold.ts:64-66,176-179`)
   > orchestration stays in Goose, running *inside* Emdash as `goose acp`
   (`impl/goose/index.ts:75-77`) > does Goose's `delegate` render as a
   subagent?
3. No: Goose emits every tool call with `ToolKind::default()`
   (`goose/crates/goose/src/acp/server/tool_calls/conversion.rs:145`),
   and Emdash's subagent kinds (`subagent|task|agent`) are Emdash-side,
   not ACP `ToolKind` values > the fix is an Emdash enrich hook keyed on
   the `delegate` tool, same shape as Claude's > is the plugin surface
   open?
4. Plugin registry is compile-time (`packages/plugins/src/agents/
   registry.ts` imports every `impl/*`; no user-defined provider path
   found) > E2 is a fork commit or an upstream PR, not a config > final
   question: how much of Emdash to touch before the thesis is tested?
   > none (see Options).

## Inventory — read this session

Emdash — what it is:
- `AGENTS.md` §Project Overview — Electron app; "coordinates provider
  CLIs, ACP chat sessions, terminal sessions, issue and PR integrations,
  diff review". pnpm/NX monorepo; `apps/emdash-desktop`,
  `apps/workspace-server` (remote host), `packages/{chat-ui,core,
  plugins,shared,theme,ui,wire}`.
- Size: 328k LOC ts/tsx non-test across `apps/` + `packages/`. License
  Apache-2.0 (`LICENSE.md`, "Copyright 2026 General Action, Inc.").
- Toolchain: node 24.14.0 + pnpm 10.28.2 pinned in root `package.json`
  (`devEngines.runtime`, `packageManager`, `onFail: download`);
  `mise.toml` is optional and says so; merge gate is `pnpm run check`
  (format, lint, typecheck, test). No Hermit, no uv.
- Panes: `apps/emdash-desktop/src/core/features/{workbench,editor,
  source-control,terminals,browser,files,tasks,issues,github,machines,
  mcp,skills,automations,agents}`; workbench pane kinds `split`,
  `terminal`, `browser`, `content` (`workbench/api/browser/tabs/`);
  monaco + xterm + node-pty in `apps/emdash-desktop/package.json:79-127`.
- Persistence: SQLite via Drizzle (`apps/emdash-desktop/drizzle/`);
  ACP intents persisted as allowlisted, versioned descriptors — provider
  env, MCP credentials never persisted (`acp-runtime.md` §Command and
  Read Paths).

Emdash — ACP runtime:
- `agents/architecture/acp-runtime.md` — `AcpRuntime` → `SessionManager`
  → `ConversationHandle` → `SessionCell` (state machine, transcript
  reducer, permission broker, prompt queue); provider processes cached
  by provider + cwd + env fingerprint; sessions suspend and
  rematerialize; `loadSession` used when the agent supports it
  (`session-materializer.ts:94-131`).
- Launch: `createNativeAcpBehavior` spawns `<cli> <args>` and wraps
  stdio with `@agentclientprotocol/sdk` `ClientSideConnection`
  (`packages/plugins/src/agents/helpers/acp-stdio.ts:16-37`).
- Per provider (`packages/plugins/src/agents/impl/`):
  goose → `goose acp` (`goose/index.ts:75-77`); cursor →
  `cursor-agent acp` (`cursor/index.ts:75-77`; local binary confirms
  `agent acp --help`); claude → `@agentclientprotocol/claude-agent-acp`
  (`claude/adapter.ts:4-5`); codex → `@agentclientprotocol/codex-acp`
  (`codex/adapter.ts:4-5`); antigravity → PTY, argv prompt, model
  picker, no ACP (`antigravity/index.ts:14-30,59,84-89`).
- Enrich hooks: `registerPluginBehavior(plugin, { acp, enrich, … })` —
  `claude/index.ts:156`, `codex/index.ts:145`. Claude maps its `Agent`
  tool to normalized `{ kind: 'subagent', operation, parentToolCallId,
  background }` (`claude/acp-transform.ts:52-61`); the normalized union
  is in `packages/core/src/primitives/acp-transcript/api/
  normalized-event.ts:66-72`.
- Goose plugin flags: `acp: supported`, `mcp: none`, `models: none`,
  `autoApprove: none`, hooks installed under `~/.agents/plugins/emdash/`
  (`goose/index.ts:17-66`, `goose/hooks.ts:15-16,51`). No collision with
  `~/.agents/agents/*.md`.
- MCP: Emdash pushes its per-provider MCP registrations into
  `session/new`/`session/load` (`session-materializer.ts:87,357-367`);
  with `mcp: none` for goose, nothing is pushed — Goose brings its own
  extensions.
- cwd: the conversation's `cwd` is sent on every session request
  (`packages/core/src/runtimes/acp/api/schemas.ts:10`); Goose honours it
  unless host-pinned (`goose/crates/goose/src/acp/server/new_session.rs:
  43-47`). So the worktree Emdash opened = Goose `working_dir` = where
  `.agents/agents/*.md` is read = where subagents edit = what the diff
  pane shows.

Goose — ACP agent side (for the orchestrate path):
- Capabilities: `load_session(true)`, session list/delete/close, prompt
  image + embedded context, `mcp_capabilities.http(true)` only
  (`goose/crates/goose/src/acp/server.rs:1838-1852`). Modes `auto` /
  `approve` / `smart_approve` (`response_builder.rs:553-559`); model and
  effort as config options (`server.rs:2493`).
- Subagent activity is forwarded as `ToolCallUpdate` with
  `_meta.toolNotification` (`type: subagent_tool_request`, logger
  `subagent:<id>`) (`acp/server/tool_notifications.rs:60-99`).
- Everything else — `delegate(provider:, async:)`, star topology, role
  files from `.agents/agents`, handoff memo, sqlite subagent sessions —
  is in the Goose research map and unchanged.

TUICommander (for the comparison):
- Tauri 2 + SolidJS + Rust (108k TS + 225k Rust), Apache-2.0, one
  maintainer, weekly releases; CodeMirror, alacritty_terminal, whisper-rs
  (`package.json:23-47`, `src-tauri/Cargo.toml:143-215`).
- ACP client is backend-only and launches one binary, the
  `ego_executable` setting: "No frontend surface yet"
  (`docs/FEATURES.md:2129-2158`, `SPEC.md:417`). All 11 agents run as
  PTYs.
- Orchestration: root orchestrator + ≤3 managed children, "Children
  must not spawn agents", results via parent inbox; children are
  `claude --print … --dangerously-skip-permissions` one-shots
  (`ORCHESTRATOR.md:1-60`). Exposed as MCP tools (`agent`,
  `drive_agent`, `inbox`, `progress_*`; `src-tauri/src/mcp_http/`).

Local prerequisites observed: `claude-agent-acp` present; `codex-acp`
missing; `cursor-agent` at `~/.local/bin` with `acp` subcommand; `goose`
CLI not installed; `agy` has no ACP mode.

## Recorded decisions

- Correction: the Goose research addendum's row "Emdash — CLI/PTY +
  lifecycle hooks, not ACP" came from a README summary and is wrong;
  the tree shows 23 ACP providers. Recorded so no README-only reader
  repeats it.
- Stock Goose Desktop as the shell (option A) — dropped: Emdash has the
  workspace Goose lacks; Goose stays as the agent.
- Codeg (option D) — dropped by user pick for Emdash, not by evidence;
  it remains the ACP-native alternative if Emdash's company direction
  turns.
- TUICommander — rejected: ACP path is private to `ego`, agents are
  PTYs, children run ungated. Its `ORCHESTRATOR.md` invariants are
  PRD §21 written as rules and are source material for
  `orchestrator.md`.
- Prior: `AGENTS.md` (2026-09-11) parks agy print mode; neither stack
  changes that — agy is a PTY tab in both.

## Options → pick

Axis: how much of Emdash is touched before the orchestration thesis
is tested.

| Option | Owns | Trades away |
|---|---|---|
| E1. Stock Emdash + stock Goose CLI; six role files in `melody-agent2/.agents/agents/`; Goose config sets the orchestrator's provider | zero code; both upstreams track themselves; Direct mode (claude/codex/cursor conversations) and Orchestrate mode (goose conversation) both work today | `delegate` shows as a plain tool row; no agent tree; orchestrator provider picked in Goose config, not Emdash's picker |
| E2. E1 + Goose enrich hook in `packages/plugins/src/agents/impl/goose/` (+ optional Goose `cursor_acp.rs` mirroring `claude_acp.rs`) | §25 activity view; gated Cursor leg | a fork commit or two upstream PRs to carry until merged |
| E3. Emdash feature slice: RPI phase strip + artifact viewer | §26 | a new slice in a 328k-LOC, YC-velocity repo |

Pick: **E1 → E2.** E2's Emdash half is ~40 lines on the documented
extension surface (`providers.md` §Adding Or Changing A Provider), so it
is an upstream PR first and a fork only if refused. E3 waits for use.
- E1 deliverable: Goose CLI + `codex-acp` installed; six role files;
  Goose `config.yaml` with `GOOSE_PROVIDER: claude-acp`; the runtime
  matrix (each role × each provider, one task) run from an Emdash goose
  conversation, results recorded.
- E2 deliverable: `impl/goose/acp-enrich.ts` mapping tool `delegate` →
  `{ kind: 'subagent' }` with `parentToolCallId` from
  `_meta.toolNotification` where present; registered via `enrich:` in
  `impl/goose/index.ts`.

## Scope — in / out / protected

- in (E1): `melody-agent2/.agents/agents/{orchestrator,researcher,
  planner,implementer,reviewer,advisor}.md`; `~/.config/goose/config.yaml`
  (provider + extensions); `npm i -g @agentclientprotocol/codex-acp`;
  `download_cli.sh` for goose; Emdash release build.
- in (E2): `~/github/emdash/packages/plugins/src/agents/impl/goose/
  {acp-enrich.ts,index.ts}`; later `~/github/goose/crates/goose/src/
  providers/cursor_acp.rs` + `inventory/registrations.rs`.
- out: any Emdash orchestration engine (Goose owns it); an Emdash
  `agy` ACP path (agy has none); a second persistence store (Emdash
  conversations + Goose sessions is two already; PRD §30 says add only
  where needed); TUICommander's MCP orchestration API.
- protected: Emdash `packages/core/src/runtimes/acp/` (protocol-major
  rules in `acp-runtime.md` §Models and Protocol Versioning); Goose
  `agents/agent.rs` + `state_machine/` (dual-path rule); the `_goose/*`
  and Wire contracts are not ours to change.

## Unknowns

- `goose acp` inside an Emdash conversation in the melody-agent2
  worktree: does `delegate(provider: "claude-acp")` run, and do
  subagent permission requests surface in Emdash's UI or get answered
  inside goosed by Goose's mode? — cheap (install goose, open Emdash);
  reversible. The one that could flip E1.
- `models: none` on the goose plugin hides the create-modal picker
  (`create-conversation-modal.tsx:59`); whether Goose's ACP
  `configOptions` (model/effort) still render in the composer — cheap;
  reversible.
- Is `_meta.toolNotification` read by Emdash's `event-routing.ts` or
  dropped? Either way subagent output lands on the delegate row —
  acceptable for V0; matters for E2's `parentToolCallId`.
- Goose advertises MCP over http only; Emdash's goose plugin pushes
  none — so Goose's `developer` extension is the tool surface for the
  orchestrator. Whether that collides with Emdash's own file/terminal
  callbacks (ACP `fs`/`terminal` client capabilities) — cheap; reversible.
- Emdash upstream appetite for a goose enrich PR — not testable without
  opening it; reversible (carry as fork commit).
- agy: unchanged — Researcher default blocked until `check-reach.py`
  PASS or a Goose `agy` provider (`gemini_cli.rs` template).

Direction call routed to this session's advisor (first rung, opus
high), one opinion; the pick was not split.
