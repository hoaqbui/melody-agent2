# Studio theme — research map

<!-- Downstream of ux_tests `docs/2026-09-18-studio-board-plan-v1.md` (the board, read
     2026-09-18) and this repo's DESIGN.md §Tokens & theme; upstream of a PRD and a plan.
     Question as asked (user, 2026-09-18): "update the UI to look and behave like the
     compo reimagined in ux_tests" — read as: the desktop adopts the B · Studio — teal &
     amber board, the agent-workbench language in ux_tests's Chat area; the Compo video
     panels there are a different product and out of scope. -->

Dated 2026-09-18.

## The surprise (lead finding)

**The desktop already has the board's skeleton; what it lacks is the board's skin and
six surface treatments.** Three columns Sessions · Chat · Work with a tab bar over the
Work slots (`DESIGN.md` §Frame; `pane-store.ts:80` `DEFAULT_COLUMNS` 280 / 480 against
the board's 264 / 480), Lucide as the one icon set (`DESIGN.md` §Iconography — the board
picked Lucide too), a theme registry with a picker (`theme-tokens.ts:293` `themes`;
`ThemeSelector.tsx:52-84` light · dark · aura), the Floating Button, Surfaces-float and
Glass rules (`DESIGN.md` §Principles) that the board's "White · floating" buttons and
frosted sidebar restate. What differs is the *value set*: the desktop's light theme is
upstream's (`theme-tokens.ts:94-154`, grey-blue, Cash Sans from Square's CDN at
`main.css:264-296`, `monospace`), and its dark theme is Charcoal Monokai (task 57), while
the board is white, ivory and ink with teal · blue · amber in fixed roles, Schibsted
Grotesk and JetBrains Mono on a five-size scale (`ux_tests/src/pages/studio.tsx:260-266`).

## Reframe trail

1. "restyle the app to match the mockup" > the board's colours, type and elevation are
   fifteen tokens plus a type scale (`ux_tests/src/index.css` `.studio`, 69 lines;
   `studio.tsx:488-546` TOKENS) and the desktop already resolves every colour through a
   token map that a theme swaps at runtime (`theme-tokens.ts:379` `applyThemeTokens`,
   `main.css:64-110` `@theme inline`) > "a theme is the skin"
2. "then the components" > the board draws eight components (session row, panel tabs, tool
   row, ask card, composer, file line, your message, divider — `studio.tsx:726-785`) and
   The Upstream Rule forbids forking chat, tool rows and settings (`DESIGN.md`
   §Principles) > the Charcoal Monokai block shows the sanctioned shape: a
   `[data-theme='…']` block in `main.css:1016-1060` hooking class names the fork owns
   (`.workspace-column`, `.chat-input-card`, `.user-message-bubble`, `[data-slot=…]`) >
   "treatments are theme-scoped CSS on existing hooks, plus hooks where none exist"
3. "and behave like it" > six motions on the board (`studio.tsx:393-486`: lift 120 ms,
   send nudge 240 ms, running halo 1.6 s, menu pop 160 ms, tab switch 180 ms, tool rows
   landing) against the desktop's one easing role and no duration roles (`DESIGN.md`
   §Motion, open) > "motion needs duration roles and three small component edits the fork
   owns (tab bar, send button, tool-row entrance)"

## Inventory — read this session

- `ui/desktop/src/theme/theme-tokens.ts:33-91` base tokens (Cash Sans, `monospace`,
  weights, sizes 12/14/16/18, radii); `:94-154` light colours; `:155-211` Charcoal
  Monokai; `:213-270` aura; `:275-277` merged maps; `:285` `ThemeId = 'light' | 'dark' |
  'aura'`; `:293-297` registry; `:346` `buildMcpHostStyles` (MCP apps read the same
  tokens); `:379` `applyThemeTokens`
- `ui/desktop/src/theme/theme-tokens.test.ts:97-106` — "light tokens are unchanged" and
  "aura tokens are unchanged" snapshots (task 57's promise)
- `ui/desktop/src/contexts/ThemeContext.tsx:25-73` — preference → resolved id;
  `ThemeSelector.tsx:52-84` — three buttons
- `ui/desktop/src/styles/main.css:113-135` font namespaces reset to the tokens; `:173-213`
  the fork's radius step (panel 16 · control 12 · chip 999); `:264-296` Cash Sans
  `@font-face` from `cash-f.squarecdn.com` (network at first paint); `:575` `monospace`;
  `:1016-1060` Charcoal Monokai overrides — the pattern to mirror
- `ui/desktop/src/components/ui/button.tsx:9-22` — variants `default` (inverse fill),
  `outline`, `ghost`; the Floating Button Rule's reach into upstream's buttons is an open
  decision (`DESIGN.md` §Open decisions)
- `ui/desktop/src/components/UserMessage.tsx:331` `.user-message-bubble` (inverse fill,
  `rounded-panel`); `ChatInput.tsx` `.chat-input-card`; `ToolCallWithResponse.tsx:217-281`
  the tool row (no fork hook yet); `WorkColumn.tsx` the tab bar (task 71)
- `ui/desktop/src/main.ts:1345`, `:1686` `vibrancy: 'window'` — the dark theme's .8-alpha
  surfaces let the desk through; the board's grounds are opaque
- `ux_tests/src/index.css` `.studio` (69 tokens, shadcn variables re-declared);
  `ux_tests/src/pages/studio.tsx:260-266` SCALE (20/600 · 15/600 · 13/500 · 12/500 ·
  11/600 uppercase), `:327-378` buttons (primary teal acts; secondary, chip, add white
  floating; ghost flat; Send the one round control), `:393-486` motion, `:488-546` TOKENS,
  `:726-785` components; `ux_tests/package.json:13-14`
  `@fontsource-variable/{schibsted-grotesk,jetbrains-mono}`
- `ux_tests/docs/2026-09-18-studio-board-plan-v1.md` §Revisions — the owner's calls: teal
  `#44c1b8` with white on it (2:1, PRD criterion 5 unmet), buttons White · floating,
  icons Lucide 2 px round, type Schibsted Grotesk · JetBrains Mono
- Boundary check against `ARCHITECTURE.md`: everything lands in `ui/desktop/src/theme`,
  `styles`, `components/ui`, `workspace` — inside the desktop box; no sidecar, no spine

## Recorded decisions

- Charcoal Monokai is the dark theme itself, not a fourth theme; light and aura stay
  byte-for-byte (`DESIGN.md` §Tokens 2026-09-16 delta) — this asks to move the light one
- One icon set, Lucide (`DESIGN.md` §Iconography) — the board agrees
- Radius step panel 16 · control 12 · chip 999 (`DESIGN.md` 2026-09-16) — the board says
  radius 8 buttons/rows/tabs · 10 menus/cards · 12 composer: a conflict to decide
- The Upstream Rule — chat, tool rows, settings composed not restyled
- Runtime identity has no colour (`DESIGN.md` §Open) — the board's blue = "where you are"
  and teal = "acts" are roles, not identities; compatible

## Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A. Studio **replaces `light`** — the light theme's tokens become the board's; Monokai stays dark; aura stays; fonts self-hosted for every theme | one pair the fork owns (Studio light · Monokai dark); the picker unchanged; the Monokai override block gets a light sibling | the "light tokens are unchanged" snapshot is rewritten on purpose; upstream's light look is gone from the fork |
| B. A **fourth theme** `studio` | light stays byte-for-byte; additive | four themes to keep and test; a picker row nobody asked for; upstream's light kept for no user |
| C. Studio the **only** theme (drop light and aura; dark = Monokai) | least to maintain | removes a choice the user has today; a larger cut than the ask |

Pick: **A**.
- Fonts: `@fontsource-variable/schibsted-grotesk` and `@fontsource-variable/jetbrains-mono`
  in `ui/desktop` (`pnpm add`), imported once in `main.css`; `--font-sans` / `--font-mono`
  in the base tokens point at them for every theme — Cash Sans (a CDN fetch at first
  paint) goes; the mono finally has a face. Two packages: the tranche's dependency ask.
- Type scale: the board's five sizes map onto upstream's `--font-text-*` slots (xs 11 · sm
  12 · md 13 · lg 15; heading-xs 20) in the base tokens — one scale for all themes, as
  the board's language demands; the Monokai theme inherits it (a visible change in dark,
  named here).
- Radius: keep the fork's step (16 · 12 · 999) — decided 2026-09-16 by the user; the
  board's 8/10/12 is not adopted (option: revisit after a live look).
- Teal `#44c1b8` with white text: the owner's recorded call in ux_tests; the desktop's
  `theme-tokens.test.ts:84` AA test on the accent surface will fail for it — the plan
  names the choice: keep the test and use the board's darkened teal `#0b7a72` for text-on
  surfaces, or relax the test to the owner's call.
- Treatments: a `[data-theme='light']` block in `main.css` mirroring the Monokai block —
  frosted Sessions column (`.workspace-column` 78 % over blur), white active tab with a
  blue icon, light-blue floating tool rows and your-message bubble, flat agent replies,
  the ask card white with a hairline, the composer without outline and a teal round Send,
  file lines with the amber bar. Hooks the fork lacks (tool row, active tab, ask card,
  send button) are added as class names, not component forks.
- Motion: duration roles `--motion-fast 120` · `--motion-press 80` · `--motion-base 180`
  · `--halo-period 1600` in the base tokens (closing DESIGN's open "Motion scale"); lift
  and press on `button.tsx` under the Floating Button Rule; tab switch slide in the tab
  bar; the running halo on the session row's dot; send nudge on the Send disc; tool rows
  land with a short entrance. No Magic UI dependency — the shimmer and beam are CSS.

## Scope — in / out / protected

- in: `theme-tokens.ts` (light tokens, base fonts/sizes, motion roles), its test,
  `main.css` (fonts, light block), `button.tsx` (lift/press), `WorkColumn.tsx` (tab
  treatment), `ChatInput.tsx` (Send disc, composer hooks), `UserMessage.tsx`,
  `ToolCallWithResponse.tsx` (hooks only), `NavigationPanel` session row hooks, DESIGN.md
  §Tokens/§Typography/§Motion amendments, `package.json` + `ui/pnpm-lock.yaml`
- out: the Compo video panels in ux_tests; a new layout (the three columns already
  match); Magic UI; the radius change; phone-specific redesign beyond what tokens give
- protected: Charcoal Monokai's and Aura's colour values and the glass rule (their colour
  snapshots stay; faces and sizes move for every theme — option A), every existing walk
  green, The Upstream Rule (no component copies)

## Unknowns

- Vibrancy under a white theme: the light grounds are opaque, so the desk never shows —
  is the frosted Sessions column wanted at 78 % over blur (the board) or opaque? cheap to
  test? yes (one token); reversible? yes
- Schibsted Grotesk and `tnum`: ux_tests found a global `tabular-nums` widens the period
  (`DESIGN_LANGUAGE.md` §3, 2026-09-17) — does upstream set `tnum` globally? cheap? yes
- Do MCP apps (`buildMcpHostStyles`) render acceptably with the new light tokens? cheap?
  yes (open one app); reversible? yes
- The white-on-teal AA test — decision above
