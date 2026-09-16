# Web workspace for desktop and phone — research map

<!-- Upstream of rpi plan > implement; reframes the fork plan's tranche 4
     (docs/2026-09-15-goose-fork-plan-v1.md) and the workspace PRD's
     surface. Anchors read this session: ~/github/goose@a23a8cd5,
     ~/github/compo@7c7301f (2026-09-14), the open web (URLs dated).
     PRODUCT.md §11 owns the workspace vision; this doc asks how it
     reaches a phone. -->

Dated 2026-09-15. Question as asked: the MVP must handle development of
`github/compo` from the desktop **and from a phone via web**, with code,
markdown (preview / rich edit), terminal, browser and files panes —
leveraging GitHub's libraries or writing our own. What does that change,
and what is the stack?

## The surprise (lead finding)

**"Phone via web" retires the Electron fork as the MVP's shell. The
workspace becomes a web app served from the Mac Studio over the tailnet
the phone is already on; Goose's spine is reachable as-is (`goose serve`,
HTTP + WebSocket, secret as a `?token=` query parameter — a plain WS
proxy suffices), and compo's own dev
server already serves itself to that tailnet (`allowedHosts:
[".eel-terrapin.ts.net"]`). Goose has no web UI and retired its mobile
tunnel; its 373-file desktop renderer calls `window.electron` from 54
files, so it is a parts bin, not a client. The reference stack is
already validated in the wild: CodeMirror 6 + `@codemirror/merge` +
xterm.js + node-pty + react-markdown + Express/ws + chokidar is exactly
what CloudCLI (13.7k★) ships to phones today.** The Electron shell comes
back later as a wrapper around the same URL, if at all.

## Reframe trail

1. Can Goose Desktop reach a phone? > No: the mobile tunnel and the
   `/tunnel/start` API are removed (`documentation/docs/experimental/
   remote-access/mobile-access.md:8-10`); goose Mobile is archived
   (`goose-mobile.md:8`). Goose's remote story is `goose roam` — iroh
   p2p ACP with connection cards (`goose-cli/src/commands/roam.rs:1-16`,
   `crates/goose-roaming/src/lib.rs:1-6`) — a transport, no UI. > So
   what *can* a phone talk to?
2. `goose serve` — "Start ACP server over HTTP and WebSocket", `--host`
   (default `127.0.0.1`), `--port 3284`, `--tls` (`goose-cli/src/cli.rs:
   853-865`), `GOOSE_SERVER__SECRET_KEY` required (`ui/desktop/src/
   gooseServe.ts:320,342`). Any browser on the tailnet can be an ACP
   client. > Can the existing renderer be that browser client?
3. `ui/desktop/src` is 373 ts/tsx files; 54 reference `window.electron`
   — mostly `getSetting`/`setSetting` (38), `on`/`off` (32), `logInfo`
   (13), `openExternal` (9), `createChatWindow`, `showMessageBox`,
   `listFiles`, `getAcpUrl`; `preload.ts` exposes 178 keys. The ACP
   layer (`src/acp/acpConnection.ts`, `@agentclientprotocol/sdk`
   ws-client) is browser-safe. > The renderer is shimmable but not
   portable as a whole; take `src/acp` and selected `components`, not
   `App.tsx`. > Who has already built a phone-capable web workspace for
   coding agents?
4. Open-world: CloudCLI / claudecodeui (AGPL-3.0, 13.7k★) — React 18 +
   Vite 7 + Express 4 + ws 8; `@uiw/react-codemirror` 4.23 +
   `@codemirror/merge` 6.11 (diff); `@xterm/xterm` 5.5 + `node-pty`
   1.2; `react-markdown` 10 + `remark-gfm` 4 (no WYSIWYG); `chokidar` 4;
   file explorer, editor, terminal, git, "browser sessions"; responsive
   to phone; drives Claude Code, Cursor CLI, Codex directly
   (github.com/siteboon/claudecodeui + its `package.json`, 2026-09-15).
   Happy (MIT, 23.8k★) — Expo/React Native + web + relay + E2E; chat-
   first with files/diffs/terminals; drives Claude Code and Codex
   (github.com/slopus/happy, 2026-09-15). Neither speaks ACP to Goose.
   > The pane stack is settled by precedent; the question is only the
   shell and who owns the spine. > What does compo need from it?
5. compo: Node 26 / pnpm 11 via mise (`mise.toml:1-3`); `mise run serve`
   = Hono backend on `COMPO_PORT` 8000 (`mise.toml` `[tasks.serve]`);
   Vite frontend on 5173 with `host: true`, `allowedHosts:
   [".eel-terrapin.ts.net"]`, `/api` proxied to 8000, preview on 4173
   for `tailscale funnel` (`frontend/vite.config.ts:8-27`); `mise run
   dev` launches the Electron shell (`shell/package.json:8`). The
   tailnet has `hoa-macstudio-2026` (100.127.56.10) and `hoa-phone`
   (iOS, 100.73.1.24) (`tailscale status`, 2026-09-15). > The phone
   already reaches compo's UI; the workspace joins it on the same
   tailnet — no tunnel, no relay, no new auth story beyond Tailscale
   identity plus Goose's secret.

## Inventory — read this session

Goose spine, reachable from a browser:
- `goose serve` flags `cli.rs:853-908`: host, port, tls, cert/key,
  platform, builtins, scheduler, `--roam` ("also expose this server over
  goose roam so paired devices can connect remotely").
- Secret: `goose serve` refuses to start without
  `GOOSE_SERVER__SECRET_KEY` unless `--dangerously-unauthenticated`
  (`cli.rs:42-44,886,1809-1830`); the desktop passes it to the WebSocket
  as `?token=` on the `/acp` URL (`gooseServe.ts:256-258`) — no custom
  header, so a browser could connect directly. The sidecar still
  terminates the WS and injects the token so the phone never holds it;
  `goose serve` stays on loopback, `--host` never changes.
- Roam (`roam.rs:1-16`): identity card, accept-by-key, no bearer token;
  "an accepted peer gets goose's full ACP surface". A second door for
  off-tailnet access later; not needed while the phone is on Tailscale.
- No web UI in tree: no `web` command in `cli.rs`; `commands/term.rs` is
  shell-integration init/log, not a pty server.

Goose desktop, as a parts bin:
- Browser-safe behind a one-method shim: `src/acp/*` touches Electron
  once — `window.electron.getAcpUrl()` (`acpConnection.ts:132`); the
  rest is ACP v1 over `experimental/ws-client`. `@aaif/goose-acp-client`
  generated types are plain TS. The tool-call renderers in `components/`
  that read message content only are candidates; the count below says
  how many are not.
- Electron-bound: 54 files × `window.electron.*`; `preload.ts` 178
  keys; `App.tsx:636-674` routes; `ModelAndProviderContext.tsx:92-140`
  (provider patching — the logic is reusable, the settings calls are
  not).
- Stack to match: Electron 43 / React 19.2 / react-router 8 / Tailwind
  4 (`ui/desktop/package.json`); no editor, terminal or diff dependency.

Pane libraries, with the phone as the constraint:
- **Code — CodeMirror 6.** Replit chose it for their mobile editor,
  "specifically designed with mobile in mind" (replit.com/blog/
  codemirror-mobile, 2021-09-20, fetched 2026-09-15); known open
  issues on iOS tap-to-place (discuss.codemirror.net/t/3345) and
  Android selection (codemirror/dev#645). Monaco is desktop-only in
  practice. `@codemirror/merge` gives the diff pane from the same
  engine (CloudCLI uses it).
- **Markdown — two modes, one engine.** Source: CM6 `@codemirror/
  lang-markdown`. Preview: `react-markdown` + `remark-gfm` +
  `github-markdown-css` (MIT, 8.9k★, generated from GitHub's own CSS,
  seven light/dark themes — github.com/sindresorhus/github-markdown-css,
  2026-09-15). This is how GitHub itself edits markdown (textarea +
  toolbar + Preview tab). WYSIWYG candidates if rich edit is required:
  Milkdown 7.22.1 (ProseMirror + remark, 2026-08-12), MDXEditor 4.2.4
  (564 kB gz) — both a second editor engine; `@latentic/live-markdown`
  is CM6-native WYSIWYG but 1★ (all via strapi.io/eddyter comparisons
  and the repo, 2026-09-15).
- **Terminal — xterm.js 5.5 + node-pty.** Open mobile issues: "limited
  touch support" (xtermjs/xterm.js#5377), no touch copy/paste (#3727),
  predictive keyboard (#2403), iPad hardware Ctrl-C = Enter (#5721).
  Mitigation every phone terminal ships: a key bar (Esc · Tab · Ctrl ·
  ↑↓←→ · paste) above the virtual keyboard, larger font, and a
  server-side session that survives the tab (tmux-style attach), since
  iOS suspends background tabs.
- **Browser — an iframe.** compo's Vite server on :5173 answers with
  no `X-Frame-Options` and no `Content-Security-Policy` (`curl -sI
  localhost:5173`, 2026-09-15, server up) and already allows tailnet
  hosts; the workspace
  embeds `http://hoa-macstudio-2026.<tailnet>:5173` directly, with an
  address bar limited to the project's own ports. Arbitrary sites are
  out (X-Frame-Options); a screenshot-streaming browser is a later
  option, not MVP.
- **Files — a list on the phone, a tree on the desktop**, over the same
  sidecar `fs` API; `chokidar` 4 for the session-written dots.
- **Shell — Vite + PWA manifest** (installable on iOS from Safari
  "Add to Home Screen"); the desktop is the same URL, Electron later if
  a native window earns it.
- **GitHub libraries in scope:** Primer React (the design system;
  primer.style fetched 2026-09-15), `github-markdown-css` (above),
  Octicons. Not GitHub's editor: github.dev / Codespaces web is VS Code
  (Monaco) and does not serve phones.

## Options → pick

Axis: what runs the panes on the phone — a web app we own, an existing
web product, or the Electron fork with a remote build.

| Option | Owns | Trades away |
|---|---|---|
| **A. Web-first workspace** — Vite React SPA + Node sidecar on the Mac (Express/Hono + ws: pty, fs, git, watch; proxies `goose serve` and holds the secret); desktop = the same URL (PWA), phone = the same URL over Tailscale; reuses Goose's `src/acp` and tool-call components behind a small `window.electron` shim | one renderer, one deploy, meets desktop + phone on day one; the pane stack is the proven one; Goose spine untouched (`--host`, secret) | no native window at MVP (no dock icon, no OS file dialogs); a sidecar is a new process to run and keep alive; the Electron plan's `main/native` becomes the sidecar |
| B. Electron fork as planned + a remote web build of the same renderer, sidecar hosting `main/native` | native desktop first; phone later from the same code | two shells to package and test before the phone works; the Electron shim work is not skippable, it is deferred |
| C. Adopt CloudCLI (claudecodeui) and add Goose as a backend | files / editor / terminal / git / phone layout exist today; 13.7k★ community | AGPL-3.0; it drives CLIs directly, so roles, `delegate`, RPI and the Agents tree need a Goose adapter inside its server — building our product inside someone else's shell |
| D. Adopt Happy (mobile-native) and add Goose | best phone UX (Expo, voice, E2E relay); MIT | chat-first, not a pane workspace; relay server in the path; same "Goose adapter inside their server" cost as C |

Pick (amended by the user 2026-09-15): **B — Electron stays the desktop
shell; the same renderer ships as a web build served by the sidecar
for the phone.** Everything below about the sidecar, the panes and the
phone layout holds; only the shell decision moved. Research pick was
A — web-first, one renderer, sidecar on the Mac; Electron deferred. Reasons: it is the only option where the phone works in the
same tranche as the desktop; Goose's spine needs no change to serve it;
the pane stack is the one CloudCLI already proves on phones; and it
keeps roles / RPI / Agents in our client rather than porting them into
an AGPL host. B is A with an extra shell in front of the gate. C and D
are the fallback if the `window.electron` shim over Goose's chat
components proves worse than rewriting chat on `src/acp`.

What this changes (for the plan, not done here):
- `ARCHITECTURE.md`: `main` / `preload` / `main/native` collapse into
  `sidecar/` (Node: pty, fs, git, watch, goose-serve proxy, static
  build); `renderer` is a browser app; the Electron shell becomes an
  optional box marked later. Two invariants survive unchanged (acp is
  the only ACP door; native/sidecar clients never speak ACP).
- Plan tranche 4 → "web workspace": sidecar first, then panes; tasks
  10–16 keep their cards, their confirms move from Electron/vitest to
  vitest + a Playwright run at phone width (`webapp-testing` skill).
- PRD: step 1 (Hub picker) becomes "open the URL; the project is the
  sidecar's cwd"; a new step for the phone: same session from the phone
  shows the chat with the pane rail collapsed to tabs.
- `DESIGN.md` (tranche 4) gets its first real content: the phone frame
  (one pane at a time, tab rail), the key bar, touch targets.

## Scope — in / out / protected

- in: `sidecar/` (Node, in the fork repo beside `ui/`), the SPA, five
  panes (files, code, markdown source+preview, terminal, browser-iframe)
  plus the chat, PWA manifest, Tailscale as the network, compo as the
  first project (`cwd = ~/github/compo`, browser default
  `:5173`, terminal PATH via `mise`).
- out: Electron packaging at MVP; WYSIWYG markdown until source+preview
  is found wanting (second concrete need); arbitrary-site browsing;
  off-tailnet access (roam / funnel are the later doors); native mobile
  app; a relay server.
- protected: `crates/*` untouched by this direction (the spine patches
  in tranche 2 stand); Goose's secret never leaves the Mac; `src/acp`
  stays the only ACP door; **the sidecar is a remote shell on the
  network — Tailscale identity is the gate, `goose serve` stays on
  loopback, and neither is ever behind `tailscale funnel`** (the first
  question the Security specialist asks; answered here).

## Unknowns

- How much of Goose's chat / tool-call `components/` renders in a
  browser behind a `window.electron` shim of ~10 methods, versus
  rewriting chat on `src/acp`? — one afternoon spike; decides A's cost
  and whether C/D re-enter.
- xterm.js on iOS Safari with a key bar: usable for `pnpm test` and
  `git status`, or only for reading? — test on `hoa-phone` in week one.
- compo's Vite server embeds (headers checked); does HMR's own
  WebSocket work inside the iframe from the phone's origin? — cheap;
  reversible.
- Session persistence for the phone: iOS kills background tabs; does
  the sidecar need tmux-style pty attach on day one? — probably yes for
  the terminal, no for chat (Goose holds the session).
- CodeMirror 6 iOS tap-to-place regression status in 6.x current — read
  the changelog before the editor task.

Direction call routed to this session's advisor (first rung); the
three-runtime specialist panel is not needed for a research pick.
