# Runtime matrix — the role × runtime proof

Dated 2026-09-16, 13:07–14:10 PDT. Tree at `7c7f16032` (worktree
`agent-a50f3869dc9a794a8`). Task 9 in `tasks.md`. Predecessor:
`docs/2026-09-15-spine-bridge-spike-v1.md` (bridge proof, two runs).

## Setup

- Parent, every run: `goose run --recipe <recipe> --provider claude-code
  --model claude-opus-5 --max-turns 6` from the worktree root, with
  `GOOSE_PATH_ROOT` = a copy of the spike's scratch home (fresh
  `sessions.db`), `GOOSE_MODE=auto`, `MCP_TOOL_TIMEOUT=1800000`,
  `CLAUDECODE` unset. Ten-minute kill wrapper per run. Runner:
  `scratchpad/t9/run.sh`; recipes: `scratchpad/t9/recipes/*.yaml`; logs:
  `scratchpad/t9/logs/<name>.log` (+ `.diff` for the three edits);
  `sessions.db`: `scratchpad/t9/goose-root/data/sessions/sessions.db`.
  Scratchpad root: `/private/tmp/claude-501/-Users-hoaqbui-github-melody-agent2/e1dd5108-5c74-44bf-9212-86b6d83e32e0/scratchpad/`.
- Binary: `cargo build -p goose-cli --bin goose` of this tree (debug),
  copied to `scratchpad/t9/goose`. Adapters: `claude` 2.1.270,
  `claude-agent-acp` 0.62.0, `@agentclientprotocol/codex-acp` 1.12.0
  (`codex-cli` 0.153.4, auth mode `chatgpt`), `cursor-agent`
  2026.09.10-fd3934a (logged in), `agy` 1.2.4.
- Implementer recipe (one per provider): call `delegate` once with
  `source: "implementer"`, `provider: "<X>"`, `instructions: "add a
  `--version` line to scripts/check-spine.sh help"`; print the child's
  reply prefixed `CHILD SAID:`; no retry. The child's `working_dir`
  defaults to the parent's (this worktree); `git checkout --
  scripts/check-spine.sh` between runs.
- Advisor recipe (six): call `delegate` once with `source: "advisor"`,
  `exclude_provider: "<one of claude-code | codex-acp | cursor-acp>"`,
  instructions asking one line ("which provider and model are you running
  as … begin with ADVISOR-OK"). No `GOOSE_RUNTIME_ROLL_SEED`, so each roll
  is `roll_runtime` over the remaining two seats at equal weight
  (`.agents/agents/advisor.md:4-7`, `summon.rs:280-296`).
- Model resolution when `provider:` is passed: the roll is skipped
  (`summon.rs:1940-1946`); `implementer.md` has no top-level `model:`, so
  `resolve_model_config` falls through to the provider default —
  `"current"` for the three ACP providers (`acp/provider.rs:52`),
  `gemini-3.8-flash-high` for `agy` (`agy.rs:28`). "current" means the
  adapter's own default; the actual model is read from the adapter's
  store and noted in the row.
- Role-body delivery: `claude-acp`, `codex-acp`, `cursor-acp` do not
  accept a system prompt (`acp/provider.rs:807`), so the role body arrives
  folded into the first user turn as "The orchestrator that delegated this
  task set your role as follows: … --- Your task: …"
  (`subagent_handler.rs:252-257`) — no Goose subagent scaffolding, unlike
  the spike's run 2. `agy` accepts a system prompt, so its first user
  message is the bare task.

## Implementer runs

| provider | model (db → actual) | turns | result shape | permission prompts | first reply honoured role body | subscription | quota/auth | wall | adapter flags |
|---|---|---|---|---|---|---|---|---|---|
| claude-acp | `current` → `claude-opus-5` (Claude Code transcript `9ca459ab`, `permissionMode: bypassPermissions`) | 11 assistant blocks, 32 messages, 13 tool requests (9 execute, 1 edit, 1 `advisor` — Claude Code's own server tool, `srvtoolu_…`, message 25; no result row came back over ACP), 455,290 tokens | edited: `+30/−1` — `show_usage()`, `--version` prints `check-spine 1.0.0`, `-h/--help`, unknown-option error; `bash scripts/check-spine.sh` still `spine clean`. Diff right (`logs/impl-claude-acp.diff`) | none | yes, with a caveat — no refusal; opened with "I'll start by looking at the script.", returned the `# Implementation Result` shape with every section, ran the checks it claimed; but it consulted Claude Code's built-in `advisor` mid-task, which the role body's "Do not delegate" arguably covers | Claude Max (child, plus the `advisor` server tool) | none | 151 s, exit 0 | none (`args: []`, `CLAUDECODE` removed, `claude_acp.rs:84-88`) |
| codex-acp | `current` → none (prompt never answered) | 1 assistant block (the error), 3 messages | not edited — child returned `usageLimitExceeded` | none | not testable — the reply is the quota message | ChatGPT (codex `auth_mode: chatgpt`) | "You've hit your usage limit … try again at 5:05 PM", `codexErrorInfo: usageLimitExceeded` (`logs/impl-codex-acp.log`) | 14 s, exit 0 | none (`args: []`, mode `agent-full-access`, `codex_acp.rs:81-95`); ran inside a git repo so `--skip-git-repo-check` is untested here and has no ACP equivalent |
| cursor-acp | `current` → `cursor-grok-4.6-high-fast` (`~/.cursor/acp-sessions/628ed0d5…/store.db`, `modelName` ×24) | 28 assistant blocks, 96 messages, 38 tool requests (3 execute, 1 edit) | edited: `+26` — `show_usage()`, `--version` prints `check-spine` (no number), `-h/--help`, unknown-option error; default path unchanged. Diff right (`logs/impl-cursor-acp.diff`) | none (mode `agent`; no `requestPermission` in the goose log) | yes — opened with "I'll start by reading the plan, project process, and the spine-check script", returned the full shape; its thinking said "Claiming the open task from tasks.md" but `tasks.md` was not touched (`git status` clean after the run) | Cursor ($20) | none | 96 s, exit 0 | `cursor-agent acp` only (`cursor_acp.rs:108-110`); no `--trust` needed; 3× `cursor/update_todos` → `-32601 Method not found` (harmless) |
| agy | `gemini-3.8-flash-high` (provider default; the role's own `agy` seat lists the same, `implementer.md:6`) | 1 assistant block, 3 messages (agy runs its own tool loop; goose sees one turn), 324,320 tokens | edited: `+18/−1` — usage comment extended, `case` on `$1` for `-h/--help/help` and `--version/-v` printing `check-spine 0.1.0`; default path unchanged. Diff right (`logs/impl-agy.diff`) | none (`--dangerously-skip-permissions`, `agy.rs:137`) | yes — role body via system prompt; reply is the full `# Implementation Result` shape with commands beside output | Google (agy) | none | 295 s, exit 0 | `--model <m> --input-format stream-json --output-format stream-json --dangerously-skip-permissions` (`agy.rs:127-137`) |

Sessions (parent → child): `20260916_1 → _2` (claude-acp), `_3 → _4`
(codex-acp), `_5 → _6` (cursor-acp), `_7 → _8` (agy); every child row
is `session_type = sub_agent` with `parent_session_id` set and
`working_dir` = this worktree.

## Advisor rolls

| roll | excluded | landed on | model (db → actual) | reply | turns | wall | sessions |
|---|---|---|---|---|---|---|---|
| 1 | `claude-code` | `codex-acp` | `gpt-5.6-sol` → none | `usageLimitExceeded` (same message as above) | 1 | 15 s | `_9 → _10` |
| 2 | `codex-acp` | `claude-code` | `claude-fable-5-1` → `claude-fable-5-1` (Claude Code transcript `561d723e`) | `ADVISOR-OK — Anthropic, Claude Fable 5.1 …; no: … a new surface with zero concrete uses` — one line, as asked; the `# Advice` shape not used (the ask was one line) | 1 (28,527 tokens) | 12 s | `_11 → _12` |
| 3 | `cursor-acp` | `codex-acp` | `gpt-5.6-sol` → none | `usageLimitExceeded` | 1 | 12 s | `_13 → _14` |
| 4 | `claude-code` | `codex-acp` | `gpt-5.6-sol` → none | `usageLimitExceeded` | 1 | 14 s | `_15 → _16` |
| 5 | `codex-acp` | `cursor-acp` | `cursor-grok-4.6-xhigh` → `cursor-grok-4.6-high-fast` (`~/.cursor/acp-sessions/c648bc63…`, `modelName` ×10) | `ADVISOR-OK` then the full `# Advice` shape (Question / Recommendation / Options / Assumption / Missing), recommending against the flag with `file:line` cites; 13 read-only tool requests, 0 edits | 5 blocks, 35 messages | 46 s | `_17 → _18` |
| 6 | `cursor-acp` | `claude-code` | `claude-fable-5-1` → `claude-fable-5-1` (`42dccd9b`) | `ADVISOR-OK — Anthropic, Claude Fable 5.1 …; no: … "default to less" wins` | 1 (31,660 tokens) | 14 s | `_19 → _20` |

- The excluded provider never ran: six of six (`provider_name` of each
  child row above; `exclude_runtime`, `summon.rs:246-252`).
- Three rolls with `codex-acp` still in the pool landed on it three
  times — consistent with chance on a fair two-way roll (1 in 8); a
  `GOOSE_RUNTIME_ROLL_SEED` re-run would settle it.
- Permission prompts: none in any of the ten runs; no
  `requestPermission` in any goose CLI log
  (`scratchpad/t9/goose-root/state/logs/cli/2026-09-16/`).

## Findings

### Settled from research v1 §Unknowns

- **`delegate(provider: "<acp>")` runs `AcpProvider` inside a `SubAgent`
  session** — yes, for all three ACP providers: linked `sub_agent` rows,
  the child's tool calls rendered as `toolRequest` messages carrying
  `goose.external_dispatch: true` and `goose.acp.kind`
  (execute/read/edit), tool results as `toolResponse`. `max_turns` appears
  not to be the bound it was assumed to be — one observation: an ACP
  child runs its whole tool loop inside the adapter on one goose prompt;
  the `cursor-acp` child produced 28 assistant blocks and 38 tool calls
  in one turn, past the default subagent cap of 25
  (`subagent_task_config.rs:9`), and was not stopped. Read: `max_turns`
  caps goose prompts, not the adapter's internal loop. Not tested:
  whether a second prompt is ever sent to an ACP child.
- **Claude model ids through `claude-agent-acp`**: not exercised here —
  the implementer cell ran with `model: "current"` (no `model:` on the
  role, provider forced), and the adapter's current = `claude-opus-5`.
  The spike settled `claude-sonnet-5`; Opus/Fable by id stay untested on
  the ACP path. The `claude-code` seat did take `claude-fable-5-1`
  (rolls 2 and 6).
- **`exclude_provider`** is honoured — six of six rolls, no repeat of
  the excluded seat.
- **Orchestrator drift** (does the prompt alone pick the provider): not
  the question this matrix asked — every recipe forced the provider or
  the exclusion. The parent (Claude Code, opus) called `delegate` exactly
  once with the arguments given in ten of ten runs and never retried;
  one parent emitted a stray "I need to load the `delegate` tool schema
  before I can call it." before the call (`logs/adv-1-ex-claude-code.log`).
- **The fold (task 26 pick C)**: judged here for `claude-acp` and
  `cursor-acp` — both children read the folded role body as their role,
  no refusal, and returned the role's return shape unprompted. The
  spike's run 2 refusal is gone with the reframed fold
  (`subagent_handler.rs:257`). One caveat on `claude-acp`: the child
  called Claude Code's own `advisor` server tool once mid-task (message
  25 of `20260916_2`) — an out-of-band consult the role's "Do not
  delegate" does not clearly permit, and a second Claude Max draw the
  ledger does not see. `codex-acp` could not be judged (quota).
- **Adapter flags**: none beyond what each provider hardcodes; no
  `--trust`, no `--skip-git-repo-check` — those are print-mode flags of
  the CLIs, and the ACP servers do not take them. `agy` in stream-json
  mode did not hang (295 s, the longest cell).
- **`MCP_TOOL_TIMEOUT`**: set pre-emptively again; the longest
  `delegate` call (295 s) returned. Whether it is needed is still
  unmeasured (no run without it).

### What failed and why

- **`codex-acp`, every time it was reached (implementer cell, advisor
  rolls 1, 3, 4)**: the ChatGPT subscription's Codex usage window was
  exhausted before this session — "You've hit your usage limit … try
  again at 5:05 PM" (`codexErrorInfo: usageLimitExceeded`). The
  adapter started, `session/new` succeeded (a `sub_agent` row exists for
  each), and the first prompt failed. Not a fork bug; the cell was not
  retried (the reset is four hours out).
- Nothing hung; no run reached the ten-minute kill.

### The first fail-over datum

- Shape: a child that starts, then dies on quota, is a **hard error to
  the parent, not a re-roll**. `resolve_rolled_provider` re-rolls only
  when `resolve_provider` fails — binary missing or ACP connect refused
  (`summon.rs:1966-1986`); the quota error arrives on the prompt, after
  the provider resolved, and is returned to the parent as the tool
  result text "Ran into this error: …". The parent then decides; with
  "do not retry" in the recipe it reported the error. So AGENTS.md's
  "advance one rung on outage, rate limit" is not something the roll
  does today — the orchestrator body (or a re-roll on prompt error in
  `summon.rs`) has to.
- Subscriptions drawn: Claude Max (parents ×10, `claude-acp` child,
  `claude-code` advisor ×2), Cursor (`cursor-acp` ×2), Google (`agy`
  ×1), ChatGPT (`codex-acp` ×4, all refused). Only ChatGPT reported a
  quota message.
- Cost column: `usage_ledger.cost_source` is `estimated` for
  `claude-code` sessions and empty for ACP and `agy` children; ACP
  children record no token counts except `claude-acp` (455,290).

### Open after this run

- Re-run the `codex-acp` implementer cell after the quota resets (the
  fold judgement for Codex, and `gpt-5.6-sol` through the ACP `model`
  option) — one run, same recipe.
- The handoff-memo criterion (`tasks.md` §Waiting on the user, task 9
  line) is a manual check the user runs, not covered here.
- `cursor-agent` ignores the seat's `cursor-grok-4.6-xhigh`
  (`model_config_option_id: None`, `cursor_acp.rs:97-101`) and ran its
  own current model, `cursor-grok-4.6-high-fast`, both times;
  `sessions.db` records the seat's id, not what ran.
