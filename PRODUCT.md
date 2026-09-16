# melody-agent2 — Product

Read this before research or a PRD; a PRD or plan that contradicts it is a finding, not a fix. Rewritten 2026-09-15 from the pasted 37-section PRD (numbering map at the end).

## 1. Promise

> **A modern coding workspace where Claude orchestrates a small software team of subscription-backed coding agents, and the user can see who did what.**

- Fork Goose Desktop; grow it into a Claude-Code-class coding environment: chat with the agent in the middle, Files / Editor / Diff / Terminal / Git beside it, one window — and the same window from the phone, over the tailnet, one pane at a time.
- Runtimes are the coding agents the user already pays for — Claude Code, Codex, Cursor (the door to Grok), Antigravity (agy) — driven through their subscriptions, never API-key-first.
- Claude is the default Orchestrator; the other runtimes are bounded workers with named roles; the RPI walk (research → plan → implement → review) sits between them.
- Goose is the spine, not the product: sessions, permissions, MCP, providers, `delegate`, star topology, handoff memo, persistence. We add the workspace, two providers, one frontmatter field, the role files, and the RPI/agent-activity surfaces. Local-first, lightweight, no control plane.
- Not a multi-agent framework. The differentiator is the combination: Goose's open infrastructure · Claude-first orchestration · four subscription runtimes · RPI · a real workspace · token-efficient specialisation · transparent delegation.

## 2. Users and today

- **Who:** one developer running Claude Code, Codex, Cursor and Gemini on the same repo several times a day.
- **Today:** four terminals, an editor, a diff tool; orchestration — Claude delegating to the others — is invisible, its output landing as text blobs. Stock Goose Desktop has the agents, providers and delegation but no file, diff, terminal or git surface; every check of what an agent did is an alt-tab.
- **Outcome that says it worked:** a task goes prompt → delegated work → reviewed diff → commit without leaving the window, and the developer can say which runtime did each step by looking at the screen.
- The walk itself is `docs/2026-09-15-workspace-prd-v1.md`; this file holds the promise and the rules.

## 3. Principles

### 3.1 Lightweight

- No separate control-plane service in V1. Avoid: Kubernetes, Redis, Kafka, Temporal, Postgres, distributed worker infrastructure, separate orchestration frameworks, a custom vector database, a custom task engine unless required.
- Goose's MCP support, unchanged — no custom gateway; all runtimes see the same project capabilities (filesystem, browser, git, project tools).
- Goose's sqlite, unchanged — sessions, subagent sessions and tasks already exist there; no new tables in V0–V1, no memory system.
- Worker processes start when delegated work starts and exit when it ends; the Claude session outlives them.

### 3.2 Claude owns the outcome

- Understands the request, decides whether to delegate and whether RPI is needed, chooses workers, reconciles results, reviews what matters, produces the final answer. Workers stay bounded and focused.

### 3.3 Roles and runtimes are separate

- A role is the job (Implementer); a runtime is who does it (Codex). Roles are portable across runtimes; the mapping is data in the role file (§6), never prompt text and never a second registry in the UI.

### 3.4 Workers absorb context; Claude absorbs conclusions

- A worker reads many files, searches, runs commands, implements — and returns a compact handoff: findings, decisions, diffs, test results, unresolved issues.
- Claude does not routinely receive worker transcripts, terminal logs, search results or the files a worker read.

### 3.5 Budget follows volume

- The heaviest roles (Implementer, Researcher) sit on the largest subscription or the cheapest model; the $20-class tiers carry low-volume judgment roles and backup seats (§5, §9).

### 3.6 Verification is a command, not a suite

- Every task carries one `confirm:` command with an expected output; that is the check. Test *suites* are a tier a project opts into when its long-term sustainability is the point (§8 Verification tiers); the default, and the expectation right now, is light.

## 4. Modes

- **Orchestrate** (default) — Claude owns the request and chooses when to delegate:

```text
User → Claude ─┬─ agy            research
               ├─ Codex          plan · review
               ├─ Claude Sonnet  implement
               └─ Grok (Cursor)  the backup seat on every role
             → Claude synthesis → User
```

- **Direct** — the user picks a runtime and talks to it; no role is loaded. Same workspace UI. Any Cursor model, Grok included, is a Direct runtime.
- Runtime and Mode are separate header controls; switching runtime mid-session carries a compacted handoff (PRD step 9).

## 5. Runtimes

| Runtime | Subscription (2026-09-15) | Goose provider | Models used | Carries |
|---|---|---|---|---|
| Claude Code | Claude Max, $200/mo | `claude-code` (`claude-acp` kept for Direct sessions) | `claude-opus-5`, `claude-sonnet-5`, `claude-fable-5-1` | orchestration, implementation, planner backup, one advisor seat |
| Codex | ChatGPT Plus, $20/mo | `codex-acp` | `gpt-6-astra`, `gpt-5.6-sol` | planning, review, one advisor seat |
| Cursor Agent | Cursor Pro, $20/mo | `cursor-acp` (new) | `cursor-grok-4.6-{medium,high,xhigh}` | Grok: backup seat on research, review, orchestrator; one advisor seat |
| Antigravity (agy) | Google AI Pro, $200/yr | `agy` (new) | `gemini-3.8-flash-high` | research, implementer backup |

- A runtime **is** a Goose provider: `AcpProvider` spawns the adapter, forwards Goose extensions as MCP servers, renders the agent's own tool calls through the normal path, and maps Goose modes to the adapter's permission modes. There is no separate `AgentRuntime` interface.
- Grok has no subscription of its own here; it is a Cursor model, so `cursor-acp` is the Grok runtime and is required, not optional.
- A Direct session on `claude-acp`, `codex-acp`, `cursor-acp` or `claude-code` runs gated by Goose's modes. Every delegated worker runs `Auto` whatever its runtime (`summon.rs:622,1400,2075,2373`; upstream forwards no child approvals yet) — the Reviewer gates the diff, not the mode. Forwarding child approvals is upstream work, out of V0.
- A runtime whose binary is missing shows "Install" and does not start; not authenticated shows the provider's own sign-in step.

## 6. Roles and the map

- **Six roles:** Orchestrator · Researcher · Planner · Implementer · Reviewer · Advisor. **Four specialists** are Advisor variants (§7.7): Software architect · UX designer · Product manager · Security. Anything else (tester, debugger, docs writer, database architect) is a variant of these, expressed in the delegation's instructions, not a new file.
- **Definitions:** a *role* is a reusable responsibility; a *runtime* is Claude / Codex / Cursor / agy; an *agent* is role + runtime + context + session; a *subagent* is an agent with a parent. Star topology: subagents never delegate (enforced upstream), so ownership, cost and lineage stay legible.

| Role | Primary (weight 9) | Backup (weight 1) |
|---|---|---|
| Orchestrator | Claude Opus 5 · `claude-code` | Grok `cursor-grok-4.6-high` — fail-over only |
| Researcher | agy `gemini-3.8-flash-high` | Grok `cursor-grok-4.6-medium` |
| Planner | Codex `gpt-6-astra` · `codex-acp` | Claude Opus 5 · `claude-code` |
| Implementer | Claude Sonnet 5 · `claude-code` | agy `gemini-3.8-flash-high` |
| Reviewer | Codex `gpt-5.6-sol` · `codex-acp` | Grok `cursor-grok-4.6-high` |
| Advisor + specialists | ⅓ Claude Fable 5.1 · `claude-code` · ⅓ Codex `gpt-5.6-sol` · ⅓ Grok `cursor-grok-4.6-xhigh`, minus the artifact's author | — |

How the roll works — data, not prompt text:

- Each role file carries `runtimes:` — a weighted list of `{provider, model, weight}` (§10).
- `delegate` rolls once per call; an explicit `delegate(provider:)` wins over the file.
- Before the roll the set is trimmed: the `exclude_provider` entry goes; any runtime whose binary is missing goes; a pick that fails to spawn or returns quota-exhausted goes and the rest is re-rolled — the list is also the fail-over order. `weight: 0` means fail-over only.
- `delegate(exclude_provider:)` keeps an Advisor off the runtime that produced the artifact it judges: a Codex plan is judged by Fable or Grok, an agy brief by any of the three. The author never grades its own homework.
- The Orchestrator is the session's provider, not a delegate: its backup is fail-over on adapter failure or quota exhaustion, never a roll — the user is talking to it.

Mental model:

```text
Claude  = orchestrates, implements, judges   (Opus · Sonnet · Fable)
Codex   = plans and reviews                  (Astra · Sol)
agy     = discovers and compresses context; second implementer
Grok    = the second opinion on every seat, through Cursor
```

## 7. Role contracts

Each role: the question it answers, its responsibilities, its authority, the rule that keeps it honest, and the artifact it returns. The artifact shapes are the required return shapes for the role files (§10).

### 7.1 Orchestrator

- **Question:** what are we trying to accomplish, and what should happen next?
- **Does:** understands intent; clarifies scope internally; sizes the task and picks the RPI tier (§8); **for a big or complex project, plans the program itself** — decomposes it into tranches, sequences them, names the gate each must pass and which tranches need research first, and keeps that program plan as its own context; chooses roles and delegates with bounded context (one tranche at a time to the Planner); holds the current objective; reconciles conflicting results; decides when work returns to Research or Plan; accepts or rejects implementation; communicates the result.
- **Retains:** goal, constraints, key architectural facts, research conclusions, current plan, worker results, review findings, task state. **Avoids:** repository crawling, large logs, doing mechanical implementation itself, duplicating worker effort.
- **Authority:** `initiative: owner · can_delegate: yes · can_change_plan: yes · can_accept_work: yes`.
- **Rules:** call `delegate(source: "<role>")` and never pass `provider:` unless overriding the role file; one advisor per gate, with `exclude_provider` set to the artifact's author (§6, §7.7); never roll itself.

### 7.2 Researcher / Scout

- **Question:** what is true about the current system?
- **Does:** searches the repository; identifies relevant files; traces execution paths; inspects existing patterns; reads docs; investigates dependencies; compares libraries or approaches; finds related tests; surfaces constraints, risks, unknowns; summarises for the Planner.
- **Authority:** `initiative: delegated · read: broad · write: normally no · can_delegate: no`.
- **Rule:** may consume large context; the handoff is compact.

```markdown
# Research Brief

## Objective

## Relevant Systems

## Current Behavior

## Key Files

## Existing Patterns

## Constraints

## Dependencies

## Risks

## Unknowns

## Findings
```

### 7.3 Planner / Architect

- **Question:** given what we learned, exactly what should we do?
- **Does:** interprets research; defines the solution and compares alternatives; names architectural boundaries, scope, sequencing; breaks work into implementable tasks with likely files; defines acceptance criteria and, per the project's verification tier (§8), the `confirm:` command each task must pass; names migration concerns; states out-of-scope work; surfaces unresolved decisions.
- **Rule:** does not modify code. Plans one change or one tranche; a plan that spans more than one tranche is a program plan and belongs to the Orchestrator (§7.1). The plan is detailed enough that the Implementer never re-invents the architecture.

```markdown
# Implementation Plan

## Goal

## Proposed Approach

## Architectural Decisions

## Changes

### 1. Work Item
Files:
- ...

Changes:
- ...

## Dependencies

## Migration / Compatibility

## Tests

## Risks

## Acceptance Criteria

## Out of Scope
```

### 7.4 Implementer / Builder

- **Question:** how do I make the agreed change work?
- **Does:** reads the plan and relevant research; makes the specified changes within scope, following project conventions; runs the task's `confirm:` command and the project's standing checks (typecheck, build, lint — test suites only at the full tier); fixes implementation-level issues; reports deviations and blocking architecture problems; returns a concise summary.
- **Rule:** never redesigns silently. When the plan's assumption fails, stop and return `BLOCKED` with the conflict ("the plan assumes X owns initialization; Y does — recommend returning to Planning"); the Orchestrator decides.

```markdown
# Implementation Result

## Changes Made

## Files Changed

## Tests Run

## Validation

## Deviations From Plan

## Remaining Issues

## Suggested Follow-Ups
```

### 7.5 Reviewer / Judge

- **Question:** did we actually solve the right problem correctly?
- **Does:** reviews the diff; validates acceptance criteria; compares implementation against plan; checks requirements coverage, regressions, edge cases; at the light tier *Test Gaps* lists PRD steps or criteria with no `confirm:` exercising them, at the full tier it also covers changed-line coverage; detects scope expansion, architectural inconsistency, over-engineering; decides pass or return.
- **Rule:** never the runtime that wrote the diff (Sonnet or agy implement; Codex or Grok review — independent in every case). Never fixes its own findings: `PASS` → Orchestrator; `FAIL` → Orchestrator routes a planning problem to the Planner, an implementation problem to the Implementer.

```markdown
# Review

## Verdict
PASS / PASS WITH ISSUES / FAIL

## Requirements Coverage

## Plan Adherence

## Correctness Issues

## Architecture Concerns

## Test Gaps

## Recommended Fixes
```

### 7.6 Advisor

- **Question:** is this the right next move, and what would change the call? The Reviewer judges a diff after implementation; the Advisor judges a direction before it.
- **When:** the two RPI gates — Research Brief → direction picked; Implementation Plan → plan approved or adjusted — plus any rewrite, rule change, or irreversible choice. Never for routine implementation.
- **Does:** reads the artifact and the objective it serves; names the option space as trade-offs; recommends one with its reason; surfaces the assumption that, if wrong, flips the call; states what is missing before the next stage.
- **Authority:** `initiative: consulted · read: broad · write: never · can_delegate: no`.
- **Rule:** never edits, never implements; advice the Orchestrator may take or decline. A second Advisor only when the first opinion is split; a third only for irreversible picks. Runtime: one of three, rolled per call, minus the artifact's author (§6).

```markdown
# Advice

## Question

## Recommendation

## Options Considered

## Assumption That Flips The Call

## Missing Before Next Stage
```

### 7.7 Specialists

An Advisor with a field's context and its own gate: same authority, same artifact, same runtime roll; a different first read and a different question.

| Specialist | Reads first | Judges | Called at |
|---|---|---|---|
| Software architect | `ARCHITECTURE.md` | plans against module boundaries and invariants; new dependencies; "does this add an undrawn edge"; could this land upstream as a Ready issue instead of a carried patch; does the packaged app still start | plan gate, when the plan crosses a module, adds a dependency, or touches `crates/*` or packaging |
| UX designer | `DESIGN.md`, PRD §Journey and §States | user-observable behaviour: flows, empty/loading/error states, what the screen tells the user | PRD gate; plan gate for user-facing tasks |
| Product manager | this file, PRD §Problem, §Criteria, §Scope | scope and priority: build it at all, build it now, criteria measurable, scope creep | research → PRD; before planning anything not in a PRD |
| Security | `ARCHITECTURE.md` §Invariants, the plan's touched paths | trust boundaries: what executes agent output and who gates it; secrets in env or args; permission-mode mapping per provider; what the preload bridge exposes | plan gate, when the plan touches `preload`, `ui/sidecar`, provider spawn, permission modes, or anything that runs a worker's output |

- One advisor per gate: the specialist whose field the artifact touches, else the generic Advisor; never three opinions stacked on one artifact.
- Field context lives in the role file's body; a `.agents/skills/<field>/SKILL.md` is added only when that context outgrows a page.

## 8. RPI

```text
User → ORCHESTRATOR
         │
         ▼
      RESEARCHER ── Research Brief ──► (Advisor) ──► PLANNER ── Implementation Plan ──► (Advisor)
                                                                                           │
                                                                          ORCHESTRATOR approves / adjusts
                                                                                           │
                                                                                      IMPLEMENTER ── code + tests
                                                                                           │
                                                                                       REVIEWER
                                                                                  ┌────────┴────────┐
                                                                                PASS               FAIL
                                                                                  │                  │
                                                                            ORCHESTRATOR       ORCHESTRATOR
                                                                                  │            ├─ planning issue → PLANNER
                                                                                User           └─ coding issue → IMPLEMENTER
```

Adaptive — the Orchestrator picks the tier:

| Task | Example | Walk |
|---|---|---|
| Tiny | rename this button | Implement |
| Normal | add sorting to the media browser | Plan → Implement → Review |
| Unknown | make render jobs recover after restart | Research → Plan → Implement → Review |
| Pure research | how does media lineage work today? | Research → Orchestrator |
| Big or complex project | fork Goose into a web workspace | Orchestrator plans the program — tranches, order, gates — with the Advisor (PM or architect) at that gate; then per tranche: Research (if unknown) → Plan → Implement → Review |

Verification tiers — set per project (`testing: light | full` in the project's `PRODUCT.md` or `AGENTS.md`; default **light**), raised per tranche by the Orchestrator when the change warrants it:

| Tier | What every task carries | What is not asked for |
|---|---|---|
| **light** (default) | one `confirm:` that exercises the change once — typecheck / build / lint plus a smoke: a CLI invocation, a Playwright walk of the PRD step (phone width when the surface is user-facing), or one unit test when the change is pure logic (a store, a roll, a parser) | a test per component, coverage targets, snapshot suites, e2e beyond the P0 walk |
| **full** | light, plus unit tests beside changed logic, e2e for every P0 step, coverage on changed lines, and the Reviewer checking them | — |

Full is for a codebase whose long-term sustainability is the point — shipped to other people, depended on by other code, maintained past the people who wrote it. Until a project says that about itself, it is light, and a tranche is raised only when the Orchestrator can name the sustainability reason (a spine patch filed upstream, for one). melody-agent2 is **light**; its spine patches carry one unit test each because they are candidate upstream PRs, not because the tier asks.

Delegate only when one or more conditions are true:

1. Another runtime has a meaningful capability advantage.
2. The task can run independently.
3. Research would consume substantial Orchestrator context.
4. Independent review materially reduces risk.
5. Parallel execution materially saves time.
6. The task is sufficiently large that specialization improves quality.

Avoid unnecessary delegation for trivial work: "rename a button → Research → Plan → Implement → Review" is the failure; "rename a button → implement directly" is the rule. The opposite failure is delegating a whole project to one Planner call: a multi-tranche plan comes back as one unreviewable artifact, so the Orchestrator plans the program and delegates tranches.

## 9. Token and budget strategy

Optimise total useful work per token, not the largest model per step.

```text
HIGH VOLUME / LOWER COST

agy / Gemini Flash      repo exploration · search · docs · summarisation · one implementation in ten
Claude Sonnet           implementation · debugging · testing · multi-file changes
Grok via Cursor         the tenth call on research, review, orchestration · one advisor call in three
Codex Astra / Sol       planning · review · one advisor call in three
Claude Opus / Fable     orchestration · judgment · synthesis · one advisor call in three
```

- Claude receives summaries, never transcripts: 60k tokens of Codex or Sonnet activity → a 2k-token Implementation Result.
- Every subscription meters in rolling windows; when one closes mid-task, the role's `runtimes:` list is the fail-over order (§6), so the task moves instead of stalling on the user.

## 10. Agent definitions

Roles are Goose custom agents, read from the project's `.agents/agents/` (Goose also reads `.goose/agents`, `.claude/agents`, and the home-directory variants):

```text
.agents/agents/
├── orchestrator.md
├── researcher.md
├── planner.md
├── implementer.md
├── reviewer.md
├── advisor.md
├── advisor-architect.md
├── advisor-ux.md
├── advisor-pm.md
└── advisor-security.md
```

```yaml
---
name: implementer
description: Executes approved implementation plans
runtimes:
  - { provider: claude-code, model: claude-sonnet-5,      weight: 9 }
  - { provider: agy,        model: gemini-3.8-flash-high, weight: 1 }
---

You are the Implementer. Execute the approved plan. Do not redesign
architecture silently; if the plan contains a blocking assumption, stop
and return BLOCKED with the conflict. Return: changes made, files
changed, tests run, deviations, remaining issues.
```

- `runtimes:` is the only per-project runtime configuration; the UI and the orchestrator prompt never encode role → runtime.
- Until the `runtimes:` field lands in the spine, stock Goose reads `model` only and the Orchestrator passes `provider:` explicitly.

## 11. Workspace

Goose Desktop is the base; it becomes a coding workspace. The walk, states and criteria are the PRD's; this is the vision.

```text
┌──────────────────────────────────────────────────────────────┐
│ Project: Candy                          Runtime ▾   Mode ▾   │
├──────────────┬───────────────────────────────┬───────────────┤
│ Sessions     │            CHAT               │   SIDE PANEL  │
│  Claude      │ You: Fix the media browser    │ Files         │
│  Codex       │ Claude: I'll inspect this…    │ Git           │
│  Cursor      │  ✓ agy research complete      │ Terminal      │
│  agy         │  ● Sonnet implementing        │ Diff          │
│ Agents       │                               │ Browser       │
│ Tasks        │                               │ Markdown      │
│              │                               │ Plan · Tasks  │
├──────────────┴───────────────────────────────┴───────────────┤
│ Ask…                                                ⌘ Enter │
└──────────────────────────────────────────────────────────────┘
```

- **Panes:** chat · file · diff · terminal · git · browser · markdown · plan · tasks · agents. Any side-panel tool can be promoted beside the chat; the centre is chat plus one pane, resizable; a replaced pane returns to the side panel with its state.
- **Two shells, one renderer:** the Electron desktop, and the same renderer served to the phone by a sidecar on the Mac over Tailscale (installable as a PWA). On a phone the workspace shows one pane at a time behind a tab rail; the terminal gets a key bar (Esc · Tab · Ctrl · arrows · paste) above the keyboard and a server-side session that survives the tab being backgrounded. The browser pane is the project's own dev server in an iframe; arbitrary sites wait for a native shell.
- **Must:** chat, streaming output, tool-call rendering, Files, editor, Diff, Git, Terminal, runtime selector, session history, subagent visibility, task status, RPI phase visibility.
- **Should:** Browser, Markdown, Plan pane, Task pane, flexible panes, agent transcript drill-down, accept/reject changes, worktree support, review results view.
- **Could:** visual delegation graph, persistent named agents, scheduled agents, mobile client, cloud execution, multi-machine workers.
- **Agent activity:** each delegated worker is a row — runtime · role · task · status (waiting / running / done / failed) — under the orchestrator, appearing when the `delegate` call starts; click → the worker's isolated transcript. Rows are a view over Goose's `tasks_update` notifications, and name the runtime the roll picked.
  - amended 2026-09-16 (task 27's pick, `docs/2026-09-16-agent-activity-research-v1.md` §Options → pick): `tasks_update` has no producer, so rows are not a view over it — the session bridge publishes per-session (`delegate_started` from summon, the child's tool activity, one terminal event with the outcome) and the ACP server forwards it as a `DelegationUpdate` on `_goose/unstable/session/update`; the tree is keyed by the child's `subagent_session_id` and rebuilt from a children read on load or reconnect; `waiting` has no producer yet (the row starts at `running`).
- **RPI strip:** Research · Plan · Implement · Review light up as a worker with that role starts; a phase with an artifact (Brief, Plan, Result, Review) is clickable; a re-run phase shows a counter.

## 12. Scope by tier

Tiers are what the user sees; the plan's tranches (`docs/2026-09-15-goose-fork-plan-v1.md`) are build order — roles land in tranche 3, before any pane, because the thesis is testable from the CLI.

- **V0** — the fork; `claude-acp` default; `codex-acp`, `cursor-acp`, `agy` providers; `runtimes:` in the spine; the ten role files and the runtime matrix; the sidecar; chat, Files, editor, markdown preview, Terminal, Diff, Git, browser (project dev server); session and runtime selectors; the web build reachable from the phone with the one-pane layout. Basic delegation, no orchestration UI.
- **V0.5** — Browser, Markdown, flexible pane layout, RPI strip, agent-activity tree, Direct vs Orchestrate in the header, research/plan artifact pane; amended 2026-09-16 (parity plan decision 3): local scheduling — routines saved from a session, a Runs inbox on the Schedules route, runs in their own worktree — moves here from Future; cloud and remote runs do not.
- **V1** — the six roles and four specialists exercised end-to-end in the UI: RPI-aware delegation, review loops, task status, worker transcript navigation, summary handoffs, plan acceptance/revision UX.
- **Future** (only after the lightweight product proves useful) — persistent named agents, agent memory, authority policies, scheduling (amended 2026-09-16: the local case moved up a tier, see above; only cloud and multi-machine scheduling stay here), iOS/Android clients, remote workers, cloud execution, multi-machine scheduling, durable background workflows.
- **Landed** (amended 2026-09-16, parity plan tasks 47–54, 59, 61, 62) — worktree-per-task (Worktree chip, `<toplevel>/.worktrees/<slug>` on `wt/<slug>`, Merge and Remove in Changes; delegated children run in their own cwd); per-hunk review in Changes (Stage · Reject · Undo per chunk, Unstaged · Staged scope); scheduled runs record done / failed / killed and land in the Runs inbox (Open · Accept · Dismiss), each in its own worktree when the recipe says so (`settings.worktree`); Save as routine; the sidecar's per-launch key, fixed port and the Phone card with the keyed URL.

## 13. Success criteria

- **Experience:** work directly with any runtime; Claude orchestrates the others without exposing complexity; RPI progress is understandable at a glance; worker output is inspectable without overwhelming the conversation; chat, code, terminal, diff and git are one window.
- **Efficiency:** Claude avoids high-context repository exploration; research routes to Flash-class workers; implementation routes to strong coders on the largest budget; worker transcripts are summarised before returning; simple tasks skip orchestration.
- **Reliability:** a worker failure never destroys the parent Claude session; delegated tasks have visible status; each phase produces a handoff artifact; review failures route to the right phase; a closed quota window fails over instead of stalling.

## 14. Ownership

- **This file owns:** promise, users, principles, modes, runtimes and roles and the map between them, role contracts and artifacts, the RPI walk and delegation rules, budget strategy, workspace vision, scope tiers, success criteria.
- **`ARCHITECTURE.md` owns:** modules, dependency direction, invariants, folder map, data flow.
- **`DESIGN.md` owns (from tranche 4):** frame, vocabulary, shared component states, token roles — the delta over Goose's design system.
- **Feature PRDs (`docs/*-prd-*.md`) own:** one journey's observable behavior, its states and criteria.
- **The plan (`docs/*-plan-*.md`) owns:** approach, tranches, negative space.
- **`tasks.md` owns:** the open work.

---

Numbering before 2026-09-15 → now: §1, §36 → 1 · §2 → 2 · §3, §29, §30 → 3 · §4 → 4 · §5, §6, §28 → 5 · §8, §17, §20, §21 → 6 · §9–14 → 7.1–7.6 · §14.1 → 7.7 · §15, §16, §19 → 8 · §18 → 9 · §22 → 10 · §23–27 → 11 · §31–34 → 12 · §35 → 13 · §37 dropped (`ARCHITECTURE.md` owns it).
