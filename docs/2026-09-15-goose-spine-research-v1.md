# Goose spine — architecture evaluation

- Dated 2026-09-15; inspected `d7b221eee`.
- Question: “evaluate if the architecture well leverages goose as its spine”.
- Method: source inspection, not an executed runtime matrix; no build or tests run.

## The surprise

- The architecture selects useful Goose infrastructure, but assumes ACP runtimes inherit Goose's orchestration tools and instructions. The inspected code does not provide that path: `AcpProvider::stream` ignores `_system` and `_tools` (`crates/goose/src/acp/provider.rs:820`), and MCP configuration conversion only forwards Stdio and StreamableHttp extensions, skipping platform extensions (`:1843`). Adding weighted selection to Summon cannot by itself make Claude ACP call Summon.

## Reframe trail

- “Does the fork duplicate Goose?” > mostly sensible reuse of sessions, UI and providers > “Can the subscription orchestrator actually reach the reused delegation machinery?”
- “Are role files sufficient?” > role bodies enter the Goose system prompt, which ACP ignores > “Which instructions and capabilities cross each runtime boundary?”
- “Are activity and fail-over just UI?” > task events and automatic retry policy are not established contracts > “Which behavior needs a Goose extension before a view can render it?”

## Inventory — read this session

- **Good reuse: provider switching.** Existing desktop `changeModel` uses `acpSetSessionProviderModel`, then patches session state (`ui/desktop/src/components/ModelAndProviderContext.tsx:92`). Server recreates the provider on the existing session (`crates/goose/src/acp/server.rs:2555`). Reuse this for the runtime selector.
- **Good reuse: context transfer.** ACP builds a bounded memo for the first prompt (`crates/goose/src/acp/provider.rs:635`, `:846`; `crates/goose/src/acp/handoff.rs:54`). This is a transfer primitive, not automatic fail-over.
- **Good reuse: delegation records.** Summon creates a `SubAgent` session and links its parent (`crates/goose/src/agents/platform_extensions/summon.rs:609`); returns last-only output and the child session ID (`:1412`, `:1433`). Keep this identity and transcript path.
- **Critical: orchestration capability gap.** ACP ignores Goose tools and system instructions (`crates/goose/src/acp/provider.rs:820`); platform MCP extensions are skipped (`:1843`). No session-bound export of Summon's tools was found in the inspected path. A native runtime's own delegation would not automatically create Goose's child-session lineage.
- **Critical: role instruction gap.** Agent source content becomes recipe instructions (`crates/goose/src/agents/platform_extensions/summon.rs:1633`), then an overridden system prompt (`crates/goose/src/agents/subagent_handler.rs:134`, `:166`); the separate user message carries the task (`:170`). ACP sends the latest user content and optional history memo (`crates/goose/src/acp/provider.rs:1913`), not that system prompt. The adapter might independently discover local files, but that is not the claimed Goose role contract.
- **Activity contract gap.** `tasks_update` is defined with no production constructor call found by `rg -n 'tasks_update\(' crates`; `TaskInfo` has no explicit selected-provider/model fields (`crates/goose/src/agents/subagent_execution_tool/notification_events.rs:28`, `:57`). Actual subagent tool notifications exist (`crates/goose/src/agents/subagent_handler.rs:208`, `:291`). Start from delegate tool metadata and child sessions; explicitly design any missing lifecycle/runtime fields.
- **Persistence distinction.** Child sessions persist, but Summon's running/completed task registries are in-memory maps; Drop cancels running tasks (`crates/goose/src/agents/platform_extensions/summon.rs:576`). SQLite transcript persistence does not imply durable worker execution. Durable workflows are already outside product scope; retain that boundary.
- **Permission distinction.** Summon forces Auto because child approval forwarding is incomplete (`crates/goose/src/agents/platform_extensions/summon.rs:1394`). Claude ACP maps modes (`crates/goose/src/providers/claude_acp.rs:71`), but a top-level mode mapping does not establish inherited child permissions. Goose hides/rejects its own nested delegate calls (`summon.rs:1369`, `:2163`); this does not disable a vendor runtime's native subagent tools.
- **agy is a capability exception.** Gemini CLI ignores extensions and tools (`crates/goose/src/providers/gemini_cli.rs:184`, `:212`), filters extension instructions (`:89`), and uses `--yolo` (`:112`). Cloning it does not give agy Goose MCP parity, ACP-style approval routing, or the ACP handoff implementation. Print-mode reachability alone does not prove compatible stream, resume or cancellation behavior.
- **Fail-over ownership gap.** `update_provider` is explicit switching (`crates/goose/src/acp/server.rs:2555`); Summon resolves one provider (`crates/goose/src/agents/platform_extensions/summon.rs:1809`). Proposed retry/re-roll policy must define error classification, partial edits, cancellation and context transfer. `tasks.md:149` assigns session fail-over to the shell, while the architecture diagram places it behind `serve`; a disconnected phone must not own continuation.
- **Sidecar boundary is reasonable.** The proposed sidecar owns interactive workspace IO (`ARCHITECTURE.md:81`), distinct from agent-facing tools. Keep it free of scheduling, role selection and agent state. Its network/HTTP/WS authorization and lifecycle still need a concrete design; interface binding alone is not that design.

## Recorded decisions

- Preserve Electron plus one browser renderer: `d7b221eee` records that direction. This review does not reopen the shell choice.
- Preserve subscription-backed runtimes and Goose session storage (`PRODUCT.md:9`, `:28`); an API-backed orchestrator is an alternative with a product trade-off, not a silent substitution.

## Options → pick

| Option | Benefit | Trade-off |
|---|---|---|
| Keep current patch scope | Small nominal fork | Central orchestration path remains unsupported by inspected code |
| **Keep Goose ownership; repair ACP integration (recommended)** | Preserves subscriptions, Goose delegation/session lineage and thin UI | Requires more integration work than three feature files |
| Goose-native `chatgpt_codex` orchestrator with ACP workers | Existing subscription provider sends Goose tools and system instructions | Changes Claude-first V0; ACP worker instruction delivery still needs repair |
| Use a Goose-native API orchestrator with subscription workers | Orchestrator receives Goose tools directly | Changes subscription-first promise; worker instruction/permission gaps remain |
| Move orchestration into sidecar | Full local control | Duplicates Goose task/session responsibilities and increases maintenance |

- Pick: preserve Goose as the owner of agent sessions and delegation, and prove a session-bound adapter integration before workspace expansion.
- Prefer reusing Summon behind the integration over implementing a new task engine. Exact transport/export mechanism needs a bounded design spike.
- Keep automatic continuation on the server side; UI displays state and requests changes.
- Replace the arbitrary “three feature files only” budget with protected behavioral boundaries; do not pre-authorize agent-loop edits.

## Scope — in / out / protected

- In for a subsequent approved plan: ACP tool exposure and instruction delivery; explicit provider capability differences; truthful lifecycle/runtime events; backend fail-over ownership.
- Out: implementing the bridge, changing role weights, pane redesign, new persistence engine, durable background workflows.
- Protected: existing sessions and provider selection, upstream chat components, sidecar as workspace IO only, no second task registry in the renderer.
- This evaluation does not claim existing tasks, change their status, or amend the approved architecture.

## Unknowns / next proof

- Run a Claude ACP parent that invokes Goose delegate, creates one linked Codex ACP child, and returns a compact result. Put a unique instruction only in the role body to prove it reaches the child. Cheap relative to UI work; reversible.
- Verify permission/cancellation and the meaning of Goose `max_turns` when an adapter executes multiple internal steps within one prompt; do not equate outer turns with vendor tool steps.
- Observe task lifecycle and chosen provider/model through ACP, including reload/reconnect; distinguish persisted transcript from live execution.
- Exercise quota/spawn failure before work and failure after one file edit; establish what can safely continue without repeating effects.
- Confirm agy stream/resume/cwd behavior against the proposed clone; its accepted ungated mode does not settle these contracts.

## Advisor review

- `claude -p … --model opus --effort high` completed on the first advisor rung. It confirmed the tool/instruction gaps and recommended a Goose-native Codex orchestrator for the fastest proof. That changes the Claude-first promise; this review retains the ACP integration recommendation when that promise is fixed, and presents native Codex as the lower-integration alternative.
- Rechecked its useful addition: `chatgpt_codex` uses OAuth configuration (`crates/goose/src/providers/chatgpt_codex.rs:37`) and sends both `system` and `tools` into `create_codex_request` (`:1003`). This provider is materially different from `codex-acp`.
- Rechecked permission mismatch: the adapter reads global mode at construction (`crates/goose/src/providers/claude_acp.rs:70`), despite Summon's Auto child configuration. If an approval request reaches the adapter, it waits on a confirmation channel (`crates/goose/src/acp/provider.rs:1005`); the child handler lacks corresponding approval forwarding. Treat delegated approval behavior as a blocking proof, not an inherited guarantee.
- Rechecked error classification: ACP errors become Authentication or RequestFailed (`crates/goose/src/acp/provider.rs:182`), so a reliable quota-triggered retry requires an explicit classification contract.
- Rechecked a second existing delegation surface: `platform_extensions/orchestrator.rs:670` exposes `start_agent`. Choose the bounded Summon workflow deliberately rather than accidentally exposing competing delegation models.
- Remaining advisor observations about locally installed adapter flags were not independently rerun; they are not treated as validated compatibility results here.
