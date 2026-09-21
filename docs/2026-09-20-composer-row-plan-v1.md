# Composer row — plan

Dated 2026-09-20. Companion: `docs/2026-09-20-composer-row-prd-v1.md` (option A). Ships the
quiet Easy row, the usage ring with its breakdown, the Advanced status chip, and the
composer's glyphs on Heroicons > one tranche, all on main.

## Approach

- **Gate, don't rebuild.** `ChatInput.tsx`'s bottom row stays upstream's; each chip is
  wrapped in a `data-ui` check read from the shell (the `SessionChipsSlot` already carries
  the shell's `workspaceUi`), so Easy renders four controls and Advanced five. Cost,
  extensions and debug move into Session controls as rows, where "8 extensions enabled"
  already sits.
- **The ring is the counter.** `UsageRing.tsx` takes what `ContextWindowIndicator` takes
  (`totalTokens`, `tokenLimit`) plus an optional `limits: {label, used, max, resetsAt}[]`
  that no seat fills yet; it draws the SVG ring around the send disc and owns the hover
  breakdown (upstream's `BottomMenuAlertPopover` positioning pattern, task 89's shape for
  the bars). The send disc keeps its `send-disc` hook and click; the ring is decoration
  plus a tooltip target.
- **One icon set for the row.** `@heroicons/react` is added (the one dependency this
  plan asks for — ux_tests' choice, `DESIGN_LANGUAGE.md` §3.1); only the composer's
  glyphs switch (cube, folder, paper clip, arrow up); the rest of the app keeps lucide
  until a later pass names it. DESIGN.md §Iconography records the two-set state and the
  rule for the row.
- **Order.** 121 (Session controls rows) ∥ 122 (UsageRing, pure + component) → 123 (the
  row gating, glyphs, lever label) → 124 (walks + DESIGN.md).

## Out of scope

- Plan-limit probes per seat (the breakdown reads "Plan limits: not reported by <seat>";
  each seat's probe is its own later task, the Claude CLI's first).
- Replacing lucide app-wide (a later pass; The Upstream Rule says compose).
- The phone build's row (folds already); renaming Easy/Advanced; the chat column outside
  the composer.

## Tasks

Approved 2026-09-20 (user: "plan and orchestrate with tasks") → moved to `tasks.md` under `### docs/2026-09-20-composer-row-plan-v1.md`; this section keeps only that pointer.

## Round 2 (2026-09-21)

The user, on the Advanced row (`Claude · Direct · Worktree · ⚙ · ▣ current · hoaqbui · attach · mic · send`): "the ux is rough". Options given — **A** finish "Easy is quiet" as approved (recommended), **B** two-line row, **C** one seat pill — and A picked. Tasks 140–142 in `tasks.md` under `### Composer row, round 2`.
