# Tasks — melody-agent2

Read this before claiming work, and before handing off. Every agent,
every session, every runtime shares this one ledger.

## Ground rules

- **Claim before work.** One task, one agent, one `status:` —
  `todo | doing | blocked | done`. Two agents on one task is a
  collision, not parallelism.
- **A claim that isn't committed doesn't exist.** Claim, commit, then
  work — an agent on another branch or worktree sees only what landed.
  The sweep rides the same rule: done leaves in the landing commit.
- **Append, never rewrite another agent's entry.** `context:` grows by
  accretion. Correct a line by adding the correction beneath it.
- **CARD is why, not how.** A solution word in `card:` skips the plan
  gate — the requirement belongs there, the approach in the plan.
- **CONTEXT cites, never pastes.** Every finding carries `file:line`
  or URL + date. A body pasted here goes stale the next commit.
- **CONFIRM is a command and an expected, never prose.** A check that
  passes on the untouched tree is not a check. Only the agent that ran
  the command marks the task `done`.
- **Blocked names what unblocks it.** No bare `blocked` — the line
  says what is waited on and who owns it. Anything only the user can
  verify is listed as such, never assumed.
- **Done is spent.** A task marked `done` leaves the file in the same
  commit that lands it — this is a work surface, not a ledger of what
  happened. Git holds the history. Last task out → the file goes too.
- **Write the handoff before the session ends.** The file is the
  memory; the session is not.

Paths below are relative to the fork root (this directory once task 1
lands). `file:line` cites are against `aaif-goose/goose@a23a8cd5` and were
re-checked at the fork base `426967d` (v1.51.0, 2026-09-15): all hold;
`summon.rs:1626` is now `:1628`.

## Tasks

### docs/2026-09-15-goose-fork-plan-v1.md

- 2. Build the fork once: `source bin/activate-hermit && cargo build -p goose-cli` and `cd ui/desktop && pnpm install && pnpm run typecheck`.
  - status: doing · agent: claude-session (opus, 2026-09-15) · worker: low
  - card: as the team, know the untouched fork builds so that the first red is ours, not upstream's
  - context:
    - Hermit pins node 24.10.0 / pnpm 10.30.3 / just 1.40.0 (`bin/`); Rust 1.96.1 (`rust-toolchain.toml`)
    - `just run-ui` is the dev loop (`Justfile:87`)
  - confirm: `source bin/activate-hermit && cargo build -p goose-cli && (cd ui/desktop && pnpm install --frozen-lockfile && pnpm run typecheck); echo exit=$?` → `exit=0`

- 3. Add `scripts/check-spine.sh` that exits 1 when `git diff upstream/main --name-only` lists `crates/goose/src/agents/agent.rs` or anything under `crates/goose/src/agents/state_machine/`.
  - status: todo · agent: — · worker: low
  - card: as a reviewer, have the dual-path rule fail mechanically so that no fork commit touches the agent loop by accident
  - context:
    - contract named in `ARCHITECTURE.md` §Invariants, last bullet
    - Goose `AGENTS.md` §Agent Loop Migration is the reason
  - confirm: `bash scripts/check-spine.sh; echo exit=$?` → `spine clean` then `exit=0`; and `touch crates/goose/src/agents/state_machine/.probe && git add -N crates/goose/src/agents/state_machine/.probe && bash scripts/check-spine.sh; echo exit=$?; git reset -q crates/goose/src/agents/state_machine/.probe; rm crates/goose/src/agents/state_machine/.probe` → `exit=1`

- 4. Add `ui/desktop/.dependency-cruiser.cjs` with the three mechanical invariants from `ARCHITECTURE.md` (new dirs never import `@agentclientprotocol/sdk` / `@aaif/goose-acp-client`; `src/{workspace,native}` never import `src/components/**/internal`; `src/native` ↔ `src/acp` forbidden both ways) and a `depcruise` script in `ui/desktop/package.json`.
  - status: todo · agent: — · worker: medium
  - card: as a planner, have every drawn boundary checked so that a task cannot add an undrawn edge
  - context:
    - rules scoped to `src/workspace`, `src/native`, `src/main/native` — upstream's four leaks (`types/extensions.ts`, `recipe/*`, `settings/providers/ProviderGrid.tsx`, `ProviderCatalogPicker.tsx`) stay out of scope
    - the dirs do not exist yet; the config must still parse and report 0 violations on the untouched tree, and 1 violation on a probe file
  - confirm: `cd ui/desktop && pnpm run depcruise; echo exit=$?` → `exit=0`; and `mkdir -p src/workspace && printf "import '@agentclientprotocol/sdk';\n" > src/workspace/.probe.ts && pnpm run depcruise; echo exit=$?; rm -r src/workspace` → `exit=1`

- 5. Add `runtimes: Vec<{provider, model, weight}>` to `AgentMetadata` in `crates/goose/src/agents/platform_extensions/summon.rs`, roll one entry per `delegate` call, and add an optional `exclude_provider` parameter to `delegate`.
  - status: todo · agent: — · worker: high
  - card: as the orchestrator, have each role file name its runtimes and their weights so that role→runtime, the tenth-call backup seat, and fail-over are data, not prompt text (PRODUCT.md §6)
  - context:
    - `AgentMetadata` is `name / description / model` only (`summon.rs:208-214`); `parse_agent_content` copies `model` into `properties` (`:236-239`)
    - `build_recipe_from_agent` sets `goose_provider: params.provider.clone()` only when `model` is present (`:1620-1631`); provider precedence is env > `params.provider` > recipe settings > config > session (`:1809-1838`)
    - precedence to keep: an explicit `delegate(provider:)` still wins over the roll; the roll wins over the parent session's provider
    - the set is trimmed before the roll: the `exclude_provider` entry goes; any entry whose binary does not resolve goes (`SearchPaths`, as `codex_acp.rs:75-77`); if the picked entry fails to spawn or returns quota-exhausted, it goes and the rest is re-rolled — the list is the fail-over order (decided 2026-09-15)
    - `weight: 0` is legal: listed for fail-over only, never rolled; when the trimmed set's weights sum to 0, take the weight-0 entries in file order (this is what `agent_frontmatter_runtimes_fall_through` asserts)
    - each entry's `model` passes through as the ACP `model` config option (`codex_acp.rs:97`); the picked `{provider, model}` rides in the task's `tasks_update` payload so the Agents pane can name it
    - roll seedable via env `GOOSE_RUNTIME_ROLL_SEED` for tests
    - tests beside `test_agent_frontmatter_parsing` (`:2387`): `agent_frontmatter_runtimes_roll_by_weight`, `agent_frontmatter_runtimes_exclude_provider`, `agent_frontmatter_runtimes_fall_through`
    - candidate upstream Ready issue; file it, do not wait on it
  - confirm: `source bin/activate-hermit && cargo test -p goose agent_frontmatter_runtimes -- --nocapture; echo exit=$?` → `test result: ok. 3 passed` then `exit=0`

- 6. Add `crates/goose/src/providers/cursor_acp.rs` (provider `cursor-acp`, binary `cursor-agent`, args `["acp"]`) mirroring `claude_acp.rs`, register it in `providers/mod.rs`, `providers/init.rs`, and `inventory/registrations.rs`.
  - status: todo · agent: — · worker: high
  - card: as every role's backup seat and one advisor seat, run Grok under Goose's permission modes so that the tenth call is gated like the other nine (PRODUCT.md §5: Grok is a Cursor model; `cursor_agent.rs:277-282` runs `--print --force` ungated)
  - context:
    - required, not optional, since 2026-09-15: Cursor Pro is the only Grok subscription here; models `cursor-grok-4.6-{low,medium,high,xhigh}[-fast]`, `cursor-grok-4.5-high` (`cursor-agent models`, 2026-09-15)
    - template: `claude_acp.rs:1-105`; mode mapping at `:66-75` is Claude-specific — map Goose modes to Cursor's ACP session modes as advertised at `session/new`, falling back to no mode set
    - registration pattern: `init.rs:86-89` (`register_with_inventory::<ClaudeAcpProvider>(false, Some(registrations::claude_acp_inventory()))`) and `registrations.rs:246-248` (`acp_inventory(name, binary, true)`)
    - keep `cursor_agent.rs` (print-mode provider) untouched
    - local `~/.local/bin/cursor-agent acp --help` prints "Start the Cursor Agent as an ACP (Agent Client Protocol) server" (2026-09-15); print mode needed `--trust` outside a trusted workspace ("Workspace Trust Required", exit 1) — check whether `acp` mode does too, and pass it if so
    - `~/.local/bin` is not on this shell's PATH; `gooseServe.ts:36` forwards the login-shell PATH — verify it reaches the binary
    - add a unit test `cursor_acp_metadata_names_binary_and_args`
  - confirm: `source bin/activate-hermit && cargo test -p goose cursor_acp -- --nocapture; echo exit=$?` → `test result: ok.` with ≥1 passed, then `exit=0`

- 17. Add `crates/goose/src/providers/agy.rs` (provider `agy`, binary `agy`) cloned from `gemini_cli.rs`, register it in `providers/mod.rs`, `providers/init.rs`, and `inventory/registrations.rs`. Tranche 2, beside tasks 5–6.
  - status: todo · agent: — · worker: high
  - card: as the researcher and the tenth implementer, run on the Google AI Pro subscription so that the highest-context role sits on the cheapest model (PRODUCT.md §6, §18)
  - context:
    - in scope since 2026-09-15: `python scripts/check-reach.py` → `agy: PASS` (plan v1 §Out of scope amended)
    - template: `gemini_cli.rs:106-112` spawns `gemini -m <model> -r <sid> --output-format stream-json --yolo`; research v1 §Inventory: `agy --help` exposes `--output-format stream-json`, `--input-format stream-json`, `--conversation <id>`, `--model`, `--effort` — map `-r` → `--conversation`, confirm the yolo-equivalent flag from `agy --help` before writing
    - known models from `agy models` (2026-09-15): `gemini-3.8-flash-{high,medium,low}`, `gemini-3.7-flash-*`, `gemini-3.6-flash-*`, `gemini-3.1-pro-high`; default `gemini-3.8-flash-high`
    - runs its own tools ungated (print mode); accepted for V0 at implementer weight 1 with the Reviewer gating the diff (user decision 2026-09-15) — surfacing approvals is out of scope (plan v1)
    - `agy` binary at `/opt/homebrew/bin/agy`
    - add a unit test `agy_metadata_names_binary_and_args`
  - confirm: `source bin/activate-hermit && cargo test -p goose agy_metadata -- --nocapture; echo exit=$?` → `test result: ok.` with ≥1 passed, then `exit=0`

- 7. Write `.agents/agents/orchestrator.md` with frontmatter `name: orchestrator`, `description`, `runtimes:` (`claude-acp` / `claude-opus-5` weight 1; `cursor-acp` / `cursor-grok-4.6-high` weight 0 — fail-over only), and a body holding PRODUCT.md §7.1 responsibilities, §19 delegation rules, §21 invariants, the §14.1 gate → specialist routing, and the advisor `exclude_provider` rule, as imperative rules (source: TUICommander `ORCHESTRATOR.md:1-12`, read 2026-09-15 — rewritten, not copied).
  - status: todo · agent: — · worker: medium
  - card: as the user, start an Orchestrate session and get RPI-shaped delegation so that the thesis is testable without UI work
  - context:
    - Goose reads `<cwd>/.agents/agents` (`summon.rs:397-408`); frontmatter parsed by `parse_frontmatter` (`sources.rs:60-67`), unknown keys tolerated — the file parses on stock Goose before task 5 lands
    - the body must tell the orchestrator to call `delegate(source: "<role>")` and never pass `provider:` unless overriding the role file (task 5)
    - advisor calls: pass `exclude_provider: <the provider that produced the artifact under judgment>`; one advisor per gate — the specialist whose field the artifact touches (architect: plan crosses a module, adds a dependency, or touches `crates/*` or packaging; ux: PRD gate, or plan gate for a user-facing task; pm: research → PRD, or anything not in a PRD; security: plan touches `preload`, `main/native`, provider spawn, permission modes, or anything that runs a worker's output), else `advisor`; a second only when split, a third only for an irreversible pick (PRODUCT.md §7.6, §14.1)
    - adaptive RPI per PRODUCT.md §8: tiny → implement; normal → plan, implement, review; unknown → research first
    - the weight-0 entry is data for the session's fail-over (task 11 reads it); `delegate` never rolls the orchestrator
  - confirm: `test -f .agents/agents/orchestrator.md && grep -c '^runtimes:$' .agents/agents/orchestrator.md && grep -q exclude_provider .agents/agents/orchestrator.md && echo ok` → `1` then `ok`

- 8. Write `.agents/agents/{researcher,planner,implementer,reviewer,advisor,advisor-architect,advisor-ux,advisor-pm,advisor-security}.md`, each with `runtimes:` per PRODUCT.md §6 and the artifact template from PRODUCT.md §7 as the required return shape.
  - status: todo · agent: — · worker: medium
  - card: as the orchestrator, delegate to bounded roles that return compact artifacts so that Claude absorbs conclusions, not transcripts (PRODUCT.md §3.4)
  - context:
    - runtimes (2026-09-15): researcher `agy`/`gemini-3.8-flash-high` 9 · `cursor-acp`/`cursor-grok-4.6-medium` 1; planner `codex-acp`/`gpt-6-astra` 9 · `claude-acp`/`claude-opus-5` 1; implementer `claude-acp`/`claude-sonnet-5` 9 · `agy`/`gemini-3.8-flash-high` 1; reviewer `codex-acp`/`gpt-5.6-sol` 9 · `cursor-acp`/`cursor-grok-4.6-high` 1; advisor and the three specialists `claude-acp`/`claude-fable-5-1` 1 · `codex-acp`/`gpt-5.6-sol` 1 · `cursor-acp`/`cursor-grok-4.6-xhigh` 1
    - model ids as `claude-agent-acp` accepts them are unverified (`claude-fable-5-1`, `claude-sonnet-5`, `claude-opus-5` are the API ids) — task 9 confirms; `gpt-6-astra` is in `~/.codex/models_cache.json` (2026-09-15) and passes through `codex-acp` (`codex_acp.rs:97`)
    - implementer must return `BLOCKED` + reason when the plan's assumption fails (PRODUCT.md §7.4); reviewer never fixes (§13); advisor and specialists never edit (§14)
    - specialists (§14.1): same authority and artifact as `advisor`; body = "read first" (architect: `ARCHITECTURE.md`, plus the upstream-steward and packaging questions; ux: `DESIGN.md`, PRD §Journey/§States; pm: `PRODUCT.md`, PRD §Problem/§Criteria/§Scope; security: `ARCHITECTURE.md` §Invariants and the plan's touched paths — trust boundaries, what executes worker output, secrets in env/args, permission-mode mapping per provider, the preload allowlist), the question the field asks, and what it must never do; no `.agents/skills/` yet — added when a body outgrows a page
    - the roll and fail-over are task 5's; until it lands, stock Goose reads `model` only and the orchestrator passes `provider:` explicitly (task 7 body says when)
  - confirm: `ls .agents/agents/*.md | wc -l` → `10`; and `grep -L '^runtimes:' .agents/agents/*.md | wc -l` → `0`

- 9. Run the runtime matrix: from a Goose session in this directory on `claude-acp`, delegate the same one-file task ("add a `--version` line to `scripts/check-spine.sh` help") to implementer on `claude-acp`, `codex-acp`, `cursor-acp`, `agy`, then call `advisor` six times with `exclude_provider` set, and record per run: provider, model, turns, result shape, permission prompts seen, in `docs/2026-09-15-runtime-matrix-v1.md`.
  - status: todo · agent: — · worker: medium
  - card: as the user, see each role×runtime pair work once so that the fork's UI work builds on a proven spine
  - context:
    - needs `codex-acp` installed (`npm i -g @agentclientprotocol/codex-acp`; `codex_acp.rs:37-42`), `claude-agent-acp` (present), `cursor-agent` (present, `~/.local/bin`), `agy` (present), and tasks 5, 6, 17 landed
    - the unknowns this settles: does `delegate(provider: "<acp>")` run `AcpProvider` inside a `SubAgent` session with `max_turns` honoured (research v1 §Unknowns, first); do the Claude model ids pass through `claude-agent-acp`; does the advisor roll respect `exclude_provider` and never repeat the excluded provider
    - print-mode flags seen 2026-09-15 running the same three runtimes by hand: `codex exec` needs `--skip-git-repo-check` outside a git repo; `cursor-agent -p` needs `--trust`; ACP mode may differ — record what each adapter needed
    - use `goose session` CLI, not the desktop, so the result is independent of tranche 4
    - record the subscription each run drew on (PRODUCT.md §5) and any quota message — that is the first fail-over datum
  - confirm: `test -f docs/2026-09-15-runtime-matrix-v1.md && grep -c '^| \(codex-acp\|cursor-acp\|claude-acp\|agy\) |' docs/2026-09-15-runtime-matrix-v1.md` → `4`

- 10. Add `ui/desktop/src/workspace/pane-store.ts` (+ test) holding the layout: chat centre, one optional centre pane, side-panel tabs; opening a second centre pane returns the first to the side panel.
  - status: todo · agent: — · worker: high
  - card: as the user, promote any side-panel tool beside the chat so that code, diff and terminal are one window with the agent (PRD step 8)
  - context:
    - PRD decision 3 (chat + one pane) — waits on the user
    - no ACP imports here (`ARCHITECTURE.md` §Invariants); state only, no React
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/pane-store.test.ts; echo exit=$?` → `exit=0` with ≥4 tests

- 11. Add `ui/desktop/src/workspace/WorkspaceShell.tsx` rendering the pane store around the existing `pair` route chat, and a header with Runtime (Claude · Codex · Cursor · More…) and Mode (Direct · Orchestrate) selectors wired to `src/acp` session config (`provider`) and to loading `orchestrator.md`.
  - status: todo · agent: — · worker: high
  - card: as the user, pick who I talk to and whether it orchestrates so that Direct and Orchestrate are one click apart (PRD steps 2–3, 9)
  - context:
    - PRD decision 1 (Runtime/Mode separate) and 4 (mid-session switch P0) — wait on the user
    - Goose exposes `provider` and `model` as ACP config options (`acp/response_builder.rs:303-317`); the desktop already patches provider per session (`ModelAndProviderContext.tsx:92-140`) — reuse that path, do not add a registry
    - Mode = whether the first prompt loads the orchestrator role; how the role is loaded is a plan decision for this task (recipe vs `load(source:)`)
    - session fail-over (added 2026-09-15): when the primary adapter fails to spawn or returns quota-exhausted, switch the session's `provider` to `orchestrator.md`'s weight-0 `runtimes:` entry with the handoff memo, show the "→ Grok from here" divider (PRD step 9), never roll at session start — the user is talking to this role
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/WorkspaceShell.test.tsx && pnpm run typecheck; echo exit=$?` → `exit=0`

- 12. Add the Files pane (`src/workspace/panes/files/`) with a tree of the session cwd, session-written-file dots, and click → Editor pane; `main/native/fs.ts` watches the cwd.
  - status: todo · agent: — · worker: high
  - card: as the user, see what the agent touched so that I don't alt-tab to check (PRD step 4)
  - context:
    - "written since session start" comes from tool-call rows the chat already renders (external-dispatch tool requests keep their args) — derive, don't re-scan
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/files && pnpm run depcruise; echo exit=$?` → `exit=0`

- 13. Add the Editor pane (`src/workspace/panes/editor/`, CodeMirror 6) with ⌘S save and a reload bar on external change.
  - status: todo · agent: — · worker: high
  - card: as the user, fix a line without leaving the window so that small corrections don't need another tool (PRD step 4, states)
  - context:
    - CodeMirror 6 over monaco: no editor dependency exists upstream; size and Electron packaging favour CM6 (plan §Approach)
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/editor; echo exit=$?` → `exit=0`

- 14. Add the Diff pane (`src/workspace/panes/diff/`): working tree vs HEAD by default, "since session start" as the second base, unified and side-by-side; `main/native/git.ts` runs `git diff`.
  - status: todo · agent: — · worker: high
  - card: as the user, review what changed against a chosen base so that I can judge the agent's work before committing (PRD step 5)
  - context:
    - PRD decision 5 (view-only at V0) — waits on the user
    - "since session start" needs the session's start commit or a stash-free snapshot; approach is this task's plan decision
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/diff; echo exit=$?` → `exit=0`

- 15. Add the Terminal pane (`src/workspace/panes/terminal/`, `@xterm/xterm`) backed by `main/native/pty.ts` (`node-pty`), starting in the session cwd with the login-shell PATH, surviving session end.
  - status: todo · agent: — · worker: high
  - card: as the user, run tests and commands beside the agent so that the loop closes in one window (PRD step 6)
  - context:
    - PATH source: `loginShellPath.ts` already resolves it for goosed — reuse
    - `node-pty` is a native module: add to `forge.config.ts` rebuild/unpack; the packaged app must still start (task 2's typecheck is not enough — add a `pnpm run make` smoke to this task's confirm if CI time allows)
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/terminal && pnpm run typecheck; echo exit=$?` → `exit=0`

- 16. Add the Git pane (`src/workspace/panes/git/`): branch, staged/unstaged lists, stage/unstage, commit box; commit disabled while any tool call is `in_progress`.
  - status: todo · agent: — · worker: high
  - card: as the user, commit the reviewed change without leaving the window so that the walk ends where it started (PRD step 7)
  - context:
    - "tool call in progress" is already known to the chat's tool-call state — subscribe, don't poll git
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/git && pnpm run depcruise; echo exit=$?` → `exit=0`

## Waiting on the user

- `ARCHITECTURE.md` — sign-off deletes `## Bootstrap Status`; until then the map is a proposal and tasks 10–16 plan against a guess.
- tasks 10–16 — the five PRD decisions (2026-09-15 review request): (1) Runtime and Mode as separate controls, no "Goose-native" runtime; (2) agy out of V0; (3) chat + one centre pane; (4) mid-session runtime switch at P0; (5) diff view-only at V0.
- task 9 — the handoff-memo criterion (PRD §Criteria, second) is a manual check: ask "what did we just change?" after a runtime switch and judge the answer.

## Ownership

- **This file owns:** task state — the claim, the 3C body, the check.
- **The plan doc owns:** approach and negative space, and dates the
  change. **`ARCHITECTURE.md` owns:** the boundaries a task may not
  cross.
