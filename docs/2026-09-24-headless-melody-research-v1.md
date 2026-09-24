# Headless Melody — research map

Dated 2026-09-24. Question as asked: "What if I like the idea of a headless version of [Melody]" → option A: a short PRD now, built after v0.9. PRD: `docs/2026-09-24-headless-melody-prd-v1.md`.

## The surprise (lead finding)

**The desktop can already attach to a `goose serve` it didn't start, but that path has no panes and no phone: the external branch never starts the sidecar.** `GOOSE_EXTERNAL_BACKEND*` / `settings.externalGoosed` (`ui/desktop/src/main.ts:931-1001`) select it; `gooseServeLeases.createExternal` (`:1214`) builds a lease with `sidecarUrl: null, phoneUrl: null` (`ui/desktop/src/gooseServeLeaseRegistry.ts:83-97`); only the local branch calls `startSidecar` (`main.ts:1311-1341`). The CLI and chat are the cheap part. The hard part is keeping the sidecar alive and contained.

## Reframe trail

1. How do we keep Melody running after the app quits? > the desktop already attaches to an external server > what does it lose when it does? Files, Editor, Terminal, Git, the ledger and the phone, all of which live on the sidecar.
2. Is "one Melody" one process today? > no: each `createChat` window gets its own lease, its own `goose serve` and its own sidecar (`main.ts:1105-1342`), sharing one sqlite; closing a window's last attachment kills its server (`gooseServeLeaseRegistry.ts:155-167`) > headless is also where "one Melody" becomes true.
3. Does work that runs with no window count? > no: every ledger writer is in the renderer (`workspace/panes/telemetry/ledger-writer.ts:18-62` → `native/ledger.ts` → `/ledger/append`) > headless work is invisible to T1/T2 until a writer moves out of the renderer.

## Inventory — read this session

- `ui/desktop/src/main.ts:921` — `GENERATED_SECRET`, the `goose serve` token, is minted per app launch
- `ui/desktop/src/main/sidecar.ts:135`, `:104` — `SIDECAR_SECRET`, minted per sidecar start
- `ui/desktop/src/main.ts:1250-1287` — the local server starts with TLS; its certificate fingerprint is taken from that start and pinned for the window
- `ui/desktop/src/main.ts:1155-1240` — the external path pins `certFingerprint` from settings; a failed check offers to turn the external backend off
- `ui/desktop/src/gooseServe.ts:364-372` — `serve … --enable-scheduler`: scheduled routines run inside a window's server, so today they stop when the window closes
- `ui/sidecar/src/fs.ts:30-67` — `requestPath`: the boundary is the spawn cwd's toplevel, or the spawn cwd itself outside any repository; launched on home, the sidecar (and the phone's key) already reaches all of home
- `ARCHITECTURE.md:93`, `:114` — sidecar containment and "the per-launch key its lock"
- `crates/goose-cli/src/cli.rs:853-905` — `goose serve` flags: host, port, TLS cert/key paths, `--enable-scheduler`, `--roam`
- `PRODUCT.md:418` — "durable background workflows" listed After 0.9; plan v3 `:47` excludes cloud and remote workers (headless is local, so not excluded)
- Groundwork: 198 (a run keeps going with no client, done), 200 (reattach, done), 208 (a manager's run starts with no window, M1a), M1b (who Melody is before any window opened her)

## Recorded decisions

- Tailscale is the fence (`ARCHITECTURE.md:114`). Rejected: upstream's `goose serve --roam` p2p remote (`cli.rs:901-905`), because it would be a second remote path around the sidecar's key and containment.
- Headless is local only. Rejected: cloud and multi-machine workers (plan v3 `:47`, `PRODUCT.md:418`).

## Options → pick

**1. What stays running**

| Option | Owns | Trades away |
|---|---|---|
| A. Server and sidecar as one background service; the app attaches to both | panes, phone and CLI all work with the app closed | makes both secrets and the TLS pin durable |
| B. Server only (today's external path, kept alive) | nothing new in the sidecar | no panes, no phone, no ledger with the app closed |
| C. Keep the app running hidden (no dock, login item) | no new process model | still Electron; an app crash or update still kills work |

Pick: A.

**2. The sidecar's reach when nothing is open**

| Option | Owns | Trades away |
|---|---|---|
| A. An allowed-roots list: `~/Melody` plus the repositories you add | the phone reaches only what you named | a list to keep; a new project needs one add |
| B. Rooted at home (today's launch-on-home behaviour, made permanent) | no list | the phone's key reaches all of home, always |
| C. One sidecar per repository | tightest containment | a process and a port per project; the phone switches origins |

Pick: A. Consequence: an `ARCHITECTURE.md` amendment (PRD §Amendment); it also absorbs T2a's second root (`~/Melody`).

**3. Secrets across restarts**

| Option | Owns | Trades away |
|---|---|---|
| A. Durable server and sidecar keys, stored in the macOS Keychain, rotated from Settings | the phone and the CLI survive a restart | a stolen key works until rotated |
| B. Per-start keys, re-handed to clients | nothing stored | the phone needs a new link after every restart |

Pick: A, with **Rotate keys** in Settings and a rotation on every sign-out.

**4. A running turn when the service restarts (update or crash)**

| Option | Owns | Trades away |
|---|---|---|
| A. An update waits for idle, up to a limit, then stops the work and says so | no silent loss | an update can wait |
| B. Stop at once | simple | loses work silently |
| C. Resume after restart | best outcome | needs a durable run, which doesn't exist (198 keeps a run alive, not one that survives a restart) |

Pick: A. C stays out of scope.

## Scope — in / out / protected

- in: `ui/desktop/src/main.ts` (attach instead of spawn), `gooseServeLeaseRegistry.ts`, `main/sidecar.ts`, `gooseServe.ts`, `ui/sidecar/src/{fs,http,index}.ts` (roots list), the updater, a `melody` command, Settings, `ARCHITECTURE.md` §Modules and §Invariants
- out: a ledger writer outside the renderer (a follow-on, see Unknowns); durable runs across a restart; cloud and multi-machine workers; `--roam`; Windows and Linux service managers (macOS first, like the alpha)
- protected: `agent.rs` and `state_machine/` untouched (`ARCHITECTURE.md:119`); the sidecar still binds only loopback and the tailnet, never `tailscale funnel`; `/fs/*` and `/git/*` never reach outside the roots list

## Unknowns

- Ledger lines for headless work (no renderer, no `worker`/`land` events): fold the writer into the sidecar or the server? Cheap to test? no. Reversible? yes. It decides whether T2's numbers count background work.
- One server for all windows: does anything assume a server per window (per-window `GOOSE_WORKING_DIR`, the scheduler, the lease registry)? Cheap to test? yes, by opening two project windows on one external server. Reversible? yes.
- A TLS certificate that survives a service restart without the desktop refusing it (`main.ts:1120-1168`). Cheap to test? yes. Reversible? yes.
- Updating a binary a running service holds (AGENTS.md: never overwrite a live binary). Cheap to test? yes. Reversible? yes.

## Security review of the amendment

FAIL, then PASS after revision; the verdict and what changed are under PRD §Amendment. The lasting finding: Allowed folders can bound the file routes but not Terminal or git hooks, so the phone's Terminal is opt-in (PRD open question 4).
