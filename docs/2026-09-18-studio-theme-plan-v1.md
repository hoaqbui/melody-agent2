# Studio theme — plan v1

<!-- Downstream of docs/2026-09-18-studio-theme-research-v1.md (option A) and
     docs/2026-09-18-studio-theme-prd-v1.md; upstream of implement. Every `confirm:` was
     baselined on the untouched tree 2026-09-18 (values in parentheses). -->

Dated 2026-09-18. The desktop's Light theme becomes the B · Studio — teal & amber board:
tokens, faces, type scale, the six surface treatments and the six motions, landing
through the theme registry and one theme-scoped CSS block, never through component
forks. Companion: `DESIGN.md`, ux_tests `docs/2026-09-18-studio-board-plan-v1.md`.

## Approach

- **Skin first, in the registry.** `lightColorTokens` (`theme-tokens.ts:94-154`) takes
  the board's values through one mapping (task 99's context); Monokai and Aura keep
  theirs. The theme test's light snapshot is rewritten on purpose and says so.
- **Faces and scale for every theme.** Schibsted Grotesk Variable and JetBrains Mono
  Variable self-hosted (`@fontsource-variable/*`, the tranche's two dependencies) replace
  Cash Sans's CDN fetch; the five-size scale rides the base tokens' `--font-text-*` slots
  so utilities keep their names. Dark inherits the faces and sizes — a named delta.
- **Treatments as the Monokai block's light sibling.** `main.css` gains a
  `[data-theme='light']` block on the hooks the fork owns; four hooks that do not exist
  yet (tool row, ask card, active tab, Send disc) are class names added where the
  component renders, not copies of the component (The Upstream Rule).
- **Motion as roles.** Four duration roles in `main.css :root` (not theme tokens — the
  MCP UI key set is closed), consumed by the lift/press on `button.tsx`, the tab slide,
  the running halo, the send nudge and the tool-row entrance; `prefers-reduced-motion`
  stills all five.
- **The session drafts.** As with the board itself, these are design drafts the user
  will iterate live; `worker:` tags stay on the ledger for a hand-off that need not
  happen. Every walk in `tests/e2e` reruns at the end, one at a time (the sidecar's fixed
  port forbids two apps at once — found 2026-09-18).
- **Order.** 98 → 99 → 100 ∥ 101 → 102.

## Tasks

Approved 2026-09-18 (user: "Approved", all six decisions as recommended) → moved to `tasks.md` under `### docs/2026-09-18-studio-theme-plan-v1.md` as tranche 8; the session drafts every task. This section keeps only that pointer.

## Decisions this plan needs (the approval gate)

Decided 2026-09-18: every recommendation as written.


1. **Option** — A (Studio replaces Light; Monokai stays dark; Aura stays) — recommended over B (a fourth theme) and C (Studio only).
2. **White on teal** — the board's owner call is `#44c1b8` with white text (2:1, below AA). The desktop's AA test (`theme-tokens.test.ts:84`) covers the dark theme only; nothing asserts Light's accent today. Recommend: add the same AA assertion for Light and take `background-inverse #0b7a72` with white text for filled controls, keeping `#44c1b8` where the fill carries an icon, not words (the Send disc). Alternative: keep `#44c1b8` + white everywhere, no Light AA test, the 2:1 recorded in DESIGN.md as your call.
3. **Radius** — keep the fork's 16 · 12 · 999 (your 2026-09-16 call) over the board's 8 · 10 · 12 — recommended; a live look can revisit.
4. **The Sessions column** — frosted ivory at 78 % over a 48 px blur (the board; the desk shows through the vibrancy) — recommended over opaque ivory.
5. **Floating Button reach** — the lift, press and shadow reach upstream's buttons through `button.tsx` (closing the open decision) — recommended; the alternative stops at the workspace's own controls and the board's "every filled control" language fails.
6. **Every theme takes the faces and scale** — body text goes from 16 px to 13 px, small text 14 → 12, captions 12 → 11, large 18 → 15, the first heading 16 → 20, in Light, Monokai and Aura alike (chat, settings, panes; colours unchanged) — recommended; the alternative is a per-theme font token, two languages in one app.

The five tasks landed in `tasks.md` as tranche 8; 98 started 2026-09-18.
