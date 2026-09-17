// The workspace around the chat (PRD steps 2-3, 8, 9; tasks 60, 71): three columns —
// Sessions (upstream's sidebar), Chat (the chat, the Hub, or any other page) and Work (the
// tab bar over the slots, WorkColumn) — with a seam between each pair, and the session
// controls handed to the chat input's bottom row: the lever in Easy, the Runtime · Mode
// chips and the Session controls popover in Advanced (task 58), the Worktree toggle in both
// (task 49). The bar's ⋯ is the session's menu (task 69, RailMenu) and its tabs carry a dot
// for what arrived while a pane was hidden. Below the phone breakpoint (task 20) one thing
// is on screen behind a tab rail, and the foreground reattaches what the background dropped.
// Composes exported components only and reaches ACP through src/acp.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useLocation, useSearchParams } from 'react-router';
import {
  BookOpen,
  Ellipsis,
  FileCode,
  FolderTree,
  GitBranch,
  GitCompare,
  Globe,
  MessageSquareText,
  Terminal,
} from 'lucide-react';
import { v7 as uuidv7 } from 'uuid';
import { defineMessages, useIntl } from '../i18n';
import { useNavigation } from '../hooks/useNavigation';
import { useConfig } from '../components/ConfigContext';
import { useModelAndProvider } from '../components/ModelAndProviderContext';
import { useNavigationContextSafe } from '../components/Layout/NavigationContext';
import { Navigation } from '../components/Layout/NavigationPanel';
import { SessionChipsSlot } from '../components/ChatInput';
import { NextChat, type NextChatDraft } from '../components/Hub';
import { Button } from '../components/ui/button';
import { DropdownMenu, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { SessionActionDialogs } from '../components/SessionActionsHeader';
import { useSessionActions } from '../hooks/useSessionActions';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/Tooltip';
import { cn } from '../utils';
import { toastError } from '../toasts';
import { sidecarFetch, type GitCwdRequest, type GitStatusResponse } from '../native/sidecar';
import { reconnectAcpAfterSystemResume } from '../acp/acpConnection';
import { formatAcpError } from '../acp/errors';
import { acpListProviderDetails, acpSetSessionProviderModel } from '../acp/providers';
import {
  acpSetSessionConfigOption,
  configChoices,
  getSessionConfigOptions,
  useSessionConfigOptions,
} from '../acp/sessionConfig';
import { listAgentSources, type SourceEntry } from '../acp/sources';
import { encodeRecipe } from '../acp/recipe';
import {
  acpChatSessionActions,
  acpChatSessionStore,
  useAcpChatSessionSnapshot,
} from '../acp/chatSessionStore';
import { createSession } from '../sessions';
import { AppEvents } from '../constants/events';
import type { ViewOptions } from '../utils/navigationUtils';
import { getEffectiveWorkingDir, getInitialWorkingDir } from '../utils/workingDir';
import type { Message } from '../types/message';
import type { ProviderDetails } from '../types/providers';
import type { WorkspaceUi } from '../utils/settings';
import { PaneContext, type PaneContextValue } from './pane-context';
import {
  createPaneStore,
  initialLayout,
  modeForWidth,
  paneVisible,
  restoreColumns,
  restoreDock,
  PANE_IDS,
  PHONE_MAX_WIDTH_PX,
  type Columns,
  type PaneId,
  type PaneStore,
} from './pane-store';
import { WorkColumn, loadDock, saveDock, type PaneChrome } from './WorkColumn';
import { RailMenu, type RailMenuProps, type TranscriptView } from './RailMenu';
import { CHANGES_POLL_MS, presetDiffBase, statusFingerprint } from './panes/diff/diff-store';
import { loadProjectEntry, saveProjectEntry } from './project-storage';
import {
  MODE_MESSAGES,
  RoutineChip,
  SessionChips,
  WorktreeChip,
  type RuntimeOption,
} from './SessionChips';
import { SessionControls } from './SessionControls';
import { RoutineSheet } from './routine/RoutineSheet';
import { firstUserPrompt } from './routine/routine';
import { Lever, STOP_MESSAGES } from './Lever';
import { TerminalPane } from './panes/terminal/TerminalPane';
import { reattachTerminals, subscribeTerminalOutput } from './panes/terminal/terminal-session';
import { newWorktreeSlug, worktreeSlugOf } from './worktree';
import {
  modeOfSession,
  moreRuntimes,
  needsInstall,
  orchestratorRecipe,
  runtimeDividerMessage,
  runtimeLabel,
  stopModel,
  stopOfSession,
  LEVER,
  ORCHESTRATOR_ROLE,
  RUNTIMES,
  type Mode,
  type Stop,
} from './session-controls';

const i18n = defineMessages({
  runtimeDivider: { id: 'workspaceShell.runtimeDivider', defaultMessage: '→ {runtime} from here' },
  startFailed: { id: 'workspaceShell.startFailed', defaultMessage: "Couldn't start session" },
  switchFailed: { id: 'workspaceShell.switchFailed', defaultMessage: "Couldn't switch runtime" },
  modelFailed: { id: 'workspaceShell.modelFailed', defaultMessage: "Couldn't set model" },
  optionFailed: { id: 'workspaceShell.optionFailed', defaultMessage: "Couldn't change {option}" },
  paneUnavailable: { id: 'workspaceShell.paneUnavailable', defaultMessage: 'Not available yet' },
  paneFiles: { id: 'workspaceShell.paneFiles', defaultMessage: 'Files' },
  paneEditor: { id: 'workspaceShell.paneEditor', defaultMessage: 'Editor' },
  paneDiff: { id: 'workspaceShell.paneDiff', defaultMessage: 'Changes' },
  paneTerminal: { id: 'workspaceShell.paneTerminal', defaultMessage: 'Terminal' },
  paneGit: { id: 'workspaceShell.paneGit', defaultMessage: 'Git' },
  paneBrowser: { id: 'workspaceShell.paneBrowser', defaultMessage: 'Browser' },
  paneMarkdown: { id: 'workspaceShell.paneMarkdown', defaultMessage: 'Markdown' },
  panes: { id: 'workspaceShell.panes', defaultMessage: 'Panes' },
  sessionMenu: { id: 'rail.menu', defaultMessage: 'Session menu' },
  columnSessions: { id: 'workspaceShell.columnSessions', defaultMessage: 'Sessions' },
  columnChat: { id: 'workspaceShell.columnChat', defaultMessage: 'Chat' },
  columnWork: { id: 'workspaceShell.columnWork', defaultMessage: 'Work' },
  resizeColumn: { id: 'workspaceShell.resizeColumn', defaultMessage: 'Resize {column}' },
});

const PANE_TITLES = {
  files: i18n.paneFiles,
  editor: i18n.paneEditor,
  diff: i18n.paneDiff,
  terminal: i18n.paneTerminal,
  git: i18n.paneGit,
  browser: i18n.paneBrowser,
  markdown: i18n.paneMarkdown,
} as const;

// DESIGN.md §Iconography: one set, lucide, at upstream's control size.
const PANE_ICONS: Record<PaneId, ComponentType<{ className?: string }>> = {
  files: FolderTree,
  editor: FileCode,
  diff: GitCompare,
  terminal: Terminal,
  git: GitBranch,
  browser: Globe,
  markdown: BookOpen,
};

// The code-editor standard (task 40): three panes first on the bar, and the ones that stay
// there however narrow it gets (task 71); the rest are listed under ⋯ too.
const PRIMARY_PANES: readonly PaneId[] = ['terminal', 'diff', 'browser'];
const MORE_PANES: readonly PaneId[] = PANE_IDS.filter((id) => !PRIMARY_PANES.includes(id));

// DESIGN.md Floating Button Rule: --shadow-sm at rest, --shadow-md lifted.
const floating = 'shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]';
// DESIGN.md §Frame: every column is one kind of glass panel (task 57 radius and shadow).
const column =
  'workspace-column relative min-h-0 min-w-0 overflow-hidden rounded-panel border border-border-primary bg-background-primary shadow-[var(--shadow-sm)]';

const COLUMNS_STORAGE_KEY = 'goose.workspace.columns';
const SEAM_KEY_STEP_PX = 16;
// The chat keeps one readable line and its input; the other columns give way first.
const CHAT_MIN_PX = 240;

type Column = keyof Columns | 'chat';

const WORKSPACE_ROUTES = new Set(['/', '/pair']);
// The web shim's window.electron answers every key with a stub, so the shape cannot tell the
// builds apart; the user agent can (task 56). No shell, no power blocker there.
const WEB_SHIM = !/\bElectron\//.test(window.navigator.userAgent);
const TRANSCRIPT_VIEW_KEY = 'goose.transcriptView';

function loadTranscriptView(sessionId: string): TranscriptView {
  return window.localStorage.getItem(`${TRANSCRIPT_VIEW_KEY}:${sessionId}`) === 'compact'
    ? 'compact'
    : 'full';
}
// iOS drops a background tab's sockets after tens of seconds, never within one glance.
const FOREGROUND_REBUILD_AFTER_MS = 10_000;
const NO_MESSAGES: readonly Message[] = [];

function loadColumns(project: string): Partial<Columns> | null {
  const saved = loadProjectEntry(COLUMNS_STORAGE_KEY, project);
  return typeof saved === 'object' ? (saved as Partial<Columns> | null) : null;
}

function usePaneLayout(store: PaneStore) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

// Everything the ⋯ menu shows and does: RailMenu's own props minus the geometry.
type SessionMenuProps = Omit<RailMenuProps, 'panes' | 'side' | 'align' | 'onClose'>;

// The session's ⋯ (task 69), at the tab bar's right end (task 71).
function SessionMenuButton(menu: SessionMenuProps) {
  const intl = useIntl();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="w-6 shrink-0 px-0"
              aria-label={intl.formatMessage(i18n.sessionMenu)}
              data-pane="more"
              data-testid="workspace-pane-more"
              // The menu hands focus back to ⋯ when it closes, and a focus-opened tooltip
              // would linger there; hover still opens it, the aria-label names it.
              onFocus={(event) => event.preventDefault()}
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{intl.formatMessage(i18n.sessionMenu)}</TooltipContent>
      </Tooltip>
      {/* Into Rule: upstream's content scales from its trigger anchor, so the menu grows
          out of ⋯ and closes back into it. */}
      <RailMenu
        {...menu}
        panes={MORE_PANES}
        side="bottom"
        align="end"
        onClose={() => setMenuOpen(false)}
      />
    </DropdownMenu>
  );
}

interface TabRailProps {
  shown: 'chat' | PaneId;
  onShow(target: 'chat' | PaneId): void;
}

// The phone's one-at-a-time strip (DESIGN.md §Frame): chat first, then every pane, along the
// bottom edge where a thumb reaches; the shown tab is pressed.
function TabRail({ shown, onShow }: TabRailProps) {
  const intl = useIntl();
  const tabs = [
    { id: 'chat' as const, title: intl.formatMessage(i18n.columnChat), Icon: MessageSquareText },
    ...PANE_IDS.map((id) => ({
      id,
      title: intl.formatMessage(PANE_TITLES[id]),
      Icon: PANE_ICONS[id],
    })),
  ];
  return (
    <div
      className="flex shrink-0 items-center justify-around gap-1 overflow-x-auto border-t border-border-primary px-1 pt-1"
      style={{ paddingBottom: 'calc(0.25rem + env(safe-area-inset-bottom, 0px))' }}
      role="toolbar"
      aria-label={intl.formatMessage(i18n.panes)}
      aria-orientation="horizontal"
      data-testid="workspace-tab-rail"
    >
      {tabs.map(({ id, title, Icon }) => (
        <Button
          key={id}
          variant={shown === id ? 'secondary' : 'ghost'}
          size="sm"
          className={cn('w-9 shrink-0 px-0', shown === id && floating)}
          aria-label={title}
          aria-pressed={shown === id}
          data-testid={`workspace-tab-${id}`}
          onClick={() => onShow(id)}
        >
          <Icon />
        </Button>
      ))}
    </div>
  );
}

interface SeamProps {
  column: keyof Columns;
  label: string;
  width: number;
  onResize(width: number): void;
  onDragChange(dragging: boolean): void;
}

// The line between two columns: drag it, or arrow it, to resize the fixed column beside it.
function Seam({ column, label, width, onResize, onDragChange }: SeamProps) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  // The Sessions seam is on its column's right, the Work seam on its left.
  const sign = column === 'sessions' ? 1 : -1;
  const press = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    onDragChange(true);
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag.current) return;
    onResize(drag.current.startWidth + sign * (event.clientX - drag.current.startX));
  };
  const release = () => {
    if (!drag.current) return;
    drag.current = null;
    onDragChange(false);
  };
  const key = (event: ReactKeyboardEvent<HTMLElement>) => {
    const step =
      event.key === 'ArrowLeft'
        ? -SEAM_KEY_STEP_PX
        : event.key === 'ArrowRight'
          ? SEAM_KEY_STEP_PX
          : 0;
    if (!step) return;
    event.preventDefault();
    onResize(width + sign * step);
  };
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      className="w-2 shrink-0 cursor-col-resize touch-none rounded-chip outline-none hover:bg-background-tertiary focus-visible:bg-background-tertiary"
      data-testid={`workspace-seam-${column}`}
      onPointerDown={press}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={key}
    />
  );
}

interface WorkspaceShellProps {
  // The always-mounted chat sessions; shown on /pair, hidden elsewhere so streams stay alive.
  chat: ReactNode;
  // The route outlet: the Hub on /, nothing on /pair, every other page as is.
  children: ReactNode;
  // Pane bodies by id; a missing pane renders its placeholder until its task lands.
  panes?: Partial<Record<PaneId, ReactNode>>;
  paneStore?: PaneStore;
}

export function WorkspaceShell({ chat, children, panes, paneStore }: WorkspaceShellProps) {
  const intl = useIntl();
  const setView = useNavigation();
  const { extensionsList } = useConfig();
  const { currentProvider: defaultProvider } = useModelAndProvider();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Upstream's toggle in the titlebar, and its auto-collapse on a narrow window, decide
  // whether the Sessions column shows; the workspace decides how wide.
  const navigation = useNavigationContextSafe();
  const sessionsOpen = navigation?.isNavExpanded ?? true;
  // The dock and the column widths are remembered per project: the window's working dir
  // names it (task 42).
  const [project] = useState(getInitialWorkingDir);
  const [store] = useState(
    () =>
      paneStore ??
      createPaneStore(
        restoreColumns(
          restoreDock(initialLayout(modeForWidth(window.innerWidth)), loadDock(project)),
          loadColumns(project)
        )
      )
  );
  const layout = usePaneLayout(store);
  const phone = layout.mode === 'phone';
  const rootRef = useRef<HTMLDivElement>(null);
  const [draggingSeam, setDraggingSeam] = useState(false);
  // Where focus goes once the next render has put the target on screen.
  const pendingFocus = useRef<Column | null>(null);

  useEffect(() => {
    if (paneStore) return;
    return store.subscribe(() => {
      const state = store.getState();
      saveDock(project, state);
      saveProjectEntry(COLUMNS_STORAGE_KEY, project, state.columns);
    });
  }, [paneStore, project, store]);

  // The layout follows the viewport across the phone breakpoint (DESIGN.md §Frame); the
  // media query is the trigger, the store's rule decides.
  useEffect(() => {
    const media = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH_PX}px)`);
    const sync = () => store.setMode(modeForWidth(window.innerWidth));
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, [store]);

  // iOS Safari suspends a background tab with its sockets; a return to the foreground
  // reattaches every shell by id and rebuilds the ACP connection, whose recovery reloads
  // each open session (ChatSessionsContainer) — the messages that arrived meanwhile with it.
  // A quick app switch keeps the sockets, so the rebuild waits for a real absence — a
  // teardown on every flip blanked the transcript each time the tab was glanced away from.
  useEffect(() => {
    if (!phone) return;
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away < FOREGROUND_REBUILD_AFTER_MS) return;
      reattachTerminals();
      reconnectAcpAfterSystemResume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [phone]);

  const isWorkspaceRoute = WORKSPACE_ROUTES.has(location.pathname);
  const isOnPairRoute = location.pathname === '/pair';
  const sessionId = (isOnPairRoute && searchParams.get('resumeSessionId')) || '';
  const snapshot = useAcpChatSessionSnapshot(sessionId);
  const session = sessionId ? snapshot?.session : undefined;

  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  // undefined until the cwd has been searched; null when it has no project role.
  const [orchestratorRole, setOrchestratorRole] = useState<SourceEntry | null | undefined>();
  const [busy, setBusy] = useState(false);
  // What the next session starts on while no session is open; until a pick, the config
  // default. A Hub submit reads the same draft through NextChat below.
  const [draftRuntime, setDraftRuntime] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState<Mode>('direct');
  // Easy's lever position before a session; once one is open the session's triple is it.
  const [draftStop, setDraftStop] = useState<Stop>('easy');
  // The worktree slug the next chat starts in (task 49); off by default, and off again once
  // a session has consumed it — a fresh chat is chat in the checkout.
  const [draftWorktree, setDraftWorktree] = useState<string | null>(null);
  // The persisted face (task 58), unknown until read so the wrong one never flashes;
  // Settings › App and the ⋯ menu both write it and announce the change.
  const [workspaceUi, setWorkspaceUi] = useState<WorkspaceUi | undefined>();
  // The file the Editor shows, picked in Files (PRD step 4).
  const [file, setFile] = useState<string | null>(null);
  // The sheet's prefill, taken when "Save as routine…" is pressed so edits stay put
  // while the transcript streams on; null is the sheet closed (task 59).
  const [routine, setRoutine] = useState<{ title: string; instructions: string } | null>(null);
  // The sessions whose "Keep computer awake" is on (task 69): main's word, per session.
  const [awake, setAwake] = useState<ReadonlySet<string>>(() => new Set());
  // Full or Compact, per session, in localStorage (task 69).
  const [transcriptView, setTranscriptView] = useState<TranscriptView>('full');

  const cwd = session?.working_dir ?? getInitialWorkingDir();
  const sessionActions = useSessionActions(session);
  const currentRuntime =
    session?.provider_name ?? draftRuntime ?? defaultProvider ?? RUNTIMES[0].id;
  const currentMode: Mode = session ? modeOfSession(session) : draftMode;
  const currentStop: Stop | 'custom' = session ? stopOfSession(session) : draftStop;
  const configOptions = useSessionConfigOptions(sessionId);

  useEffect(() => {
    window.electron.getSetting('workspace.ui').then(setWorkspaceUi).catch(console.error);
    const onChange = (event: Event) => setWorkspaceUi((event as CustomEvent<WorkspaceUi>).detail);
    window.addEventListener(AppEvents.WORKSPACE_UI_CHANGED, onChange);
    return () => window.removeEventListener(AppEvents.WORKSPACE_UI_CHANGED, onChange);
  }, []);

  // Every session start, the Hub's included, dispatches SESSION_CREATED: the slug is spent.
  useEffect(() => {
    const reset = () => setDraftWorktree(null);
    window.addEventListener(AppEvents.SESSION_CREATED, reset);
    return () => window.removeEventListener(AppEvents.SESSION_CREATED, reset);
  }, []);

  // A session that leaves (archived, deleted) takes its blocker with it.
  useEffect(() => {
    const onDeleted = (event: Event) => {
      const { sessionId: gone } = (event as CustomEvent<{ sessionId: string }>).detail;
      setAwake((current) => {
        if (!current.has(gone)) return current;
        void window.electron.keepAwake(gone, false);
        const next = new Set(current);
        next.delete(gone);
        return next;
      });
    };
    window.addEventListener(AppEvents.SESSION_DELETED, onDeleted);
    return () => window.removeEventListener(AppEvents.SESSION_DELETED, onDeleted);
  }, []);

  const keepAwake = useCallback(
    (on: boolean) => {
      if (!sessionId) return;
      window.electron
        .keepAwake(sessionId, on)
        .then((active) =>
          setAwake((current) => {
            const next = new Set(current);
            if (active) next.add(sessionId);
            else next.delete(sessionId);
            return next;
          })
        )
        .catch(console.error);
    },
    [sessionId]
  );

  useEffect(() => {
    setTranscriptView(sessionId ? loadTranscriptView(sessionId) : 'full');
  }, [sessionId]);

  const pickTranscriptView = useCallback(
    (view: TranscriptView) => {
      setTranscriptView(view);
      if (sessionId) window.localStorage.setItem(`${TRANSCRIPT_VIEW_KEY}:${sessionId}`, view);
    },
    [sessionId]
  );

  const toggleWorktree = useCallback(
    () => setDraftWorktree((slug) => (slug === null ? newWorktreeSlug() : null)),
    []
  );

  const toggleAdvanced = useCallback(() => {
    const next: WorkspaceUi = workspaceUi === 'easy' ? 'advanced' : 'easy';
    setWorkspaceUi(next);
    window.dispatchEvent(new CustomEvent(AppEvents.WORKSPACE_UI_CHANGED, { detail: next }));
    window.electron.setSetting('workspace.ui', next).catch(console.error);
  }, [workspaceUi]);

  useEffect(() => {
    if (!isWorkspaceRoute) return;
    acpListProviderDetails().then(setProviders).catch(console.error);
  }, [isWorkspaceRoute]);

  // A route may arrive asking for a pane and a Changes base (the Runs inbox's Open, task
  // 53). The ask is consumed once: left in history it would reopen the pane on Back.
  useEffect(() => {
    if (!isOnPairRoute) return;
    const state = location.state as ViewOptions | null;
    if (!state?.openPane && !state?.diffBase) return;
    if (state.diffBase) presetDiffBase(state.diffBase);
    if (state.openPane) store.openPane(state.openPane);
    const { openPane: _pane, diffBase: _base, ...rest } = state;
    // react-router keeps the route state under `usr` beside its own key and index.
    window.history.replaceState({ ...window.history.state, usr: rest }, document.title);
  }, [isOnPairRoute, location.key, location.state, store]);

  useEffect(() => {
    if (!isWorkspaceRoute) return;
    let cancelled = false;
    setOrchestratorRole(undefined);
    // PRD step 2: the project's own role, not a global one Goose would also discover.
    listAgentSources(cwd)
      .then((sources) => {
        if (cancelled) return;
        setOrchestratorRole(
          sources.find((source) => source.name === ORCHESTRATOR_ROLE && !source.global) ?? null
        );
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [cwd, isWorkspaceRoute]);

  // The stop's model among what the session's provider lists, set on the session; the
  // triple lands in two steps because session/new takes no model. Best-effort: a miss
  // leaves the adapter's model and the lever reads Custom.
  const applyStopModel = useCallback(
    async (id: string, stop: Stop) => {
      const option = getSessionConfigOptions(id).find((candidate) => candidate.id === 'model');
      const model = option && stopModel(stop, configChoices(option));
      if (!model) return;
      try {
        await acpSetSessionConfigOption(id, 'model', model);
        const current = acpChatSessionStore.getSnapshot(id);
        if (!current?.session) return;
        acpChatSessionActions.setSessionMetadata(id, {
          ...current.session,
          model_config: { toolshim: false, ...current.session.model_config, model_name: model },
        });
      } catch (error) {
        toastError({ title: intl.formatMessage(i18n.modelFailed), msg: formatAcpError(error) });
      }
    },
    [intl]
  );

  const startSession = useCallback(
    async (providerId: string, mode: Mode, stop?: Stop) => {
      setBusy(true);
      try {
        const recipeDeeplink =
          mode === 'orchestrate' && orchestratorRole
            ? await encodeRecipe(orchestratorRecipe(orchestratorRole))
            : undefined;
        const newSession = await createSession(await getEffectiveWorkingDir(), {
          provider: providerId,
          recipeDeeplink,
          allExtensions: extensionsList,
          worktree: draftWorktree ?? undefined,
        });
        if (stop) await applyStopModel(newSession.id, stop);
        window.dispatchEvent(new CustomEvent(AppEvents.SESSION_CREATED));
        window.dispatchEvent(
          new CustomEvent(AppEvents.ADD_ACTIVE_SESSION, { detail: { sessionId: newSession.id } })
        );
        setView('pair', { disableAnimation: true, resumeSessionId: newSession.id });
      } catch (error) {
        toastError({ title: intl.formatMessage(i18n.startFailed), msg: formatAcpError(error) });
      } finally {
        setBusy(false);
      }
    },
    [applyStopModel, draftWorktree, extensionsList, intl, orchestratorRole, setView]
  );

  // Mid-session the switch is the ACP `provider` option; the store snapshot is the
  // selector's value, so a failed request leaves it where it was (PRD step 9). A stop
  // names the divider ("→ Hard from here") and sets its model once the provider is on.
  const switchRuntime = useCallback(
    async (providerId: string, stop?: Stop) => {
      setBusy(true);
      try {
        const applied = await acpSetSessionProviderModel(sessionId, providerId);
        const current = acpChatSessionStore.getSnapshot(sessionId);
        if (!current?.session) return;
        const provider = applied.providerId ?? providerId;
        acpChatSessionActions.setSessionMetadata(sessionId, {
          ...current.session,
          provider_name: provider,
        });
        const divider = intl.formatMessage(i18n.runtimeDivider, {
          runtime: stop
            ? intl.formatMessage(STOP_MESSAGES[stop])
            : runtimeLabel(provider, providers),
        });
        acpChatSessionActions.setMessages(sessionId, [
          ...current.messages,
          runtimeDividerMessage(uuidv7(), divider),
        ]);
        if (stop) await applyStopModel(sessionId, stop);
      } catch (error) {
        toastError({ title: intl.formatMessage(i18n.switchFailed), msg: formatAcpError(error) });
      } finally {
        setBusy(false);
      }
    },
    [applyStopModel, intl, providers, sessionId]
  );

  const pickRuntime = useCallback(
    (providerId: string) => {
      if (providerId === currentRuntime || needsInstall(providerId, providers)) return;
      if (session) {
        void switchRuntime(providerId);
        return;
      }
      setDraftRuntime(providerId);
      void startSession(providerId, draftMode);
    },
    [currentRuntime, draftMode, providers, session, startSession, switchRuntime]
  );

  // Orchestrate is fixed at session/new, so a mode pick on an open session starts a
  // new one on the same runtime; the previous session stays in the list.
  const pickMode = useCallback(
    (mode: Mode) => {
      if (mode === currentMode || (mode === 'orchestrate' && !orchestratorRole)) return;
      setDraftMode(mode);
      void startSession(currentRuntime, mode);
    },
    [currentMode, currentRuntime, orchestratorRole, startSession]
  );

  // The lever: a stop is the Runtime and Mode picks in one — a different mode starts a
  // new session, the same mode switches the open one, a fresh chat starts on the triple.
  const pickStop = useCallback(
    (stop: Stop) => {
      const triple = LEVER[stop];
      if (triple.mode === 'orchestrate' && !orchestratorRole) return;
      setDraftStop(stop);
      setDraftRuntime(triple.provider);
      setDraftMode(triple.mode);
      if (session && triple.mode === currentMode) {
        void switchRuntime(triple.provider, stop);
        return;
      }
      void startSession(triple.provider, triple.mode, stop);
    },
    [currentMode, orchestratorRole, session, startSession, switchRuntime]
  );

  // Advanced's generic option rows: provider goes through the Runtime switch (its divider
  // and metadata), the rest are the option alone.
  const setConfigOption = useCallback(
    async (configId: string, value: string) => {
      if (configId === 'provider') {
        pickRuntime(value);
        return;
      }
      setBusy(true);
      try {
        await acpSetSessionConfigOption(sessionId, configId, value);
        const current = acpChatSessionStore.getSnapshot(sessionId);
        if (configId === 'model' && current?.session) {
          acpChatSessionActions.setSessionMetadata(sessionId, {
            ...current.session,
            model_config: { toolshim: false, ...current.session.model_config, model_name: value },
          });
        }
      } catch (error) {
        toastError({
          title: intl.formatMessage(i18n.optionFailed, { option: configId }),
          msg: formatAcpError(error),
        });
      } finally {
        setBusy(false);
      }
    },
    [intl, pickRuntime, sessionId]
  );

  // The Changes dot (task 69): while the pane is hidden, the working tree is polled every 30 s
  // and a state the pane has not shown earns the dot; the first poll after the pane goes
  // hidden is the baseline (what it showed), so only what appears afterwards counts. The
  // pane refreshes itself while it is on screen.
  const diffHidden = isWorkspaceRoute && !paneVisible(layout, 'diff');
  useEffect(() => {
    if (!diffHidden) return;
    let cancelled = false;
    let baseline: string | null = null;
    const poll = () => {
      const request: GitCwdRequest = { cwd };
      sidecarFetch<GitStatusResponse>('/git/status', request)
        .then((status) => {
          if (cancelled) return;
          const fingerprint = statusFingerprint(status.entries);
          if (baseline === null) baseline = fingerprint;
          else if (fingerprint !== baseline && fingerprint !== '') store.markUnseen('diff');
        })
        .catch(() => {});
    };
    poll();
    const timer = window.setInterval(poll, CHANGES_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cwd, diffHidden, store]);

  // The Terminal dot: the session's shell wrote something while its pane was not showing.
  const ptyId = sessionId || 'hub';
  useEffect(
    () =>
      subscribeTerminalOutput((id) => {
        if (id === ptyId) store.markUnseen('terminal');
      }),
    [ptyId, store]
  );

  // A pick opens the Editor beside Files — the bottom half under a full Files (PRD step 4) —
  // or brings it back where the user left it.
  const openFile = useCallback(
    (path: string) => {
      setFile(path);
      store.openPane('editor');
    },
    [store]
  );
  // The ⋯ menu's pane rows (task 40); the modifier meant tear-off until task 71.
  const openPane = useCallback((id: PaneId) => store.openPane(id), [store]);
  const paneContext = useMemo<PaneContextValue>(
    () => ({
      cwd,
      mode: layout.mode,
      messages: snapshot?.messages ?? NO_MESSAGES,
      file,
      openFile,
      markUnseen: store.markUnseen,
    }),
    [cwd, file, layout.mode, openFile, snapshot?.messages, store]
  );

  // The transcript is read at the click, not closed over: it streams, the chips do not.
  const sessionName = session?.name;
  const openRoutine = useCallback(() => {
    if (sessionName === undefined) return;
    const prefill = {
      title: sessionName,
      instructions: firstUserPrompt(acpChatSessionStore.getSnapshot(sessionId)?.messages ?? []),
    };
    // A modal opened from a menu item's own click keeps that menu on screen (its close
    // never finishes under the new focus scope), so the sheet opens once the menu has gone.
    window.setTimeout(() => setRoutine(prefill), 0);
  }, [sessionId, sessionName]);
  const saveRoutine = sessionName === undefined ? undefined : openRoutine;
  const openSchedule = useCallback(
    (scheduleId: string) => setView('schedules', { scheduleId }),
    [setView]
  );

  const runtimeOptions = useMemo<RuntimeOption[]>(() => {
    const options = RUNTIMES.map((runtime) => ({ ...runtime, more: false }));
    const more = moreRuntimes(providers).map((runtime) => ({ ...runtime, more: true }));
    const listed = [...options, ...more];
    return listed.some((runtime) => runtime.id === currentRuntime)
      ? listed
      : [
          ...listed,
          { id: currentRuntime, label: runtimeLabel(currentRuntime, providers), more: true },
        ];
  }, [currentRuntime, providers]);

  // What the open session runs on, as the chips' tooltip (task 40).
  const sessionStatus = session
    ? `${runtimeLabel(currentRuntime, providers)} · ${intl.formatMessage(MODE_MESSAGES[currentMode])}`
    : undefined;
  const canOrchestrate = orchestratorRole === undefined ? undefined : orchestratorRole !== null;
  const extensionsEnabled = extensionsList.filter((extension) => extension.enabled).length;
  const sessionModel = session?.model_config?.model_name;
  const sessionCwd = session?.working_dir;
  // In a session the chip reads the cwd's own slug; before one, the draft.
  const worktreeSlug = sessionCwd === undefined ? draftWorktree : worktreeSlugOf(sessionCwd);
  // One element per change, not per render: the chat input re-renders with its slot.
  const chips = useMemo(
    () =>
      workspaceUi === undefined ? null : workspaceUi === 'easy' ? (
        <>
          <Lever
            stop={currentStop}
            providers={providers}
            canOrchestrate={canOrchestrate}
            busy={busy}
            model={sessionModel}
            onPick={pickStop}
          />
          <WorktreeChip
            slug={worktreeSlug}
            cwd={sessionCwd}
            busy={busy}
            onToggle={toggleWorktree}
          />
          <RoutineChip session={session} onOpen={openSchedule} />
        </>
      ) : (
        <>
          <SessionChips
            runtimes={runtimeOptions}
            currentRuntime={currentRuntime}
            providers={providers}
            currentMode={currentMode}
            canOrchestrate={canOrchestrate}
            busy={busy}
            status={sessionStatus}
            onPickRuntime={pickRuntime}
            onPickMode={pickMode}
          />
          <WorktreeChip
            slug={worktreeSlug}
            cwd={sessionCwd}
            busy={busy}
            onToggle={toggleWorktree}
          />
          <SessionControls
            options={configOptions}
            cwd={cwd}
            role={currentMode === 'orchestrate' ? orchestratorRole?.name : undefined}
            extensionsEnabled={extensionsEnabled}
            busy={busy}
            onSetOption={setConfigOption}
            onOpenFiles={() => store.openPane('files')}
            onOpenExtensions={() => setView('extensions')}
            onSaveRoutine={saveRoutine}
          />
          <RoutineChip session={session} onOpen={openSchedule} />
        </>
      ),
    [
      busy,
      canOrchestrate,
      configOptions,
      currentMode,
      currentRuntime,
      currentStop,
      cwd,
      extensionsEnabled,
      openSchedule,
      orchestratorRole?.name,
      pickMode,
      pickRuntime,
      pickStop,
      providers,
      runtimeOptions,
      saveRoutine,
      session,
      sessionCwd,
      sessionModel,
      sessionStatus,
      setConfigOption,
      setView,
      store,
      toggleWorktree,
      workspaceUi,
      worktreeSlug,
    ]
  );

  // Only the chat on screen gets the chips: the Hub (no session) on /, the open session
  // on /pair; the other mounted chats are hidden.
  const chipsFor = useCallback(
    (id: string | null) => ((id ?? '') === sessionId ? chips : null),
    [chips, sessionId]
  );

  // ⌘1 · ⌘2 · ⌘3 focus Sessions · Chat · Work; Work with nothing open is the bar's first
  // tab. ⇧⌘F opens Files (the ⋯ menu's shortcut, task 69).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.shiftKey) {
        if (event.key.toLowerCase() === 'f' && isWorkspaceRoute) {
          event.preventDefault();
          store.openPane('files');
        }
        return;
      }
      const target = ({ '1': 'sessions', '2': 'chat', '3': 'work' } as const)[event.key];
      if (!target) return;
      event.preventDefault();
      if (target === 'sessions' && !sessionsOpen) navigation?.setIsNavExpanded(true);
      pendingFocus.current = target;
      // A column already on screen needs no render first.
      focusPending();
    };
    const focusPending = () => {
      const target = pendingFocus.current;
      const root = rootRef.current;
      if (!target || !root) return;
      const scope = root.querySelector<HTMLElement>(`[data-testid="workspace-column-${target}"]`);
      if (!scope) return;
      pendingFocus.current = null;
      const preferred =
        target === 'chat' ? scope.querySelector<HTMLElement>('[data-testid="chat-input"]') : null;
      const first = scope.querySelector<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])'
      );
      (preferred ?? first ?? scope).focus();
    };
    window.addEventListener('keydown', onKey);
    focusPending();
    return () => window.removeEventListener('keydown', onKey);
  });

  // The pty is keyed by the chat session so a reload or the phone reattaches to its shell;
  // the Hub, with no session yet, gets one shell in the window's working dir. A session
  // still loading has no working_dir yet, and the shell it would spawn is cached.
  const defaultPane = (id: PaneId) =>
    id === 'terminal' && (!sessionId || session) ? (
      <TerminalPane ptyId={ptyId} cwd={cwd} />
    ) : undefined;
  const renderPane = (id: PaneId) => (
    <PaneContext.Provider value={paneContext}>
      {panes?.[id] ?? defaultPane(id) ?? (
        <p className="p-4 text-sm text-text-secondary">
          {intl.formatMessage(PANE_TITLES[id])} — {intl.formatMessage(i18n.paneUnavailable)}
        </p>
      )}
    </PaneContext.Provider>
  );
  const chrome = Object.fromEntries(
    PANE_IDS.map((id) => [id, { title: intl.formatMessage(PANE_TITLES[id]), Icon: PANE_ICONS[id] }])
  ) as Record<PaneId, PaneChrome>;

  const columnLabel = (name: Column) =>
    intl.formatMessage(
      name === 'sessions'
        ? i18n.columnSessions
        : name === 'chat'
          ? i18n.columnChat
          : i18n.columnWork
    );
  // A seam drag moves the Sessions column with the pointer; otherwise its width eases — the
  // collapse into the titlebar toggle (Into).
  const sessionsMotion = cn(
    'flex shrink min-w-0 overflow-hidden',
    draggingSeam ? 'transition-none' : 'transition-[width] duration-200 ease-[var(--ease-g2)]'
  );
  const seam = (name: keyof Columns) => (
    <Seam
      column={name}
      label={intl.formatMessage(i18n.resizeColumn, { column: columnLabel(name) })}
      width={layout.columns[name]}
      onResize={(width) => store.resizeColumn(name, width)}
      onDragChange={setDraggingSeam}
    />
  );
  const sessionMenu = (
    <SessionMenuButton
      layout={layout}
      chrome={chrome}
      onOpenPane={openPane}
      actions={session ? sessionActions : undefined}
      cwd={cwd}
      webShim={WEB_SHIM}
      transcriptView={transcriptView}
      onTranscriptView={pickTranscriptView}
      keepAwake={awake.has(sessionId)}
      onKeepAwake={keepAwake}
      advanced={workspaceUi === 'advanced'}
      onToggleAdvanced={toggleAdvanced}
      onOpenPhone={() => setView('settings', { section: 'phone' })}
      // SettingsView maps `styles` to the Chat tab, where the Response styles live.
      onOpenResponseStyles={() => setView('settings', { section: 'styles' })}
      // The Board (task 67) once it lands; the Runs inbox on Schedules until then.
      onBackgroundTasks={() => setView('schedules')}
      onSaveRoutine={saveRoutine}
    />
  );

  // Easy: the lever's triple; Advanced: the Runtime · Mode chips' draft. Orchestrate brings
  // the orchestrator role as the recipe; the lever's model lands once the session exists.
  const nextChat = useMemo<NextChatDraft>(() => {
    const easy = workspaceUi === 'easy';
    const triple = LEVER[draftStop];
    const provider = easy ? triple.provider : (draftRuntime ?? undefined);
    const mode: Mode = easy ? triple.mode : draftMode;
    const orchestrate = mode === 'orchestrate' && orchestratorRole ? orchestratorRole : null;
    return {
      worktree: draftWorktree,
      provider,
      recipeDeeplink: orchestrate ? () => encodeRecipe(orchestratorRecipe(orchestrate)) : undefined,
      onCreated: easy ? (id) => applyStopModel(id, draftStop) : undefined,
    };
  }, [
    applyStopModel,
    draftMode,
    draftRuntime,
    draftStop,
    draftWorktree,
    orchestratorRole,
    workspaceUi,
  ]);

  const chatBody = (
    <SessionChipsSlot.Provider value={chipsFor}>
      <NextChat.Provider value={nextChat}>
        <div className="relative min-h-0 min-w-0 flex-1">
          {children}
          <div className={isOnPairRoute ? 'contents' : 'hidden'}>{chat}</div>
        </div>
      </NextChat.Provider>
    </SessionChipsSlot.Provider>
  );
  const shellAttributes = {
    className: 'relative flex h-full min-h-0 min-w-0 flex-1 overflow-x-hidden p-2',
    'data-testid': 'workspace-shell',
    'data-ui': workspaceUi,
    'data-orchestrator-role':
      orchestratorRole === undefined ? 'loading' : orchestratorRole ? 'present' : 'absent',
  };
  const sessionsColumn = (
    <section
      className={cn(column, 'flex-1')}
      tabIndex={-1}
      aria-label={columnLabel('sessions')}
      data-testid="workspace-column-sessions"
    >
      <Navigation />
    </section>
  );

  // Phone: one thing on screen — the Sessions column whole when the titlebar toggle opens
  // it, else the chat or a pane behind the tab rail. The bodies stack in one place and hide
  // by visibility, so a scrolled transcript or tree is where it was when it comes back; the
  // open tabs stay mounted for the same reason (DESIGN.md Nothing Lost Rule).
  if (phone) {
    const shown = isWorkspaceRoute ? layout.visible : 'chat';
    const mounted = PANE_IDS.filter((id) => id === shown || layout.tabs.includes(id));
    const body = (id: 'chat' | PaneId) =>
      cn(
        'absolute inset-0 min-h-0 min-w-0',
        shown === id
          ? 'animate-in fade-in-0 zoom-in-95 origin-bottom ease-[var(--ease-g2)] duration-150'
          : 'invisible'
      );
    return (
      <div ref={rootRef} {...shellAttributes} data-mode="phone">
        <div className={sessionsMotion} style={{ width: sessionsOpen ? '100%' : 0 }}>
          {sessionsColumn}
        </div>
        <section
          className={cn(column, 'flex flex-1 flex-col', sessionsOpen && 'hidden')}
          tabIndex={-1}
          aria-label={columnLabel('chat')}
          data-testid="workspace-column-chat"
          data-transcript-view={transcriptView}
        >
          <div className="relative min-h-0 min-w-0 flex-1">
            <div className={cn(body('chat'), 'flex')} data-testid="workspace-pane-chat">
              {chatBody}
            </div>
            {isWorkspaceRoute &&
              mounted.map((id) => (
                // Below the titlebar's 32 px band, as the Work column keeps its strip; the
                // chat carries its own spacer.
                <div
                  key={id}
                  className={cn(body(id), 'top-6 overflow-auto')}
                  data-testid={`workspace-pane-${id}`}
                >
                  {renderPane(id)}
                </div>
              ))}
          </div>
          {isWorkspaceRoute && <TabRail shown={shown} onShow={store.show} />}
        </section>
        <SessionActionDialogs actions={sessionActions} />
      </div>
    );
  }

  return (
    <div ref={rootRef} {...shellAttributes}>
      <div className={sessionsMotion} style={{ width: sessionsOpen ? layout.columns.sessions : 0 }}>
        {sessionsColumn}
      </div>
      {sessionsOpen && seam('sessions')}

      <section
        className={cn(column, 'flex flex-1')}
        style={{ minWidth: CHAT_MIN_PX }}
        tabIndex={-1}
        aria-label={columnLabel('chat')}
        data-testid="workspace-column-chat"
        data-transcript-view={transcriptView}
      >
        {chatBody}
      </section>

      {/* The Work column and its bar are there with nothing open: the bar is the one place
          pane controls live, in Easy and Advanced alike (task 71). */}
      {isWorkspaceRoute && (
        <>
          {seam('work')}
          <section
            // Below the titlebar's 32 px drag strip, as the sidebar's own spacer keeps its rows.
            className={cn(column, 'shrink pt-6')}
            style={{ width: layout.columns.work }}
            tabIndex={-1}
            aria-label={columnLabel('work')}
            data-testid="workspace-column-work"
          >
            <WorkColumn
              layout={layout}
              store={store}
              chrome={chrome}
              primary={PRIMARY_PANES}
              renderPane={renderPane}
              trailing={sessionMenu}
            />
          </section>
        </>
      )}

      <SessionActionDialogs actions={sessionActions} />
      <RoutineSheet
        open={routine !== null}
        onOpenChange={(open) => !open && setRoutine(null)}
        sessionId={sessionId}
        title={routine?.title ?? ''}
        instructions={routine?.instructions ?? ''}
        options={configOptions}
        cwd={cwd}
        onSaved={() => setView('schedules')}
      />
    </div>
  );
}
