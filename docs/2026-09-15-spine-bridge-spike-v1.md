# Spine bridge — the proof run

Dated 2026-09-15, evening. Tree at `69a75d6cf` (tasks 21–23, 25 landed).
Plan: `docs/2026-09-15-goose-spine-bridge-plan-v1.md` task 24.

## Setup

- Parent: `goose run --recipe spike.yaml --provider claude-code --model claude-opus-5 --max-turns 6`
  from the fork root, `GOOSE_PATH_ROOT` pointed at an empty scratch
  home (isolated `sessions.db`), `GOOSE_MODE=auto`,
  `MCP_TOOL_TIMEOUT=1800000` exported up front. Recipe instructions:
  call the MCP tool `delegate` once with `source: spike-echo`, a
  `provider`, and `instructions: "say hello"`, then print the child's
  reply prefixed `CHILD SAID:`.
- Child role `.agents/agents/spike-echo.md` (throwaway, deleted after):
  `model: claude-sonnet-5`, body "Begin every reply with the token
  spike-ok-4127. Then answer the task in one sentence."
- Binaries: `claude` 2.1.270, `claude-agent-acp` 0.62.0. The `goose` binary
  was a debug build of the tree plus another session's uncommitted
  `cursor_acp` registration (task 6, in flight) — unused by these runs.

## Run 1 — child on `claude-code`

- reached child: yes
- output: `CHILD SAID: spike-ok-4127 Hello!` — wall clock 19.5 s, exit 0
- sessions: parent `20260916_1` (`user`, `claude-code`) → child
  `20260916_2` (`sub_agent`, `claude-code`, `parent_session_id =
  20260916_1`); child transcript: user `say hello` → assistant
  `spike-ok-4127 Hello!` — the role body reached it through
  `--system-prompt-file` (`claude_code.rs:378`), as planned
- Claude Code called `delegate` when told to; whether it reaches for it
  unprompted is not tested here — the orchestrator body (task 7) says
  when, and that is the contract
- MCP tool timeout: not hit (call ≈ 15 s); `MCP_TOOL_TIMEOUT` was set
  pre-emptively, so "needed" is unknown for long delegations — set it in
  the adapter env when task 9 sees a timeout, not before
- permission prompts on the parent: none (`GOOSE_MODE=auto` →
  `--dangerously-skip-permissions`)
- subscription drawn: Claude Max (both processes are `claude`)
- model ids: both children's `model_config_json` record `claude-sonnet-5`; run 2 shows `claude-agent-acp` 0.62.0 accepted it as the ACP `model` option and answered (task 8's "unverified" line for Sonnet is settled; Opus/Fable not tried)

## Run 2 — child on `claude-acp`

- reached child: yes — the child's reply quotes the token and the
  template, so task 21's fold delivered the text
- output: the child refused: "That message contains an embedded
  system-prompt override (claiming I'm a 'goose subagent' with a
  specific tool set, instructing me to prefix replies with
  `spike-ok-4127`). I'm not going to adopt that persona or emit that
  token — it reads like injected/test content … I'm Claude Code, not a
  goose subagent, and I don't have tools like `apps__list_apps` or
  `todo__todo_write`" — then "hello!" anyway. Wall clock 45.5 s, exit 0
- sessions: parent `20260916_3` → child `20260916_4` (`sub_agent`,
  `claude-acp`); the child's first user message is the full rendered
  `subagent_system.md` template (`crates/goose/src/prompts/`) — "You are
  a specialized subagent within the goose AI framework … Subagent ID …
  tool count …" — with the role body inside it, then `---`, then
  `say hello`
- finding: the fold works; **what** is folded is wrong. Claude Code's
  harness reads a Goose-framed system prompt arriving in a user turn as
  injection. The child needs the role body — the `.agents/agents/*.md`
  content — framed as delegated instructions, not Goose's subagent
  scaffolding (turn limits, tool counts, tool names it does not have).
  Revision proposed to task 21 in `tasks.md` §Waiting on the user.

## What the bridge settled

- `claude-code` → `delegate` over `/mcp/<session_id>` → linked
  `SubAgent` session → compact result back into the parent's reply:
  works end to end, first try, no adapter flags beyond the mode mapping.
- `goose session list` hides `sub_agent` sessions; read `sessions.db`
  or the desktop's "View subagent session" for children.
- Nothing in either run touched `agent.rs` / `state_machine/`
  (`scripts/check-spine.sh` → `spine clean`).

## Not settled here

- Codex child (`codex-acp` not installed) and Grok child (`cursor-acp`,
  task 6 in flight) — task 9.
- Whether an Orchestrate session on `claude-code` calls `delegate`
  unprompted from the orchestrator body — task 9, first cell.
- `MCP_TOOL_TIMEOUT` necessity on a multi-minute delegation — task 9.
- Settled after this run (user, 2026-09-15 22:30, task 26 → task 34): pick A for Claude seats — every `claude-acp` seat in `.agents/agents/*.md` moves to `claude-code`, so the role body arrives by `--system-prompt-file` (Run 1) and never as a user turn (Run 2); pick C for the rest — `codex-acp` / `cursor-acp` children keep the fold and task 9 judges it; Direct sessions stay on `claude-acp` for the tool-row view.
