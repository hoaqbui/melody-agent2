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

- 121. `ui/desktop/src/workspace/SessionControls.tsx`: two rows after the extensions row — **Cost** (`workspace-config-cost`, the session's accumulated cost from `CostTracker`'s inputs, "—" until a turn lands) and **Diagnostics** (`workspace-config-diagnostics`, opens what the bottom row's bug icon opened: `setDiagnosticsOpen(true)` via a callback prop); `SessionControls.test.tsx` gains both.
  - status: todo · agent: — · worker: low
  - card: as the user in Advanced, find cost and diagnostics where every other session fact is, so that the composer row can drop them
  - confirm: `grep -c "workspace-config-cost\|workspace-config-diagnostics" ui/desktop/src/workspace/SessionControls.tsx` → `2` (untouched: `0`); `pnpm vitest run src/workspace/SessionControls` → all passed

- 122. `ui/desktop/src/components/bottom_menu/UsageRing.tsx` (+ `usage-ring.ts` pure, + tests): `mostSpent(limits)` → the highest `used/max` of the context window and any plan limits; `ringState(pct)` → `empty | filling | warm | full | unknown` (warm ≥ 80, full = 100, unknown when no limit); the component wraps children (the send disc) in a 36 px SVG ring (`usage-ring`, `aria-valuenow`, `data-state`), tooltip `used / limit (pct%)`, and on hover/focus a popover above (`usage-breakdown`: Context window bar + "Compacts automatically at N%" + Compact session; per-limit rows with bar and reset time; "Plan limits: not reported by <seat>" when none; See detailed breakdown → `openPane`-free callback to Session controls); Esc closes; Heroicons 16 solid glyphs.
  - status: todo · agent: — · worker: medium
  - card: as the user, see how much of the window and the plan I have spent on the one control every message touches, and get the full picture on hover
  - context: colours from tokens only — `--color-text-inverse`/teal accent for filling, `warning` for warm, `danger` for full; `@heroicons/react` added with `pnpm add` in `ui/desktop` (the plan's one dependency)
  - confirm: `cd ui/desktop && pnpm vitest run src/components/bottom_menu/usage-ring 2>&1 | grep Tests` → `≥ 8 passed` (untouched: no file); `grep -c "@heroicons/react" ui/desktop/package.json` → `1` (untouched: `0`)

- 123. `ui/desktop/src/components/ChatInput.tsx` + `src/workspace/Lever.tsx`: the bottom row reads `data-ui` (a `workspaceUi` value on `SessionChipsSlot`'s context, `'easy' | 'advanced' | null` — null off the workspace route keeps upstream's row as is); on the workspace route Easy renders lever · folder · attach · send-in-ring, Advanced adds the model chip as `cube + mono id` (`ModelsBottomBar` restyled through its className, not rewritten) and keeps the worktree chip; cost, tokens, extensions and debug do not render on the workspace route in either mode; the lever's visible label (`workspace-lever-label`) becomes screen-reader-only, the tooltip unchanged; the row's glyphs (folder, paper clip, arrow up, cube) come from `@heroicons/react/16/solid`.
  - status: todo · agent: — · worker: medium
  - card: as the user, read a four-control row in Easy and a five-control row in Advanced, so that the composer is as quiet as the tools it stands beside
  - context: upstream's `isBottomBarNarrow` folding order stays; `send-disc[data-armed]` and the Studio lift stay; the dot the alert popover drew is gone with the counter (the ring is the alert)
  - confirm: `grep -c "workspace-config-mode\|data-testid=\"usage-ring\"" ui/desktop/src/components/ChatInput.tsx` → `≥ 1` (untouched: `0`); `pnpm run typecheck` clean; `pnpm vitest run src/components/ChatInput src/workspace` all passed

- 124. Walks and documents: `tests/e2e/easy-mode.spec.ts` reads the stop from the lever's `aria-label`/tooltip instead of `workspace-lever-label` text and asserts the Easy row's four controls and the Advanced chip; a new `tests/e2e/usage-ring.spec.ts` (walk `usage ring`): a session with one reply → the ring has `aria-valuenow > 0`, hover opens `usage-breakdown` with the context row, Esc closes, the disc still sends; `studio light` screenshot retaken; `DESIGN.md` §Vocabulary rows **chip** (Easy's four, Advanced's five, dated), **usage ring**, **usage breakdown**; §Iconography: Heroicons 16 solid for the composer row, lucide elsewhere until named; `PRODUCT.md` §11 line on the composer.
  - status: todo · agent: — · worker: medium
  - confirm: `just walk "easy mode|usage ring|studio light"` → all passed; `grep -c "usage ring" DESIGN.md` → `≥ 1` (untouched: `0`)

Approval gate: tasks 121–124 wait on sign-off. Flagged: 122 adds a dependency
(`@heroicons/react`, the second icon set in the tree — ux_tests' pick, scoped to the row);
123 changes what a Claude Code-shaped row shows by default, which the user chose from the
mockups. The `usage ring` walk needs a live seat for its one reply (the Claude seat answered
"done" this afternoon, so it should run). Approved → the list lands in `tasks.md` under
`### docs/2026-09-20-composer-row-plan-v1.md`; this section keeps only that pointer.
