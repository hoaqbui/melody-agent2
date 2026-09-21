# Composer row — PRD

Dated 2026-09-20. Mockups: https://claude.ai/artifact/F6qa2Z4834pMPhsHuJrqcE (option A,
"Easy is quiet", picked by the user after five rounds: cube for the model, no dollar amount,
no green dot, the usage counter folded into the send disc, Heroicons 16 solid, the ux_tests
type scale). Design source: `DESIGN.md` §Vocabulary (chip, lever, stop, Session controls),
§Tokens (Studio light, Charcoal Monokai), and ux_tests `DESIGN_LANGUAGE.md` §3 / §3.1.

## Problem

The chat card's bottom row holds nine controls — lever, worktree, model, folder, cost,
tokens, extensions, debug, attach, send — in one line (`ChatInput.tsx:1776-1963`). The
tools the user compares against show three or four: Claude Code shows attach and send with
the model as a text line; Codex two pickers; Cursor a model dropdown and a usage ring that
appears as it fills. Cost, live token counts, an extensions count and a debug icon appear in
none of them by default. Easy and Advanced already exist as a switch (task 58,
`workspace-shell[data-ui]`) but upstream's chips render in both.

## Journey

1. [Session, Easy] · P0
   - does: look at the row
   - rule: four controls — the **lever**, the **folder** chip, **attach**, **send**; the
     lever's stop word is its tooltip (`Claude · opus[1m] · Direct`) and its accessible
     name, not a caption under the knob; no model, cost, tokens, extensions or debug
   - → [the same row; the ring on send shows usage]
2. [Session, any mode] · P0 — the **usage ring**
   - does: watch the send disc as the conversation grows
   - rule: the disc's edge is a ring that fills to the **most spent limit** — the context
     window today, the seat's plan limits once a seat reports them — teal to 80 %, amber
     past it; the exact numbers are the ring's tooltip; a full ring at 100 % is Error
     (§States) with Compact session as the recovery
   - → hover → [the **usage breakdown** above the composer: Context window `used / limit
     (%)` with a bar and "Compacts automatically at N%" · Compact session; then, per seat
     that reports them, the plan limits each with a bar and its reset time; then See
     detailed breakdown → Session controls]
3. [Session, Advanced] · P0
   - does: switch Advanced on (⋯ menu or Settings › App)
   - rule: the Easy row plus one **status chip** — the cube glyph and the model id in mono
     (`opus[1m]`) — that opens Session controls; extensions count, cost and the debug
     entry live inside Session controls (extensions already do: "8 extensions enabled");
     the worktree chip stays as today when a worktree is on
   - → click the chip → [Session controls]
4. [Any mode, narrow composer] · P0
   - rule: the folder chip folds first, then the status chip; the lever, attach and the
     ring never fold (upstream's `isBottomBarNarrow` order, kept)

## States

- Ring: empty (0 %, hairline only) · filling (teal) · warm (≥ 80 %, amber) · full (100 %,
  danger, tooltip names Compact session) · unknown (no token limit yet — hairline only, no
  tooltip numbers).
- Breakdown: loading (bars as skeletons) · partial (context window only, plan limits
  absent with one line "Plan limits: not reported by <seat>") · ready · error (the probe's
  message, Retry).
- Status chip (Advanced): ready · partial (model unknown: chip reads "Model…").

## Criteria

- Easy row: exactly `workspace-lever`, the folder chip, attach, send in the DOM; no
  `data-testid` for cost, tokens, extensions or debug on the workspace route.
- Ring: `aria-valuenow` = the most spent percentage; `data-warm` at ≥ 80; tooltip text
  carries `used / limit`.
- Breakdown: opens on hover and on focus of the disc; Esc closes; the disc still sends.
- Iconography: Heroicons 16 solid for the row's glyphs (cube, folder, paper clip, arrow
  up); 14 px in chips, 16 px on buttons; text 12 px in chips, 13 px body; 500 regular, 600
  emphasis; mono on the model id only.
- Walks: `easy mode` and `studio light` amended and green; a new `usage ring` walk.

## Scope

- in: `ChatInput.tsx` bottom row gating by `data-ui`, the send disc ring + breakdown
  (a new `UsageRing.tsx` beside `ContextWindowIndicator`), Session controls rows for
  cost and extensions, the lever label to tooltip, Heroicons for the composer's glyphs.
- out: plan-limit probes per seat (a later task per seat; the breakdown shows "not
  reported" until then); any change to the chat column outside the composer; renaming
  Easy/Advanced; the phone build's row (it already folds).
- protected: upstream's `ChatInput.tsx` structure (compose, don't rewrite — the row is
  gated, not rebuilt); The Upstream Rule; Monokai and Studio colours; every walk green.
