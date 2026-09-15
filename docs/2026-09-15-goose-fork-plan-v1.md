# Goose fork — plan

<!-- Downstream of docs/2026-09-15-goose-fork-research-v1.md (pick B,
     revised) and docs/2026-09-15-workspace-prd-v1.md; upstream of
     implement. The task list lives in tasks.md; this doc keeps the
     approach and the negative space. -->

Dated 2026-09-15. Companion: research v1 §Options (pick B), workspace
PRD v1, `ARCHITECTURE.md` (bootstrap proposal). Ships the fork
scaffold, the two spine patches, the role files, and the V0 workspace
> one PR per tranche.

## Approach

- **Tranche 1 — fork scaffold.** melody-agent2 becomes the fork root:
  `aaif-goose/goose@main` as `upstream`, our `PRODUCT.md` /
  `ARCHITECTURE.md` / `docs/` / `tasks.md` beside Goose's own files.
  Boundary contracts land with the scaffold (`dependency-cruiser` in
  `ui/desktop`, `scripts/check-spine.sh`) so every later task is
  checked against `ARCHITECTURE.md` from its first commit.
- **Tranche 2 — spine patches.** Three files in `crates/goose`, each a
  candidate upstream Ready issue: `runtimes` in agent frontmatter — a
  weighted `{provider, model, weight}` list rolled once per
  `delegate`, unavailable or quota-exhausted runtimes dropped before
  the roll, plus `exclude_provider` on `delegate` (`summon.rs:208-214`,
  `:779-860`, `:1626`); `providers/cursor_acp.rs` mirroring
  `claude_acp.rs` (local `cursor-agent acp` confirmed — this is the
  Grok runtime, Cursor Pro being the only Grok subscription here);
  and `providers/agy.rs` cloned from `gemini_cli.rs` (agy print mode
  passed `check-reach.py` 2026-09-15, reversing the 2026-09-11 park).
  Plus the three registration points those providers need
  (`providers/mod.rs`, `providers/init.rs`,
  `inventory/registrations.rs`); `agent.rs` and `state_machine/`
  untouched, nothing else in `crates/`. Amended 2026-09-15 from two
  patches: the role map moved (PRODUCT.md §6), agy became a
  first-class runtime, and the 10 % backup seat needed a mechanism
  in data, not prompt text.
- **Tranche 3 — roles.** Ten files in `.agents/agents/` — the six
  roles and four Advisor specialists (architect, UX, PM, security;
  PRODUCT.md §7.7) — each with `runtimes:`; the orchestrator's body carries
  TUICommander's invariants rewritten for Goose (`ORCHESTRATOR.md:1-12`,
  read 2026-09-15), the gate → specialist routing, and the
  `exclude_provider` rule for advisor calls. The runtime matrix (role
  × provider, one task) is the acceptance run and is recorded in
  `docs/`. Amended 2026-09-15 from six files, then to ten.
- **Tranche 4 — workspace shell.** `ui/desktop/src/workspace/` pane
  store + header (Runtime, Mode) hosting the existing chat; then one
  pane per task: files, editor, diff, terminal, git. `main/native`
  grows one handler per pane that needs main (pty, fs watch, git).
  Editor is CodeMirror 6 (smaller than monaco; Goose already ships
  no editor, so no migration). Terminal is `@xterm/xterm` +
  `node-pty`.
- **Tranche 5 (V0.5, later plan).** Agents tree, RPI strip, artifact
  pane, browser, markdown — planned after tranche 4 is in use.

## Out of scope

- ~~agy provider~~ — in scope since 2026-09-15 (tranche 2); agy's
  print mode unparked (`check-reach.py` PASS). It runs ungated
  (`--yolo`-class); accepted for V0 at one implementation in ten, the
  Reviewer gating the diff.
- Permission gating for agy's own tool calls (would need the provider
  to surface approvals — bigger patch; revisit if agy's weight rises).
- Accept/reject per hunk, worktree-per-task, mobile, cloud,
  scheduling (PRD §Scope; PRODUCT.md §11 Should / §34 Future).
- Any edit to `crates/goose/src/agents/agent.rs` or `state_machine/`
  (dual-path rule, Goose `AGENTS.md`).
- A second provider registry in the renderer; the runtime selector
  drives the ACP `provider` config option (`ARCHITECTURE.md`
  §Invariants).
- Rewriting upstream `components/`; the shell composes them.

## Tasks

Moved to `tasks.md` under `### docs/2026-09-15-goose-fork-plan-v1.md`
on 2026-09-15. Tranches 1–3 (tasks 1–9, 17) are approved by the user's
"fork Goose" decision and "start tasks"; the 2026-09-15 role-map
amendment (tasks 5–9, 17 rewritten) was decided in conversation the
same day; tranche 4 (tasks 10–16) waits on the five PRD decisions
listed in `tasks.md` §Waiting on the user.
