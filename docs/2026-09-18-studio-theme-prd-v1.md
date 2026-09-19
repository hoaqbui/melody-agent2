# PRD — Studio theme (the desktop in the board's skin)

<!-- Downstream of docs/2026-09-18-studio-theme-research-v1.md (option A); cites DESIGN.md
     for names and shared states. -->

## Problem

The desktop's light theme is upstream's: grey-blue tokens, Cash Sans fetched from a CDN,
a generic monospace, flat buttons. The user's agent workbench language — the B · Studio
teal & amber board in ux_tests — exists only as a styleguide page. Outcome that says it
worked: with Light picked, the desktop reads as the board (white page, ivory sidebar,
ink text, teal acts, blue where-you-are, amber marks; Schibsted Grotesk and JetBrains
Mono; floating white controls), and every existing walk stays green.

## Journey

1. [Settings › Theme, Light] · P0
   - does: pick Light
   - rule: if Light is picked then the page is `#ffffff`, the Sessions column ivory
     `#f1efe9` frosted over blur, text ink `#1e1d1a` / `#5a5851` / `#6f6c64`, the primary
     action teal `#44c1b8`, selection blue `#2277cc`; the body font is Schibsted Grotesk
     at 13 / 500 and mono is JetBrains Mono
   - → [Studio light]
2. [Studio light, a session running] · P0
   - does: read the session list and the Work column
   - rule: the current session row is flat white with a 600 title and no bar; state is
     the dot alone (blue breathing halo running · green done · red failed); the active
     Work tab is white with a blue icon and fixed to its content, idle tabs icon + kind
   - → [Studio light]
3. [Studio light, a turn with tool calls] · P0
   - does: watch the reply
   - rule: your message is a light-blue floating bubble on the right; the agent's reply
     is flat on the page; each tool row is light blue and floating, verb in 600 secondary
     ink, target in mono; a permission ask is the one white surface with a hairline
   - → [Studio light]
4. [Studio light, composing] · P0
   - does: type, hover controls, press Send
   - rule: the composer floats on its shadow with no outline; the Send disc is teal and
     round and nudges up 3 px once there is text; every button lifts 1 px on hover (120
     ms) and drops on press (80 ms); a menu pops from 98 % in 160 ms
   - → [sent]
5. [Dark or Aura picked] · P0
   - does: switch theme
   - rule: Charcoal Monokai and Aura keep their colours; they take the new fonts and type
     scale (named delta); the picker still shows three themes
   - → [that theme]
6. [Phone width] · P1
   - does: open on the phone build
   - rule: the same tokens; the rail's tabs take the board's icon + kind treatment
   - → [phone]

## States

- Theme switch: loading → tokens apply in one frame, no flash of the old theme; error →
  none (a missing token key fails the theme test, never the app)
- Fonts: loading → the system sans until the woff2 arrives (self-hosted, same paint in
  practice); partial → a glyph the face lacks falls back to the system stack

## Criteria

- [ ] given Light, when `document.documentElement` is read, then
      `--color-background-primary` is `#ffffff`, `--color-text-primary` `#1e1d1a`, the
      computed `font-family` of `body` starts with `Schibsted Grotesk Variable`, and
      `code` with `JetBrains Mono Variable`
- [ ] given Light, when the `session menu` walk runs, then it passes; the `terminal
      pane`, `files pane`, `chat links`, `browser pane`, `command palette`, `changes bar`
      walks pass unchanged
- [ ] given Dark, when the theme test runs, then the Monokai colour snapshot is unchanged
- [ ] given the AA test (`theme-tokens.test.ts:84`), when Light's accent is teal, then the
      test's outcome is the one the plan's decision names (kept with `#0b7a72` for text on
      teal, or relaxed with the owner's call recorded)
- [ ] given a fresh install offline, when the app paints, then no request leaves for
      `cash-f.squarecdn.com`

## Scope

- out: the Compo video panels; Magic UI; the board's radius (8/10/12); layout changes
- protected: Monokai and Aura colours; The Upstream Rule; every walk in `tests/e2e`
