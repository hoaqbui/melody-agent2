# Work ledger — plan

Dated 2026-09-20. Companion: `docs/2026-09-20-work-ledger-prd-v1.md` (research: `docs/2026-09-20-telemetry-pane-research-v1.md`, pick A + A4). Ships the Telemetry pane over a per-project work ledger — Now · Over time · Roles, three data-written trends, hover-why on every number > one tranche, on main.

## Approach

- **The ledger is the store; the pane is a fold.** The sidecar owns one JSONL per project (`<state>/ledger/<toplevel-slug>.jsonl`), appended through `POST /ledger/append` and read through `POST /ledger/read`, contained and keyed like `/git/*`. The renderer writes an event at each moment it already knows — a turn's usage landed, a worker returned, the session edited a worker's file, a review verdict parsed, a turn was undone — and never derives twice: every chart in Over time and Roles reads events; Now reads the live transcript and stamps outcomes from the same events.
- **Three fields, one spine touch.** `SessionMeta` (`acp/response_builder.rs`) gains `accumulatedInputTokens · accumulatedOutputTokens · accumulatedCost` so a range's headline needs no transcript loads; `sessions.ts` reads them like the fields beside them. `agent.rs`, `state_machine/`, the ACP adapters: untouched.
- **Pure state, thin panes.** Each view is a pure module with a test (`telemetry-buckets.ts`, `telemetry-roles.ts`, `telemetry-trends.ts`, `telemetry-now.ts`) and one component that renders its output; charts are inline SVG drawn to the prototype's picture (`docs/mockups/2026-09-20-work-ledger.html`), no chart library. One `<Why>` wrapper carries `data-why` / `data-from` into one tooltip.
- **Honest marks are data.** `est.`, `—`, and **hand-counted** are values the state modules return, not copy the components add; the Roles board's `tasks.md` rows come from a sidecar read of the file, marked `hand: true`.
- **Order.** 125 (spine fields) ∥ 126 (sidecar ledger) → 127 (the writers, needs 126) ∥ 128 (the pane, `PaneId`, i18n) → 129 (Now) ∥ 130 (Over time, needs 125 + 127) ∥ 131 (Roles, needs 127) → 132 (Trends, needs 130 + 131) → 133 (walk + DESIGN.md + ARCHITECTURE.md line).

## Out of scope

- Workers that never pass through `delegate` appearing on the wire (the spine bridge, tasks 5/8/9 — until then they are `tasks.md` rows marked hand-counted).
- A price table beyond the four seats' published rates; a cost calculator; currency.
- A `#/usage` route; the phone build beyond stacking (the tab rail already carries every pane).
- Reading `llm_request.*.jsonl` (empty for the four seats); a compaction row.
- Persisting the ledger anywhere but this Mac.

## Tasks

Approved 2026-09-20 (user: "ok draft a plan" → "build the tasks") → moved to `tasks.md` under `### docs/2026-09-20-work-ledger-plan-v1.md`; this section keeps only that pointer.

- 125 landed 2026-09-20: the confirm's `cargo build -p goose` was wrong on this tree (`-p goose` alone loses the `process-wrap` feature `goose-cli` unifies in — fails identically on the untouched tree); the check run was `cargo build -p goose-cli --bin goose` → exit 0.
