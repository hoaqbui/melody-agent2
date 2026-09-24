# Persistent agent memory — research v1

Dated 2026-09-22. User: "allow the agents to keep persistent context and manage it themselves. eg their own markdown repo. melody will be the main one. we'll give her 3 friends … does this present a compaction problem?" → "research how do others approach this? do deep research". Research only: nothing in `tasks.md` changes until the user picks. Neighbours: `docs/mockups/2026-09-22-melody-visual-design.html` (where Melody lives in the layout); memory `melody-main-agent-direction` (one Melody, delegates to sessions).

> **Correction 2026-09-23.** The claim below that `claude-acp` gets goose's compaction is wrong. Every ACP seat returns `manages_own_context() == true` (`crates/goose/src/acp/provider.rs:966`) — `claude-acp`, `codex-acp` and `cursor-acp` all — as do `claude-code`, `agy` and `gemini_cli`. goose's compaction runs on none of the seats in use. The sessions DB agrees: 316 sessions from 2026-09-16 to 2026-09-23, **0 compactions**, 0 sessions active on more than one day, and the 147 real user sessions have at most 16 messages (`~/.local/share/goose/sessions/sessions.db`, read-only query). The `claude-acp` adapter loads `CLAUDE.md` and settings from user, project and local (`claude-agent-acp/dist/acp-agent.js:4040` `settingSources`), so seat-native memory reaches the seat the user runs. The summary-of-summary defect is real in goose's code and has no impact on this user.


Method: five parallel web sweeps (memory frameworks, file-based coding agents, multi-agent hub design, papers, month-scale practitioner reports) + the goose tree. Claims marked **(sweep)** were read by a sweep agent, not re-read by hand this session; the six load-bearing sources were re-fetched by hand and are unmarked. All URLs read 2026-09-22.

## Verdict

- **Yes, there's a compaction problem, and goose has it today: it summarises its own summaries.** `do_compact` feeds only the agent-visible messages into the summariser (`crates/goose/src/context_mgmt/mod.rs:340-346`); after the first compaction the originals are agent-invisible and the summary is agent-visible (`mod.rs:137-143`), so the second pass summarises the first summary plus what came after. Every benchmark that tested this shape found it loses exactly the details later questions need (§Papers). This is Melody's exposure on `claude-acp` (the active provider, `~/.config/goose/config.yaml:130`; the Direct-session runtime, `PRODUCT.md:71`), which does not override `manages_own_context` and so gets goose's compaction. On `claude-code` (the Orchestrator/Implementer runtime, `PRODUCT.md:88-91`) goose's compaction never runs (`mod.rs:230`, `providers/claude_code.rs:692`): the CLI's own compaction applies, with its `PreCompact` hook and `MEMORY.md` re-injection (sweep), and the goose loop change is moot for her there.
- **The bigger problem isn't compaction, it's confident staleness.** Everyone who ran markdown memory for months kept it and none abandoned it; every one of them stopped letting the agent promote its own writes, because the failure they hit was true-when-written facts cited weeks later at full confidence (§Practitioners).
- **"3 persistent companions" needs a split.** Every production harness checked gives specialists persistent *memory* and fresh *context* per job (Claude Agent SDK, LangChain subagents, OpenClaw spawn, Anthropic's research system; Magentic-One resets specialists on every re-plan). Only vendors argue for persistent transcripts (§Multi-agent).
- **Melody rewriting her companions' instructions is the unsolved part.** No primary source shows an in-loop manager doing it safely. The systems that do it (GEPA, ADAS, TPGO, Meta-Harness) all run a held-out eval, and two papers name the collapse without one (§Self-improvement).

## The trail of reframes (the finding)

1. "compaction" → **summary-of-summary**. The lossy step is re-summarising a summary, not summarising once. Fix: raw episodes stay immutable; every summary reads originals and discards the previous summary (CliffCompaction: "We never compact a compaction").
2. "persistent agents" → **persistent memory + fresh context**. The transcript is the episode; the repo is the agent. A companion is its charter + its notes, not its conversation.
3. "the repo will bloat" → **the repo will go stale with confidence**. Bloat is cheap to cap (200 lines / 25 KB with a warning); staleness needs provenance tags, timestamps, and corrections that overwrite.
4. "Melody specialises them by editing their charter" → **delta edits, gated**. A rewrite pass drops detail ("the model dropping detail as it rewrites", filesystem paper); an ungated optimiser collapsed 30% → 14.55% in four iterations (TPGO, sweep).
5. The first answer's "transcript is throwaway" → **wrong**. The raw log is the ground truth notes are derived from; goose already keeps it (originals stay user-visible after compaction, `mod.rs:137-143`; SQLite via `session_manager.rs:456`).

## Axes (Melody's pick marked ►)

| axis | ends | who sits where |
|---|---|---|
| who writes memory | agent in-session ↔ background consolidator ↔ human only | Claude Code, OpenClaw, Gemini CLI, Letta MemFS: agent · Codex: background only, agent forbidden · Aider: human · ► agent writes the journal; a consolidation pass promotes; the user approves charters |
| always loaded vs retrieved | everything (Cline, 6 files) ↔ pinned slice + retrieval ↔ nothing pinned (Mem0, Zep) | ► pinned index ≤ 25 KB + `charter.md`; the rest by path |
| growth control | hard cap that warns ↔ hard cap that truncates silently ↔ scheduled consolidation ↔ none | Claude Code warns · Codex/opencode truncate silently · OpenClaw dreams nightly · ► warn + consolidate |
| compaction stance | summarise (Claude, Gemini, goose) ↔ flush-to-disk first (OpenClaw) ↔ refuse and hand off (Amp, Cline) | ► flush first, then summarise from originals |
| what crosses the subagent boundary | full transcript (OpenAI handoffs, Cognition) ↔ final message (Claude SDK, LangChain, goose) ↔ structured report + pointer to a file (Anthropic research appendix, Manus) | ► report + pointer |
| shared vs private memory | shared by default (CrewAI, OpenAI sessions) ↔ private by default (Claude agent memory, LangGraph namespaces) | ► private repos; Melody reads companions' repos by path |
| retrieval | grep/BM25 ↔ embeddings ↔ graph | ► grep. "BM25 ≈ embeddings at 1/100th cost" on 19k real sessions (HN, sweep); Karpathy's 100-article wiki runs on an index file (sweep) |

## The convergent design (what survived months)

Every source that ran this for a month or more lands on the same shape. Letta, the structured-memory vendor, converged on it too (Context Repositories, 2026-02-12).

- **A pointer-only index, hard-capped, that warns.** Claude Code: first 200 lines / 25 KB of `MEMORY.md`, nag near the cap, error over it (sweep, docs). practicalsystems.io after 7 months and 327 daily notes: index 9,795 chars, boot context capped at 56.8k chars. The failure when the cap is silent: `MEMORY.md` at 34.3 KB truncated at ~24.4 KB, chronological, so *the newest rules were the part cut* (claude-code #57574, sweep).
- **A daily journal as the free write buffer; promotion gated.** OpenClaw: dailies are the raw log, `MEMORY.md` is "a curated summary, not raw logs" (sweep). practicalsystems: a lesson becomes a rule after "three independent signals across at least two different sessions". OpenClaw's nightly dream: 740 candidates → 1 promoted (sweep, unmeasured benefit).
- **Provenance and time on every line.** `[stated] / [observed] / [inferred]` tags; corrections overwrite rather than add a contradicting neighbour; volatile facts expire into hypotheses (Imoto, sweep). Codex ships "Memory is not proof of current behavior" in its read-path prompt.
- **Immutable raw, derived notes that cite it.** Letta: every edit a git commit, `system/` pinned, the file tree in the prompt, a background sleep-time process writes notes, a defrag skill targets 15–25 files. Karpathy's wiki: `raw/` immutable, `index.md` one line per page, append-only `log.md`, a lint for contradictions (sweep).
- **Flush before compaction.** OpenClaw "automatically reminds the agent to save important notes to memory files" before compacting; its maintainer calls this the single change that mattered most, with a ~40k-token reserve (sweep). Compaction keeps recent messages intact and the full history on disk.
- **Things the agent may not edit.** practicalsystems: identity layer and boot files. Reitz's vault: "Claude proposes, you dispose" (sweep). Codex: generated memory files are off-limits; the agent appends notes, consolidation applies them.
- **Git is both undo and hazard.** Praised as the audit trail everywhere; one HN report of agents digging deprecated designs out of history and reimplementing them (sweep).
- **An always-on agent's cost is the heartbeat, not the memory.** OpenClaw idle cost $2–5/day, heartbeats 2–3M tokens/day, and after 3 months 111 KB (~28k tokens) of session history shipped on every request; moving heartbeats to a local model took idle to $0 (insiderllm, sweep). practicalsystems: a memory plugin that inherited an API key made 16,561 compression calls, $227.72 in eight days. Compaction invalidates the prompt cache, so the next call pays a full re-cache (velvetshark, sweep). For one persistent Melody: idle turns must not carry the repo, and nothing consolidates on a paid model without a budget.

## Papers — what the numbers say

- **Summary-of-summary loses what questions need.** LoCoMo: RAG over session summaries 32.5 despite high recall, "loss of information during the conversion of dialogs to summaries" (sweep). CliffCompaction (2026-09-22): only truncate or drop, never rephrase; discard prior compactions. Context Compaction Theory (2026-08-02): Anthropic's compaction endpoint on 15k-item membership "close to a random guess"; a sequence of compactions is left "as an open problem"; cites Codex's own warning that multiple compactions reduce accuracy.
- **More context is worse past a point.** A 300-token slice beats the 113k full input (Context Rot, sweep); full memory 0.647 → 0.489 from 10k to 100k tokens (MemBench, sweep); case retrieval peaks at K=4 (Memento, sweep).
- **Curated stores are not reliably better.** Filesystem-Based Memory for LLM Agents (2026-07-29): agent-curated ties foldered on LoCoMo (86.1) and is the weakest store on PersonaMem-32k (37.5 vs verbatim 78.1). "Reading, not writing, is where backbone strength pays"; reorganisation "erodes for all but the strongest management agent … dropping detail as it rewrites".
- **Agents don't infer a schema.** They succeed when told which structure to use and fail to pick one unprompted (2602.11243, sweep). The repo layout must be prescribed.
- **What does work:** reflection that cites its evidence records (Generative Agents, sweep); distilled lessons including failures (ReasoningBank +3–5 pts where trajectory memory gains ~1, sweep); one self-curated cheatsheet on verifiable tasks (Dynamic Cheatsheet, sweep); beliefs carrying a confidence that evidence can lower (Hindsight, sweep).
- **Self-written memory is an attack surface.** MINJA: query-only attacker gets the agent to write its own poison, ASR 57–99% (sweep); AgentPoison >80% ASR at <0.1% poison rate (sweep); "agents designed to write and retrieve memory more aggressively are more exploitable" (2606.04329, sweep). The lever is write aggressiveness, not file vs DB.

## Multi-agent — the hub problem

- Anthropic's lead agent holds the plan, never traces; subagents return findings (~1–2k tokens), write big outputs to files and pass references "to avoid the game of telephone" (sweep). Manus: the file system is the unbounded context; compression must be restorable (drop the page body, keep the URL) (sweep).
- Magentic-One's orchestrator keeps a Task Ledger and a Progress Ledger and forces agents to clear context on every re-plan (sweep). Cognition's counter-argument, "share full traces, single-threaded", is the strongest case against a manager at all (sweep) — and it's about *decisions* crossing the boundary, which a structured report can carry.
- Persistent specialist teams at month scale are **unreported**. The only month-scale first-hand data is two persistent generalists (practicalsystems). People who run for months run one generalist and spawn stateless workers (sweep).

## Self-improvement — Melody editing her companions

- Shipped: Claude Code watches `.claude/agents/*.md` and picks up an edited definition in seconds; the docs tell you to ask Claude to write the file (sweep). LangGraph's procedural-memory example has an agent revise its own prompt from feedback (sweep). Neither has an eval in the loop.
- Researched: GEPA reflects on trajectories to propose prompt edits against a Pareto frontier; ADAS keeps an archive of prior agents; Meta-Harness rewrites the harness from an archive with held-out models and leakage audits (all sweep). ACE names "brevity bias and context collapse from iterative rewriting" and uses delta updates (sweep). TPGO without experience memory: 30% → 14.55% by iteration 4 (sweep).
- Implication: charter edits are deltas with a reason, land as a git diff, and something checks them. Cheapest check today: the user. Later: a small fixed probe per companion (three known tasks) run before the diff lands.

## goose today (`file:line`)

| has | where |
|---|---|
| a structured compaction summary, ordered most-important-first, cut from the tail | `crates/goose-context-management/src/structured.rs:14` |
| originals kept after compaction (user-visible, agent-invisible); sessions in SQLite | `crates/goose/src/context_mgmt/mod.rs:137-143`, `crates/goose/src/session/session_manager.rs:456` |
| a memory extension with global + per-project markdown categories | `crates/goose-mcp/src/memory/mod.rs:118` |
| subagents that start fresh and return text | `crates/goose/src/agents/subagent_handler.rs:93` |

| lacks | where |
|---|---|
| summarising from originals: the second compaction reads the first summary | `mod.rs:340-346` |
| a pre-compaction flush turn: the threshold check goes straight to compaction | `mod.rs:224` |
| any compaction at all on CLI-wrapped providers — `claude_code`, `agy`, `gemini_cli` manage their own context, so the hook would never fire there | `mod.rs:230`; `providers/claude_code.rs:692`, `agy.rs:225`, `gemini_cli.rs:201` |
| an index: the memory extension loads every global memory into the instructions at startup | `memory/mod.rs:143-170` |
| a structured subagent report (final text or the whole stream, nothing between) | `subagent_handler.rs:93-148` |
| both loops: any of the above must land in `agent.rs` and `state_machine/` (AGENTS.md §Agent Loop Migration) | — |

Which provider Melody runs on decides where the flush lives: on `claude-acp` (today's active provider) or any API provider it's goose's `compact_messages`, and the "both loops" row applies; on `claude-code`, `agy` or `gemini_cli` it's the CLI's own compaction (Claude Code re-injects `MEMORY.md` and CLAUDE.md after compaction and offers a `PreCompact` hook, sweep), and the repo layout is the only part goose owns. Note `claude-acp` and `claude-code` differ here: `providers/claude_acp.rs` does not override `manages_own_context`, `claude_code.rs:692` does.

## Options

- **A. goose as-is + a memory extension the agent writes to.** No loop change. Keeps summary-of-summary and the load-everything index. Not recommended.
- **B. Repo per agent, index-first, flush-before-compact, gated promotion** (recommended):
  ```
  agents/<name>/
    charter.md      who I am, what I own — Melody proposes deltas, the user approves; the agent never edits
    INDEX.md        one line per note, hard cap, the loader warns at 80 % and errors over
    journal/        YYYY-MM-DD.md — the free write buffer, append-only, never rewritten
    notes/<topic>.md  derived; each line dated and tagged [stated]/[observed]/[inferred] and citing the journal entry
    .git            every write a commit
  ```
  - loaded every turn: `charter.md` + `INDEX.md` (+ today's and yesterday's journal, the OpenClaw pattern); everything else by path, grep for search
  - before compaction: one agent turn "write what must survive to the journal", then summarise **from the originals**, discarding the prior summary
  - promotion journal → notes: a consolidation pass (idle or nightly) with a recurrence gate; corrections overwrite; nothing is promoted to `charter.md` by an agent
  - a companion = its repo; each job runs in fresh context that boots from it and ends with a structured report `{outcome, decisions, files, pointer}` back to Melody, not a transcript
  - Melody's own repo holds a ledger of sessions and companions (Magentic-One's two ledgers), never their traces
- **C. B + semantic retrieval.** Deferred: grep matched embeddings at 1/100th the cost on real sessions, and Letta ships no index by default.

## Decisions for the user (only the ones the research changed)

1. **Companions: persistent memory + fresh context per job**, or a long-running conversation each? The evidence is one-sided; the first answer and the ask both assumed the second.
2. **Charter edits: Melody proposes as a git diff, the user approves** (matches the global rule that rule changes get review), or auto with a probe? Nothing shipped does auto safely.
3. **Where the repos live**: `~/Library/Application Support/Melody/agents/` (next to the profile) or a repo you browse and can push. practicalsystems and Reitz both keep it browsable.

## Sources re-read by hand this session

- Letta, Context Repositories — https://www.letta.com/blog/context-repositories/ (2026-02-12)
- Filesystem-Based Memory for LLM Agents — https://arxiv.org/html/2607.26637 (2026-07-29)
- CliffCompaction — https://arxiv.org/abs/2609.26779 (2026-09-22)
- Context Compaction Theory — https://arxiv.org/html/2608.01326v1 (2026-08-02)
- OpenClaw compaction — https://docs.openclaw.ai/concepts/compaction
- Codex memories read path — https://raw.githubusercontent.com/openai/codex/main/codex-rs/ext/memories/templates/memories/read_path_v2.md
- Seven Months of AI Agent Memory — https://www.practicalsystems.io/blog/seven-months-of-ai-agent-memory-what-rotted-what-survived (2026-09-06)

Sweep-reported sources (not re-read): Claude Code memory/context docs; OpenClaw memory, dreaming, agent-workspace; Codex config + issues #13386 #30299; Gemini CLI compression; Amp "handoff" (2025-10-23); opencode #18037; Anthropic multi-agent research system and context-engineering posts; Manus context-engineering post; Cognition "Don't build multi-agents"; Magentic-One 2411.04468; Claude Agent SDK subagents; LangGraph memory; CrewAI memory; MemGPT 2310.08560; Generative Agents 2304.03442; A-MEM 2502.12110; Mem0 2504.19413; LoCoMo 2402.17753; LongMemEval 2410.10813; MemBench 2506.21605; MemoryAgentBench 2507.05257; Context Rot (Chroma); Hindsight 2512.12818; ReasoningBank 2509.25140; Dynamic Cheatsheet 2504.07952; Memento 2508.16153; 2602.11243; MINJA 2503.03704; AgentPoison 2407.12784; 2606.04329; GEPA 2507.19457; ADAS 2408.08435; ACE 2510.04618; TPGO 2604.20714; Meta-Harness 2603.28052; claude-code issues #57574 #34776; dev.to Imoto (2026-06-22), Kumawat (2026-07-14), mrclaw207 (2026-06-19); velvetshark OpenClaw memory masterclass (2026-03-05); insiderllm token guide; Reitz Obsidian essay (2026-03-06); Karpathy LLM wiki gist (2026-04-04); HN 49508317, 47486287, 47899844, 49581240.
