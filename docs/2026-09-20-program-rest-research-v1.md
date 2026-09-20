# The rest of the program — research map

Dated 2026-09-20. Question as asked: "Research and plan out the rest" (after "How far are
we along the plan??" — tranche 7 at 21/25, tranche 8 at 5/5).

## The surprise (lead finding)

**Nothing left is blocked on design; almost everything left is blocked on two
environment facts — a live Claude seat and a red Rust gate — and the four open tasks
already carry the right shape.** The product ladder (`PRODUCT.md` §12) has one tier
left, V1, and its pieces are mostly landed as surfaces (Agents pane, RPI strip, plan gate,
Review pane, Runs inbox); what is missing is the spine behind three of them, and that
work needs a build that has been red since the 1.98.1 move and live seats for proof runs.

## Reframe trail

1. "what is left in the plan?" > tranche 7 = 4 tasks, all gated on a live seat
   (`tasks.md:93-124`) > "what is left in the *program*?"
2. "what is left in the program?" > `PRODUCT.md:416-418`: V0 and V0.5 landed, V1 is
   "roles exercised end-to-end in the UI"; its six items are half surfaces already built
   (Agents pane task 28, RPI strip 29, plan gate 79/90, Review pane 70) and half spine
   gaps every plan since 09-15 has named out of scope (approval forwarding to children,
   `waiting` with no producer, fail-over ownership) > "which gaps are ours to close, and
   what gates them?"
3. "what gates them?" > `cargo clippy -D warnings` red on 24 pre-existing lints in
   `agents/*` (`tasks.md:127`) — paths `scripts/check-spine.sh:13-14` forbids the fork
   from editing, so the lints cannot be fixed in-fork; the gate must be scoped, not the
   lints > the build-health tranche is the first move, and it is headless
4. "and the mockup?" > tranche 8 landed the Studio *theme*; the plan's own revision
   names two board behaviours not built (idle tabs icon + kind, the file line's amber
   bar) and three cheap unknowns (vibrancy under white, `tnum`, MCP apps under light)
   (`docs/2026-09-18-studio-theme-plan-v1.md:55`, research `:141-150`) — all waiting on
   one user look at Light first (`tasks.md` §Waiting, "Tranche 8 landed")

## Inventory — read this session

- `tasks.md:93-124` — open: 88 doing (walk needs a live seat), 89 doing (same), 93 todo
  (needs a live turn), 96 todo (live Hard runs; `rpi strip` walk red on main at
  'Research active' before any tranche-7 change, `:121`); 33 blocked on the user
  (`:53-59`).
- `tasks.md:127` — `just test-full` red at line one; chromium project needs Databricks;
  `phone` spec needs the web build on :3285; the Claude seat hit its monthly spend limit.
- `Justfile:12-13`, `:222-223` — clippy is `--all-targets -- -D warnings` over the whole
  workspace in both `test` and `test-full`; `:204-207` — `test-light` already carries the
  `RUST SKIPPED` marker pattern for a cargo line that cannot run.
- `scripts/check-spine.sh:13-14` — `agents/agent.rs` and `agents/state_machine/*` are
  deny-listed for the fork; the 24 lints live under `agents/*`.
- `PRODUCT.md:405-418` — Should and Could rows mostly marked landed; V1 = RPI-aware
  delegation, review loops, task status, worker transcript navigation, summary handoffs,
  plan acceptance/revision UX; Future stays Future.
- `docs/2026-09-15-goose-spine-bridge-plan-v1.md:95-116` — out of scope then, still
  open now: approval forwarding to delegated children (every child runs Auto), quota /
  spawn-failure classification beyond task 64's one re-roll, agy permission gating.
- `PRODUCT.md:409` — `waiting` has no producer; a worker row starts at `running`.
- `docs/2026-09-18-ux-parity-plan-v1.md:49-55` — a spine plan gate is "the named
  escalation if a live walk shows the model overrunning more than once in ten runs" —
  task 96 decides it; nothing to plan until 96 runs.
- `docs/2026-09-18-studio-theme-plan-v1.md:55`, `-research-v1.md:141-150` — not built:
  idle tabs icon + kind, amber file-line bar; unknowns: vibrancy under white, `tnum`,
  MCP apps under light — each "cheap to test, reversible".
- `ARCHITECTURE.md:5-23` — §Bootstrap Status still reads "Proposal, not a description of
  implemented code … boxes marked (new) do not exist yet"; they all exist. Sign-off
  deletes it (`tasks.md` §Waiting); `DESIGN.md:208-215` — six open decisions, two
  resolved 2026-09-18, four waiting on a user test (runtime colour, Esc, phone breakpoint,
  dark canvas off macOS).
- `tasks.md` §Waiting, "Worker routing evidence (2026-09-18)" plus this session: 8/8 and
  9/9 haiku diffs needed corrections; three sonnet workers stalled on task 83 without a
  line (the Sonnet endpoint timing out) and the session built it — the routing table in
  `AGENTS.md` §Model routing has not been revised on this evidence.
- `tasks.md` §Waiting, "Walk launch hang (2026-09-19)" — `~/.skip-forge-system-check`
  created in the user's home; `editor-pane.spec.ts:8-25` still moves HOME (the Welcome
  screen on main, as the diff-pane walk was).

## Recorded decisions

- Claude-first spine, `claude-code` + the bridge, then ACP workers — rejected: B (repair
  as `chatgpt_codex` orchestrator), C (sidecar task engine) (user 2026-09-15 20:10,
  `tasks.md` §Waiting "Decided").
- Compose upstream, add nothing — rejected: `cmdk`, a context-menu package, copies of
  upstream components (`docs/2026-09-18-ux-parity-plan-v1.md:33-40`, The Upstream Rule).
- Studio is Light, not a fourth theme; Monokai and Aura byte-for-byte
  (`docs/2026-09-18-studio-theme-plan-v1.md` decision 1, approved 2026-09-18).
- Task 33 parked until the parity fixes prove out in use (user 2026-09-16).

## Options → pick

| Option | Owns | Trades away |
|---|---|---|
| A. Wait for the seat, then finish tranche 7 as written | the four open tasks, no new plan | every headless day until the seat returns; the red gate stays red |
| B. Build health first (headless), then the seat-gated closeout, then V1 by research | a green `test-full`, a routing rule that matches the evidence, the closeout the moment a seat answers, V1 planned on facts from the closeout (96's overrun count, 89's live card) | starts V1 later than a plan written today would |
| C. Plan V1 now from the 09-15 spine research | the biggest tier moves first | plans spine work against a build that cannot run and proofs that cannot be taken; re-derives what 96 and 89 will measure |
| D. Studio finish first | the mockup's last two behaviours | works ahead of the one user look the plan asked for |

Pick: **B**, as four tranches walked one at a time — 9 build health (headless, now),
10 seat-gated closeout (the four open tasks plus the two walks it proves, the moment a
seat answers), 11 Studio finish (after the user's look at Light), 12 V1 spine (its own
research, after 10 supplies the overrun count and the live approve card).
- Consequence: nothing in V1 is planned before tranche 10 measures it; the gate that
  decides a spine plan gate is task 96, not a guess.
- Consequence: tranche 9 changes rules (`AGENTS.md` routing, the clippy scope) — each
  takes an advisor per lens before it lands, per AGENTS.md.

## Scope — in / out / protected

- in (tranche 9): `Justfile` (clippy scope, hermit Node on the desktop recipes, a
  `chromium`-skip note, the forge flag's recipe), `ui/desktop/tests/e2e/editor-pane.spec.ts`
  (GOOSE_TEST_DIR), `AGENTS.md` §Model routing (one dated row), `ARCHITECTURE.md`
  §Bootstrap Status (a sign-off-ready draft, deleted only on the user's word), `tasks.md`
  §Waiting (the hand-check backlog re-listed for the user).
- out: cloud, remote workers, iOS/Android shells, persistent agents, memory
  (`PRODUCT.md` Future); any edit under `agents/agent.rs` or `state_machine/`; fixing
  upstream's 24 lints (protected paths — the gate is scoped instead); a fourth theme.
- protected: every walk in `tests/e2e` green one at a time on main; Monokai and Aura
  colours; The Upstream Rule; the spine check.

## Unknowns

- Whether scoping clippy to the fork-touched crates and files still catches the fork's
  own lints — cheap to test? yes (`cargo clippy -p goose-cli` and the three fork files by
  path); reversible? yes.
- Whether the Sonnet stalls were the endpoint or the worktree isolation — cheap to test?
  yes (one worker on a trivial task once the endpoint answers); reversible? yes.
- Whether a live seat returns this cycle or next month — not ours to test; tranche 10
  waits, tranche 9 does not.
- What 96's ten runs show (≤ 1 overrun → no spine gate; > 1 → a spine task) — decides
  tranche 12's first task; not knowable before the seat.
