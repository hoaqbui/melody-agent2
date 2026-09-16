# PRD — Goose Desktop fork: the coding workspace (V0 + V0.5)

<!-- Upstream of rpi plan > implement. Spec for the user-observable
     surface only; PRODUCT.md §11 holds the vision, this file holds
     the walk. `· P0` = PRODUCT.md §12 V0; `· later` = §12 V0.5. How it
     is built (panes over App.tsx routes, xterm, monaco…) is the
     plan's. -->

## Problem

- Who: one developer running Claude Code, Codex, Cursor and Gemini on
  the same repo, several times a day. Today that is four terminals plus
  an editor plus a diff tool, and the orchestration (Claude delegating
  to the others) is invisible — output lands as text blobs
  (`PRODUCT.md` §2, §3.4, §35).
- Evidence: stock Goose Desktop 1.50 has the agents, providers and
  delegation but no file, diff, terminal or git surface — every check
  of what an agent did is an alt-tab (`docs/2026-09-15-goose-fork-
  research-v1.md` §The surprise; `ui/desktop/package.json` has no
  editor/terminal/diff dependency).
- Outcome that says it worked: a task goes from prompt → delegated
  work → reviewed diff → commit without leaving the window, and the
  developer can say which runtime did each step by looking at the
  screen.

## Journey

1. [Hub: working-directory picker, session list] · P0
   - does: pick the project directory (Hub's existing chooser) — the
     spotlight "Ask goose anything…" launcher window is unchanged
   - rule: if the directory has no git repo then the workspace opens
     with the Git pane disabled and a one-line notice
   - → [Workspace: chat centre, session list left, side panel right];
     fail(dir unreadable) → [Hub with error toast]; cancel → [Hub]

2. [Workspace, no session] · P0
   - does: in the header, pick a Runtime — Claude · Codex · Cursor
     (API-key providers under "More…") — and a Mode — Direct ·
     Orchestrate
   - rule: if the runtime's adapter binary is missing then the row
     shows "Install" and the session does not start; if Mode is
     Orchestrate and the project has no `.agents/agents/orchestrator.md`
     then Mode shows "no orchestrator role in this project" and falls
     back to Direct
   - → [Session on that runtime, empty chat, header shows
     "Claude · Orchestrate"]; fail(adapter not authenticated) → [chat
     shows the provider's auth step, selectors unchanged]

3. [Session, empty chat] · P0
   - does: type a task, ⌘Enter
   - rule: in Orchestrate the first turn loads the orchestrator role;
     in Direct no role is loaded
   - → [Streaming reply: text, thinking, tool-call rows with status];
     cancel(Esc / Stop) → [Session, reply truncated, input enabled]

4. [Streaming reply] · P0
   - does: click the Files tab in the side panel
   - rule: files the session has written since it started carry a dot;
     the tree is the session's working directory
   - → [Files pane: tree]; click a file → [Editor pane opens in the
     centre beside chat, read/write, saves on ⌘S]

5. [Files pane] · P0
   - does: click the Diff tab
   - rule: default diff = working tree vs HEAD; a second selector
     offers "since session start"; if there are no changes the pane
     says so with the base it compared against
   - → [Diff pane: file list left, unified/side-by-side diff right]

6. [Diff pane] · P0
   - does: click the Terminal tab; type a command
   - rule: the shell starts in the session's working directory with the
     user's login-shell PATH; killing the session does not kill the
     terminal
   - → [Terminal pane, scrollback kept while the window is open]

7. [Terminal pane] · P0
   - does: click the Git tab; stage files; write a message; Commit
   - rule: commit is disabled while an agent turn is still writing
     files (tool call in progress); the branch name is always visible
   - → [Git pane: branch, staged/unstaged lists, commit box; after
     commit the Diff pane's "vs HEAD" is empty]

8. [Any pane] · P0
   - does: drag the pane's tab into the centre, or click "Open as pane"
   - rule: the centre shows chat plus one pane side by side; opening a
     second pane replaces the first (it returns to the side panel); at
     phone width there is no centre split — one pane at a time behind
     a tab rail, chat included
   - → [Centre: chat + pane, resizable]; close → [pane returns to the
     side panel]
   - amended 2026-09-15 (user: "make them panels you can tear off and
     reposition on the right"; supersedes decision 3, chat + one centre
     pane): the chat stays in the centre and the centre pane goes; the
     side panel becomes a right dock of panels stacked top to bottom,
     each a tab strip over one visible pane
     - does: click a pane's launcher → it opens as a tab in the panel
       that holds it, else the top panel, else a new panel; drag a tab
       out of its strip (or shift-click the launcher) → it tears off
       into a new panel below its source; drag a tab into another
       strip, drag a panel header to reorder, drag a seam to resize
     - rule: a pane keeps its identity across every move, so contents
       survive repositioning (criterion 5); a panel emptied by its
       last tab closing disappears into its neighbour; at phone width
       the dock folds away behind the chat and the rail is unchanged —
       one pane at a time, chat first
     - → [Right dock: N panels, resizable]; close → [tab returns into
       its launcher (DESIGN.md §Principles, Into Rule)]

9. [Session on Claude, mid-conversation] · P0
   - does: change the runtime selector to Codex
   - rule: the conversation continues on the new runtime with a
     compacted handoff; the message list shows a divider
     "→ Codex from here"
   - → [Same session, new runtime]; fail(adapter missing) → [selector
     reverts, toast]

10. [Orchestrate session, task sent] · later
    - does: watch the Agents tab
    - rule: each delegated worker appears as a row — runtime · role ·
      task title · status (waiting / running / done / failed) — under
      the orchestrator; rows appear when the `delegate` call starts,
      not when it ends
    - → [Agents pane: tree]; click a row → [Worker transcript pane,
      read-only, its own tool-call rows]

11. [Orchestrate session] · later
    - does: look at the RPI strip above the chat
    - rule: phases Research · Plan · Implement · Review light up when a
      worker with that role starts; a phase with an artifact (Brief,
      Plan, Result, Review) is clickable
    - → [Artifact pane: the markdown the worker returned]; a phase
      that re-runs (Review FAIL → Implement) shows a counter, not a
      second strip

12. [Any session] · later
    - does: click the Browser tab; enter a URL (default: the project's
      dev server if one is listed in `.goose` config)
    - → [Browser pane with address bar]; Markdown tab → [rendered view
      of the file selected in Files]

13. [Phone, on the tailnet] · P0
    - does: open the workspace URL in Safari (or the installed PWA);
      pick the session that is open on the desktop
    - rule: the same session, the same panes, one at a time behind a
      tab rail; the terminal shows a key bar above the keyboard and
      reattaches to its shell after the tab was backgrounded; if the
      phone is off the tailnet the URL does not resolve — there is no
      public door
    - → [Workspace at phone width: chat first, tab rail: Files · Editor
      · Diff · Terminal · Git]; fail(sidecar down) → [one-line "not
      reachable" page with the Mac's name]

## States

- Hub: empty → no recent directories, chooser only; loading → session
  list greyed; partial → a recent directory that vanished shows a
  broken icon and "Locate…"; error → toast with the path.
- Runtime / Mode selectors: empty (no adapter installed) → every row shows
  Install; loading → row spinner while the binary is probed; partial →
  installed but not authenticated shows "Sign in"; error → row shows
  the probe's one-line error; Mode with no orchestrator role shows why
  and stays on Direct.
- Chat: empty → the runtime's name and mode as placeholder; loading →
  typing indicator; partial → a tool call still running when the reply
  ends keeps its spinner; error → the provider's error in the message
  list, input enabled.
- Files: empty → "Nothing here" with the path; loading → skeleton
  tree; partial → unreadable subtree shows a lock icon; error → path
  and the OS error.
- Editor: empty → no file selected message; loading → tab shows a
  spinner; partial → file changed on disk while open shows a reload
  bar; error → read error in the tab body.
- Diff: empty → "No changes vs <base>"; loading → skeleton; partial →
  binary files listed, not rendered; error → git's stderr.
- Terminal: empty → prompt; loading → "starting shell…"; partial →
  shell exited shows "[exited <code>] — Restart"; error → spawn error
  with the PATH used.
- Git: empty (not a repo) → pane disabled with "Not a git repository";
  loading → status spinner; partial → merge conflicts list files and
  disable Commit; error → git's stderr.
- Agents: empty → "No delegated work yet"; loading → row spinner;
  partial → a worker whose transcript is not yet stored shows its
  status only; error → row shows the worker's error and stays.
- RPI strip: empty → all phases dim; loading → active phase pulses;
  partial → a phase without an artifact is lit but not clickable;
  error → the failing phase turns red and stays clickable.

## Criteria

- [ ] Given a session on any runtime, when a tool call writes a file,
      then the Files dot and the Diff pane reflect it within 2 s of the
      tool call reaching `completed`.
- [ ] Given a runtime switch mid-session, when the next reply
      streams, then it references the prior turn (the handoff memo
      reached the new runtime) — checked by asking "what did we just
      change?".
- [ ] Given a delegate that fails, when the orchestrator's reply
      ends, then the Agents row is `failed` and the chat has the
      orchestrator's own text; the parent session is still usable.
- [ ] Given a killed worker process, when the orchestrator session
      is prompted again, then it answers (PRODUCT.md §13 Reliability).
- [ ] Given a centre pane replaced by another, when it is reopened,
      then no state was lost (terminal scrollback, editor buffer,
      diff selection).
- [ ] Given the same session open on the desktop and the phone, when a
      tool call writes a file, then both Files panes show the dot
      within 2 s — one sidecar, one watcher, two clients.
- [ ] Given the phone backgrounds the tab for five minutes, when it
      returns, then the terminal reattaches with its scrollback and the
      chat has the messages that arrived meanwhile.
- [ ] Given every stock Goose route (sessions, extensions, recipes,
      skills, schedules, apps, settings), when opened in the fork, then
      it opens and completes its main action — no regression in the
      upstream surface.

## Scope

- out: accept / reject per hunk (view-only diff at V0; why: the plan
  gate needs the pane first); worktree-per-task (Goose sessions share
  the cwd; why: PRODUCT.md §11 lists it as Should); a native phone app
  (the web build is the phone at V0; Capacitor later if a store listing
  or push is wanted), cloud / scheduled agents (PRODUCT.md §12);
  off-tailnet access; arbitrary-site browsing (iframe of the project's
  dev server only); editing a worker's transcript;
  any change to `crates/goose/src/agents/agent.rs` or
  `state_machine/` (dual-path rule).
- protected: every existing desktop route and `_goose/*` call keeps
  working; provider adapters are added, never modified.
