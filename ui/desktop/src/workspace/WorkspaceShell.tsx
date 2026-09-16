// The workspace around the chat (PRD steps 2-3, 8, 9; task 60): three columns — Sessions
// (upstream's sidebar), Chat (the chat, the Hub, or any other page) and Work (the dock) —
// with a seam between each pair, the pane launchers on a floating rail that slides into the
// dock's top strip, and the session controls handed to the chat input's bottom row: the lever
// in Easy, the Runtime · Mode chips and the Session controls popover in Advanced (task 58).
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
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import {
  BookOpen,
  Check,
  Ellipsis,
  FileCode,
  FolderTree,
  GitBranch,
  GitCompare,
  Globe,
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
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/Tooltip';
import { cn } from '../utils';
import { toastError } from '../toasts';
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
  restoreColumns,
  restoreDock,
  PANE_IDS,
  type Columns,
  type PaneId,
  type PaneLayout,
  type PaneStore,
} from './pane-store';
import { Dock, loadDock, saveDock } from './Dock';
import type { PaneChrome } from './Panel';
import { presetDiffBase } from './panes/diff/diff-store';
import { loadProjectEntry, saveProjectEntry } from './project-storage';
import { MODE_MESSAGES, SessionChips, type RuntimeOption } from './SessionChips';
import { SessionControls } from './SessionControls';
import { Lever, STOP_MESSAGES } from './Lever';
import { TerminalPane } from './panes/terminal/TerminalPane';
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
  advancedControls: { id: 'workspaceShell.advancedControls', defaultMessage: 'Advanced controls' },
  paneUnavailable: { id: 'workspaceShell.paneUnavailable', defaultMessage: 'Not available yet' },
  paneFiles: { id: 'workspaceShell.paneFiles', defaultMessage: 'Files' },
  paneEditor: { id: 'workspaceShell.paneEditor', defaultMessage: 'Editor' },
  paneDiff: { id: 'workspaceShell.paneDiff', defaultMessage: 'Changes' },
  paneTerminal: { id: 'workspaceShell.paneTerminal', defaultMessage: 'Terminal' },
  paneGit: { id: 'workspaceShell.paneGit', defaultMessage: 'Git' },
  paneBrowser: { id: 'workspaceShell.paneBrowser', defaultMessage: 'Browser' },
  paneMarkdown: { id: 'workspaceShell.paneMarkdown', defaultMessage: 'Markdown' },
  panes: { id: 'workspaceShell.panes', defaultMessage: 'Panes' },
  morePanes: { id: 'workspaceShell.morePanes', defaultMessage: 'More panes' },
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

// The code-editor standard (task 40): three panes one click away, the rest under ⋯.
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

function paneVisible(layout: PaneLayout, id: PaneId): boolean {
  if (layout.mode === 'phone') return layout.visible === id;
  return layout.dock.some((panel) => panel.active === id);
}

const WORKSPACE_ROUTES = new Set(['/', '/pair']);
const NO_MESSAGES: readonly Message[] = [];

function loadColumns(project: string): Partial<Columns> | null {
  const saved = loadProjectEntry(COLUMNS_STORAGE_KEY, project);
  return typeof saved === 'object' ? (saved as Partial<Columns> | null) : null;
}

function usePaneLayout(store: PaneStore) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

interface RailProps {
  layout: PaneLayout;
  onOpen(id: PaneId, tear: boolean): void;
  // In the dock's top strip while a panel is open, floating at the right edge otherwise.
  docked: boolean;
  advanced: boolean;
  onToggleAdvanced(): void;
}

// The pane launchers, Terminal · Changes · Browser · ⋯; pressed = the pane is showing. One
// layoutId per element, so the rail slides into the strip and back out (Into Rule).
function Rail({ layout, onOpen, docked, advanced, onToggleAdvanced }: RailProps) {
  const intl = useIntl();
  const open = (id: PaneId) => (event: MouseEvent) => onOpen(id, event.shiftKey);
  const tooltipSide = docked ? 'bottom' : 'left';
  const button = cn(
    floating,
    'workspace-rail-button w-8 px-0 aria-pressed:bg-background-secondary'
  );
  return (
    <motion.div
      layoutId="workspace-rail"
      className={cn(
        'workspace-rail flex items-center gap-1',
        docked ? 'ml-1 flex-row' : 'flex-col rounded-control p-1'
      )}
      role="toolbar"
      aria-label={intl.formatMessage(i18n.panes)}
      aria-orientation={docked ? 'horizontal' : 'vertical'}
      data-testid="workspace-pane-menu"
      data-docked={docked}
    >
      {PRIMARY_PANES.map((id) => {
        const Icon = PANE_ICONS[id];
        const title = intl.formatMessage(PANE_TITLES[id]);
        return (
          <motion.div key={id} layoutId={`workspace-rail-${id}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={button}
                  aria-label={title}
                  aria-pressed={paneVisible(layout, id)}
                  data-testid={`workspace-pane-button-${id}`}
                  onClick={open(id)}
                >
                  <Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent side={tooltipSide}>{title}</TooltipContent>
            </Tooltip>
          </motion.div>
        );
      })}
      <motion.div layoutId="workspace-rail-more">
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={button}
                  aria-label={intl.formatMessage(i18n.morePanes)}
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
            <TooltipContent side={tooltipSide}>{intl.formatMessage(i18n.morePanes)}</TooltipContent>
          </Tooltip>
          {/* Into Rule: upstream's content scales from its trigger anchor, so the menu grows
              out of ⋯ and closes back into it. */}
          <DropdownMenuContent
            side={docked ? 'bottom' : 'left'}
            align={docked ? 'end' : 'center'}
            data-testid="workspace-pane-more-menu"
          >
            {MORE_PANES.map((id) => {
              const Icon = PANE_ICONS[id];
              return (
                <DropdownMenuItem
                  key={id}
                  className="aria-[current=true]:bg-background-secondary"
                  aria-current={paneVisible(layout, id) ? 'true' : undefined}
                  data-testid={`workspace-pane-item-${id}`}
                  onClick={open(id)}
                >
                  <Icon />
                  {intl.formatMessage(PANE_TITLES[id])}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            {/* Easy ↔ Advanced (task 58): the one place the workspace's face is switched
                from, beside Settings › App. */}
            <DropdownMenuItem
              role="menuitemcheckbox"
              aria-checked={advanced}
              data-testid="workspace-advanced-controls"
              onClick={onToggleAdvanced}
            >
              <Check className={advanced ? undefined : 'invisible'} />
              {intl.formatMessage(i18n.advancedControls)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>
    </motion.div>
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
        restoreColumns(restoreDock(initialLayout(), loadDock(project)), loadColumns(project))
      )
  );
  const layout = usePaneLayout(store);
  const rootRef = useRef<HTMLDivElement>(null);
  const [draggingSeam, setDraggingSeam] = useState(false);
  // Where focus goes once the next render has put the target on screen.
  const pendingFocus = useRef<Column | 'more' | null>(null);

  useEffect(() => {
    if (paneStore) return;
    return store.subscribe(() => {
      const { dock, columns } = store.getState();
      saveDock(project, dock);
      saveProjectEntry(COLUMNS_STORAGE_KEY, project, columns);
    });
  }, [paneStore, project, store]);

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
  // default, which is what a Hub submit uses too.
  const [draftRuntime, setDraftRuntime] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState<Mode>('direct');
  // Easy's lever position before a session; once one is open the session's triple is it.
  const [draftStop, setDraftStop] = useState<Stop>('easy');
  // The persisted face (task 58), unknown until read so the wrong one never flashes;
  // Settings › App and the ⋯ menu both write it and announce the change.
  const [workspaceUi, setWorkspaceUi] = useState<WorkspaceUi | undefined>();
  // The file the Editor shows, picked in Files (PRD step 4).
  const [file, setFile] = useState<string | null>(null);

  const cwd = session?.working_dir ?? getInitialWorkingDir();
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
    [applyStopModel, extensionsList, intl, orchestratorRole, setView]
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

  // A first pick tears the Editor off into its own panel so Files stays in view (PRD step 4);
  // once it is in the dock, a pick just brings it to the front where the user left it.
  const openFile = useCallback(
    (path: string) => {
      setFile(path);
      const inDock = store.getState().dock.some((panel) => panel.tabs.includes('editor'));
      if (inDock) store.openPane('editor');
      else store.tearOff('editor');
    },
    [store]
  );
  // Task 40's menu: a click opens the pane in the top panel; shift-click tears it off.
  const openPane = useCallback(
    (id: PaneId, tear: boolean) => {
      if (tear) store.tearOff(id);
      else store.openPane(id);
    },
    [store]
  );
  // A pane that closed alone in its panel leaves focus nowhere in the dock, so it lands on
  // the rail's ⋯ — the one pane button whose tooltip does not open on focus (task 40). The
  // rail re-renders out of the strip first, so the focus waits for that render.
  const paneClosed = useCallback(() => {
    pendingFocus.current = 'more';
  }, []);
  const paneContext = useMemo<PaneContextValue>(
    () => ({
      cwd,
      mode: layout.mode,
      messages: snapshot?.messages ?? NO_MESSAGES,
      file,
      openFile,
    }),
    [cwd, file, layout.mode, openFile, snapshot?.messages]
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
  // One element per change, not per render: the chat input re-renders with its slot.
  const chips = useMemo(
    () =>
      workspaceUi === undefined ? null : workspaceUi === 'easy' ? (
        <Lever
          stop={currentStop}
          providers={providers}
          canOrchestrate={canOrchestrate}
          busy={busy}
          model={sessionModel}
          onPick={pickStop}
        />
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
          <SessionControls
            options={configOptions}
            cwd={cwd}
            role={currentMode === 'orchestrate' ? orchestratorRole?.name : undefined}
            extensionsEnabled={extensionsEnabled}
            busy={busy}
            onSetOption={setConfigOption}
            onOpenFiles={() => store.openPane('files')}
            onOpenExtensions={() => setView('extensions')}
          />
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
      orchestratorRole?.name,
      pickMode,
      pickRuntime,
      pickStop,
      providers,
      runtimeOptions,
      sessionModel,
      sessionStatus,
      setConfigOption,
      setView,
      store,
      workspaceUi,
    ]
  );

  // Only the chat on screen gets the chips: the Hub (no session) on /, the open session
  // on /pair; the other mounted chats are hidden.
  const chipsFor = useCallback(
    (id: string | null) => ((id ?? '') === sessionId ? chips : null),
    [chips, sessionId]
  );

  const workOpen = isWorkspaceRoute && layout.dock.length > 0;

  // ⌘1 · ⌘2 · ⌘3 focus Sessions · Chat · Work; Work with nothing open is the rail.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
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
      const scope =
        target === 'more' || (target === 'work' && !workOpen)
          ? root.querySelector<HTMLElement>('[data-testid="workspace-pane-menu"]')
          : root.querySelector<HTMLElement>(`[data-testid="workspace-column-${target}"]`);
      if (!scope) return;
      pendingFocus.current = null;
      const preferred =
        target === 'more'
          ? scope.querySelector<HTMLElement>('[data-pane="more"]')
          : target === 'chat'
            ? scope.querySelector<HTMLElement>('[data-testid="chat-input"]')
            : null;
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
      <TerminalPane ptyId={sessionId || 'hub'} cwd={cwd} />
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
  // collapse into the titlebar toggle (Into). Work appears at its width: its motion is the
  // rail sliding into the strip, which a width transition would chase.
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
  const rail = isWorkspaceRoute && (
    <Rail
      layout={layout}
      onOpen={openPane}
      docked={workOpen}
      advanced={workspaceUi === 'advanced'}
      onToggleAdvanced={toggleAdvanced}
    />
  );

  return (
    <div
      ref={rootRef}
      className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-x-hidden p-2"
      data-testid="workspace-shell"
      data-ui={workspaceUi}
      data-orchestrator-role={
        orchestratorRole === undefined ? 'loading' : orchestratorRole ? 'present' : 'absent'
      }
    >
      <div className={sessionsMotion} style={{ width: sessionsOpen ? layout.columns.sessions : 0 }}>
        <section
          className={cn(column, 'flex-1')}
          tabIndex={-1}
          aria-label={columnLabel('sessions')}
          data-testid="workspace-column-sessions"
        >
          <Navigation />
        </section>
      </div>
      {sessionsOpen && seam('sessions')}

      <section
        className={cn(column, 'flex flex-1')}
        style={{ minWidth: CHAT_MIN_PX }}
        tabIndex={-1}
        aria-label={columnLabel('chat')}
        data-testid="workspace-column-chat"
      >
        <SessionChipsSlot.Provider value={chipsFor}>
          <div className="relative min-h-0 min-w-0 flex-1">
            {children}
            <div className={isOnPairRoute ? 'contents' : 'hidden'}>{chat}</div>
          </div>
        </SessionChipsSlot.Provider>
      </section>

      {workOpen && (
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
            <Dock
              layout={layout}
              store={store}
              chrome={chrome}
              renderPane={renderPane}
              onClosed={paneClosed}
              launchers={rail}
            />
          </section>
        </>
      )}

      {/* The rail, pinned to the window's right edge and centred, until a panel opens and
          it slides into the dock's strip (the Work column is that rail, unfolded). */}
      {isWorkspaceRoute && !workOpen && (
        <div className="pointer-events-none absolute inset-y-0 right-4 z-40 flex items-center">
          <div className="pointer-events-auto">{rail}</div>
        </div>
      )}
    </div>
  );
}
