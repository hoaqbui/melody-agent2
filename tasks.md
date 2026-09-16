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
  - status: doing · agent: subagent-t5 via claude-session-opus-2 (21:25, worktree) · worker: high
  - blocked: necessary but not sufficient — after this lands an Orchestrate session on `claude-acp` still has no `delegate` (ACP drops Goose tools, `acp/provider.rs:820-825`; research v1 addendum, evening). Unblocks: the user picks the orchestrator path (§Waiting on the user); if repair (ii) is chosen, this task and the bridge land together — owner: user
  - unblocks (2026-09-15 20:40, plan spine-bridge v1 approved): after task 24 records `reached child: yes`; the bridge (tasks 22–23) is what gives `claude-code` `delegate`
  - unblocked 2026-09-15 21:20: task 24 recorded `reached child: yes` (`docs/2026-09-15-spine-bridge-spike-v1.md` §Run 1)
  - card: as the orchestrator, have each role file name its runtimes and their weights so that role→runtime, the tenth-call backup seat, and fail-over are data, not prompt text (PRODUCT.md §6)
  - context:
    - `AgentMetadata` is `name / description / model` only (`summon.rs:208-214`); `parse_agent_content` copies `model` into `properties` (`:236-239`)
    - `build_recipe_from_agent` sets `goose_provider: params.provider.clone()` only when `model` is present (`:1620-1631`); provider precedence is env > `params.provider` > recipe settings > config > session (`:1809-1838`)
    - precedence to keep: an explicit `delegate(provider:)` still wins over the roll; the roll wins over the parent session's provider
    - the set is trimmed before the roll: the `exclude_provider` entry goes; any entry whose binary does not resolve goes (`SearchPaths`, as `codex_acp.rs:75-77`); if the picked entry fails to spawn or returns quota-exhausted, it goes and the rest is re-rolled — the list is the fail-over order (decided 2026-09-15)
    - `weight: 0` is legal: listed for fail-over only, never rolled; when the trimmed set's weights sum to 0, take the weight-0 entries in file order (this is what `agent_frontmatter_runtimes_fall_through` asserts)
    - each entry's `model` passes through as the ACP `model` config option (`codex_acp.rs:97`); the picked `{provider, model}` rides in the task's `tasks_update` payload so the Agents pane can name it
    - correction 2026-09-15 21:30: `tasks_update` has no production constructor call (spine research §Activity contract gap; `notification_events.rs:28`) — the payload piece is task 27's, out of this task's scope; this task delivers the roll, the trim, `exclude_provider`, the re-roll on provider-creation failure, and the three tests. Quota-exhausted classification is task 32's — re-roll here only when `providers::create_with_working_dir` fails
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
    - `Provider::accepts_system_prompt()` (task 21, `goose-provider-types/src/base.rs`): return `false` if `agy` does not pass the system prompt through (`gemini_cli.rs:184` ignores extensions and tools; check whether it sends `system` at all before deciding)
  - confirm: `source bin/activate-hermit && cargo test -p goose agy_metadata -- --nocapture; echo exit=$?` → `test result: ok.` with ≥1 passed, then `exit=0`

- 9. Run the runtime matrix: from a Goose session in this directory on `claude-acp`, delegate the same one-file task ("add a `--version` line to `scripts/check-spine.sh` help") to implementer on `claude-acp`, `codex-acp`, `cursor-acp`, `agy`, then call `advisor` six times with `exclude_provider` set, and record per run: provider, model, turns, result shape, permission prompts seen, in `docs/2026-09-15-runtime-matrix-v1.md`.
  - status: blocked · agent: — · worker: medium
  - blocked: no subscription orchestrator in tree can call `delegate` except `chatgpt_codex` (research v1 addendum, evening). Unblocks: the user's pick — run the matrix from a `chatgpt_codex` session as the interim proof, or wait for repair (ii) — owner: user
  - unblocks (2026-09-15 20:40, plan spine-bridge v1 approved): tasks 22–24 give `claude-code` `delegate` via the session bridge; run the matrix with the orchestrator on `claude-code` after 24
  - still blocked 2026-09-15 21:20 on: task 26 (ACP workers refuse the folded template), task 6 (`cursor-acp`), and `npm i -g @agentclientprotocol/codex-acp` — owner: user for the install, this ledger for 26 and 6
  - card: as the user, see each role×runtime pair work once so that the fork's UI work builds on a proven spine
  - context:
    - needs `codex-acp` installed (`npm i -g @agentclientprotocol/codex-acp`; `codex_acp.rs:37-42`), `claude-agent-acp` (present), `cursor-agent` (present, `~/.local/bin`), `agy` (present), and tasks 5, 6, 17 landed
    - the unknowns this settles: does `delegate(provider: "<acp>")` run `AcpProvider` inside a `SubAgent` session with `max_turns` honoured (research v1 §Unknowns, first); do the Claude model ids pass through `claude-agent-acp`; does the advisor roll respect `exclude_provider` and never repeat the excluded provider
    - print-mode flags seen 2026-09-15 running the same three runtimes by hand: `codex exec` needs `--skip-git-repo-check` outside a git repo; `cursor-agent -p` needs `--trust`; ACP mode may differ — record what each adapter needed
    - use `goose session` CLI, not the desktop, so the result is independent of tranche 4
    - record the subscription each run drew on (PRODUCT.md §5) and any quota message — that is the first fail-over datum
  - confirm: `test -f docs/2026-09-15-runtime-matrix-v1.md && grep -c '^| \(codex-acp\|cursor-acp\|claude-acp\|agy\) |' docs/2026-09-15-runtime-matrix-v1.md` → `4`

- 11. Add `ui/desktop/src/workspace/WorkspaceShell.tsx` rendering the pane store around the existing `pair` route chat, and a header with Runtime (Claude · Codex · Cursor · agy · More…) and Mode (Direct · Orchestrate) selectors wired to `src/acp` session config (`provider`) and to loading `orchestrator.md`.
  - status: doing · agent: subagent-t11 via claude-session-opus-2 (21:25, worktree) · worker: high
  - card: as the user, pick who I talk to and whether it orchestrates so that Direct and Orchestrate are one click apart (PRD steps 2–3, 9)
  - context:
    - PRD decisions 1 (Runtime/Mode separate) and 4 (mid-session switch P0) — approved 2026-09-15; decision 2 ("agy out of V0") superseded by the role map: the Runtime list is Claude · Codex · Cursor · agy · More…
    - Goose exposes `provider` and `model` as ACP config options (`acp/response_builder.rs:303-317`); the desktop already patches provider per session (`ModelAndProviderContext.tsx:92-140`) — reuse that path, do not add a registry
    - Mode = whether the first prompt loads the orchestrator role; how the role is loaded is a plan decision for this task (recipe vs `load(source:)`)
    - decided by the spike (2026-09-15, `docs/2026-09-15-spine-bridge-spike-v1.md`; plan spine-bridge §Approach, fifth): Orchestrate = `session/new` with `.agents/agents/orchestrator.md`'s body as recipe instructions — `claude-code`'s system prompt is fixed at spawn, so `load` mid-session cannot do it; the bridge already gives that session `delegate` on `goose serve` (`acp/server.rs` `sync_session_bridge`)
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
  - status: doing · agent: subagent-t18 via claude-session-opus-2 (21:25, worktree) · worker: high
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
  - status: doing · agent: subagent-t19 via claude-session-opus-2 (21:25, worktree) · worker: high
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

- 26. Fold only the role body into an ACP child's first user message: in `crates/goose/src/agents/subagent_handler.rs` change `first_user_message` to take the raw `system_instructions` (the `.agents/agents/*.md` content, `recipe.instructions`) instead of the rendered `subagent_prompt`, framed as `The orchestrator that delegated this task set your role as follows:\n\n<body>\n\n---\n\nYour task:\n\n<task>`; keep `override_system_prompt(subagent_prompt)` unchanged.
  - status: doing · agent: subagent-t26 via claude-session-opus-2 (21:25, worktree) · worker: medium
  - card: as a delegated worker on an ACP runtime, receive my role as delegated instructions I can act on so that Claude Code's harness does not read it as a prompt injection (`docs/2026-09-15-spine-bridge-spike-v1.md` §Run 2)
  - context:
    - spike run 2: the folded text was Goose's whole `subagent_system.md` template ("You are a specialized subagent within the goose AI framework… tool count… `apps__list_apps`") and the `claude-acp` child refused it; the role body alone is what the contract promises (PRODUCT.md §7)
    - `system_instructions` is in scope at `subagent_handler.rs:133`; pass it to `first_user_message` beside `subagent_prompt` or instead of it — the rendered prompt still goes to `override_system_prompt` for providers that read it
    - update the two tests from task 21: the dropped-system case asserts the message starts with the framing line, contains the body, contains `---`, and ends with the task; and does not contain "goose AI framework"
    - then rerun spike run 2 exactly as `docs/2026-09-15-spine-bridge-spike-v1.md` §Setup describes (throwaway `spike-echo.md` + recipe, child `provider: claude-acp`, isolated `GOOSE_PATH_ROOT`) and append `## Run 3 — child on claude-acp after task 26` with `- reached child: yes` and `- run 3 token: spike-ok-4127` when the child's first reply starts with the token; delete the throwaway files after
  - confirm: `source bin/activate-hermit && cargo test -p goose --lib subagent_first_prompt 2>&1 | grep -E 'test result: ok\. 2 passed'; echo exit=$?` → `exit=0`; and `grep -c '^- run 3 token: spike-ok-4127' docs/2026-09-15-spine-bridge-spike-v1.md` → `1` (untouched tree: `0`)

- 33. File the three upstream Ready issues against `aaif-goose/goose` named by the spine bridge plan: (i) role bodies never reach an ACP worker (`acp/provider.rs:820`), (ii) a session's platform tools exposed to ACP/CLI providers as an MCP server (`agents/session_bridge.rs`), and `runtimes:` in agent frontmatter (task 5).
  - status: blocked · agent: — · worker: low
  - blocked: posting to GitHub is outward-facing — owner: user, say "file them" and name the account
  - card: as the fork's maintainer, put each spine patch in front of upstream so that the fork carries fewer patches over time (AGENTS.md §Contribution Workflow: issue first, template in `.github/ISSUE_TEMPLATE/`)
  - context:
    - each issue: problem, the fork's patch as evidence (`file:line`, commit), the verification the spike ran; `gh issue create` does not apply templates — paste the template body
  - confirm: `gh issue list --repo aaif-goose/goose --author @me --state open --json title | python3 -c "import json,sys; t=[i['title'] for i in json.load(sys.stdin)]; print(sum('bridge' in x.lower() or 'system prompt' in x.lower() or 'runtimes' in x.lower() for x in t))"` → `3`

### PRODUCT.md §11 — tranche 5 (V0.5): agent activity, artifacts, browser

Planned 2026-09-15 21:25 from PRD steps 10–12 and the spine research §Activity contract gap; tasks 28–30 wait on 27's pick before any source edit.

- 27. Research how a bridge-dispatched `delegate` can surface in the parent session as agent activity, in `docs/2026-09-16-agent-activity-research-v1.md`: today `session_bridge.rs` `tools/call` drops the child's `notification_stream` (`subagent_tool_request` events, `subagent_handler.rs:119,317`) while the Goose loop forwards it as tool-call `_meta` on `session/update` (`state_machine/ops_toolcalling.rs:919` → `acp/server/tool_notifications.rs:92`) and the desktop reads it (`components/ToolCallWithResponse.tsx:133`); the parent's own `delegate` call is an external tool call the adapter renders, with no Goose tool-call id to hang `_meta` on.
  - status: doing · agent: subagent-t27 via claude-session-opus-2 (21:25, worktree, read-only) · worker: medium
  - card: as the user in an Orchestrate session, see each delegated worker as a row that appears when the `delegate` call starts so that the Agents tree (PRD step 10) has an event source that is true, not inferred (PRODUCT.md §11; spine research §Activity contract gap)
  - context:
    - options to weigh, at least: (a) the bridge emits its own `session/update` notifications to the parent's ACP client (needs the bridge to reach the `ConnectionTo<Client>` — the ACP server holds it, the CLI has none); (b) a `_goose/*` custom method the renderer polls for a session's child sessions (`sessions.parent_session_id` already links them — spike doc §Run 1); (c) the parent's adapter tool-call row for `delegate` is matched to the child session by the result payload (child session id rides in the compact result, `summon.rs:1433`)
    - `tasks_update` has no production constructor call (`notification_events.rs:28`; spine research) — do not assume it
    - the CLI path (task 9) has no ACP client; whatever is picked must degrade to "child sessions exist in the DB"
  - confirm: `test -f docs/2026-09-16-agent-activity-research-v1.md && grep -c '^## Options' docs/2026-09-16-agent-activity-research-v1.md` → `1`

- 28. Add the Agents pane (`ui/desktop/src/workspace/panes/agents/`): a tree of delegated work under the orchestrator — runtime · role · task title · status (waiting / running / done / failed) — rows appearing when the `delegate` call starts; click a row → a read-only worker transcript pane over the child session (`_goose/*` session load through `src/acp`).
  - status: blocked · agent: — · worker: high
  - blocked: waits on task 27's pick for the event source — owner: this ledger
  - card: as the user, see who is working on what and open a worker's transcript so that orchestration stops being invisible (PRD step 10; PRODUCT.md §3.4, §11)
  - context:
    - states per PRD §States "Agents": empty → "No delegated work yet"; partial → status-only row while the transcript is not stored; error → the worker's error stays on the row
    - the picked runtime shows on the row once task 5's payload carries it; until then provider/model from the child session record
    - no ACP imports outside `src/acp` (task 4's depcruise rule)
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/agents && pnpm run depcruise; echo exit=$?` → `exit=0`

- 29. Add the RPI strip above the chat (`ui/desktop/src/workspace/rpi-strip/`): phases Research · Plan · Implement · Review lit when a worker with that role starts (from the same event source as task 28), a phase with an artifact clickable, a re-run phase showing a counter.
  - status: blocked · agent: — · worker: medium
  - blocked: waits on task 27's pick, and on task 28's row model to map role → phase — owner: this ledger
  - card: as the user, see which RPI phase the orchestrator is in so that a long task reads as progress, not a blank chat (PRD step 11)
  - context:
    - role → phase from the role file name (`researcher` → Research, `planner` → Plan, `implementer` → Implement, `reviewer` → Review; advisors light the phase they gate)
    - states: all dim / active pulses / lit-not-clickable without artifact / red on failure, still clickable (PRD §States "RPI strip")
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/rpi-strip; echo exit=$?` → `exit=0` with ≥3 tests

- 30. Add the Artifact pane (`ui/desktop/src/workspace/panes/artifact/`): the markdown a worker returned (Brief, Plan, Result, Review — PRODUCT.md §7 shapes), opened from an RPI phase or an Agents row, rendered read-only with the role and runtime in its header.
  - status: blocked · agent: — · worker: medium
  - blocked: waits on tasks 28 and 29 (its two entry points) — owner: this ledger
  - card: as the user, read the compact artifact a worker produced without opening its transcript so that Claude's conclusions and the worker's evidence are one click apart (PRD step 11; PRODUCT.md §3.4)
  - context:
    - the artifact is the child session's last assistant message (`summon.rs:1412` returns last-only output) — read it through `src/acp`, do not re-derive from the parent's transcript
    - markdown rendering: reuse whatever the chat already uses for assistant text (`components/`), compose, do not fork
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/artifact && pnpm run depcruise; echo exit=$?` → `exit=0`

- 31. Add the Browser pane (`ui/desktop/src/workspace/panes/browser/`: address bar + iframe, default URL the project's dev server when `.goose` config lists one) and the Markdown pane (`panes/markdown/`: rendered view of the file selected in Files).
  - status: todo · agent: — · worker: medium
  - card: as the user, check the running app and read a doc beside the agent so that the last two alt-tabs go away (PRD step 12)
  - context:
    - iframe of the project's dev server only — arbitrary-site browsing is out (PRD §Scope); at V0.5 the address bar accepts any http(s) URL but the default and the "reset" target are the dev server
    - depends on task 11 (shell) and task 12 (Files selection); on the web build (task 19) an iframe to `localhost` from the phone will not resolve — show the PRD "not reachable" line, do not proxy
    - markdown rendering shares task 30's choice
  - confirm: `cd ui/desktop && pnpm vitest run src/workspace/panes/browser src/workspace/panes/markdown && pnpm run depcruise; echo exit=$?` → `exit=0`

- 32. Research server-side runtime fail-over in `docs/2026-09-16-failover-research-v1.md`: how a session on an adapter that fails to spawn or returns quota-exhausted moves to the role file's weight-0 runtime with the handoff memo, owned by `goose serve`, not the shell.
  - status: doing · agent: subagent-t32 via claude-session-opus-2 (21:25, worktree, read-only) · worker: medium
  - card: as the user, have a task move to the backup seat when a subscription window closes so that the task continues instead of stalling on me (PRODUCT.md §6, §17; PRD step 9 divider)
  - context:
    - the gaps the spine research names (§Fail-over ownership gap): error classification (ACP errors collapse to Authentication / RequestFailed, `acp/provider.rs:182`), partial edits after one file was written, cancellation, and context transfer (`acp/handoff.rs:54` is a transfer primitive, not a policy)
    - `update_provider` is explicit switching today (`acp/server.rs:2555`); task 11's shell-side switch is the manual form and must stay
    - the orchestrator never rolls; only its weight-0 entry is a fail-over target (`ARCHITECTURE.md` §Invariants)
    - output: options with the trade-offs, a pick, and the task list for the plan — no source edits
  - confirm: `test -f docs/2026-09-16-failover-research-v1.md && grep -c '^## Options' docs/2026-09-16-failover-research-v1.md` → `1`

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
- *Task 21 revision (2026-09-15 21:05) → task 26 (21:25, user: "build out tasks for everything" taken as the go; say so if 21 should stay as landed).*
- `npm i -g @agentclientprotocol/codex-acp` on this Mac — task 9 needs the Codex adapter (`codex_acp.rs:37-42`); a global npm install is yours to run or to tell me to run.
- Task 33 — filing the three upstream issues posts under your GitHub account; say "file them".
- `ARCHITECTURE.md` — sign-off deletes `## Bootstrap Status`; until then the map is a proposal and tasks 10–16 plan against a guess.
- task 20 — the phone check is manual: open the URL on `hoa-phone`, walk PRD step 13, judge the terminal with the key bar.
- task 9 — the handoff-memo criterion (PRD §Criteria, second) is a manual check: ask "what did we just change?" after a runtime switch and judge the answer.
- Goose spine integration — the next session must finish the concrete plan above and obtain plan approval before source edits; “continue” established the direction, not an unwritten implementation scope.

## Ownership

- **This file owns:** task state — the claim, the 3C body, the check.
- **The plan doc owns:** approach and negative space, and dates the
  change. **`ARCHITECTURE.md` owns:** the boundaries a task may not
  cross.
