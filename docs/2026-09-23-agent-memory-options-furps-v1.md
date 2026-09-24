# Agent memory — three options, FURPS+ — research v1

Dated 2026-09-23. User: "what are the 3 options and what are the trade offs? what would be the implementation like? what would be the FURPS benefit?" → "do a deeper FURPS analysis". Neighbours: `docs/2026-09-22-persistent-memory-research-v1.md` (the field; its 2026-09-23 correction), `docs/2026-09-22-agent-memory-prd-v1.md` (the walk scored against below). Research only.

## The options

1. **Notebook** — `~/Melody/` git repo in OpenClaw's layout (`AGENTS.md` rules · `SOUL.md` voice · `USER.md` you · `MEMORY.md` capped index + durable facts · `memory/YYYY-MM-DD.md` log · `BOOTSTRAP.md` first run · `CLAUDE.md` = `@AGENTS.md @SOUL.md @USER.md @MEMORY.md`), read natively by the seats; later a ~100-line cap-check + tidy-up script.
2. **goose-built** — a Rust platform extension (tools + boot text) and a flush-then-summarise-from-originals hook at both compaction sites (`agent.rs:2326`, `state_machine/ops_compaction.rs:197`).
3. **OpenClaw seat** — `openclaw acp` as one more ACP runtime, its workspace at `~/Melody/`, its multi-agent config as the companions.

## Facts established this session (they move the scores)

- Every seat in use manages its own context — `claude-acp`, `codex-acp`, `cursor-acp` (`crates/goose/src/acp/provider.rs:966`), `claude-code` (`providers/claude_code.rs:692`), `agy`, `gemini_cli`. goose's compaction runs on none; the sessions DB shows 0 compactions and 0 multi-day sessions in 316 sessions (2026-09-16 → 09-23); the 147 real sessions have ≤ 16 messages.
- ACP seats take no system prompt from goose (`acp/provider.rs:970` `accepts_system_prompt() == false`); goose's extensions reach them as per-session MCP servers (`providers/claude_acp.rs:7` `extension_configs_to_mcp_servers`).
- The `claude-acp` adapter loads `CLAUDE.md` and settings from user, project and local (`claude-agent-acp/dist/acp-agent.js:4040`).
- `openclaw acp` exists: an ACP server over stdio that "forwards prompts to the Gateway over WebSocket"; **per-session MCP servers are rejected** ("Bridge mode rejects per-session MCP server requests"); exec-approval relay and tool streaming are partial (https://docs.openclaw.ai/cli/acp, read 2026-09-23). `acpx` is the other direction — OpenClaw driving ACP agents (`extensions/acpx/README.md`).
- OpenClaw is MIT; `@openclaw/memory-core` is `"private": true` with `openclaw` as a peer dependency — not importable (`extensions/memory-core/package.json`).

## Functionality — does it deliver the walk?

| PRD step | 1 Notebook | 2 goose-built | 3 OpenClaw |
|---|---|---|---|
| 1 boot from charter + index + 2 log days | ✓ Claude via `CLAUDE.md` imports; Codex/Cursor read `AGENTS.md` only (no imports), so `AGENTS.md` must say "read SOUL/USER/MEMORY and the two log days first" — a tool call, not automatic | ? boot text rides MCP server instructions on ACP seats; whether each adapter surfaces them is untested | ✓ native (`AGENTS.md`, `SOUL.md`, `MEMORY.md`, today + yesterday) |
| 2 read a note on demand | ✓ Read tool | ✓ `note_read` | ✓ `memory_get` |
| 3 journal as she goes | ✓ by instruction | ✓ by tool (clearer affordance) | ✓ by instruction + tool |
| 4 flush before compaction | ✗ no hook reaches the model on your seats; mitigated by journaling as she goes; never triggered today | ✓ in code — on seats you don't use | ✓ native silent flush turn |
| 5–7 companions, report, charter diff | ✓ folders + `delegate` (a child builds in its own `working_dir`); report via the final-output schema — both goose features already present | ✓ same | ✗ `delegate` is a goose MCP tool and the bridge rejects per-session MCP servers — companions would be OpenClaw agents, outside goose's Agents pane, roles and seat routing |
| 8 nightly tidy-up | later — script | later — code | ✓ dreaming (gates, 25 % loss cap, `DREAMS.md`) |
| 9 user reads / edits / reverts | ✓ files + git + the panes | ✓ same | ✓ files + git; the panes only if the cwd is the workspace |
| 10 seat switch keeps memory | ✓ all four seats read the folder | ✓ where goose's loop runs | ✗ Melody *is* the OpenClaw seat; switching seats leaves her memory behind |
| Security: companions can't read your profile | by rule (a companion's cwd is its own folder) | by code (scoped tool) | by config (`MEMORY.md` main-session only, per-agent vaults) |

- **1:** 7 of 10 steps today, 8 with the script; the flush gap is real but idle on current usage.
- **2:** the same steps as 1 on your seats plus a flush that never fires; strictly more code for the same coverage.
- **3:** strongest on memory steps 1–4, 8; **breaks goals 2 and 3** of `PRODUCT.md` §1 (the team and its visibility run through goose's `delegate`).

## Usability — who touches what

| | 1 | 2 | 3 |
|---|---|---|---|
| setup | pick `~/Melody/` as Melody's folder (or one default) | none visible | install OpenClaw, run its Gateway, log it into a model, configure agents |
| legibility | plain markdown you already read daily in this workflow | same files; plus a "saved n lines" row | same files; plus `DREAMS.md` diary |
| control | edit / revert in any editor or the panes | same | same, plus OpenClaw's own settings UI |
| learnability | nothing new | nothing new | a second product's vocabulary (Gateway, channels, session keys) |
| visibility of saving | none in the transcript — you see it in Changes | a transcript row | tool calls in its transcript |

## Reliability — what fails, and how you find out

| failure | 1 | 2 | 3 |
|---|---|---|---|
| she doesn't write something down | **main risk.** Instruction-driven. Detect: a chat in `~/Melody/` with no log commit; a weekly count | same risk, a tool makes it likelier to happen | same; the flush turn catches some |
| confident staleness (practitioners' #1) | mitigated by `[stated/observed/inferred]` + date + "safe to act when" (OpenClaw's rule) + "as of" labels | same | same rules available |
| silent truncation of the boot files | the seat truncates `MEMORY.md` at 200 lines / 25 KB with a warning (Claude Code); Codex AGENTS.md cap 32 KiB silently — keep boot under both | goose's own loader — cap and warning in our code | 20 k / file, 60 k total, truncation "when injected"; a reported bug cut a file from the middle (sweep) |
| a wrong note spreads (poisoning) | git revert; companions can't write to Melody's folder by rule | same | same + dreaming's gates |
| availability | nothing to crash — files | inside goosed | a Gateway daemon must be up; a second process to supervise |
| recovery | `git log` / `git revert` | same | same |

## Performance — tokens, money, time

- **Boot cost.** 1 and 2: target ≤ 8 k tokens (charter ~1 k, soul ~0.5 k, user ≤ 1 k, `MEMORY.md` ≤ 25 KB ≈ 6 k, two log days ~1 k); ceiling ~15 k at OpenClaw's 60 k-char cap. On `opus[1m]` that is ≤ 1.5 % of the window. Stable files first keeps the prompt-cache prefix warm; the log days change once a day. 3: same files plus OpenClaw's own prompt.
- **Per turn.** 1: a journal line is one edit tool call (~200 tokens). 2: same via its tool. 3: same, plus the Gateway hop.
- **Idle.** 1 and 2: $0 — nothing runs. 3: $0 only with heartbeats off; OpenClaw's defaults cost $2–5/day idle for one user (insiderllm, sweep).
- **Tidy-up.** One pass per day on a budget; OpenClaw's promoted snippet is ≤ 160 tokens. 1 can run it on a cheap seat (`worker: low`).
- **Scale over months.** All three keep boot flat because only the index and two days load; old log days sit on disk. The seven-month report held boot at 56.8 k chars after 327 daily notes.

## Supportability — what you own

| | 1 | 2 | 3 |
|---|---|---|---|
| code owned | 0 now; ~100-line script later | ~300 lines extension + ~80 × 2 hook + 2 tests, in the spine | ~200-line provider (a `claude_acp.rs` copy) + Gateway lifecycle |
| upstream merge risk | none | `agent.rs` and `state_machine/` — the two hottest upstream files | provider registration points only |
| testability without a seat | the cap-check script is pure; boot is the seat's | goose tests on a fake provider | needs OpenClaw running |
| portability | any seat that reads `AGENTS.md`/`CLAUDE.md` | any seat goose's loop drives | OpenClaw only |
| external dependency | none | none | a daily-versioned project (`2026.9.5`), 390 k★, moving fast |

## + Constraints (`PRODUCT.md`, `AGENTS.md`)

- `PRODUCT.md` §3.1 "No separate control-plane service" — 3's Gateway is one. ✗
- `PRODUCT.md` §3.1 "no memory system" in V0–V1, §12 memory under Future — 2 and 3 are memory systems; 1 is files the seats already read (arguable, and worth an amendment either way).
- `AGENTS.md` §Agent Loop Migration — 2 pays twice.
- `PRODUCT.md` §3.3 roles and runtimes separate; §3.2 Claude owns the outcome — 3 moves the owner to OpenClaw.

## Scorecard (1 = poor, 5 = strong; for this user, today)

| | F | U | R | P | S | + | total |
|---|---|---|---|---|---|---|---|
| 1 Notebook | 4 | 4 | 3 | 5 | 5 | 4 | **25** |
| 2 goose-built | 3 | 4 | 3 | 5 | 2 | 3 | **20** |
| 3 OpenClaw seat | 3 | 2 | 3 | 3 | 2 | 1 | **14** |

- 1's weak spot is Reliability: it rests on her discipline. The cheapest fix is measurement — count chats in `~/Melody/` with no log commit — not code.
- 2 would win F and R on a direct API model; for this user its loop work never runs.
- 3 is the best memory engine and the worst fit: it rejects goose's per-session MCP servers, so `delegate`, the roles and the Agents pane don't reach it.

## Pick

- **1**, with two additions the analysis earned: `AGENTS.md` opens with an explicit read-first routine (Codex and Cursor don't follow `@imports`), and a weekly "chats without a log line" count as the reliability check.
- Revisit 3 only as a memory *reference* (dreaming's rules), not a runtime, unless its bridge gains per-session MCP servers.
- Revisit 2 only if Melody moves to a direct API model or a headless routine.
