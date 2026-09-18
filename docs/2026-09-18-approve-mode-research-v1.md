# Approve mode reaches the ACP seats — research map

<!-- Cluster `approve-mode`, one item. Upstream of a plan; read-only —
     no source edits, no task claims. Sibling clusters run the same
     brief (scratchpad/research-common.md). -->

Dated 2026-09-18 (tree at `d7d9406f2`, worktree
`agent-afb5f8f91b342c6b5`). Question as asked: "today
`crates/goose/src/providers/claude_acp.rs:70-102` reads
`Config::global().get_goose_mode()` at connect and maps it to the
adapter's `session_mode_id`, so a session's own goose mode … never
reaches Claude/Codex/Cursor/agy children or Direct sessions."

Adapters read live this session: `claude-agent-acp` 0.62.0,
`@agentclientprotocol/codex-acp` 1.12.0 (ChatGPT Plus),
`cursor-agent` (`agent acp`), `agy` 1.2.4 — probe transcripts under
`scratchpad/r-approve-mode/*.log` (`probe.py`, `probe2.py`,
`probe3.py`). Those logs live in a session scratchpad and are
**ephemeral** (the `t9`/`t65` captures the brief pointed at had
already gone the same way); the excerpts quoted in §Inventory are the
durable record, and `probe3.py`'s shape is reproduced in §Plan
skeleton so any session can re-run it.

## The surprise (lead finding)

**The session's mode already reaches the ACP adapters — and on two of
the three seats it buys nothing.** `on_set_mode`
(`acp/server.rs:2602-2620`) → `Agent::update_goose_mode`
(`agents/agent.rs:3629-3645`) → `AcpProvider::update_mode`
(`acp/provider.rs:735-763`) sends `session/set_config_option`
(`"mode"`) or `session/set_mode`, and every provider-recreation path
re-pushes the session's mode afterwards (`agent.rs:3847-3855`,
`:3679-3682`, `execution/manager.rs:253-257`). The desktop's
Allow · Always Allow · Deny card is wired end to end today
(`server.rs:1500-1516` → `:1659-1720` → `acp/permissionRequests.ts:14-31`
→ `acp/adapter/permissions.ts:12-44` → `ToolCallConfirmation.tsx` →
`ToolApprovalButtons.tsx:95-105` → `submit_tool_confirmation`
`agent.rs:1517-1596` → `AcpProvider::handle_permission_confirmation`
`:828-839`). The premise "the mode never reaches the seat" is false
for `claude-acp`, `codex-acp` and `cursor-acp`.

What is false instead is the *promise*. Goose's Approve reads "Ask
before every tool call" (`goose-provider-types/src/goose_mode.rs:26`).
Live, with the mode actually set on the adapter and one prompt that
writes a file:

| seat | mode id Goose maps Approve to | `session/request_permission` seen | file written? |
|---|---|---|---|
| `claude-agent-acp` | `default` ("Manual") | 1 (Write) — `claude.write.log:11-56` | no (rejected) |
| `claude-agent-acp` | `default` — Bash `echo T3-PROBE` | **0** — `claude.perm.log:6-13` | n/a, ran |
| `codex-acp` | `read-only` ("Ask for approval") | **0** — `codex.write.log:7-9` | **yes** |
| `cursor-agent acp` | `agent` | **0** — `cursor.write.log:6-10` | **yes** |
| `agy` | — (not ACP; `--dangerously-skip-permissions` always) | n/a | n/a |

Approve on a Cursor or Codex seat today is a label on a gate that is
open. `cursor_acp.rs:71-75`'s in-tree comment ("its permission
requests arrive over ACP requestPermission, which AcpProvider
forwards") is contradicted by the capture.

## Reframe trail

1. "Does the session's goose mode reach the adapter?" > `update_mode`
   sends it and every recreate path re-syncs (`agent.rs:3847-3855`) >
   "Then why does Approve feel absent in the app?"
2. "Is the desktop card wired for adapter-originated prompts?" > yes,
   end to end, including Deny → `Tool call was denied.` tool_response
   (`acp/provider.rs:1000-1018`) > "So the gap is not plumbing — what
   does Approve *mean* on each seat?"
3. "What does each adapter do in the mapped mode?" > only
   `claude-agent-acp` asks, and only for what Claude Code itself
   deems dangerous; Codex `read-only` asks for files *outside* the
   workspace, Cursor `agent` asks for nothing > "the work is the
   mapping and the copy, not the wire."
4. "Then is anything in the wire actually wrong?" > yes, three
   fidelity losses on the way to the card: the adapter's `diff`
   content is dropped, the tool name is the adapter's *title*
   re-titled and lowercased, and the four option kinds Goose offers
   are re-matched against the adapter's own list by kind alone —
   which on Claude's ExitPlanMode silently picks `auto` mode.

## Inventory — read this session

- `scratchpad/r-approve-mode/claude-agent-acp.probe.log` — `initialize`
  + `session/new` from `claude-agent-acp` 0.62.0: `currentModeId:
  "auto"`, `availableModes` = auto · default · acceptEdits · plan ·
  dontAsk · bypassPermissions, and a `configOptions[]` entry
  `{id: "mode", category: "mode"}` carrying the same list. Read this
  session.
- `scratchpad/r-approve-mode/codex-acp.probe.log` — `codex-acp` 1.12.0:
  modes `read-only` ("Ask for approval") · `agent` ("Approve for me")
  · `agent-full-access` ("Full access"), plus `{id: "mode", category:
  "mode"}`. The table is `AgentMode` in
  `/opt/homebrew/lib/node_modules/@agentclientprotocol/codex-acp/dist/index.js:27705-27748`:
  `read-only` = `approvalPolicy: "on-request"`, sandbox
  `workspaceWrite`.
- `scratchpad/r-approve-mode/cursor-acp.probe.log` — `cursor-agent acp`:
  modes `agent` · `plan` · `ask`, plus `{id: "mode", category:
  "mode"}`. No `bypass`-style mode; `plan` is the only read-only one.
- `scratchpad/r-approve-mode/claude.write.log:11-56` — the live
  `session/request_permission` payload from `claude-agent-acp` in
  `default`: `options` = `allow_always` ("Always Allow all Write") ·
  `allow_once` ("Allow") · `reject_once` ("Reject"); `toolCall.title`
  = `"Write probe-write.txt"`, `kind: "edit"`, `content: [{type:
  "diff", path, oldText: null, newText}]`, `locations: [...]`, and
  **no `_meta`** (the adapter only attaches `_meta.claudeCode` when
  the call has a `parentToolUseId`,
  `claude-agent-acp/dist/acp-agent.js:3485-3492`). Answering
  `reject_once` produced `tool_call_update status: "failed",
  rawOutput: "User refused permission to run tool"` and the turn ended
  `end_turn` with the model naming the refusal.
- `scratchpad/r-approve-mode/claude.perm.log:6-13` — same seat, same
  mode, `echo T3-PROBE`: zero permission requests, the command ran.
  `default` is "prompts for dangerous operations"
  (`acp-agent.js:4518-4523`), not "every tool call".
- `crates/goose/src/providers/claude_acp.rs:70-102` — `mode_mapping`
  Auto→`bypassPermissions`, Approve→`default`,
  SmartApprove→`acceptEdits`, Chat→`plan`; `session_mode_id` is the
  first candidate for the *global* mode at connect.
- `crates/goose/src/providers/codex_acp.rs:78-103` — Auto→
  `agent-full-access`, SmartApprove→`agent`, Approve→`read-only`,
  Chat→`read-only`; `session_mode_id: None` (the mapping is consulted
  first, so this is inert).
- `crates/goose/src/providers/cursor_acp.rs:70-103` — Auto, Approve
  and SmartApprove **all** map to `agent`; only Chat→`ask`. Cursor's
  `plan` is never used.
- `crates/goose/src/providers/agy.rs:120-137` — every spawn adds
  `--dangerously-skip-permissions`; agy is a stream-json CLI provider,
  not ACP, and overrides neither `update_mode` nor
  `permission_routing`, so the trait default
  (`goose-provider-types/src/base.rs:673-675`) returns `Ok(())` —
  **a mode change on an agy session silently succeeds and changes
  nothing**. `agy --help` offers `--mode accept-edits|plan` only; no
  ask mode exists. Hard limit.
- `crates/goose/src/acp/provider.rs:1795-1837` `apply_session_mode` —
  at `session/new` the client loop resolves
  `initial_mode_candidates` (`:1839-1847`) from the mode the provider
  was *constructed* with and sends one `session/set_mode` if it
  differs from the agent's current mode.
- `crates/goose/src/acp/provider.rs:735-763` `update_mode` — picks the
  first mapped id the agent advertises (`select_mode_id`
  `:1849-1862`), then `send_set_config_option("mode", …)` when the
  session published a `category: "mode"` option, else
  `send_set_mode`. All three adapters publish the config option
  (probes above), so the config-option branch is the live one.
- `crates/goose/src/acp/provider.rs:925-930`, `:1032-1063` — `stream`
  snapshots `goose_mode` per turn; `permission_decision_from_mode`
  (`:2375-2381`) auto-answers Auto (AllowOnce) and Chat (RejectOnce)
  and returns `None` for Approve/SmartApprove, which is what makes the
  request travel to the user.
- `crates/goose/src/acp/provider.rs:2107-2147`
  `build_action_required_message` — keeps `tool_call.fields.title`,
  `raw_input` and **the first text content block only**. A `diff`
  content block (what both Claude and Cursor send for an edit) is
  dropped, so the card shows raw arguments instead of the diff.
- `crates/goose/src/acp/server.rs:1500-1516`, `:1659-1720` — the
  server rebuilds the request with
  `build_permission_tool_call_update(request_id, tool_name, args,
  prompt)` (`server/tool_calls/conversion.rs:136-156`) and offers a
  fixed four options (AllowAlways · AllowOnce · RejectOnce ·
  RejectAlways) regardless of what the adapter offered;
  `map_permission_response` (`acp/common.rs:70-107`) maps the answer
  back by *kind*, taking the first option of that kind.
- `crates/goose/src/acp/server/tool_calls/conversion.rs:14-63` —
  `default_tool_title` re-titles: `format_tool_name` replaces `_`
  with ` `, then appends `" · <first arg>"` for keys `command`,
  `path`, `file`, … . Fed the adapter's title, a Bash prompt becomes
  `"echo T3-PROBE · echo T3-PROBE"`; a Write prompt keeps
  `"Write probe-write.txt"` (its `file_path` key is not in the list).
- `ui/desktop/src/acp/adapter/permissions.ts:20-41` — `toolIdentity`
  (`adapter/shared.ts:107-122`) needs `_meta.goose.toolCall.toolName`,
  which the server never sets on a permission update, so the card's
  `toolName` is that re-titled string; `ToolCallConfirmation.tsx:18-22,
  :40-47` runs it through `snakeToTitleCase` (`utils.ts:8-13`), which
  **lowercases everything after the first character** — a shell
  command in the header reads `Echo t3-probe · echo t3-probe`.
- `ui/desktop/src/components/ToolApprovalButtons.tsx:122-144` — three
  buttons, and **Always Allow is hidden whenever `prompt` is set**
  (`:132`), i.e. whenever the adapter sent a text content block.
- `crates/goose/src/acp/server/new_session.rs:50`,
  `:58-61` — a new session is created with
  `Config::global().get_goose_mode()`; `meta_string` reads only
  `provider`, `client`, `sessionTitle`, `projectId`,
  `recipeParameterScopeId` (`new_session.rs:198`, `:287`, `:315`,
  `:319`, `server.rs:372`), so **`session/new` carries no mode** and a
  new session always starts on the global `GOOSE_MODE`.
- `crates/goose/src/acp/server.rs:1158-1197` — activation calls
  `sync_session_bridge`, which for an adapter-backed session
  recreates the provider and ends in `recreate_provider_for_session`
  (`agent.rs:3652-3683`) → `update_goose_mode(self.goose_mode())`;
  `Agent::goose_mode` is seeded from the session row
  (`execution/manager.rs:186-196`). This is why the session's mode
  wins over the connect-time global.
- `crates/goose/src/acp/response_builder.rs:217-233`, `:300-315` —
  `build_mode_state` publishes all four `GooseMode` variants and
  `build_config_options` publishes them as `{id: "mode", name:
  "Mode", category: Mode}` — the option the desktop renders.
- `ui/desktop/src/workspace/SessionControls.tsx:78-103` — Advanced's
  Session controls renders every published option as a radio group
  with `workspace-config-<id>` / `workspace-config-<id>-<value>` test
  ids, so **`workspace-config-mode-approve` exists today** with no
  fork-side code; `ui/desktop/src/acp/sessionConfig.ts:65-72` is the
  `session/set_config_option` call behind it.
- `ui/desktop/src/components/settings/mode/ModeSection.tsx:9-26`,
  `mode/ModeSelectionItem.tsx:48-69` — Settings writes the **global**
  `GOOSE_MODE` (Autonomous · Manual · Smart · Chat only); it is not
  per session.
- `crates/goose/src/agents/platform_extensions/summon.rs:849`,
  `:1636-1655` — a delegated child's session and `AgentConfig` are
  both `GooseMode::Auto`, with the in-tree comment "Subagents must use
  Auto until `get_agent_messages` forwards ActionRequired messages to
  the parent." (d) confirmed. (`tasks.md`'s cite `summon.rs:622,1400,
  2075,2373` has drifted; the live sites are `:849` and `:1655`.)
- `crates/goose-cli/src/session/mod.rs:1356-1378` — a **headless**
  `goose run` that meets a tool confirmation in Approve/SmartApprove
  does not park and does not auto-allow: it cancels the turn and
  errors, `"Tool approval required in non-interactive mode with
  GooseMode::approve. This is an invalid configuration …"`. That
  error *is* the CLI-observable proof that the seat asked; a seat that
  does not ask finishes the run and leaves the file on disk. The
  interactive `goose session` renders the prompt and waits
  (`prompt_tool_confirmation`, `:1358`); `output.rs:325-329` prints
  `action_required(tool_confirmation): <tool_name>` when the message
  is rendered.
- `crates/goose-cli/src/cli.rs:225-234`, `:326-336` — the probe's
  flags: `goose run -t/--text <TEXT>` and `--provider <NAME>`.
  `ui/desktop/src/bin/goose` and `target/debug/goose` are the same
  483 MB debug binary built 2026-09-16 in the **main checkout**;
  neither exists in this worktree, and nothing can rebuild them today
  (§Unknowns, the `sqlx` dlopen break).
- `crates/goose/src/providers/codex_acp.rs:85` — **Chat** maps to
  `read-only` as well, and `reject_all_tools`
  (`acp/provider.rs:930`, `:1000-1010`) only suppresses a tool request
  when the adapter *asks*. The same capture that shows Approve is
  ungated on Codex shows Chat is not chat-only there either: the
  in-workspace write lands as an ordinary tool call. Adjacent to this
  cluster's target; recorded for whoever owns the mapping.
- `crates/goose/src/providers/claude_code.rs:350-364`, `:715-726` —
  out of this cluster (print mode, not ACP) but named because the
  lever's Hard stop runs on it: permission flags are read from the
  **global** config at spawn and `update_mode` only guards against a
  *second* different mode. A session set to Approve on `claude-code`
  is accepted and then spawned with whatever the global mode says.

## Recorded decisions

- Approval forwarding to delegated children — out of scope; every
  child runs Auto (`docs/2026-09-15-goose-spine-bridge-plan-v1.md:95-100`,
  approved 2026-09-15 20:40). Keep it out.
- agy's ungated print mode accepted for V0 with the Reviewer gating
  the diff (`tasks.md` §Waiting on the user, task 17 hand checks,
  2026-09-16).
- "Mode" in the workspace means Direct · Orchestrate only; the
  permission gate keeps upstream's words and stays in Settings
  (`DESIGN.md:108`, §Vocabulary `:73`). A per-session permission gate
  on the default surface would contradict this line — it is the
  user's to change, not the plan's.
- A routine saves the session's actual goose mode, and an Approve
  routine would stall unattended — open product call
  (`tasks.md`, task 63). Anything this plan does to per-session
  Approve lands in that hole too.
- `agent.rs` and `state_machine/` are not edited in the fork
  (`ARCHITECTURE.md` §Invariants; `scripts/check-spine.sh`). Every
  finding above that sits in `agent.rs` is read-only evidence.

## Approve mode reaches the ACP seats

### Inventory — (a) how the mode is set per provider

| provider | at `session/new` | `session/set_mode` on the adapter? | live behaviour in the Approve-mapped mode |
|---|---|---|---|
| `claude-acp` (`claude_acp.rs:70-102`) | `mode_mapping[global mode]` → `apply_session_mode` sends one `session/set_mode` (`provider.rs:1795-1837`) | yes — and the session's own mode arrives right after via `update_mode` → `set_config_option("mode")` (`provider.rs:745-752`) | asks for Write, does **not** ask for `echo` (`claude.write.log`, `claude.perm.log`) |
| `codex-acp` (`codex_acp.rs:78-103`) | same; `session_mode_id: None` is inert | yes — `setSessionMode` and the `mode` config option both land in `applyModeChange` (`codex-acp/dist/index.js:33181-33247`) | `read-only` wrote the in-workspace file with **no** request (`codex.write.log:7-9`) |
| `cursor-acp` (`cursor_acp.rs:70-103`) | same | yes — `current_mode_update` echoed back (`cursor.write.log:3-4`) | `agent` wrote the file with **no** request (`cursor.write.log:6-10`) |
| `agy` (`agy.rs:120-137`) | n/a — not ACP | no — trait default `Ok(())` (`base.rs:673-675`) | always `--dangerously-skip-permissions`; **hard limit**, and today a *silent* one |
| `claude-code` (`claude_code.rs:350-364`) | global flags at spawn | `update_mode` guards, never re-flags | out of cluster; flagged because Hard runs here |

`AcpProvider::connect` does read the global mode
(`claude_acp.rs:70`, `:102`), but it is corrected on the way in: a new
session's row is the same global value (`new_session.rs:50`), and any
session whose row differs has it pushed after the provider is built
(`agent.rs:3847-3855` on restore, `:3679-3682` on recreate,
`manager.rs:253-257` on the default-provider path). The only real
cost of the global read is one extra `session/set_mode` on the wrong
mapping before the right one lands.

### Inventory — (b) how a permission request reaches Goose and the desktop

- Adapter → provider: the client loop's `requestPermission` handler
  (`provider.rs:1410-1435`) forwards the request as
  `AcpUpdate::PermissionRequest` with a `oneshot` back-channel.
- Provider → loop: in Auto/Chat it is auto-answered
  (`permission_decision_from_mode`, `:2375-2381`); in
  Approve/SmartApprove it becomes a `Message::assistant()
  .with_action_required(...).user_only()`
  (`build_action_required_message`, `:2107-2147`) and the turn parks
  on the oneshot.
- Loop → ACP client: `server.rs:1500-1516` matches
  `ActionRequiredData::ToolConfirmation` and
  `handle_tool_permission_request` (`:1659-1720`) sends
  `session/request_permission` to the desktop with its own four
  options.
- Desktop: `requestAcpPermission` (`permissionRequests.ts:14-31`) →
  `applyPermissionRequest` (`adapter/permissions.ts:12-44`) pushes a
  synthetic `actionRequired` message → `ToolCallConfirmation.tsx` →
  `ToolApprovalButtons.tsx`; the answer walks back through
  `resolveAcpPermissionRequest` → `submit_tool_confirmation`
  (`agent.rs:1517-1596`) →
  `try_route_tool_confirmation_to_provider` (`:1597-1613`) →
  `AcpProvider::handle_permission_confirmation` (`:828-839`) →
  `map_permission_response` (`acp/common.rs:70-107`) → the adapter.
- Not auto-answered, then — **forwarded**. Three fidelity losses on
  the way:
  1. **the diff is dropped** — only the first *text* content block
     survives (`provider.rs:2126-2137`); Claude's and Cursor's edit
     prompts carry `type: "diff"`, so the card shows `file_path` +
     the whole new content as raw arguments.
  2. **the name is mangled** — `default_tool_title` re-titles the
     adapter's title and `snakeToTitleCase` lowercases it
     (`conversion.rs:27-63`, `utils.ts:8-13`): a Bash prompt would
     read `Echo t3-probe · echo t3-probe`.
  3. **the options are collapsed to kinds** — Goose always offers
     four, and `find_option` (`common.rs:102-107`) takes the *first*
     option of the chosen kind. Claude's ExitPlanMode prompt offers
     two `allow_always` options (`auto`, then `acceptEdits`,
     `acp-agent.js:3387-3402`), so pressing **Always Allow** there
     silently switches the seat into Claude's `auto` mode. (Not
     reproduced live — the probe never entered plan mode.)
  - Also: `ToolApprovalButtons.tsx:132` hides **Always Allow**
    whenever the adapter sent a text block, so which buttons the card
    shows depends on the adapter's payload. The live Write prompt
    carried a diff and no text, so all three showed.

### Inventory — (c) the session's mode when the provider is built, and the smallest change

- At `session/new`: the row is created with the global mode
  (`new_session.rs:50`) and no `_meta` field can override it
  (`server.rs:372`, the `meta_string` call sites). The provider is
  then built inside `activate_acp_session` →
  `prepare_acp_session_agent` → `restore_provider_from_session`
  (`agent.rs:3740-3856`), which ends by pushing `session.goose_mode`
  to it — so session and adapter agree by the time the first prompt
  runs.
- At `on_set_mode`: `agent.goose_mode()` (`agent.rs:3647-3649`) is
  the in-memory session mode, written by `update_goose_mode` after
  the provider accepted it. A provider that *refuses* fails the whole
  call (`:3632-3635`) and the session keeps the old mode — correct,
  and the shape agy should adopt.
- `Provider::set_session_mode` does **not** exist; the hook is
  `Provider::update_mode(&self, session_id, mode)`
  (`goose-provider-types/src/base.rs:673-675`), already implemented by
  `AcpProvider` (`:735-763`), `claude_code` (`:715-726`) and `codex`
  (`providers/codex.rs:739`).
- Smallest change that makes both paths honest: **nothing in the wire**.
  `session/new` + `on_set_mode` already push the mode. What is missing
  is (i) a truthful `update_mode` on `agy` (refuse non-Auto instead of
  silently succeeding), (ii) a mapping and copy that say what Approve
  means per seat, and (iii) the two fidelity fixes on the card.
  Threading the mode into provider *construction* would mean changing
  `ProviderDef::from_env_with_working_dir`'s signature across every
  provider to save one redundant `set_mode` — the plan should not.

### Inventory — (d) the delegated child

Out, confirmed: `summon.rs:849` creates the child session `Auto` and
`:1655` builds its `AgentConfig` `Auto`, with the in-tree reason at
`:1636-1638`; the bridge plan lists it as out of scope
(`docs/2026-09-15-goose-spine-bridge-plan-v1.md:97-100`). Nothing in
this cluster touches it. Note for the plan: because the child is
built Auto and `permission_decision_from_mode(Auto)` auto-allows
(`provider.rs:2375-2377`), a child on an ACP seat needs no prompt
plumbing at all — the parent's Approve does not leak into it.

### Inventory — (e) the Direct case is the target

A Direct session (no role loaded, PRD `:52`) on `claude-acp` with the
session's mode set to Approve is the one configuration where the whole
path is live today: adapter asks → card → Deny → the model names the
refusal. Nothing new is needed to *reach* it; what the fork owes it is
a reachable control (Advanced → Session controls → Mode → Approve
exists but is labelled "Mode" beside a different "Mode"), honest copy,
and a card that shows the diff.

### Options → pick

| Option | Owns | Trades away |
|---|---|---|
| **A · Prove and true-up** — one live probe pinning the matrix; `agy.update_mode` refuses non-Auto; `cursor_acp` Approve→`plan` **or** the seat declares "no ask mode"; the card carries the adapter's tool name and diff; one walk | the promise matches the seat; no new surface; every change is one file | Approve on Codex/Cursor either becomes read-only-ish (`plan`) or is openly unavailable — the user loses "Approve means ask" on two seats |
| **B · Goose-side gate** — stop mapping Approve to an adapter mode; keep the seat in its auto mode and have Goose intercept every `tool_call` update and ask before letting the turn continue | one meaning of Approve on every seat, adapter-independent | ACP gives no pre-execution hook — a `tool_call` update arrives *as* the tool runs, so the gate would ask after the edit; needs a Goose-side veto the protocol does not have. Fiction |
| **C · Ship the truth in the UI only** — leave every mapping, add per-seat copy in Session controls ("Claude asks for risky actions · Codex asks outside the workspace · Cursor does not ask · agy cannot") | honesty for the price of strings | the label still reads Approve while the seat writes files; the fidelity bugs stay; nothing is testable beyond a string |

Pick: **A**, with C's copy as one of its tasks.
- The matrix is evidence, not opinion, so the plan's first task is the
  probe that re-runs it on the current adapter versions.
- `cursor_acp`'s Approve→`agent` line is a wrong comment as much as a
  wrong mapping; changing it to `plan` makes Approve mean "it cannot
  edit without telling me" on that seat, which is the closest true
  thing Cursor offers. `[unsure]` whether the user prefers that over
  "Approve unavailable on Cursor" — options, not a pick.
- Codex's `read-only` already asks for anything outside the workspace;
  leave the mapping, fix the copy.
- agy refusing non-Auto turns a silent lie into the Error row the
  DESIGN states already define.
- B is listed to be rejected: nothing in ACP lets a client veto a tool
  call it was not asked about.

### UX test plan

Setup: a Direct session on `claude-acp` in a scratch git repo with no
`permissions.allow` rule for `Write`; Advanced controls on
(`workspace.ui = advanced`); `GOOSE_MODE` left at its global value so
the walk exercises the per-session change.

1. Open Session controls (`workspace-session-controls`) → assert the
   `workspace-config-mode` group lists four radios and that
   `workspace-config-mode-<global>` is `aria-checked="true"`.
2. Click `workspace-config-mode-approve` → assert it becomes
   `aria-checked="true"` **and** that the seat line beside it reads
   the per-seat sentence (new testid `workspace-config-mode-note`,
   text `/asks before/i` for Claude) within 2 s.
3. Prompt the session to write a file. Assert a card
   `[data-testid="tool-confirmation"]` (new testid on
   `ToolCallConfirmation.tsx`'s root) appears within 60 s, its header
   reads `Write <basename>` (**not** the lowercased re-title — this
   assertion fails on today's tree), and it shows a diff row
   (`tool-confirmation-diff`) rather than a raw `content` argument.
4. Assert the buttons: `tool-approval-allow-once`,
   `tool-approval-deny` always; `tool-approval-always-allow` only when
   the request carried no text prompt.
5. Click Deny → assert the card collapses to
   `Write <basename> - Denied once`, the tool row reaches a terminal
   status, and the agent's next text mentions the refusal
   (`/denied|refus|not allowed/i`) within 60 s.
6. Switch the session to `workspace-config-mode-auto` mid-session →
   assert no card on the next write.
7. On an `agy` session, click `workspace-config-mode-approve` →
   assert the radio does **not** move and an error line appears in
   place naming the seat (`workspace-config-error`, text
   `/agy .* cannot ask/i`).

DESIGN §Shared component states the card must declare
(`DESIGN.md:117-135`) — a `TOOL_CONFIRMATION_STATES` export beside the
pane ones:
- **Empty** — no pending request: the card does not exist; the tool
  row alone is the surface.
- **Loading** — the request has arrived but its arguments are still
  streaming: the header and buttons render, the diff area is a
  skeleton; never a blank card.
- **Partial** — the adapter sent no diff and no text (Cursor's shape):
  the raw arguments block under a one-line bar saying the seat sent no
  preview.
- **Running** — the turn is parked on the answer: the tool row keeps
  its spinner, the buttons are live (they are the only way out), and
  Stop is available; Esc cancels the turn →
  `cancelAcpPermissionRequestsForSession`
  (`permissionRequests.ts:54-66`) resolves `cancelled` and the adapter
  raises "Tool use aborted" (`acp-agent.js:3493-3496`).
- **Error** — a stale request (`ToolApprovalButtons.tsx:100`, "This
  approval request is no longer active.") and the agy refusal: cause
  then recovery in place, the row kept.
- **Ready** — answered: the one-line `<tool> - Allowed once /
  Denied once / Always allowed` (`ToolApprovalButtons.tsx:107-120`).

Keyboard: Tab reaches Allow · Always · Deny in that order; Enter
fires; Esc is the turn's cancel and must not dismiss the card
(`DESIGN.md` §Accessibility, "Esc cancels the turn"). Focus lands on
Allow when the card mounts, and returns to the chat input after an
answer.

Phone width: the card is in the chat column, which never folds
(`DESIGN.md:63`); the three buttons wrap to two lines under ~360 px
and the diff area scrolls horizontally rather than widening the
column.

Only a human can verify:
- a real Deny mid-edit — the file on disk is untouched and the agent
  recovers in the same turn rather than retrying the write;
- **Always Allow** actually persisting: the rule lands in Claude
  Code's own settings and the *next* turn does not ask;
- that the Manual mode's ask set matches expectation on the user's
  machine — the `echo` probe did not ask, and whether that is Claude's
  risk classifier or the user's own `permissions.allow` rules cannot
  be told from the wire;
- the Codex and Cursor mappings after the pick, on a real edit outside
  the workspace;
- phone rendering of a long diff.

### Scope — in / out / protected

- in: `crates/goose/src/providers/agy.rs` (an `update_mode` that
  refuses non-Auto), `crates/goose/src/providers/cursor_acp.rs`
  (mapping + the wrong comment),
  `crates/goose/src/acp/provider.rs` (`build_action_required_message`:
  carry the adapter's tool name and diff),
  `crates/goose/src/acp/server/tool_calls/conversion.rs` (stop
  re-titling a title that is already a title; set
  `_meta.goose.toolCall.toolName`),
  `ui/desktop/src/acp/adapter/permissions.ts` +
  `ui/desktop/src/components/ToolCallConfirmation.tsx` (testids, the
  diff row, the partial bar),
  `ui/desktop/src/workspace/SessionControls.tsx` (the per-seat note
  and the error line), one walk under `ui/desktop/tests/e2e/`.
- out: delegated children (§(d), bridge plan `:97-100`);
  `claude-code`'s spawn-time flags (print mode, not this cluster —
  recorded at `claude_code.rs:350-364` for whoever owns Hard);
  threading the mode through provider construction (§(c));
  a new default-surface control for the permission gate
  (`DESIGN.md:108` keeps it in Settings — the user's call);
  `GOOSE_MODE` as a global setting.
- protected: `crates/goose/src/agents/agent.rs` and
  `crates/goose/src/agents/state_machine/` (fork invariant). No edit
  is needed there: for an ACP seat the permission path lives entirely
  in the provider and the ACP server, so **both loops behave
  identically** and the AGENTS.md parity rule is satisfied without a
  second implementation. `ToolApprovalButtons.tsx` and
  `ToolCallConfirmation.tsx` are upstream components — compose and add
  testids, do not fork.

### Unknowns

- Does `cursor-agent acp` ever send `session/request_permission`, in
  any mode? One prompt in `agent` mode did not. — cheap to test? yes
  (one `probe3.py` run in `plan` mode); reversible? yes.
- Does `codex-acp` `read-only` ask when the edit is **outside** the
  cwd? The `AgentMode` table says it should
  (`index.js:27705-27720`). — cheap? yes; reversible? yes.
- Whether Claude's `default` skipped the `echo` because of the risk
  classifier or the user's own `permissions.allow` rules. — cheap? no
  (needs a clean `~/.claude` home); reversible? yes.
- Whether **Always Allow** on an ExitPlanMode prompt really switches
  the seat to `auto` (the code path says yes,
  `acp-agent.js:3387-3402` + `common.rs:102-107`; not reproduced). —
  cheap? yes (one probe that enters plan mode); reversible? the mode
  change is, the burnt turn is not.
- Where `onSetOption`'s rejection surfaces in the desktop today — a
  refused `set_config_option` is an ACP error; whether Session
  controls shows it or swallows it is unread
  (`sessionConfig.ts:65-72`). — cheap? yes (vitest); reversible? yes.
- The two-"Mode" collision in Advanced (the server's `mode` option vs
  the Direct·Orchestrate chip, `DESIGN.md:18`, `:73`, `:89`, `:108`).
  Options: rename server-side (upstream drift), override the label
  client-side for id `mode` (breaks "the server's own names"), or
  leave. **The user owns vocabulary — presented, not picked.**
- Whether an Approve session may be saved as a routine at all
  (`tasks.md` task 63's open product call). — not cheap to settle
  here; it is a product decision.
- **Why no cargo build completes on this machine** (Darwin 27.0.0):
  `libsqlx_macros-….dylib` fails `dlopen` with "mis-aligned LINKEDIT
  string pool", in the shared target dir and a fresh private one
  alike (twice, 2026-09-18). Every Rust `confirm:` in `tasks.md` is
  unrunnable until it is resolved — likely a toolchain/OS mismatch
  after the OS bump, so `cargo clean` plus a hermit Rust refresh is
  the first thing to try. — cheap to test? yes; reversible? yes.
  Blocks tasks 2 and 4's confirms, not their implementation.

## Plan skeleton

Evidence, not a task — the matrix in §The surprise was run 2026-09-18
with `scratchpad/r-approve-mode/probe3.py <modeId> <adapter cmd…>`
(stdio JSON-RPC: `initialize` → `session/new` → `session/set_mode` →
`session/prompt` "create probe-write.txt containing HELLO", answering
any `session/request_permission` with its `reject_once` option). Re-run
it per seat whenever an adapter version bumps; it is the reference the
tasks below are measured against.

Tasks in dependency order. `worker:` per the model-routing table;
`confirm:` baselined on the untouched tree beneath each.

1. **agy refuses non-Auto** — implement `update_mode` on
   `AgyProvider` returning `ProviderError::RequestFailed` for
   Approve/SmartApprove/Chat with the reason ("agy runs
   `--dangerously-skip-permissions`; it cannot ask"). Waits on:
   nothing.
   - worker: low
   - confirm: `cargo test -p goose --lib providers::agy::tests::update_mode_refuses_non_auto 2>&1 | tail -3` → `test result: ok. 1 passed`
   - baseline: **no cargo build completes on this machine today.**
     Both the shared `CARGO_TARGET_DIR=/Users/hoaqbui/github/melody-agent2/target`
     and a fresh private one under the scratchpad fail identically
     before any test runs:
     `error: …/debug/deps/libsqlx_macros-5a2651784b49b40f.dylib: dlopen(…): (mis-aligned LINKEDIT string pool, fileOffset=0x0066EC84)`
     → `error: could not compile 'sqlx' (lib) due to 1 previous error`
     (run twice, 2026-09-18, hermit PATH). Not a concurrency race — an
     environment break that blocks every Rust `confirm:` in this repo
     (§Unknowns). Tree baseline instead:
     `grep -c "fn update_mode" crates/goose/src/providers/agy.rs` → `0`.
2. **Cursor's mapping and comment** — pick between Approve→`plan` and
   "Approve unavailable on this seat" (an `update_mode` refusal like
   agy's), then make `cursor_acp.rs:70-103` say the true thing. Waits
   on: the user's pick between the two.
   - worker: low
   - confirm: `grep -n "requestPermission" crates/goose/src/providers/cursor_acp.rs | wc -l` → `0`
   - baseline: `1` today (the comment at `:71-75` the capture
     contradicts).
3. **Carry the adapter's tool name and content** — set
   `_meta.goose.toolCall.toolName` on the permission update and stop
   `default_tool_title` re-titling a title that is already one;
   forward a `diff` content block instead of dropping it
   (`acp/provider.rs:2107-2147`,
   `acp/server/tool_calls/conversion.rs:136-156`). Waits on: nothing.
   - worker: medium
   - confirm: `cargo test -p goose --lib acp::provider::tests::action_required_carries_adapter_tool_name 2>&1 | tail -3` → `test result: ok. 1 passed`
   - baseline: same `sqlx`/`dlopen` failure as task 1; tree baseline
     `grep -c "action_required_carries_adapter_tool_name" crates/goose/src/acp/provider.rs` → `0`.
4. **The card** — testids (`tool-confirmation`,
   `tool-confirmation-diff`, `tool-approval-allow-once` /
   `-always-allow` / `-deny`), the diff row, the partial bar, and a
   `TOOL_CONFIRMATION_STATES` export naming the six states. Waits
   on: 3.
   - worker: medium
   - confirm: `cd ui/desktop && pnpm vitest run src/components/ToolCallConfirmation.test.tsx -t "renders the adapter diff" 2>&1 | tail -3` → `1 passed`
   - baseline: not runnable in this worktree — it has no
     `ui/desktop/node_modules` (`ls ui/desktop/node_modules` → no
     output; `pnpm exec playwright …` → `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL
     Command "playwright" not found`). Tree baseline:
     `grep -c "tool-confirmation" ui/desktop/src/components/ToolCallConfirmation.tsx` → `0`.
5. **The per-seat note in Session controls** — one line under the Mode
   radios naming what the current seat does with Approve, and the
   Error row when a seat refuses the change. Waits on: 1, 2, 4.
   - worker: medium
   - confirm: `grep -c "workspace-config-mode-note" ui/desktop/src/workspace/SessionControls.tsx` → `1`
   - baseline: `0` today.
6. **The walk** — `ui/desktop/tests/e2e/approve-mode.spec.ts` for
   steps 1–7 of the UX test plan, on `claude-acp`. Waits on: 4, 5.
   - worker: medium
   - confirm: `just walk "approve mode"` → `1 passed`
   - baseline: `ls ui/desktop/tests/e2e | grep -c approve` → `0`; the
     `--list` form cannot run here (no `node_modules`, above).
7. **The live goose-level probe** — the proof the item asks for; the
   session runs it, not a worker. Waits on: 1–5 **and** on the
   toolchain break (§Unknowns): the probe needs a goose binary built
   from the changed tree, and the only ones on disk
   (`target/debug/goose`, `ui/desktop/src/bin/goose`, identical, built
   2026-09-16 in the **main checkout**) predate every task above.
   - Command, from a scratch git repo:
     `GOOSE_MODE=approve <goose> run --provider cursor-acp -t "create probe.txt containing HELLO using your file-write tool"`
   - What shows the prompt: headless `goose run` in Approve neither
     parks nor auto-allows — it cancels the turn and errors with
     `Tool approval required in non-interactive mode with GooseMode::approve`
     (`goose-cli/src/session/mod.rs:1356-1373`). That error is the
     seat asking; a seat that does not ask finishes the run and leaves
     the file.
   - confirm: `test -f probe.txt && echo WROTE || echo GATED` → `GATED`
   - baseline: `WROTE` today — the 2026-09-18 capture shows
     `cursor-agent acp` in `agent` (and `codex-acp` in `read-only`)
     writing the file with zero `session/request_permission`.
   - the desktop half is a hand check, not a walk: the same prompt on
     a `claude-acp` session with the card on screen → **Deny** → the
     card collapses to `Write probe.txt - Denied once` and the agent's
     reply names the refusal (live today: `tool_call_update status:
     "failed", rawOutput: "User refused permission to run tool"`).
