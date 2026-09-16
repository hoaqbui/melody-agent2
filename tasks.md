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
  This project is `testing: light` (PRODUCT.md §8): one smoke per task,
  a unit test only where the change is pure logic; no suites.
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

- 5. Add `runtimes: Vec<{provider, model, weight}>` to `AgentMetadata` in `crates/goose/src/agents/platform_extensions/summon.rs`, roll one entry per `delegate` call, and add an optional `exclude_provider` parameter to `delegate`.
  - status: blocked · agent: — · worker: high
  - blocked: necessary but not sufficient — after this lands an Orchestrate session on `claude-acp` still has no `delegate` (ACP drops Goose tools, `acp/provider.rs:820-825`; research v1 addendum, evening). Unblocks: the user picks the orchestrator path (§Waiting on the user); if repair (ii) is chosen, this task and the bridge land together — owner: user
  - unblocks (2026-09-15 20:40, plan spine-bridge v1 approved): after task 24 records `reached child: yes`; the bridge (tasks 22–23) is what gives `claude-code` `delegate`
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
  - status: doing · agent: claude-session-opus (20:01, worker via claude -p haiku) · worker: high
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

- 8. Write `.agents/agents/{researcher,planner,implementer,reviewer,advisor,advisor-architect,advisor-ux,advisor-pm,advisor-security}.md`, each with `runtimes:` per PRODUCT.md §6 and the artifact template from PRODUCT.md §7 as the required return shape.
  - status: blocked · agent: — · worker: medium
  - blocked: role bodies never reach an ACP worker — the recipe instructions become a system prompt ACP ignores (`subagent_handler.rs:134,167`, `acp/provider.rs:820`). Unblocks: repair (i) — fold the system prompt into the first ACP prompt — or the user accepting that ACP workers run on task instructions alone — owner: user
  - unblocks (2026-09-15 20:40, plan spine-bridge v1 approved): task 21 folds the role body into the ACP child's first prompt; write the files once 24 records `reached child: yes`
  - card: as the orchestrator, delegate to bounded roles that return compact artifacts so that Claude absorbs conclusions, not transcripts (PRODUCT.md §3.4)
  - context:
    - runtimes (2026-09-15): researcher `agy`/`gemini-3.8-flash-high` 9 · `cursor-acp`/`cursor-grok-4.6-medium` 1; planner `codex-acp`/`gpt-6-astra` 9 · `claude-acp`/`claude-opus-5` 1; implementer `claude-acp`/`claude-sonnet-5` 9 · `agy`/`gemini-3.8-flash-high` 1; reviewer `codex-acp`/`gpt-5.6-sol` 9 · `cursor-acp`/`cursor-grok-4.6-high` 1; advisor and the three specialists `claude-acp`/`claude-fable-5-1` 1 · `codex-acp`/`gpt-5.6-sol` 1 · `cursor-acp`/`cursor-grok-4.6-xhigh` 1
    - model ids as `claude-agent-acp` accepts them are unverified (`claude-fable-5-1`, `claude-sonnet-5`, `claude-opus-5` are the API ids) — task 9 confirms; `gpt-6-astra` is in `~/.codex/models_cache.json` (2026-09-15) and passes through `codex-acp` (`codex_acp.rs:97`)
    - implementer must return `BLOCKED` + reason when the plan's assumption fails (PRODUCT.md §7.4); reviewer never fixes (§7.5); advisor and specialists never edit (§7.6)
    - specialists (§7.7): same authority and artifact as `advisor`; body = "read first" (architect: `ARCHITECTURE.md`, plus the upstream-steward and packaging questions; ux: `DESIGN.md`, PRD §Journey/§States; pm: `PRODUCT.md`, PRD §Problem/§Criteria/§Scope; security: `ARCHITECTURE.md` §Invariants and the plan's touched paths — trust boundaries, what executes worker output, secrets in env/args, permission-mode mapping per provider, the preload allowlist), the question the field asks, and what it must never do; no `.agents/skills/` yet — added when a body outgrows a page
    - the roll and fail-over are task 5's; until it lands, stock Goose reads `model` only and the orchestrator passes `provider:` explicitly (task 7 body says when)
  - confirm: `ls .agents/agents/*.md | wc -l` → `10`; and `grep -L '^runtimes:' .agents/agents/*.md | wc -l` → `0`

- 9. Run the runtime matrix: from a Goose session in this directory on `claude-acp`, delegate the same one-file task ("add a `--version` line to `scripts/check-spine.sh` help") to implementer on `claude-acp`, `codex-acp`, `cursor-acp`, `agy`, then call `advisor` six times with `exclude_provider` set, and record per run: provider, model, turns, result shape, permission prompts seen, in `docs/2026-09-15-runtime-matrix-v1.md`.
  - status: blocked · agent: — · worker: medium
  - blocked: no subscription orchestrator in tree can call `delegate` except `chatgpt_codex` (research v1 addendum, evening). Unblocks: the user's pick — run the matrix from a `chatgpt_codex` session as the interim proof, or wait for repair (ii) — owner: user
  - unblocks (2026-09-15 20:40, plan spine-bridge v1 approved): tasks 22–24 give `claude-code` `delegate` via the session bridge; run the matrix with the orchestrator on `claude-code` after 24
  - card: as the user, see each role×runtime pair work once so that the fork's UI work builds on a proven spine
  - context:
    - needs `codex-acp` installed (`npm i -g @agentclientprotocol/codex-acp`; `codex_acp.rs:37-42`), `claude-agent-acp` (present), `cursor-agent` (present, `~/.local/bin`), `agy` (present), and tasks 5, 6, 17 landed
    - the unknowns this settles: does `delegate(provider: "<acp>")` run `AcpProvider` inside a `SubAgent` session with `max_turns` honoured (research v1 §Unknowns, first); do the Claude model ids pass through `claude-agent-acp`; does the advisor roll respect `exclude_provider` and never repeat the excluded provider
    - print-mode flags seen 2026-09-15 running the same three runtimes by hand: `codex exec` needs `--skip-git-repo-check` outside a git repo; `cursor-agent -p` needs `--trust`; ACP mode may differ — record what each adapter needed
    - use `goose session` CLI, not the desktop, so the result is independent of tranche 4
    - record the subscription each run drew on (PRODUCT.md §5) and any quota message — that is the first fail-over datum
  - confirm: `test -f docs/2026-09-15-runtime-matrix-v1.md && grep -c '^| \(codex-acp\|cursor-acp\|claude-acp\|agy\) |' docs/2026-09-15-runtime-matrix-v1.md` → `4`

- 11. Add `ui/desktop/src/workspace/WorkspaceShell.tsx` rendering the pane store around the existing `pair` route chat, and a header with Runtime (Claude · Codex · Cursor · agy · More…) and Mode (Direct · Orchestrate) selectors wired to `src/acp` session config (`provider`) and to loading `orchestrator.md`.
  - status: todo · agent: — · worker: high
  - card: as the user, pick who I talk to and whether it orchestrates so that Direct and Orchestrate are one click apart (PRD steps 2–3, 9)
  - context:
    - PRD decisions 1 (Runtime/Mode separate) and 4 (mid-session switch P0) — approved 2026-09-15; decision 2 ("agy out of V0") superseded by the role map: the Runtime list is Claude · Codex · Cursor · agy · More…
    - Goose exposes `provider` and `model` as ACP config options (`acp/response_builder.rs:303-317`); the desktop already patches provider per session (`ModelAndProviderContext.tsx:92-140`) — reuse that path, do not add a registry
    - Mode = whether the first prompt loads the orchestrator role; how the role is loaded is a plan decision for this task (recipe vs `load(source:)`)
    - session fail-over (added 2026-09-15): when the primary adapter fails to spawn or returns quota-exhausted, switch the session's `provider` to `orchestrator.md`'s weight-0 `runtimes:` entry with the handoff memo, show the "→ Grok from here" divider (PRD step 9), never roll at session start — the user is talking to this role
  - confirm: `cd ui/desktop && pnpm run typecheck && pnpm exec playwright test -g "workspace shell"; echo exit=$?` → `exit=0` (one Playwright walk of PRD steps 2–3: pick Runtime and Mode, send a prompt, see a reply)

- 12. Add the Files pane (`src/workspace/panes/files/`) with a tree of the session cwd (a drill-down list at phone width), session-written-file dots, and click → Editor pane; `ui/sidecar/src/fs.ts` serves reads and watches the cwd (`chokidar`).
  - status: todo · agent: — · worker: high
  - card: as the user, see what the agent touched so that I don't alt-tab to check (PRD step 4)
  - context:
    - "written since session start" comes from tool-call rows the chat already renders (external-dispatch tool requests keep their args) — derive, don't re-scan
    - needs task 18 (sidecar) landed; the pane talks to `src/native/fs.ts`, never to Electron
  - confirm: `cd ui/desktop && pnpm run typecheck && pnpm run depcruise && pnpm exec playwright test -g "files pane"; echo exit=$?` → `exit=0` (PRD step 4: open Files, see the cwd tree, click a file → editor opens)

- 13. Add the Editor pane (`src/workspace/panes/editor/`, CodeMirror 6) with ⌘S save, a reload bar on external change, and for `.md` files a Preview toggle (`react-markdown` + `remark-gfm` + `github-markdown-css`).
  - status: todo · agent: — · worker: high
  - card: as the user, fix a line without leaving the window so that small corrections don't need another tool (PRD step 4, states)
  - context:
    - CodeMirror 6 over monaco: no editor dependency exists upstream; size, Electron packaging and the phone favour CM6 (plan §Approach; research web-workspace §Inventory)
    - markdown is source + preview at V0 — GitHub's own model; WYSIWYG is a second engine and waits for a second concrete need (user decision 2026-09-15)
  - confirm: `cd ui/desktop && pnpm run typecheck && pnpm exec playwright test -g "editor pane"; echo exit=$?` → `exit=0` (open a file, type, ⌘S, file on disk changed)

- 14. Add the Diff pane (`src/workspace/panes/diff/`, `@codemirror/merge`): working tree vs HEAD by default, "since session start" as the second base, unified and side-by-side; `ui/sidecar/src/git.ts` runs `git diff`.
  - status: todo · agent: — · worker: high
  - card: as the user, review what changed against a chosen base so that I can judge the agent's work before committing (PRD step 5)
  - context:
    - PRD decision 5 (view-only at V0) — approved 2026-09-15
    - "since session start" needs the session's start commit or a stash-free snapshot; approach is this task's plan decision
  - confirm: `cd ui/desktop && pnpm run typecheck && pnpm exec playwright test -g "diff pane"; echo exit=$?` → `exit=0` (PRD step 5: a modified file shows in the list; unified and side-by-side render)

- 15. Add the Terminal pane (`src/workspace/panes/terminal/`, `@xterm/xterm`) backed by `ui/sidecar/src/pty.ts` (`node-pty`), starting in the session cwd with the login-shell PATH, surviving session end and client disconnect (reattach by session id), with a key bar (Esc · Tab · Ctrl · arrows · paste) at phone width.
  - status: todo · agent: — · worker: high
  - card: as the user, run tests and commands beside the agent so that the loop closes in one window (PRD step 6)
  - context:
    - PATH source: `loginShellPath.ts` already resolves it for goosed — reuse
    - `node-pty` is a native module in the *sidecar*, not the renderer bundle; the packaged Electron app must bundle and start the sidecar (`forge.config.ts` extraResource) — add a `pnpm run make` smoke to task 18's confirm if CI time allows
    - xterm.js touch gaps on iOS (xtermjs/xterm.js#5377, #3727, #2403) are why the key bar and server-side reattach are in this task, not later
  - confirm: `cd ui/desktop && pnpm run typecheck && pnpm exec playwright test -g "terminal pane"; echo exit=$?` → `exit=0` (PRD step 6: shell opens in the session cwd, `pwd` prints it)

- 16. Add the Git pane (`src/workspace/panes/git/`): branch, staged/unstaged lists, stage/unstage, commit box; commit disabled while any tool call is `in_progress`; git commands run in `ui/sidecar/src/git.ts`.
  - status: todo · agent: — · worker: high
  - card: as the user, commit the reviewed change without leaving the window so that the walk ends where it started (PRD step 7)
  - context:
    - "tool call in progress" is already known to the chat's tool-call state — subscribe, don't poll git
  - confirm: `cd ui/desktop && pnpm run typecheck && pnpm run depcruise && pnpm exec playwright test -g "git pane"; echo exit=$?` → `exit=0` (PRD step 7: branch shown, stage a file, commit, Diff vs HEAD empty)

- 18. Add `ui/sidecar/` (Node, TypeScript; add `'sidecar'` to `packages` in `ui/pnpm-workspace.yaml`): WebSocket + HTTP service binding the tailnet interface, with `pty` (node-pty; sessions keyed by id, reattachable), `fs` (read, write, list, `chokidar` watch → events), `git` (status, diff, stage, unstage, commit), a `/acp` WebSocket proxy to `goose serve` on loopback that injects `?token=` from `GOOSE_SERVER__SECRET_KEY`, and static serving of the web build; Electron `main` spawns it beside `goose serve`.
  - status: todo · agent: — · worker: high
  - card: as the user on either the desktop or the phone, reach the same shell, files and git through one process so that the panes have one code path and the Goose secret never leaves the Mac (research web-workspace §Options B; ARCHITECTURE.md §Invariants)
  - context:
    - `goose serve` refuses to start without `GOOSE_SERVER__SECRET_KEY` (`crates/goose-cli/src/cli.rs:1809-1830`); the desktop passes it as `?token=` on the `/acp` URL (`ui/desktop/src/gooseServe.ts:256-258`) — the proxy adds it server-side, the client URL carries none
    - bind: the Tailscale interface (`tailscale ip -4`) or loopback, never `0.0.0.0`; refuse to start on a public address; never behind `tailscale funnel` (Security specialist's first question, answered in the research §Scope)
    - `loginShellPath.ts` already resolves the login-shell PATH for goosed — the pty inherits it; for compo that PATH must reach `mise` shims
    - the sidecar is where `node-pty` lives; the renderer bundle stays free of native modules (task 4's electron/node ban)
    - packaging: `forge.config.ts` bundles the sidecar as an extra resource; `pnpm run make` must still produce a starting app
    - the sidecar gets its own `.dependency-cruiser.cjs` line: `src/**` never imports `@agentclientprotocol/sdk` or `@aaif/goose-acp-client` (it proxies bytes, it does not speak ACP) — `ui/desktop`'s config cannot see a sibling package
  - confirm: `cd ui/sidecar && pnpm run typecheck && pnpm run build; echo build=$?` → `build=0`; then `(node dist/index.js --bind 127.0.0.1 --port 3285 &) ; sleep 2; curl -sf http://127.0.0.1:3285/health; echo; curl -sf -X POST http://127.0.0.1:3285/fs/list -H 'content-type: application/json' -d '{"path":"."}' | head -c 80; echo; pkill -f 'dist/index.js --bind 127.0.0.1 --port 3285'; echo exit=$?` → `ok`, a JSON listing, `exit=0`

- 19. Add the browser build of the renderer: `ui/desktop/vite.web.config.mts` (beside `vite.renderer.config.mts`; Forge + Vite is the existing setup) → `dist-web/`, `src/shims/electron-web.ts` implementing the `window.electron` methods the reused components call (`getSetting`/`setSetting`, `on`/`off`, `logInfo`, `openExternal`, `getAcpUrl` → the sidecar's `/acp`, `platform`, `getConfig`) over the sidecar's HTTP, a `pnpm run build:web` script, and a PWA manifest. **First task of tranche 4 — the spike that decides it.**
  - status: todo · agent: — · worker: high
  - card: as the user on the phone, open the workspace URL and get the desktop's chat so that one renderer serves both shells (PRD step 13; research web-workspace §Unknowns, second)
  - context:
    - `src/acp` has no `electron` or `node:` import today (grep 2026-09-15), so task 4's ban is 0-violation on the untouched tree; 54 of 373 renderer files call `window.electron.*`; the top methods by count are `getSetting` 20, `setSetting` 18, `on` 16, `off` 16, `logInfo` 13, `openExternal` 9, `platform` 7 (research web-workspace §Reframe 3) — shim those, stub the rest to no-ops that log once
    - `src/acp/acpConnection.ts:132` is the one ACP touchpoint: `getAcpUrl()` returns the sidecar's `/acp` URL (no token)
    - if the chat and tool-call components do not render in Chromium behind the shim within the task's budget, return `BLOCKED` naming the components — that reopens the research's options C/D, not a bigger shim
    - light tier: the confirm is the walk, not a suite
  - confirm: `cd ui/desktop && pnpm run build:web && pnpm exec playwright test -g "web build" --project=chromium; echo exit=$?` → `exit=0` (Chromium loads `dist-web/` against a running sidecar + `goose serve`, opens a session, sends a prompt, sees a reply)

- 20. Add the phone layout to `src/workspace/`: below 768 px the pane store exposes one visible pane behind a tab rail (chat · Files · Editor · Diff · Terminal · Git), the terminal key bar from task 15 is shown, and reconnect-on-foreground reattaches the pty and refreshes the chat; Playwright gets a `phone` project (390 × 844, touch, iPhone UA).
  - status: todo · agent: — · worker: medium
  - card: as the user on the phone, check what the agent did and nudge it from wherever I am so that the walk does not wait for the desk (PRD step 13, criteria 7–8)
  - context:
    - iOS Safari suspends background tabs: the WS drops; on `visibilitychange` → visible, reconnect to the sidecar and reattach the pty by id (task 15/18), then pull the session's messages since the last seen id via `src/acp`
    - CodeMirror 6 iOS tap-to-place (discuss.codemirror.net/t/3345) — read the current changelog before relying on editing; reading and small edits are the bar at V0
    - test on `hoa-phone` over the tailnet (`tailscale status`, 2026-09-15) — the Playwright phone project is the mechanical check, the phone is the manual one (§Waiting on the user)
  - confirm: `cd ui/desktop && pnpm run typecheck && pnpm exec playwright test -g "phone" --project=phone; echo exit=$?` → `exit=0` (at 390 px: chat first; tap Files → tree; tap a file → editor; tap Terminal → key bar visible; `pwd` prints the cwd)

### docs/2026-09-15-goose-spine-bridge-plan-v1.md

- 23. Reconcile the bridge extension on top-level session activation in both activation paths: in `crates/goose/src/acp/server.rs` `prepare_acp_session_agent` (`:1152-1165`) and `update_provider` (`:2555`), and in `crates/goose-cli/src/session/builder.rs` after `update_provider` (`:799`) — a shared `crate::agents::session_bridge::reconcile(agent, session_manager, session_id)` that: registers the session with the bridge; when `agent.provider().manages_own_context()` and the stored `EnabledExtensionsState` (`session/extension_data.rs:103-133`) has no extension named `goose`, appends `SessionBridge::extension_config(session_id)`, persists it, and calls `agent.recreate_provider_for_session(session_id, provider_name, model_config)` once; when the provider is native and the entry is present, removes it, persists, recreates; unregisters in `on_close_session` (`server.rs:2629`).
  - status: todo · agent: — · worker: high
  - card: as the user, open a session on `claude-code` or any ACP runtime and have `delegate` simply be there — and not be there on a Goose-native provider — so that no provider gets a second copy of its own tools (spine research §Critical: orchestration capability gap)
  - context:
    - why reconcile, not inject-before-create: the provider reads the stored list at construction inside `agent.rs` (`:3771-3783`, `:3665-3676`), which the fork does not edit; the session id is not known to `providers::create_with_working_dir` (`providers/init.rs:276`)
    - the native-provider removal matters: Goose loads `StreamableHttp` extensions itself when the provider does not manage its own context (`agent.rs:1268-1280`), and the bridge's handler would then block on that session's creation lock (`execution/manager.rs:130-160`) until the MCP init timeout
    - `recreate_provider_for_session` is public on `Agent` (`agent.rs:3652`); a `SubAgent` session never passes through either activation path (children are built in `subagent_handler.rs:139-152`) — add a debug assertion that `session.session_type` is not `SubAgent` in `reconcile`
    - the secret rides in the adapter's MCP config: for `claude-code` that is a file under `Paths::state_dir()` (`claude_code.rs:659`, `:607`) — same exposure as `GOOSE_SERVER__SECRET_KEY` in the desktop's `?token=` (`ui/desktop/src/gooseServe.ts:256-258`); note it in the Ready issue, no new mitigation here
    - `on_close_session` today: `server.rs:2629-2640` — unregister beside whatever it drops
    - `goose run` and `goose session` share `build_session` (`cli.rs:2291`, `:2076`; `builder.rs:651`), so the CLI site covers task 24's `goose run`
    - test in `server.rs` tests (pattern `:3630-3660`, stub provider factory): `acp_session_on_own_context_provider_gets_bridge_extension` — factory returns a stub whose `manages_own_context` is true; after `session/new` the stored extensions contain a `StreamableHttp` named `goose` with `uri` starting `http://127.0.0.1:` and ending `/mcp/<session id>`; a second stub with `manages_own_context` false leaves the list without it
  - confirm: `source bin/activate-hermit && cargo test -p goose --lib acp_session_on_own_context_provider 2>&1 | grep -E 'test result: ok\. 1 passed'; echo exit=$?` → the `test result` line, then `exit=0` (untouched tree: no match, `exit=1`); and `bash scripts/check-spine.sh` → `spine clean`

- 24. Run the proof and record it in `docs/2026-09-15-spine-bridge-spike-v1.md`: a throwaway `.agents/agents/spike-echo.md` (`model: claude-sonnet-5`, body: "Begin every reply with the token spike-ok-4127.") and a throwaway recipe `spike.yaml` (instructions: call the `delegate` tool with `source: spike-echo` and the instruction "say hello"; print the child's reply verbatim); run `goose run --recipe spike.yaml --provider claude-code --model claude-opus-5` from the fork root, then `goose session list` / `goose session export` on the child; delete both throwaway files after.
  - status: todo · agent: — · worker: medium
  - card: as the user, see one Claude-first orchestration go parent → `delegate` → linked ACP child → compact result, with the role body provably in the child, so that tasks 5, 8, 9 build on a run, not a reading (spine research §Unknowns, first)
  - context:
    - the child rolls onto `claude-acp` through the role file's `model` only until task 5 lands — set `GOOSE_PROVIDER`-independent routing by passing `provider: claude-acp` in the recipe's delegate instruction, or run the child on `claude-code` first and `claude-acp` second; record both
    - `claude-agent-acp` and `claude` are on PATH (`/opt/homebrew/bin`, 2026-09-15); `codex-acp` is not installed — the Codex child is task 9's, not this task's
    - findings to record, one line each: did Claude Code call `delegate` unprompted or only when told; MCP tool-call timeout hit? (if so, set `MCP_TOOL_TIMEOUT` in the spawned adapter's env — `claude_code.rs` command builder / `acp/provider.rs:1480` — and say which); permission prompts seen on the parent; turns; the child session id and whether its transcript's first user message carries the role body (task 21) and its first reply the token
    - light tier: the confirm is the walk and its record, not a suite
  - confirm: `test -f docs/2026-09-15-spine-bridge-spike-v1.md && grep -c 'spike-ok-4127' docs/2026-09-15-spine-bridge-spike-v1.md && grep -q '^- reached child: yes' docs/2026-09-15-spine-bridge-spike-v1.md && echo ok` → a count ≥ 1, then `ok` (untouched tree: `test -f` fails, nothing printed)

- 25. Correct `PRODUCT.md` §5's gating line to what the tree does.
  - status: todo · agent: — · worker: low
  - card: as a reader of the product doc, learn that every delegated worker runs ungated so that the agy carve-out and the "gated like the other nine" card are not read as guarantees (fork research §Correction, fourth)
  - context:
    - from: "`claude-acp`, `codex-acp` run gated by Goose's modes. `cursor-acp` (ACP mode) is gated; `agy` runs its own tools ungated (print mode) — accepted for V0 at one implementation in ten, with the Reviewer gating the diff. Surfacing agy's approvals is out of scope until its weight rises." / to: "A Direct session on `claude-acp`, `codex-acp`, `cursor-acp` or `claude-code` runs gated by Goose's modes. Every delegated worker runs `Auto` whatever its runtime (`summon.rs:622,1400,2075,2373`; upstream forwards no child approvals yet) — the Reviewer gates the diff, not the mode. Forwarding child approvals is upstream work, out of V0."
    - `PRODUCT.md` line 78 (2026-09-15, `aa44e934e`)
  - confirm: `grep -c 'Every delegated worker runs `Auto`' PRODUCT.md` → `1` (untouched tree: `0`)

## Handoff — Goose spine evaluation (2026-09-15, Codex)

- **Resume here:** `docs/2026-09-15-goose-spine-research-v1.md` owns the evidence and options. User said “continue” after the recommendation to preserve Claude-first and repair ACP integration, then requested handoff. Direction carried forward; no implementation plan has been completed or approved.
- **Next action:** finish a bounded integration plan for Claude ACP → Goose Summon `delegate` → linked Codex ACP child → compact result. Prove a unique instruction present only in the role body reaches the child. Specify session authority, lifecycle, cancellation, permissions and result metadata before implementation; no new sidecar task engine.
- **Corrections to existing task assumptions (append-only; not a replacement plan):**
  - tasks 5, 7–9: ACP ignores Goose's system prompt and tool list (`crates/goose/src/acp/provider.rs:820`); MCP forwarding skips platform extensions (`:1843`). Role content becomes the child system prompt (`crates/goose/src/agents/subagent_handler.rs:134`, `:166`). Weighted selection and role files alone cannot deliver the orchestration path. Task 9 depends on resolving these integration gaps.
  - task 5: `tasks_update` has no production constructor call found; use the actual delegate result/child-session metadata and design missing lifecycle/runtime fields explicitly (`crates/goose/src/agents/subagent_execution_tool/notification_events.rs:28`; `crates/goose/src/agents/platform_extensions/summon.rs:1433`). Decide how runtime selection interacts with the existing environment override (`:1822`).
  - tasks 6, 9: delegated approval handling is not established by provider mode mapping. Summon assumes Auto (`summon.rs:1394`), but Claude ACP reads global mode (`crates/goose/src/providers/claude_acp.rs:70`); requests can wait for confirmations the child handler does not forward (`crates/goose/src/acp/provider.rs:1005`).
  - tasks 5, 11: automatic fail-over needs backend ownership and partial-work semantics; switching plus a memo is not that policy (`crates/goose/src/acp/server.rs:2555`). ACP errors currently map to Authentication/RequestFailed (`crates/goose/src/acp/provider.rs:182`), so quota classification also needs design.
  - task 17: the Gemini CLI template ignores extensions/tools and lacks ACP handoff behavior (`crates/goose/src/providers/gemini_cli.rs:184`, `:212`, `:80`). Confirm agy's actual protocol/flags; do not claim MCP or permission parity from a clone.
- **Integration leads, not approved design:** `PlatformExtensionContext` already carries the session manager and weak extension manager (`crates/goose/src/agents/platform_extensions/mod.rs:230`); `ToolCallContext` carries session/cwd/call identity (`crates/goose/src/agents/tool_execution.rs:34`); `ExtensionManager::dispatch_tool_call` exists (`crates/goose/src/agents/extension_manager.rs:2407`). Check ACP activation/provider-construction order (`crates/goose/src/acp/server.rs:1156`; `server/new_session.rs:74`) before choosing where to attach a session-bound MCP facade. Production HTTP-server feature/dependency implications remain unresolved (`crates/goose/Cargo.toml:88`, `:265`).
- **Alternative retained:** Goose-native `chatgpt_codex` sends system instructions and tools (`crates/goose/src/providers/chatgpt_codex.rs:1003`), unlike `codex-acp`; using it as orchestrator changes the Claude-first promise and does not fix ACP child instructions.
- **Advisor:** first-rung `claude -p … --model opus --effort high` completed and confirmed the main gaps; review recorded in the research note. A later narrow hook/transport consult (`--effort medium`) was stopped for handoff before returning; no result or pending worker to rely on.
- **Verification this session:** `bash scripts/check-spine.sh` → `spine clean`, exit 0. No build, runtime matrix or adapter smoke run; no task marked done. Another session landed task 2 as `2d6ad3c26`; that build was not rerun here.
- **Concurrent work:** tasks 4 and 7 remain claimed by Comprehend [12ee2f]. At handoff, `ui/desktop/package.json`, `ui/pnpm-lock.yaml` and untracked `.agents/` were other ongoing work; preserve them. This evaluation owns only its research note and this handoff addition. No source code or architecture rules changed by this session.

## Waiting on the user

- **Direction — who can orchestrate (found 2026-09-15 evening, research v1 addendum):** on stock Goose no ACP or print-mode subscription provider receives Goose's tools, and ACP workers do not receive their role body; only `chatgpt_codex` (ChatGPT Plus) and API-key providers do. Options: (A) repair the spine — (i) fold system into the first ACP prompt, (ii) export a session's platform tools (`delegate`, `load`) to ACP agents and `claude-code` as an MCP endpoint on `goose serve`; keeps Claude-first via `claude-acp`; (B) interim Codex-native orchestrator (`chatgpt_codex`) for the proof while A lands; (C) interim Claude API-key orchestrator. Tasks 5, 8, 9 blocked on this; 6 and 17 stand.
  - *Correction (same evening, research v1 §Correction):* `claude-code` (Claude Max, print mode) already receives the role body and forwards StreamableHttp MCP servers, so it is a Claude-first orchestrator that needs only (ii); (i) is the ACP-workers patch. (ii) shrinks to one `goose serve` route plus a per-session synthetic `StreamableHttp` extension. All delegated children run `Auto` regardless of provider (`summon.rs:622,1400,2075,2373`) — `PRODUCT.md` §5's gating line is wrong for workers; fix after the pick. Recommendation: destination A as `claude-code`+(ii), then (i); interim B (`chatgpt_codex`) for the task 9 proof, with the Implementer on `claude-code`. Task 19 is independent of all of this and can run now.
  - *Decided (2026-09-15 20:10, user):* **A** — repair the spine as `claude-code` + (ii), then (i). B and C not taken. Tasks 5, 8, 9 stay blocked until the bounded integration plan (§Handoff, next action) is written and approved; that plan is the next claim on the spine side.
- `ARCHITECTURE.md` — sign-off deletes `## Bootstrap Status`; until then the map is a proposal and tasks 10–16 plan against a guess.
- task 20 — the phone check is manual: open the URL on `hoa-phone`, walk PRD step 13, judge the terminal with the key bar.
- task 9 — the handoff-memo criterion (PRD §Criteria, second) is a manual check: ask "what did we just change?" after a runtime switch and judge the answer.
- Goose spine integration — the next session must finish the concrete plan above and obtain plan approval before source edits; “continue” established the direction, not an unwritten implementation scope.

## Ownership

- **This file owns:** task state — the claim, the 3C body, the check.
- **The plan doc owns:** approach and negative space, and dates the
  change. **`ARCHITECTURE.md` owns:** the boundaries a task may not
  cross.
