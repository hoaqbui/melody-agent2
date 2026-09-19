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

- 98. Faces, scale, motion roles: `pnpm add @fontsource-variable/schibsted-grotesk @fontsource-variable/jetbrains-mono` in `ui/desktop`; `@import` both at the top of `ui/desktop/src/styles/main.css` and delete the four Cash Sans `@font-face` blocks (`:264-296`); base tokens (`theme-tokens.ts:37-38`) `--font-sans: 'Schibsted Grotesk Variable', system-ui, sans-serif`, `--font-mono: 'JetBrains Mono Variable', ui-monospace, monospace`; sizes `--font-text-xs/sm/md/lg-size` 11/12/13/15 px with line heights 16/16/20/22 and `--font-heading-xs-size` 20/28 (`:41-70`); `main.css :root` gains `--motion-fast: 120ms; --motion-press: 80ms; --motion-base: 180ms; --halo-period: 1600ms`.
  - status: todo · agent: — · worker: low
  - card: as the user, read the app in the board's faces and sizes in every theme, offline from first paint, so that the language is one thing wherever it shows (research §Options: fonts, type scale)
  - context:
    - `main.css:113-135` resets the font namespaces to the tokens — no other place names a face
    - `tnum` (ux_tests `DESIGN_LANGUAGE.md` §3): if `main.css` sets `font-feature-settings: "tnum"` anywhere global, scope it to the counters that need it
    - headless — no UX plan; the `session menu` walk is the smoke
  - context (cont.): `lightTokens` and `auraTokens` are the base tokens merged with each theme's colours (`theme-tokens.ts:275-277`), so the two "unchanged" snapshots (`theme-tokens.test.ts:100`, `:104`) break the moment a face or size moves — this task rewrites them: the aura test becomes "aura colours unchanged" over the colour keys alone (export `auraColorTokens` or filter the merged map by key), the light snapshot is retaken here and again in 99
  - confirm: `grep -c "Schibsted" ui/desktop/src/theme/theme-tokens.ts` → `1` (untouched: `0`); `grep -c "squarecdn" ui/desktop/src/styles/main.css` → `0` (untouched: `8`); `cd ui/desktop && pnpm vitest run src/theme 2>&1 | grep -E 'Tests'` → `14 passed` with the two snapshots retaken (untouched: `14 passed` against the old); `just walk "session menu"` → 1 passed

- 99. The light theme is the board: `lightColorTokens` (`theme-tokens.ts:94-154`) takes the mapping in context; `theme-tokens.test.ts:100` "light tokens are unchanged" becomes "light tokens are the Studio board's" with a new snapshot and one assertion per role group; the AA test at `:84` per decision 2.
  - status: todo · agent: — · worker: medium
  - card: as the user, pick Light and see the board — white page, ivory sidebar, ink text, teal acts, blue where I am, amber marks (PRD step 1)
  - context:
    - mapping (board → role): background-primary `#ffffff` · background-secondary `#f8f7f3` (inspector) · background-tertiary `#f1efe9` (sidebar) · background-inverse `#44c1b8` (the primary action — `button.tsx` default fills with inverse) · background-info `#2277cc` · background-danger `#c23b3b` · background-success `#2f8f5b` · background-warning `#fbbf24` · background-disabled `#e6e1d6`; text-primary `#1e1d1a` · text-secondary `#5a5851` · text-tertiary `#6f6c64` · text-inverse per decision 2 · text-info `#2277cc` · text-danger `#c23b3b` · text-success `#2f8f5b` · text-warning `#d9a012` (amber's darker cut for text) · text-disabled `#a8a49b`; border-* `#e3dfd6` (the one hairline), border-inverse `#1e1d1a`, border-info `#2277cc` …; ring-primary `#2277cc` (focus is blue); shadows `--shadow-sm` `0 1px 2px rgba(0,0,0,.10), 0 2px 6px rgba(0,0,0,.08)` (elev-1) · `--shadow-md` `0 1px 2px rgba(0,0,0,.06), 0 6px 18px rgba(0,0,0,.12)` (elev-2) · `--shadow-lg` `0 10px 28px rgba(0,0,0,.16), 0 0 0 .5px rgba(0,0,0,.10)` (elev-3) · `--shadow-hairline` `0 0 0 1px #e3dfd6`
    - the light-blue tint `#f3f8fd` (tool rows, your message, chips) has no upstream role — it lives in the treatments block (task 100), not the token map
    - decision 2 names `text-inverse`: `#ffffff` (the owner's call, 2:1) or the test-safe pair `background-inverse #0b7a72` + `text-inverse #ffffff`
  - confirm: `grep -c "#1e1d1a" ui/desktop/src/theme/theme-tokens.ts` → `≥ 1` (untouched: `0`); `cd ui/desktop && pnpm vitest run src/theme 2>&1 | grep -E 'Tests'` → all passed with the new snapshot (untouched: `14 passed` against the old)

- 100. The treatments: a `[data-theme='light']` block in `main.css` after the Monokai one — `.workspace-column[data-column='sessions']` `rgba(241,239,233,.78)` + `backdrop-filter: blur(48px)`; `.chat-input-card` white, no border, `--shadow-md`; `.user-message-bubble` `#f3f8fd` ink text `--shadow-sm` right-aligned; `.tool-row` `#f3f8fd` `--shadow-sm` verb 600 secondary · target mono; `.ask-card` white with `--shadow-hairline`; `.work-tab[data-active='true']` white with `--shadow-sm` and a blue icon, idle tabs icon + kind; `.send-disc` round teal; `.file-line[data-changed]` amber bar `#fbbf24` on `#fdf3d6`. Hooks added where missing: `tool-row` on `ToolCallWithResponse.tsx:265`'s container, `ask-card` on `ToolCallConfirmation.tsx`'s card, `work-tab` + `data-active` on `WorkColumn.tsx`'s tab button, `send-disc` on `ChatInput.tsx`'s Send button, `data-column` on the three `.workspace-column`s.
  - status: todo · agent: — · worker: medium
  - card: as the user, see the board's surfaces — floating white controls, a frosted sidebar, light-blue tool rows and my message, flat agent replies, the one hairline on an ask (PRD steps 2–4)
  - UX test plan (walk `studio light`, task 102 writes it): setup — Light picked, a session with one tool call; steps — (1) `getComputedStyle(document.body).backgroundColor` is `rgb(255, 255, 255)`; (2) the Sessions column's `backdrop-filter` contains `blur`; (3) the current session row has no border and its title is 600; (4) the user bubble's background is `rgb(243, 248, 253)` and its box-shadow is not `none`; (5) a `.tool-row` exists with the same background; (6) the active `.work-tab` is white and its icon's `color` is `rgb(34, 119, 204)`; (7) the composer card has no outline and a box-shadow; keyboard: Tab reaches Send; states — Dark: none of the above applies (the block is scoped)
  - confirm: `grep -c "\[data-theme='light'\]" ui/desktop/src/styles/main.css` → `≥ 8` (untouched: `0`); `grep -c "tool-row" ui/desktop/src/components/ToolCallWithResponse.tsx` → `1` (untouched: `0`); `cd ui/desktop && pnpm run typecheck && pnpm run test:light 2>&1 | grep -E 'Tests'` → all passed

- 101. The motions: `button.tsx`'s filled and outline variants (not ghost or link — a flat control does not lift) gain `hover:-translate-y-px active:translate-y-px transition-[transform,box-shadow] duration-[var(--motion-fast)] active:duration-[var(--motion-press)]` and `shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]` (the Floating Button Rule reaching upstream's buttons — decision 5); `WorkColumn.tsx` the active tab's white slides to the picked tab (`transition-[left,width]` on an indicator or `layout` on the tab, `--motion-base`); `.running-dot` keyframe halo to 8 px every `--halo-period` on the session row's and tool row's running dot; `.send-disc[data-armed]` steps up 3 px once the composer has text (`--motion-base` + 60, once); tool rows enter with `animate-in fade-in-0 slide-in-from-bottom-1` over `--motion-base`; menus `zoom-in-[.98]` `--motion-base` − 20 in, 100 ms out; all inside `@media (prefers-reduced-motion: no-preference)` with a `reduce` block that stills them.
  - status: todo · agent: — · worker: medium
  - card: as the user, feel the board's six beats — lift, nudge, halo, pop, slide, landing — in the app itself (PRD step 4; research §Reframe 3)
  - UX test plan (part of walk `studio light`): (8) hover Send → its `transform` is a `translateY(-1px)`; (9) type a character → `.send-disc` has `data-armed`; (10) `prefers-reduced-motion: reduce` emulated → the running dot's animation is `none`
  - confirm: `grep -c "motion-fast" ui/desktop/src/styles/main.css` → `≥ 3` (untouched: `0`); `grep -c "translate-y" ui/desktop/src/components/ui/button.tsx` → `≥ 1` (untouched: `0`); `cd ui/desktop && pnpm run typecheck && pnpm run test:light 2>&1 | grep -E 'Tests'` → all passed

- 102. Amend the documents and prove it: `DESIGN.md` §Tokens & theme (2026-09-18 delta: Light is the Studio board — the mapping, the frosted column, the tint), §Typography (the five-size scale, the two faces, self-hosted), §Motion (the four duration roles), §Open decisions (Floating Button reach and Motion scale resolved); `tests/e2e/studio-light.spec.ts` per tasks 100–101's UX plan; every walk in `tests/e2e` rerun one at a time on main; one screenshot of the Light desktop for the user.
  - status: todo · agent: — · worker: low
  - card: as the next agent, read what the light theme is and why, and trust the walks that say so
  - confirm: `grep -c "Studio" DESIGN.md` → `≥ 3` (untouched: `0`); `just walk "studio light"` → 1 passed (untouched: no spec); `for w in "session menu" "terminal pane" "files pane" "chat links" "browser pane" "command palette" "changes bar"; do just walk "$w" | grep -E "passed|failed"; done` → seven `passed`

## Decisions this plan needs (the approval gate)

1. **Option** — A (Studio replaces Light; Monokai stays dark; Aura stays) — recommended over B (a fourth theme) and C (Studio only).
2. **White on teal** — the board's owner call is `#44c1b8` with white text (2:1, below AA). The desktop's AA test (`theme-tokens.test.ts:84`) covers the dark theme only; nothing asserts Light's accent today. Recommend: add the same AA assertion for Light and take `background-inverse #0b7a72` with white text for filled controls, keeping `#44c1b8` where the fill carries an icon, not words (the Send disc). Alternative: keep `#44c1b8` + white everywhere, no Light AA test, the 2:1 recorded in DESIGN.md as your call.
3. **Radius** — keep the fork's 16 · 12 · 999 (your 2026-09-16 call) over the board's 8 · 10 · 12 — recommended; a live look can revisit.
4. **The Sessions column** — frosted ivory at 78 % over a 48 px blur (the board; the desk shows through the vibrancy) — recommended over opaque ivory.
5. **Floating Button reach** — the lift, press and shadow reach upstream's buttons through `button.tsx` (closing the open decision) — recommended; the alternative stops at the workspace's own controls and the board's "every filled control" language fails.
6. **Every theme takes the faces and scale** — body text goes from 16 px to 13 px, small text 14 → 12, captions 12 → 11, large 18 → 15, the first heading 16 → 20, in Light, Monokai and Aura alike (chat, settings, panes; colours unchanged) — recommended; the alternative is a per-theme font token, two languages in one app.

Approval → the five tasks land in `tasks.md` as tranche 8 and 98 starts at once.
