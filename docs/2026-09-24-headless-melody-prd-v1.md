# PRD — Headless Melody

Dated 2026-09-24. **v1, draft for the user's approval.** Built after v0.9 (user: option A, 2026-09-24); the plan is written at the A gate. Research, options and picks: `docs/2026-09-24-headless-melody-research-v1.md`. Names and states cite `DESIGN.md`.

## Problem

- Melody stops when the app closes. Each window starts its own server and sidecar and stops them when it closes (`ui/desktop/src/gooseServeLeaseRegistry.ts:155-167`), so work Melody delegated dies with the window, and scheduled routines only run while a window is open (`ui/desktop/src/gooseServe.ts:369`).
- The phone only works while the app is open on the Mac.
- Nothing outside the app can talk to Melody: no script, hook, cron job or other agent.
- The outcome that says it worked: you give Melody a long task, quit the app, and an hour later your phone or `melody status` shows it finished, with nothing lost.

## Journey

1. [Settings › General, the app open] · P0
   - does: turn on **Keep Melody running when the app is closed**
   - rule: if it's on, Melody and the panes' machine access keep running in the background and start again at login; the app becomes a window onto them
   - → [Melody running in the background]; fail(it can't start) → [Settings, the reason and **Retry**, the app keeps working as today]
2. [a turn running] · P0
   - does: quit the app (⌘Q) mid-turn
   - rule: if background is on, the turn and its delegates keep running; the quit doesn't ask; if off, today's behaviour and today's quit prompt
   - → [app closed, work running]
3. [app closed] · P0
   - does: open the app again
   - → [Work column as you left it, the running turn streaming, finished turns there once each (no duplicates)]
4. [app closed] · P0
   - does: open the phone link
   - rule: Files, Editor and Git reach only Allowed folders (step 6); Terminal is a full shell as you, as it is today, so it's offered on the phone only when **Phone Terminal** is on (Settings, off by default)
   - → [the phone workspace, the same sessions and Files]
5. [a terminal] · P0
   - does: `melody status`, `melody sessions`, `melody ask "…"`
   - rule: `ask` sends to Melody's own session and prints her reply; `--no-wait` prints the session and returns at once
   - → [the answer printed, exit 0]; fail(not running) → ["Melody isn't running — open the app or turn on Keep Melody running", exit 1]
6. [Settings › Phone and access] · P0
   - does: add or remove a folder from **Allowed folders** (`~/Melody` is always there and can't be removed)
   - rule: Files, Editor, Git and the ledger reach only these folders and the worktrees Melody made in them; opening a project in the app offers to add it; the list changes only here, on the Mac, never from the phone, the CLI or an agent
   - → [the list saved; a removed folder is closed at once for every open connection, Terminals started in it are ended]
7. [an update ready] · P0
   - does: **Restart to update**
   - rule: if work is running, "Waiting for 2 running turns · Restart now stops them"; it restarts by itself when idle, or after 30 minutes stops them, restarts, and marks each stopped turn "stopped by update"
   - → [updated, running]
8. [Settings › Phone and access] · P0
   - does: **Rotate keys**, or **Sign out** a phone
   - → [the old keys stop working at once: open phone and CLI connections drop, their Terminals end; each phone pairs again from the Mac; the app keeps working]
9. [Settings › General] · P0
   - does: turn **Keep Melody running** off
   - rule: if work is running, confirm "Stop 1 running turn?"
   - → [background stopped; the app back to today's behaviour]

## States

- Desktop: empty → background off: today's app, a one-line hint in Settings; loading → "Connecting to Melody…" while it attaches; partial → Melody running but panes unavailable: chat works, panes show "Machine access stopped · **Restart**"; error → can't reach Melody: the reason, **Retry** and **Start without background** (today's behaviour for this launch)
- Phone: empty → nothing running on the Mac: "Melody isn't running on your Mac"; loading → as today; partial → a folder outside the allowed list: "Not in Allowed folders" with the list; Terminal off: "Phone Terminal is off · turn it on from the Mac"; error → a rotated key or signed-out phone: "Pair again from the Mac"
- CLI: empty → not running: exit 1 and the line in step 5; loading → `ask` prints a spinner to stderr only, never to stdout; partial → `ask` interrupted with Ctrl-C: the turn keeps running, prints the session to follow it with; error → a wrong or rotated key: "Run `melody login` on this Mac", exit 2

## Criteria

- [ ] given background on and a turn with a running delegate, when the app quits, then the delegate still finishes and its reply is in the session when the app reopens, exactly once
- [ ] given background on and the app closed, a scheduled routine runs at its time
- [ ] given the allowed folders `~/Melody` and one repository, a Files, Git or ledger request anywhere else is refused, over the phone and the desktop alike, including through a symlink or a folder named `.worktrees` that Melody didn't make
- [ ] given Phone Terminal off, the phone can open no Terminal; given a key rotated, no request with the old key succeeds and no Terminal it opened is still running
- [ ] given a phone paired, the key it holds is its own, revocable alone, never the service's key
- [ ] given a restart of the background service, the desktop, the phone and the CLI reconnect with no new link, sign-in or trust prompt
- [ ] given an update with work running, no turn is stopped without "stopped by update" on it
- [ ] given `melody ask "…"` in a script, stdout is the reply alone, and the exit code is 0 on a reply, 1 when not running, 2 on auth
- [ ] given background off, the app starts, runs and quits as today: nothing left running after quit
- [ ] given two app windows on two projects, they share one Melody: a session started in one is in the other's list and in her `list_sessions`

## Scope

- out: resuming a turn that was running when the service restarted (no durable runs; research option 4C); ledger lines for work done with no window open (the ledger writer lives in the renderer, a follow-on before T2's numbers can count background work); cloud and multi-machine workers (plan v3 `:47`); upstream's `--roam` p2p (research §Recorded decisions); Windows and Linux; a full-screen terminal app
- protected: the phone path stays behind the tailnet and a key, never public; `agent.rs` and `state_machine/` untouched; background off is exactly today's app

## Amendment

`ARCHITECTURE.md` §Invariants, replacing "the per-launch key its lock" (`:114`) on landing:

"**The sidecar is the only remote shell; Tailscale is its fence, durable keys its lock, and Allowed folders its reach for files** (amended <date>). With background on, the server and the sidecar outlive the app. `goose serve` binds loopback only; every remote request goes through the sidecar, which binds loopback and the tailnet only, refuses a public or wildcard bind, and is never behind `tailscale funnel`. The two service secrets stay separate, random 32-byte values, checked in constant time before any dispatch or WebSocket upgrade on every route but `/health`, `/config` and the static build — `/acp`, `/fs/*`, `/fs/watch`, `/git/*`, `/pty` and `/ledger/*` included — and persist across restarts only in the Mac's secure credential store, never in a plaintext file, a log or browser storage. A phone or a `melody` terminal holds its own revocable credential, paired once from the desktop; rotation or sign-out revokes it at once, drops its streams and ends its Terminals. `/fs/*`, `/git/*` and `/ledger/*` are refused 400 outside the Allowed folders (always `~/Melody`, plus those the user adds) and the worktrees recorded as made in them, checked by realpath at each operation; removing a folder revokes it for open connections and watches at once. Only the desktop, on the user's action, changes the list or the keys — never a phone, a CLI or an agent credential. Allowed folders bound the file routes; they are not a sandbox: Terminal, and git with its hooks, run as the user, which is why Phone Terminal is off unless the user turns it on. The TLS certificate persists across restarts; a changed one needs the desktop to pair again."

Security review (codex `gpt-6-astra`, read-only, 2026-09-24): FAIL on the first draft: Terminal and git can't be contained by folder checks, `/acp` auth could be dropped, rotation was deferred, grants were a UI rule only, and `.worktrees/` siblings were trusted by name. Revised to the text above, then PASS, with per-operation race and git-hook details left to the plan.

## Open questions for the user

1. **Keys** — durable keys that survive restarts, rotated from Settings (recommended), or a new phone link after every restart?
2. **Allowed folders** — a list you manage (recommended), or all of home as when the app opens on home today?
3. **Update wait** — 30 minutes before an update stops running work (recommended), or never stop, only notify?
4. **Phone Terminal** — off until you turn it on in Settings (recommended: Terminal is a full shell as you, which Allowed folders can't contain), or on as today?
5. **Default** — background off until you turn it on (recommended for the first release), or on from first run?
