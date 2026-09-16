# Design

Read this before designing, specifying, or implementing a user-facing surface. PRDs cite this file's names and states; a PRD that defines a visual is exposing a missing entry here.

The delta over Goose Desktop's design system. Under a section upstream already settles the line is "upstream's, unchanged" and only what the fork adds follows. Headings tagged `[contract]` are matched by code and carry a `check:` line; a contract without one is listed under Open decisions. Everything else is direction. Template: `skills/rpi/templates/design.md`.

## Principles

- **The Upstream Rule** — chat, tool rows, settings and the session list are Goose's components, composed not restyled (`ARCHITECTURE.md:86`, `:98`); a fork-side copy of an upstream component is a bug.
- **The One Pane Rule** — the centre is the chat plus at most one pane; a second promoted pane replaces the first, which returns to the side panel (PRD `docs/2026-09-15-workspace-prd-v1.md:86-88`, `pane-store.ts:18`, `:53`); a second split, a floating window, or a modal pane is forbidden.
- **The Nothing Lost Rule** — a pane that leaves the centre keeps its state and its tab slot (PRD `:186-188`, `pane-store.ts:14-15`); a pane that remounts empty on return is a bug.
- **The Named Runtime Rule** — every step on screen says which runtime did it, in the runtime's own name: the header, the "→ Codex from here" divider, the worker row (PRD `:21-24`, `:96-97`; PRODUCT.md §11); colour or an icon alone never carries it.
- **The Floating Button Rule** `[direction]` (user, 2026-09-15) — buttons carry a soft shadow beneath them so they read as floating; a flat control the user is meant to press is a bug.
- **The Into Rule** `[direction]` (user, 2026-09-15) — transitions have things disappear *into* things: a closed pane returns into its tab, a promoted tab grows out of the side panel; a cut, a fade to nothing, or an element that appears from nowhere is forbidden where a source or destination exists.
- **The One Word Rule** — one word per concept per tier (§Vocabulary); the fork's "Mode" never means Goose's permission gate, and a provider id never reaches the default surface.

## Frame

Region names are the `ARCHITECTURE.md` §Modules they render into (`workspace`, `components`); a region without a module, or a module drawing outside its region, is drift. `main`, `preload`, `acp`, `native` and the sidecar render nothing and have no region (`ARCHITECTURE.md:80-88`).

```text
Application window
├── header — `workspace`: project name · Runtime ▾ · Mode ▾ (PRODUCT.md §11 sketch; PRD :36-47)
├── sessions — `components`: upstream's session list, unchanged (PRD :33)
├── centre — the chat; never a pane (PRD :84-108, amended 2026-09-15)
│   ├── RPI strip — `workspace`, above the chat · later (PRD :127-134)
│   └── chat — `components`: transcript, tool rows, input with ⌘Enter; never moves
└── right dock — `workspace`: panels stacked top to bottom, each a tab strip over one visible pane;
    │           sizes are fractions of the dock's height summing to 1 (`pane-store.ts:14-19`, `:25`)
    ├── panel — tabs Files · Editor · Diff · Terminal · Git open here in launcher order (`pane-store.ts:6`)
    │           tear a tab off → a new panel below its source, half its height (`pane-store.ts:106`)
    │           drag a panel → reorder; drag a seam → resize against the neighbour (`:141`, `:150`)
    │           close the last tab → the panel disappears into its neighbour (`pane-store.ts:76`)
    └── later: Agents · Browser · Markdown (PRD :118-140; PRODUCT.md §11)

Phone width (≤ PHONE_MAX_WIDTH_PX, `pane-store.ts:10`, `:35-37`)
└── tab rail — chat first, then the same tabs; one thing visible, no split (`pane-store.ts:27`; PRD :142-152)
```

- 2026-09-15 amendment (tasks 41–42): the side panel and the one centre pane become the right dock; §Principles One Pane Rule and §Vocabulary rows "side panel" / "beside the chat" describe the superseded layout and wait on task 42's rewiring. Until then `centre` / `activeSide` / `sideTabs` are adapters over the dock (`pane-store.ts:184-201`).
- The header and the chat keep their location and meaning at every width; the Hub and the spotlight launcher are upstream's, unchanged (PRD `:28-30`).
- As space contracts: the dock folds away whole behind the chat, its panels kept (`pane-store.ts:176-179`); then the session list; the chat never shrinks below one readable line and its input. Growing back shows the dock as it was, plus the pane the phone had on screen (`pane-store.ts:180-181`, `pane-store.test.ts:173`).
- Dense surfaces: pane contents (tree, diff, terminal, git lists) at upstream's compact sizes; the header, tabs and chat are never dense.
- Overlays: upstream's stack, unchanged — dialogs (`ui/desktop/src/components/ui/dialog.tsx`) above toasts (`react-toastify`, `ui/desktop/package.json:96`); the fork adds no overlay. A pane is never an overlay. Focus returns to the control that opened the dialog; Esc dismisses a dialog, and only a dialog (see §Accessibility).

## Vocabulary & copy [contract]

| Concept | Default surface | Diagnostics | Internal |
|---|---|---|---|
| who the session talks to | **Runtime** — Claude · Codex · Cursor · agy · More… (PRD `:37-39`; agy from PRODUCT.md §5) | provider | the session's `provider` config option (`ARCHITECTURE.md:103`); ids `claude-acp`, `claude-code`, `codex-acp`, `cursor-acp`, `agy` (PRODUCT.md §5) |
| whether the runtime orchestrates | **Mode** — Direct · Orchestrate (PRD `:38-39`) | mode | whether the first turn loads `.agents/agents/orchestrator.md` (PRD `:51-52`) |
| Goose's permission gate | **Autonomous · Manual …**, in Settings only (`components/settings/mode/ModeSelectionItem.tsx:10`, `:18`) | goose mode | `GOOSE_MODE` (`components/settings/mode/ModeSection.tsx:13`) |
| talk to one runtime, no role | **Direct** | direct | no role loaded (PRD `:52`) |
| Claude owns the request, delegates | **Orchestrate** | orchestrate | orchestrator role loaded (PRD `:51`; PRODUCT.md §4) |
| a tool surface | **pane** — Files · Editor · Diff · Terminal · Git | pane | `PaneId` (`pane-store.ts:4`) |
| where panes live when not promoted | **side panel** | side tabs | `activeSide`, `sideTabs` (`pane-store.ts:20`, `:39`) |
| a pane beside the chat | **beside the chat**; the action is **Open as pane** (PRD `:85`) | centre | `centre` (`pane-store.ts:18`) |
| the phone's one-at-a-time strip | **tab rail** | rail | `visible` (`pane-store.ts:22`) |
| delegated work | **worker** — runtime · role · task · status (PRD `:103-104`) | subagent | SubAgent session, `tasks_update` (`ARCHITECTURE.md:87`, `:105`) |
| the job a worker does | **role** — Orchestrator, Researcher, Planner, Implementer, Reviewer, Advisor (and the Advisor's four specialists) | role | the ten files in `.agents/agents/` (`ARCHITECTURE.md:94`) |
| what a worker hands back | **artifact** — Brief · Plan · Result · Review (PRD `:113-115`) | artifact | the markdown the worker returned |
| a runtime switch mid-session | **"→ <Runtime> from here"** divider (PRD `:96-97`) | handoff | compacted handoff memo (PRODUCT.md §4) |

- Labels are imperative verbs in sentence case: Install, Sign in, Locate…, Restart, Commit, Open as pane (PRD §States).
- Errors: the cause in plain words, then the action that fixes it — "[exited <code>] — Restart", "No changes vs <base>", "Not a git repository" (PRD `:157-163`); never "something went wrong".
- Runtimes are named as the user says them (Claude, Codex, Cursor, agy); a provider id never rises to the default surface.
- "Mode" in the workspace means Direct · Orchestrate only; the permission gate keeps upstream's words and stays in Settings.
- Pane names are nouns; a tab reads Files, never "File browser".
- No retired words yet; when one retires it goes to `docs/decisions/`, dated.
- check: open — see §Open decisions (no workspace strings exist to check yet).

## Shared component states [contract]

The PRD's per-surface lines (`:137-170`) are deviations from these rows; a state the PRD names is one of these.

| State | Renders | Actions available | Context retained | Focus lands | Announces |
|---|---|---|---|---|---|
| Empty | the surface's purpose, the path or base it looked at, one starting action ("Nothing here" + path; "No changes vs <base>"; "No delegated work yet") | the starting action | — | the action | the empty line |
| Loading | layout preserved; the unresolved part is a skeleton or a row spinner, never a blank | navigation, tab switch, Stop | all | unchanged | "loading" once, then silence |
| Partial | the resolved part is live; the unresolved part carries one icon or one bar naming what is missing (lock, reload bar, "binary", "Sign in") | everything on the resolved part; the bar's action | all | unchanged | the bar's text |
| Running | the row keeps its spinner while the call runs, even after the reply ends (PRD `:148-149`); Commit is disabled and says why (PRD `:79`) | Stop; navigation | all | unchanged | the row's title |
| Error | plain cause (git's stderr, the OS error, the provider's error) then the recovery it names; the row stays (PRD `:167`, `:170`) | the recovery | input and selection kept; chat input enabled | the recovery | cause, then recovery |
| Cancelled | the reply truncated where it stopped; input enabled (PRD `:54`) | send again | the draft | the input | "stopped" |
| Unavailable | the row stays and reads Install, Sign in, or the probe's one line; the session does not start (PRD `:40-47`, `:142-146`) | Install · Sign in | selectors unchanged | the row | the row's text |

- A closed centre pane returns into its tab and that tab is the active one (`pane-store.ts:59-62`, `pane-store.test.ts:36`); focus lands on that tab.
- check: open — see §Open decisions (no pane declares a state type yet).

## Tokens & theme [contract]

Upstream's, unchanged. Source: `ui/desktop/src/theme/theme-tokens.ts` (named the single source of values at `ui/desktop/src/styles/main.css:62`) — roles `background`, `text`, `border`, `ring` × `primary`, `secondary`, `tertiary`, `inverse`, `ghost`, `info`, `danger`, `success`, `warning`, `disabled` (`main.css:68-110`); shadows `--shadow-hairline`, `--shadow-sm`, `--shadow-md`, `--shadow-lg` (`theme-tokens.ts:141-144`, dark `:197-200`) and `--shadow-default` (`main.css:203`, `:230`); themes light and dark (`main.css:181`, `:208`). Delta:

- Colour: `info` marks what the agent touched (the Files dot, PRD `:58`); `success` a done worker or phase; `warning` a waiting one; `danger` a failed one that stays (PRD `:104`, `:170`). Semantic roles never retint with theme; runtime identity has no colour role (open).
- Elevation is the Floating Button Rule: a workspace control at rest carries `--shadow-sm`; lifted (hover, drag, in flight during an Into motion) carries `--shadow-md`; `--shadow-lg` and `--shadow-default` stay upstream's for overlays. Upstream's own buttons are flat — `button.tsx:11` asks for `shadow-xs`, which the reset at `main.css:25` removes and `theme-tokens.ts` never defines — so the rule is a real delta; whether it lands as a `button.tsx` variant or a workspace wrapper is the plan's.
- Space and radius: upstream's scale; the fork adds no step.
- check: every role named here resolves — `for r in shadow-sm shadow-md shadow-default color-text-info color-text-danger color-text-success color-text-warning; do grep -q -- "--$r" ui/desktop/src/theme/theme-tokens.ts ui/desktop/src/styles/main.css || echo "missing $r"; done` prints nothing.

## Typography

Upstream's, unchanged (`main.css:113-135`; values from `theme-tokens.ts`). Delta: mono is for pane contents that are text from the machine — terminal, diff, editor, code, git output — and for nothing else; a tab, a header control, or a worker row in mono is a bug.

## Iconography

Upstream's, unchanged: `lucide-react` (`ui/desktop/package.json:87`), used by `components/ui/*`. The fork's tabs and pane toolbars draw from the same set at upstream's control size; a second set is a bug. The Files dot is a dot, not an icon, and is always paired with text (§Accessibility).

## Motion

Upstream's easing role `--ease-g2` (`main.css:65`); upstream names no duration roles (open). Every animation names the continuity it explains; here each is the Into Rule applied to the pane store:

- Promote (`openCentre`, `pane-store.ts:50-57`): the pane grows out of its side-panel tab into the centre slot; the tab's slot stays (`:14-15`), so the pane has somewhere to return.
- Replace (second `openCentre`, `:53-55`): the displaced pane shrinks into its tab, which becomes the selected one, as the new pane grows out of its own (`pane-store.test.ts:29`).
- Close (`closeCentre`, `:59-62`): the pane returns into its tab; the tab becomes active.
- Phone (`show`, `:70-73`): the leaving pane returns into its rail tab; the arriving one grows out of its rail tab; chat is a rail tab like the others.
- The "→ <Runtime> from here" divider appears in place; nothing animates in the transcript, the tool rows, or the terminal — text streams and rows appear, that is all.
- Reduced motion: upstream's global block zeroes every transition (`main.css:380-392`), so an Into motion degrades to a cut; the focus rules in §States still hold, so only the picture is lost.

## Accessibility & input

Upstream's, unchanged. Delta for the workspace:

- Promote, close, and every tab switch are reachable from the keyboard; after a close, focus is on the tab the pane returned into (§States).
- Keys the PRD fixes: ⌘Enter sends (`:50`), ⌘S saves the editor (`:61`), Esc cancels the turn (`:54`) — Esc is therefore never a pane-close key (open).
- Colour never alone: the Files dot pairs with a tooltip or the row's text; a worker's status is a word beside its colour; a runtime is its written name.
- Disabled controls say why in place — Commit while an agent turn writes files (PRD `:79`), Git in a non-repo (PRD `:162`).
- Destructive: none in V0 (view-only diff, PRD `:202`); Stop is not destructive and needs no confirmation.
- Conventions: macOS first (⌘); the phone has no modifier keys, so the terminal shows a key bar — Esc · Tab · Ctrl · arrows · paste (PRD `:129-130`; PRODUCT.md §11).

## Ownership

- **This file owns:** frame, vocabulary and copy rules, shared component states, token roles and theme rules, type, icon and motion direction, accessibility and input rules — for `src/workspace`. `src/components` is upstream's and is not restyled (`ARCHITECTURE.md:86`); where a workspace control is an upstream component, this file's rules govern how the workspace places and wraps it.
- **`PRODUCT.md` owns:** promise, users, principles, modes, runtimes and roles, workspace vision, scope tiers (PRODUCT.md §14).
- **`ARCHITECTURE.md` owns:** modules, dependency direction, invariants, data flow (`ARCHITECTURE.md:110`).
- **Feature PRDs own:** one journey's observable behavior; they cite this file's names and states and add only deviations.
- **`theme-tokens.ts`, `components/ui/`, `docs/mockups/` own:** values, implementations, pictures — subordinate to this file's roles and rules; a mockup that contradicts this file is a bug in the mockup.
- **`tasks.md` owns:** the open work; this file never lists tasks.
- **Precedence on conflict:** this file's rules > token values > implemented components > mockups > PRD prose.
- **Change trigger:** an edit to a `[contract]` section reopens every PRD that cites the changed row and reruns the section's `check:`.

## Open decisions

- Vocabulary check: upstream's strings are react-intl `defaultMessage`s (`ModeSelectionItem.tsx:10`); the natural check greps `src/workspace/**` messages for a word outside the table, but no workspace `.tsx` exists yet, so it would pass vacuously — resolved when task 11's header lands and the grep has strings to fail on.
- States check: no pane declares a state type; `pane-store.ts:4-23` types layout only — resolved when the first pane (Files) declares one and a test diffs it against the table.
- Floating Button reach: whether the rule reaches upstream's buttons (the chat's Send, Settings) through a `button.tsx` variant or stops at the workspace's own controls — resolved by the user.
- Motion scale: upstream has one easing role and no duration roles (`main.css:65`) — resolved by a prototype of promote and close in the shell.
- Runtime identity colour: whether a runtime gets a colour role beyond its written name — resolved by a user test once the Agents tree shows several runtimes at once.
- Pane-close key: Esc is cancel-turn (PRD `:54`) — resolved by trying candidates in the landed shell.
- Phone breakpoint: `PHONE_MAX_WIDTH_PX` (`pane-store.ts:10`) and upstream's `--breakpoint-md` (`main.css:15`) differ — resolved by measurement on the phone (PRD step 13).
