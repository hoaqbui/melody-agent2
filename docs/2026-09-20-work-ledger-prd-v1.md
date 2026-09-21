# PRD — Work ledger (the Telemetry pane)

Dated 2026-09-20. Upstream: `docs/2026-09-20-telemetry-pane-research-v1.md` (pick A + A4, the start-over view). User's words: "which models are being called with what settings" · "dashboards! graphs! time over days, months, quarters" · "where we are routing, what models is being used, and are the roles continuing to be effective?" · "no prose, just numbers and charts … hover … why it is important" · "at the top, 3 trends in prose bulleted form". Prototype: `docs/mockups/2026-09-20-work-ledger.html`. Names and states cite `DESIGN.md`.

## Problem

- The user pays for three seats and routes roles across them by hand-edited weights (`.agents/agents/*.md` `runtimes:`) and a rules table (`AGENTS.md` §Model routing), and judges whether that pays by counting corrections in `tasks.md` by hand (`tasks.md:196` — 17/17 haiku diffs corrected). Nothing on screen says which model answered a turn, what the fortnight cost, or whether a role's output survived the session.
- Upstream's only surface, "View recent model interactions", is empty for all four subscription seats (`SessionActionsHeader.tsx:47`; no `start_log` in any ACP adapter).
- Outcome that says it landed: the user opens **Telemetry**, reads three trends, and can answer "which seat should the Implementer be on?" from the Roles board without opening `tasks.md`.

## Journey

1. [Work column, any pane or none] · P0
   - does: click + on the panel's bar, pick **Telemetry**
   - rule: if the project has ledger events then the pane opens on **Over time** with the last-used scope; else on **Now**
   - → [Telemetry · Over time]; no ledger file yet → [Telemetry · Now, the Over time cards Empty]
2. [Telemetry · Over time] · P0
   - does: read the three **Trends** bullets, then the headline numbers (Tokens · Cost · Turns with their deltas), the stacked bars by model, cost per week, share, quarters, by runtime, top sessions
   - rule: the trends are the three largest movements between this range and the one before, written from templates (never a model call); every number, cell and chart carries a hover: *why it matters* then *where it reads from*
   - → [hover any number] shows the tooltip; [click Days · Weeks · Months · Quarters] re-buckets every card with the bars morphing, the range chip reading `14 d · 13 w · 12 mo · 5 q`
3. [Telemetry · Now] · P0
   - does: click **Now**
   - rule: the Session card shows Runtime · Model · Lever · Thinking effort · Permission gate · Context · Turns · Cost, ids in mono beneath (a Diagnostics-tier surface: the one pane where ids and the gate show); the **Turns** list has one row per reply — When · Who · Runtime · model (requested → resolved when they differ) · In · Out · Time (elapsed · TTFT) · Cost · Outcome — newest first, a worker's row nested under the turn that delegated it
   - → [a turn running] its row keeps the `info` dot and reads "—" until usage lands; [outcome] reads landed · corrected · blocked · undone · failed from the ledger
4. [Telemetry · Roles] · P0
   - does: click **Roles**
   - rule: **Routing** draws one ribbon per role → seat, width = runs, a dashed `danger` thread for a fail-over or re-roll; the **Roles** board has one row per role (the Implementer split by `worker:` tier): Seat (most) · Runs · Done · Blocked · Corrected · Review PASS · Median · Tok / run · Trend · Verdict; **Clean-done by role** draws the weekly line per role with the routing change marked
   - rule: Verdict = **Effective** when clean-done ≥ 80% and PASS ≥ 80% (or no reviews), **Watch** below either, **Failing** when corrected ≥ half the runs or clean-done < 50%; a row whose runs never passed through `delegate` reads from `tasks.md` and carries the **hand-counted** mark
   - → [hover a role] dims the other ribbons; [hover a cell] the column's why and source
5. [any scope, phone width] · later
   - does: open Telemetry from the tab rail
   - rule: cards stack one column; the Turns and Roles tables scroll sideways inside their own container; the page never scrolls sideways
   - → [same cards, one column]

## States

- Trends: empty → "No movement yet — two ranges of turns are needed" (one line, the card stays); loading → three skeleton lines; partial → a bullet that reads from `tasks.md` carries **hand-counted**; error → the ledger read's cause with Retry
- Over time cards: empty → "No turns in this range — widen it"; loading → frame kept, bars grow in as events page in; partial → a `warning` line over the Cost card "<n> turns unpriced — <seat> reports none"; error → the read's cause, last good picture kept, Retry
- Now: empty → "No turns yet — send a message and the model that answers shows here"; loading → the Session card live, Turns rows a skeleton; partial → Cache · Cost read "—" where the seat reported none; error → the transcript read's cause
- Roles: empty → "No delegated work in this range" with the hand-counted rows still shown when `tasks.md` has any; loading → ribbons draw in; partial → rows from `tasks.md` marked hand-counted, the board's footer naming how many; error → the cause, Retry

## Criteria

- [ ] given a session with N assistant messages carrying `usage`, the Now list has exactly N session rows (a turn with five tool rounds is one row)
- [ ] given a `DelegationUpdate` whose child's return text starts `BLOCKED`, the Roles board counts it under Blocked and not under Done's clean-done
- [ ] given a worker returned Done with `## Files Changed` naming `a.ts`, and the session's next `write`/`edit` tool call touches `a.ts`, the ledger holds one `correction` event and the row's Corrected is 1
- [ ] given a day bucket key, no two days from different years share it (the mockup's collision)
- [ ] given the range changes, every headline delta compares against the range of the same length before it
- [ ] given a subscription seat, its turns carry cost `—` and are counted in "<n> turns unpriced", never as $0
- [ ] every `data-why` element resolves to a tooltip with a why line and a from line; no card carries a sentence outside the Trends card
- [ ] `session/list` totals: with A4 landed, the Over time headline tokens for a range equal the sum of the listed sessions' `accumulatedInputTokens + accumulatedOutputTokens` for sessions created in it, without loading a transcript
- [ ] phone width: no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth`)

## Scope

- out: a per-request log for ACP seats (the CLI's own calls are invisible to Goose); a price table beyond the four seats' published rates (`est.` is the mark, not a calculator); child token totals before A4 lands (rows read "—"); persistence of ledger events across machines (one JSONL per project on this Mac); a `#/usage` route (the pane is the surface — the Board precedent is noted, not followed, per the user's "panel"); a compaction row (nothing sets `isCompaction` yet)
- protected: `agent.rs` and `state_machine/` untouched (`ARCHITECTURE.md` §Invariants); `sessionNotificationAdapter.ts:109` stays `[]`; upstream's `MessageUsageStats` and the JSON dialog composed, never copied; the Named Runtime Rule — a provider id never rises above the Telemetry pane; task 88's Undo and task 70's review parse reused, not re-implemented
