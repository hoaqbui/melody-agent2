# Goose fork for melody-agent2 — research map

<!-- Upstream of rpi plan > implement (PRD sits between: PRODUCT.md is
     the pasted PRD, not yet in templates/prd.md shape). Anchor: the
     Goose upstream tree, cloned read-only to ~/github/goose at
     aaif-goose/goose@a23a8cd5 (2026-09-14, v1.50.0; org moved from
     block/ to aaif-goose/). melody-agent2 itself is empty, so the
     ARCHITECTURE.md boundary check is N/A this round; bootstrap.md
     runs before the first plan gate. -->

Dated 2026-09-15. Question as asked: fork Goose Desktop for
melody-agent2 per PRODUCT.md — does the current release expose the ACP /
subagent / custom-agent / persistence hooks §7 assumes, and what is left
to build?

## The surprise (lead finding)

**Goose 1.50 already ships the runtime layer the PRD planned to build.
Every §5 runtime exists as a Goose provider, `delegate` takes a per-call
`provider`, the star topology is enforced, agent `.md` files are read
from `.claude/agents`, and the handoff memo my 2026-08-22 ACP-mux
research called "unshipped" is in tree. What Goose does not have is the
workspace: zero editor / terminal / diff / git dependencies, and a
page-router UI, not panes.** §7's "primary custom engineering" collapses
to: workspace panes (large), one frontmatter field (tiny), an `agy`
provider (small, blocked), RPI phase UI (medium).

## Reframe trail

1. Does Goose expose ACP so we can plug external agents in? > Goose is
   an ACP *agent* (`goose serve`, `goose acp`) and the desktop is an ACP
   *client* over WebSocket (`ui/desktop/src/acp/acpConnection.ts:1-8`);
   external agents plug in as *providers* (`crates/goose/src/acp/provider.rs:274`) > so what is a "runtime" in Goose terms?
2. Runtime = Provider. `claude_acp.rs`, `codex_acp.rs`, `cursor_agent.rs`,
   `gemini_cli.rs` all exist (`crates/goose/src/providers/mod.rs:25-40`)
   > PRD §6 `AgentRuntime` is already Goose's `Provider` trait; question
   becomes: can a *subagent* run on a different provider than the Orchestrator?
3. `delegate(provider:, model:, async:)` + `load(source: task_id, peek:)`
   (`summon.rs:779-860`) > yes, per call > question becomes: can the
   *role file* pin the runtime?
4. `AgentMetadata` = name / description / model only
   (`summon.rs:208-214`) > no; role→runtime lives in the Orchestrator's prompt or
   a fork patch > question becomes: what does Goose lack for §22-26?
5. Desktop deps: no xterm / node-pty / monaco / codemirror / diff lib
   (grep of `ui/desktop/package.json` empty); routes are pages
   (`ui/desktop/src/App.tsx:636-674`) > the workspace UI is net-new; the
   fork cost is the UI, not the agent layer > final question: is a fork
   needed to test the orchestration thesis at all? > no (see Options).

## Inventory — read this session

Runtime adapters (all subscription-backed, all in tree):
- `crates/goose/src/providers/mod.rs:25-40` — `chatgpt_codex`, `claude_acp`,
  `claude_code`, `codex`, `codex_acp`, `copilot_acp`, `cursor_agent`,
  `gemini_cli` modules; `amp_acp` at `:2`.
- `crates/goose/src/providers/claude_acp.rs:16-45` — provider `claude-acp`,
  binary `claude-agent-acp`, "Use goose with your Claude Code
  subscription"; `:66-75` maps GooseMode → Claude permission mode
  (Auto→bypassPermissions, Approve→default, SmartApprove→acceptEdits,
  Chat→plan). `claude-agent-acp` is installed here
  (`/opt/homebrew/bin/claude-agent-acp`).
- `crates/goose/src/providers/codex_acp.rs:15-45` — provider `codex-acp`,
  needs `@agentclientprotocol/codex-acp` (not `@zed-industries/`);
  `codex-acp` is **missing** locally.
- `crates/goose/src/providers/cursor_agent.rs:277-282` — spawns
  `cursor-agent --model … --print --output-format json --force`; the CLI
  runs its own tools, no permission gate. `cursor-agent --help` shows
  print / stream-json only, no ACP mode. Binary at `~/.local/bin`, not on
  this shell's PATH.
- `crates/goose/src/providers/gemini_cli.rs:106-112` — spawns `gemini -m
  <model> -r <sid> --output-format stream-json --yolo`. `agy --help`
  exposes the same print surface (`--output-format stream-json`,
  `--input-format stream-json`, `--conversation <id>`, `--model`,
  `--effort`) and no ACP mode → an `agy` provider is a near-clone of
  this file. No `gemini` binary here.
- `crates/goose/src/acp/provider.rs:274,606,677,820` — `AcpProvider`
  spawns the adapter, forwards Goose extensions as MCP servers
  (`:1843 extension_configs_to_mcp_servers`), and marks the agent's own
  tool calls `TOOL_META_EXTERNAL_DISPATCH_KEY` (`:38`); the agent loop
  keeps those in the message but skips dispatch
  (`agents/reply_parts.rs:1427-1465`), so the desktop renders them via
  the normal tool-call path.
- `crates/goose/src/acp/handoff.rs:1-40` — bounded handoff memo when a
  conversation moves to an ACP agent with no native session: 30 % of
  context, ≤64k tokens, older tool output redacted. This is the
  "compacted handoff brief" my ACP-mux memo said nobody had shipped.

Delegation / roles:
- `crates/goose/src/agents/platform_extensions/summon.rs:779-860` —
  `delegate` schema: `instructions`, `source` (recipe or agent name),
  `extensions`, `provider`, `model`, `max_turns`, `context`,
  `working_dir`, `async`; `:706-720` `load(source: task_id, peek|cancel)`
  for background tasks.
- `summon.rs:1809-1838` — provider precedence: env
  `GOOSE_SUBAGENT_PROVIDER` > `params.provider` > recipe settings >
  config `GOOSE_SUBAGENT_PROVIDER` > parent session provider.
- `summon.rs:208-214` — `AgentMetadata { name, description, model }`; no
  `provider` field. `:1626-1631` only carries `params.provider` into
  recipe settings when the file sets `model`.
- `summon.rs:397-408` — agent dirs: `<cwd>/.goose/agents`,
  `<cwd>/.claude/agents`, `<cwd>/.agents/agents`, plus `~/` variants and
  `<config>/agents`. PRD §21's `.agents/agents/*.md` layout is read as-is.
- `summon.rs:1369`, `:2163-2170` — a `SessionType::SubAgent` session gets
  no `delegate` tool and is refused if it calls it: PRD §20 star topology
  is enforced upstream.
- `platform_extensions/orchestrator.rs:652-683` — a second, hidden,
  off-by-default extension (`mod.rs:187-191`): `list_sessions`,
  `view_session`, `start_agent`, `send_message`, `interrupt_agent`;
  subagents may only message siblings (`:477-497`). Persistent named
  agents (PRD §33) already have a backend.
- `agents/subagent_task_config.rs:9-14,55` — `DEFAULT_SUBAGENT_MAX_TURNS
  = 25`, override `GOOSE_SUBAGENT_MAX_TURNS`.
- `agents/subagent_execution_tool/notification_events.rs:4-60` —
  `TaskStatus {Pending,Running,Completed,Failed}`, `tasks_update` /
  `tasks_complete` notifications: the §25 activity feed has a backend
  event stream.

Desktop:
- `ui/desktop/src/acp/acpConnection.ts:1-8` — `@agentclientprotocol/sdk`
  1.3.0 (`package.json:53`), ACP v1 over `experimental/ws-client`;
  `gooseServe.ts:365-372` spawns `goose serve --port … [--tls]`.
- `_goose/unstable/*` — ~80 extension methods (sessions, providers,
  extensions, recipes, schedules, config, dictation, apps) enumerated
  from `ui/goose-acp-client/src`; the desktop is not a generic ACP
  client and cannot be pointed at `claude-agent-acp` directly.
- `ui/desktop/src/components/ModelAndProviderContext.tsx:92-140` —
  `changeModel(sessionId, model)` patches provider/model per session:
  PRD §4.2 Direct mode = pick `claude-acp` / `codex-acp` /
  `cursor-agent` for a session, already in the UI.
- `ui/desktop/src/components/ToolCallWithResponse.tsx:28-134` — "View
  subagent session" link from a delegate tool call (`subagent_session_id`
  meta): PRD §23 "agent transcript drill-down" exists.
- `ui/desktop/src/App.tsx:636-674` — routes: hub, pair, settings,
  extensions, apps, sessions, schedules, recipes, skills, permission.
  `components/Layout/` is `AppLayout` + `MainPanelLayout` + nav panel;
  no pane / split model.
- `ui/desktop/package.json` — no xterm, node-pty, monaco, codemirror,
  diff renderer; stack is Electron 43.4 / React 19.2 / react-router 8 /
  Tailwind 4 (`:84,89,145,154`). Desktop is 67.8k LOC ts/tsx (non-test);
  `crates/goose` is 171k LOC Rust.

Persistence / ops:
- `crates/goose/src/session/session_manager.rs:19,51,799` — sqlx +
  sqlite, `SessionType::SubAgent`, `parent_session_id`. PRD §29's
  sessions/tasks tables exist; only `artifacts` would be new.
- `goose/AGENTS.md` §Agent Loop Migration — `agents/agent.rs` and
  `agents/state_machine/` are dual-path (`GOOSE_STATE_MACHINE=1`);
  changes must land in both. Upstream PRs need a Ready issue.
- `CUSTOM_DISTROS.md` — supported customisation points are config,
  declarative providers, bundled extensions, prompts, desktop branding;
  "Build a new UI … over ACP: High".
- `rust-toolchain.toml` — Rust 1.96.1; `ui/desktop` builds with pnpm.

## Recorded decisions

- No git history in melody-agent2. Two dated priors bind:
  - memory `acp-mux-project` (2026-08-22): "don't build an ACP mux, use
    hydra-acp". Partially superseded — Goose's `AcpProvider` + handoff
    memo is that mux, with sessions and a desktop attached.
  - `agent-workspace/AGENTS.md` (2026-09-11): `agy` print mode parked —
    "turns hang and return empty output with exit 0". PRD §10/§16
    Researcher = AGY runs on exactly that surface.
- melody-agent (sibling) chose OpenClaw + ACPX as host; melody-agent2's
  PRD picks Goose. Not re-litigated here; the two are different hosts
  for the same delegation idea.

## Options → pick

Axis: how much code must be owned before the orchestration thesis
(Claude orchestrates, others work, RPI in between) can be tested.

| Option | Owns | Trades away |
|---|---|---|
| A. Config-only V0 on stock Goose Desktop: `.agents/agents/{orchestrator,researcher,planner,implementer,reviewer,advisor}.md` + a Orchestrator prompt that names the provider per role + `codex-acp` install | zero code, upstream tracks itself, thesis testable this week | no panes; role→runtime pinned in prompt text, not the role file; Cursor/agy legs ungated |
| B. Fork `aaif-goose/goose`: `provider` in `AgentMetadata` + pane system + Files/Diff/Terminal/Git panes in `ui/desktop` | everything in PRD §30 as written | carrying a 67.8k-LOC desktop against a daily-commit upstream; dual-path agent-loop rule on any backend touch |
| C. New thin client over `goose serve` via `@aaif/goose-acp-client` | clean pane architecture, no Electron fork | re-implements chat / tool-call / permission UI over ~80 `_goose/*` methods before any pane is useful |

Pick (revised 2026-09-15, user decision): **B — fork `aaif-goose/goose`,
keep `crates/*` as the spine, build the workspace on top of `ui/desktop`.**
A (stock desktop) was the research recommendation; the user chose to own
the UI now rather than after a config-only V0. C is dead: the desktop's
ACP client + `_goose/*` surfaces are exactly what a thin client would
re-implement.
- Goose is the spine: sessions, modes/permissions, providers, `delegate`,
  star topology, handoff memo, `provider`/`model` as ACP config options
  (`acp/response_builder.rs:303-317`, `acp/server/dispatch.rs:171` —
  runtime swap mid-conversation).
- The fork adds what the research found missing: a pane system over
  `App.tsx` routes; Files / editor / Diff / Terminal / Git / Browser /
  Markdown panes (new deps: xterm + node-pty, monaco or codemirror, a
  diff renderer); RPI phase strip + artifact viewer; agent-activity tree
  fed by `tasks_update` notifications; `provider` in agent frontmatter
  (`summon.rs:208-214`); `cursor_acp.rs` mirroring `claude_acp.rs`
  (local `cursor-agent acp` exists); an `agy` provider cloned from
  `gemini_cli.rs` when agy unparks.
- First fork commits are the two tiny backend patches (`provider`
  frontmatter, `cursor_acp.rs`) filed upstream as Ready issues in
  parallel, so they stop being carried; the UI work is the fork proper.

## Scope — in / out / protected

- in (A): `melody-agent2/.agents/agents/*.md` (6 files); a Orchestrator prompt
  or `.goose` recipe naming provider-per-role; `npm i -g
  @agentclientprotocol/codex-acp`; Goose Desktop 1.50 installed;
  `~/.local/bin` on the login-shell PATH that `gooseServe.ts:36`
  forwards.
- in (fork): `summon.rs:208-214` (+ `:1626`) for `provider`;
  `providers/cursor_acp.rs` + `inventory/registrations.rs`;
  `ui/desktop/src/App.tsx`, `components/Layout/*` → pane system; new
  panes + deps for terminal / diff / editor / git / browser / markdown;
  RPI strip + artifact viewer; agents activity view.
- out: a custom ACP gateway, a task engine, an `artifacts` table
  (PRD §28-29 say so, and Goose's sqlite already holds sessions and
  tasks); an `agy` provider until `check-reach.py` reports agy PASS
  (`gemini_cli.rs` is the template when it does).
- protected: `crates/goose/src/agents/agent.rs` and
  `agents/state_machine/` (dual-path rule); any upstream change goes
  through a Ready issue; provider adapters stay untouched in A.

## Unknowns

- Does `delegate(provider: "claude-acp")` run `AcpProvider` inside a
  `SubAgent` session with `max_turns` honoured and the agent's own tool
  calls rendered? — cheap to test? yes (Goose binary via
  `download_cli.sh`, `claude-agent-acp` present); reversible? yes. The
  one unknown that could flip A → B.
- `agy` print-mode hang — cheap? yes (`python scripts/check-reach.py`);
  reversible? yes. Blocks Researcher = AGY; interim is Researcher on
  `claude-acp` with `--effort low`, or `gemini-cli` if a `gemini` binary
  is installed.
- Cursor and agy legs run `--force` / `--yolo`: does PRD §7 "reuse Goose
  permissions" accept ungated Implementer runs? — a product call, not a
  test.
- Whether the Orchestrator's prompt alone reliably picks the provider per role
  (A) or drifts — cheap? yes (run the runtime matrix); reversible? yes.
- Upstream velocity: v1.50.0 with commits dated 2026-09-14; how often
  `_goose/unstable/*` changes shape decides B's carrying cost — not
  cheap to price without a few weeks of tracking.

Direction call routed to this session's advisor tool (first rung, opus
high); no second opinion taken — the pick was not split.

## Addendum 2026-09-15 — open-world sweep: adopt a workspace instead of building one?

Question: before B or C, is there a GitHub project that already has the
PRD §22-26 panes and can drive Goose? Sources are READMEs fetched
2026-09-15, not code read; stars as of that date.

Reframe: Goose is also an ACP *agent* (`goose acp`, stdio —
`crates/goose-cli/src/cli.rs:829`), so any ACP-native workspace can put
Goose (orchestrator + `delegate` + providers) behind its own panes. The
question is then "which ACP client has the panes", not "how do we build
panes".

| Project | Stars / license | Stack | Agents driven by | Panes (files/diff/term/git) | Orchestration | Fit |
|---|---|---|---|---|---|---|
| Codeg — github.com/xintaofei/codeg | 3.5k / Apache-2.0 | Tauri + Next.js | **ACP**, any agent via registry JSON; lists Antigravity | all four + split tab groups + Office preview; iOS/Android clients | user `@`-mentions agents; sub-agent output streams in-card | closest to PRD; Goose not listed but registrable |
| Emdash — github.com/generalaction/emdash | 5.7k / Apache-2.0 | Electron + TS (NX) | CLI/PTY + lifecycle hooks, 34 providers incl. Goose | diff, terminal, PR/CI, kanban, SSH remote | parallel worktrees only, no delegation | strong shell, wrong protocol (no ACP) |
| TUICommander — github.com/sstraus/tuicommander | 127 / Apache-2.0 | Tauri + SolidJS + Rust, alacritty terminal | PTY, 11 agents incl. Goose | richest set: editor, diff, git panel, PRs, CI auto-heal, browser PWA | inter-agent messaging, exposes itself as MCP | best panes, tiny community, PTY not ACP |
| Jockey — github.com/recailai/jockey | 25 / MIT | Tauri + SolidJS | ACP | none documented | per-role model + prompt (@PM on Opus, @Developer on Codex) | closest to PRD §8 roles, too small to adopt |
| Gold Band — github.com/diodeme/Gold-Band | 84 / AGPL-3.0 | Tauri + React | ACP | none documented | DIRECT / WORKFLOW canvas / AUTO | AGPL; no panes |
| acp-ui — github.com/formulahendry/acp-ui | 476 / MIT | Tauri + Vue | ACP, stdio **and ws://** | none | none | only client found that speaks WebSocket ACP — could hit `goose serve` directly |
| Vibe Kanban — github.com/BloopAI/vibe-kanban | (large) / open | Rust + React | CLI executors | diff + inline comments, built-in browser | kanban, no delegation | review-first, not ACP |
| Agent Orchestrator — github.com/TheTechOddBug/agent-orchestrator | — / Apache-2.0 | Go + Electron | CLI, 25+ harnesses | kanban, changed files, PR, CI | supervision, not delegation | ops layer, not a workspace |

Directory: agentclientprotocol.com/get-started/clients lists ~120 ACP
clients (2026-09-15); the desktop/multi-agent subset above is the part
that overlaps the PRD.

New option:

| Option | Owns | Trades away |
|---|---|---|
| D. Codeg as the workspace, `goose acp` registered as its agent | full pane set + mobile on day one, Apache-2.0, 3.5k★; Goose keeps orchestrator / delegate / providers | Goose-only surfaces (`_goose/*`: session list, provider config UI, "View subagent session") — Codeg owns sessions; delegation visible only as tool calls |

Pick (superseded 2026-09-15): D (Codeg) and Emdash (see
`2026-09-15-emdash-acp-research-v1.md`) were both evaluated and dropped by
user decision in favour of B — forking Goose's own desktop. The original
reasoning is kept below for the record.

Earlier pick: **A now; D is the fast-follow to test before
B or C.** D's test is one afternoon: register `goose acp` in Codeg via
distribution JSON, run the six roles, check that `delegate` tool calls
and subagent output render. If D holds, B shrinks to the `provider`
frontmatter patch and C is dead. If D fails on the Goose extension
surface, B is the path.

Unknowns added:
- Can Codeg's registry JSON launch a stdio agent with a working dir
  and env (Goose needs the project cwd)? — cheap; reversible.
- Does Codeg render nested tool-call streams from an ACP agent that
  itself delegates (Goose subagent output arrives as the parent's
  tool-call content)? — cheap; reversible.
- Codeg lists "Google Antigravity" as an ACP agent — is there an agy
  ACP adapter we missed? — cheap (read Codeg's registry entry).

## Addendum 2026-09-15 (later) — runtime facts that moved the role map

- `agy` print mode **unparked**: `python scripts/check-reach.py` →
  `claude: PASS · agy: PASS · codex: PASS · cursor-agent: PASS`
  (2026-09-15). The §Unknowns "agy hang" line is resolved; an `agy`
  provider (clone of `gemini_cli.rs`) is in scope (plan tranche 2).
  `agy models` lists `gemini-3.8-flash-{high,medium,low}` and
  `gemini-3.1-pro-high`.
- **Grok is a Cursor model**, not an xAI subscription here:
  `cursor-agent models` lists `cursor-grok-4.6-{low,medium,high,xhigh}[-fast]`,
  `cursor-grok-4.5-high`, plus `gpt-5.6-sol-*`, `gpt-5.6-luna-high`,
  `claude-{opus,sonnet}-5-*`, `claude-fable-5-thinking-*`,
  `gemini-3.7-flash-high`, `composer-2.5`. So `cursor_acp.rs` (task 6)
  is the Grok runtime and is required, not optional. Goose's
  `xai_oauth` (SuperGrok, `xai_oauth.rs:66,781`) stays unused.
- **Codex models**: `~/.codex/models_cache.json` lists `gpt-6-astra`
  (272k context, efforts low→ultra) and `gpt-5.6-sol`; Goose's own
  list stops at 5.6 (`chatgpt_codex.rs:59-79`) but `codex-acp` passes
  the model string through (`codex_acp.rs:97`).
- **Print-mode flags learned running the advisor panel** (three
  runtimes, one outline, 1–4 min each): `codex exec` needs
  `--skip-git-repo-check` outside a git repo; `cursor-agent -p` needs
  `--trust` (else "Workspace Trust Required", exit 1, empty output);
  `claude -p --model opus --effort high` needs nothing.
- **Budget (user, 2026-09-15)**: Claude Max $200/mo; ChatGPT Plus
  $20/mo; Cursor Pro $20/mo; Google AI Pro $200/yr. Volume roles
  (Implementer, Researcher) moved onto Claude and Flash accordingly
  (PRODUCT.md §5, §17).
- §Unknowns, first line ("does `delegate(provider:)` run `AcpProvider`
  inside a `SubAgent` with `max_turns` honoured") is still open —
  task 9 settles it, now across four providers.

## Addendum 2026-09-15 (evening) — the orchestrator has no `delegate` on any subscription runtime

Prompted by `docs/2026-09-15-goose-spine-research-v1.md` (another
session's evaluation, untracked at the time); every line below re-read
in this tree at `391811a10`.

- **ACP adapters drop Goose's system prompt and tools.**
  `AcpProvider::stream(&self, model_config, _system, messages, _tools)`
  (`crates/goose/src/acp/provider.rs:820-825`); the first prompt of a
  new ACP session is the last user message plus an optional handoff memo
  (`:1913` `messages_to_prompt`). So a session on `claude-acp`,
  `codex-acp` or the planned `cursor-acp` never sees `delegate`, and a
  delegated child on any of them never sees its role body (the recipe
  instructions become an overridden *system* prompt —
  `agents/subagent_handler.rs:134,167-168` — which ACP ignores).
- **Extensions cross to ACP and `claude-code` only as Stdio /
  StreamableHttp MCP servers.** `extension_configs_to_mcp_servers`
  (`acp/provider.rs:1843`, `_ => {}`) and `claude_mcp_config_json`
  (`providers/claude_code.rs:541-580`, `_ => {}`) skip `Builtin` and
  `Platform`; summon is a platform extension
  (`agents/platform_extensions/mod.rs:121-129`), so `delegate` /
  `load` are not exported anywhere.
- **Print-mode CLIs are no better.** `claude-code` passes the system
  prompt (`--system-prompt-file`, `claude_code.rs:368-380`) but ignores
  tools (`_tools`); `gemini_cli` the same; `cursor_agent`'s
  `execute_command` takes `_tools` (`cursor_agent.rs:~546`).
- **The only subscription-backed provider that receives both system
  and tools is `chatgpt_codex`** ("Use your ChatGPT Plus/Pro
  subscription for GPT-5 Codex models via OAuth", `chatgpt_codex.rs:961`;
  `system`/`tools` in its `stream`). API-key providers (`anthropic`,
  `openai`, `xai`, …) do too. `gemini_oauth` is deprecated in tree
  (`gemini_oauth.rs:936`).
- **Consequence for the plan.** Tranche 2's "three feature files" do
  not give Claude an orchestrator seat: after tasks 5, 6, 17 land, an
  Orchestrate session on `claude-acp` still cannot call `delegate`, and
  ACP workers still do not read `.agents/agents/*.md` bodies. Task 9
  would have found this on its first run; found by reading instead.
- **Repairs, sized (spine, outside `agent.rs` / `state_machine/`):**
  (i) fold the system prompt into the first prompt of a new ACP session
  in `AcpProvider::stream` — small, one file; gives role bodies to ACP
  orchestrators and workers. (ii) export a session's platform
  extensions as a StreamableHttp MCP endpoint on `goose serve`
  (`/mcp/<session_id>`), and include it from
  `extension_configs_to_mcp_servers` and `claude_mcp_config_json` —
  medium; gives `delegate` to `claude-acp` and `claude-code`. Both are
  upstream-shaped Ready issues. Summon's children run `Auto`
  (`summon.rs:1394`) — permission forwarding is a separate, later gap.
- **Interim orchestrators without spine work:** `chatgpt_codex`
  (subscription, tools+system, contradicts Claude-first and puts the
  heaviest session on the $20 tier) or `anthropic` by API key (Claude,
  tools+system, contradicts subscription-first, costs money).

### Correction, same evening — three checks that resize the repairs

Run at `822dd1f51`; each line re-read in tree.

- **No hidden system channel in ACP.** `grep -n system
  crates/goose/src/acp/provider.rs` finds only the ignored `_system`
  parameter; `session/new` carries no prompt or `_meta` field. Repair
  (i) stands, but it is a *workers-on-ACP* patch, not an orchestrator
  patch (next line).
- **`claude-code` is a Claude-first orchestrator that needs only (ii).**
  Registered (`providers/init.rs:90`), takes `--model`
  (`claude_code.rs:398`), passes the role body as
  `--system-prompt-file` (`:378`) and forwards `StreamableHttp` /
  `Stdio` extensions via `--mcp-config --strict-mcp-config`
  (`:391-392`, `:546-556`). Gating: `Auto` → `--dangerously-skip-permissions`;
  `SmartApprove`/`Approve` → `--permission-prompt-tool stdio`
  (`:350-365`), so a Direct session on it honours Goose's modes. Open
  question for the spike, not assumed: whether Claude Code print mode
  calls an MCP tool named `delegate` unprompted or needs the role body
  to say when.
- **(ii) is smaller than "medium" as a synthetic extension.** Register
  one per-session `ExtensionConfig::StreamableHttp` whose `uri` is a
  new `goose serve` route (`/mcp/<session_id>`, token in `headers`)
  that dispatches to that session's platform clients. Both forwarders
  already pass `StreamableHttp` through untouched, so the patch is the
  route plus the injection at session start — neither
  `extension_configs_to_mcp_servers` nor `claude_mcp_config_json`
  changes.
- **Every delegated child runs `Auto`, whatever its provider.**
  `summon.rs:622,1400,2075,2373`, with the in-tree comment "Subagents
  must use Auto until get_agent_messages forwards ActionRequired
  messages to the parent." `PRODUCT.md` §5 ("`claude-acp`, `codex-acp`
  run gated by Goose's modes") is true for a Direct session and false
  for every worker; the accepted-ungated-`agy` carve-out was moot. Fix
  §5 when the direction lands.
- **(ii) makes `delegate` callable, not visible.** An adapter's tool
  call is external dispatch; the Agents tree and RPI strip (`PRODUCT.md`
  §11) depend on `tasks_update` / `subagent_tool_request`
  notifications that no code path emits for a foreign-adapter call.
  Tranche 5 work, not a blocker; do not read "(ii) done" as "the tree
  lights up".
- **For the task 9 proof, put the Implementer on `claude-code`, not
  `claude-acp`.** Print-mode workers receive their role body today; ACP
  workers do not until (i). One cell in `PRODUCT.md` §6, pending (i).
