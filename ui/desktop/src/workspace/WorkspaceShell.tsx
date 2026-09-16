// The workspace around the chat (PRD steps 2-3, 8, 9): a header with Runtime, Mode and the
// pane menu, the chat (or the Hub) in the main column, and the right dock over the pane
// store. Composes exported components only and reaches ACP through src/acp.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
  type RefObject,
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
  Terminal,
} from 'lucide-react';
import { v7 as uuidv7 } from 'uuid';
import { defineMessages, useIntl } from '../i18n';
import { useNavigation } from '../hooks/useNavigation';
import { useConfig } from '../components/ConfigContext';
import { useModelAndProvider } from '../components/ModelAndProviderContext';
import { useNavigationContextSafe } from '../components/Layout/NavigationContext';
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/Tooltip';
import { cn } from '../utils';
import { toastError } from '../toasts';
import { formatAcpError } from '../acp/errors';
import { acpListProviderDetails, acpSetSessionProviderModel } from '../acp/providers';
import { listAgentSources, type SourceEntry } from '../acp/sources';
import { encodeRecipe } from '../acp/recipe';
import {
  acpChatSessionActions,
  acpChatSessionStore,
  useAcpChatSessionSnapshot,
} from '../acp/chatSessionStore';
import { createSession } from '../sessions';
import { AppEvents } from '../constants/events';
import { getEffectiveWorkingDir, getInitialWorkingDir } from '../utils/workingDir';
import type { Message } from '../types/message';
import type { ProviderDetails } from '../types/providers';
import { PaneContext, type PaneContextValue } from './pane-context';
import {
  createPaneStore,
  initialLayout,
  restoreDock,
  PANE_IDS,
  type PaneId,
  type PaneLayout,
  type PaneStore,
} from './pane-store';
import { Dock, loadDock, saveDock } from './Dock';
import type { PaneChrome } from './Panel';
import { TerminalPane } from './panes/terminal/TerminalPane';
import {
  modeOfSession,
  moreRuntimes,
  needsInstall,
  orchestratorRecipe,
  runtimeDividerMessage,
  runtimeLabel,
  ORCHESTRATOR_ROLE,
  RUNTIMES,
  type Mode,
} from './session-controls';

const i18n = defineMessages({
  runtime: { id: 'workspaceShell.runtime', defaultMessage: 'Runtime' },
  mode: { id: 'workspaceShell.mode', defaultMessage: 'Mode' },
  more: { id: 'workspaceShell.more', defaultMessage: 'More…' },
  install: { id: 'workspaceShell.install', defaultMessage: 'Install' },
  direct: { id: 'workspaceShell.direct', defaultMessage: 'Direct' },
  orchestrate: { id: 'workspaceShell.orchestrate', defaultMessage: 'Orchestrate' },
  noOrchestrator: {
    id: 'workspaceShell.noOrchestrator',
    defaultMessage: 'no orchestrator role in this project',
  },
  runtimeDivider: { id: 'workspaceShell.runtimeDivider', defaultMessage: '→ {runtime} from here' },
  startFailed: { id: 'workspaceShell.startFailed', defaultMessage: "Couldn't start session" },
  switchFailed: { id: 'workspaceShell.switchFailed', defaultMessage: "Couldn't switch runtime" },
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

function paneVisible(layout: PaneLayout, id: PaneId): boolean {
  if (layout.mode === 'phone') return layout.visible === id;
  return layout.dock.some((panel) => panel.active === id);
}

const WORKSPACE_ROUTES = new Set(['/', '/pair']);
const NO_MESSAGES: readonly Message[] = [];

function usePaneLayout(store: PaneStore) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

interface PaneMenuProps {
  layout: PaneLayout;
  onOpen(id: PaneId, tear: boolean): void;
  // The toolbar, so focus has somewhere to land when a closed pane empties its panel.
  menuRef: RefObject<HTMLDivElement | null>;
}

// The header's right: Terminal · Changes · Browser · ⋯. Pressed = the pane is showing.
function PaneMenu({ layout, onOpen, menuRef }: PaneMenuProps) {
  const intl = useIntl();
  const open = (id: PaneId) => (event: MouseEvent) => onOpen(id, event.shiftKey);
  return (
    <div
      ref={menuRef}
      className="ml-auto flex items-center gap-1"
      role="toolbar"
      aria-label={intl.formatMessage(i18n.panes)}
      data-testid="workspace-pane-menu"
    >
      {PRIMARY_PANES.map((id) => {
        const Icon = PANE_ICONS[id];
        const title = intl.formatMessage(PANE_TITLES[id]);
        return (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(floating, 'w-8 px-0 aria-pressed:bg-background-secondary')}
                aria-label={title}
                aria-pressed={paneVisible(layout, id)}
                data-testid={`workspace-pane-button-${id}`}
                onClick={open(id)}
              >
                <Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{title}</TooltipContent>
          </Tooltip>
        );
      })}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(floating, 'w-8 px-0')}
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
          <TooltipContent side="bottom">{intl.formatMessage(i18n.morePanes)}</TooltipContent>
        </Tooltip>
        {/* Into Rule: upstream's content scales from its trigger anchor, so the menu grows
            out of ⋯ and closes back into it. */}
        <DropdownMenuContent align="end" data-testid="workspace-pane-more-menu">
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
  // AppLayout's nav toggle floats over the top-left when the nav is collapsed.
  const isNavCollapsed = !useNavigationContextSafe()?.isNavExpanded;
  // The dock is remembered per project: the window's working dir names it (task 42).
  const [project] = useState(getInitialWorkingDir);
  const [store] = useState(
    () => paneStore ?? createPaneStore(restoreDock(initialLayout(), loadDock(project)))
  );
  const layout = usePaneLayout(store);
  const paneMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paneStore) return;
    return store.subscribe(() => saveDock(project, store.getState().dock));
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
  // The file the Editor shows, picked in Files (PRD step 4).
  const [file, setFile] = useState<string | null>(null);

  const cwd = session?.working_dir ?? getInitialWorkingDir();
  const currentRuntime =
    session?.provider_name ?? draftRuntime ?? defaultProvider ?? RUNTIMES[0].id;
  const currentMode: Mode = session ? modeOfSession(session) : draftMode;

  useEffect(() => {
    if (!isWorkspaceRoute) return;
    acpListProviderDetails().then(setProviders).catch(console.error);
  }, [isWorkspaceRoute]);

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

  const startSession = useCallback(
    async (providerId: string, mode: Mode) => {
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
    [extensionsList, intl, orchestratorRole, setView]
  );

  // Mid-session the switch is the ACP `provider` option; the store snapshot is the
  // selector's value, so a failed request leaves it where it was (PRD step 9).
  const switchRuntime = useCallback(
    async (providerId: string) => {
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
          runtime: runtimeLabel(provider, providers),
        });
        acpChatSessionActions.setMessages(sessionId, [
          ...current.messages,
          runtimeDividerMessage(uuidv7(), divider),
        ]);
      } catch (error) {
        toastError({ title: intl.formatMessage(i18n.switchFailed), msg: formatAcpError(error) });
      } finally {
        setBusy(false);
      }
    },
    [intl, providers, sessionId]
  );

  const pickRuntime = (providerId: string) => {
    if (providerId === currentRuntime || needsInstall(providerId, providers)) return;
    if (session) {
      void switchRuntime(providerId);
      return;
    }
    setDraftRuntime(providerId);
    void startSession(providerId, draftMode);
  };

  // Orchestrate is fixed at session/new, so a mode pick on an open session starts a
  // new one on the same runtime; the previous session stays in the list.
  const pickMode = (mode: Mode) => {
    if (mode === currentMode || (mode === 'orchestrate' && !orchestratorRole)) return;
    setDraftMode(mode);
    void startSession(currentRuntime, mode);
  };

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
  // the header's ⋯ — the one pane button whose tooltip does not open on focus (task 40).
  const paneClosed = useCallback(() => {
    paneMenuRef.current?.querySelector<HTMLElement>('[data-pane="more"]')?.focus();
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

  const runtimeOptions = useMemo(() => {
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

  if (!isWorkspaceRoute) {
    return (
      <>
        {children}
        <div className="hidden">{chat}</div>
      </>
    );
  }

  const modeLabel = (mode: Mode) =>
    intl.formatMessage(mode === 'direct' ? i18n.direct : i18n.orchestrate);
  // What the open session runs on, as the Runtime and Mode controls' tooltip (task 40 moved
  // it off the header's right, which is the pane menu now).
  const sessionStatus = session
    ? `${runtimeLabel(currentRuntime, providers)} · ${modeLabel(currentMode)}`
    : undefined;
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

  return (
    <div
      className="flex flex-col h-full min-h-0"
      data-testid="workspace-shell"
      data-orchestrator-role={
        orchestratorRole === undefined ? 'loading' : orchestratorRole ? 'present' : 'absent'
      }
    >
      <header
        // Above the fixed 32px titlebar drag strip (z-50), like AppLayout's own controls.
        className={cn(
          'relative z-[60] flex items-center gap-4 pr-4 pt-[14px] pb-2 text-sm no-drag',
          isNavCollapsed ? 'pl-[140px]' : 'pl-4'
        )}
      >
        <label className="flex items-center gap-2" title={sessionStatus}>
          <span className="text-text-secondary">{intl.formatMessage(i18n.runtime)}</span>
          <select
            className="rounded-md border border-border-primary bg-background-primary px-2 py-1 text-text-primary"
            data-testid="workspace-runtime"
            value={currentRuntime}
            disabled={busy}
            onChange={(event) => pickRuntime(event.target.value)}
          >
            {runtimeOptions
              .filter((runtime) => !runtime.more)
              .map((runtime) => (
                <option
                  key={runtime.id}
                  value={runtime.id}
                  disabled={needsInstall(runtime.id, providers)}
                  data-testid={`workspace-runtime-option-${runtime.id}`}
                >
                  {runtime.label}
                  {needsInstall(runtime.id, providers)
                    ? ` — ${intl.formatMessage(i18n.install)}`
                    : ''}
                </option>
              ))}
            {runtimeOptions.some((runtime) => runtime.more) && (
              <optgroup label={intl.formatMessage(i18n.more)}>
                {runtimeOptions
                  .filter((runtime) => runtime.more)
                  .map((runtime) => (
                    <option
                      key={runtime.id}
                      value={runtime.id}
                      data-testid={`workspace-runtime-option-${runtime.id}`}
                    >
                      {runtime.label}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        </label>
        <div
          className="flex items-center gap-2"
          role="group"
          aria-label={intl.formatMessage(i18n.mode)}
          title={sessionStatus}
          data-testid="workspace-mode"
        >
          <span className="text-text-secondary">{intl.formatMessage(i18n.mode)}</span>
          {(['direct', 'orchestrate'] as const).map((mode) => (
            <Button
              key={mode}
              variant={currentMode === mode ? 'default' : 'outline'}
              size="xs"
              disabled={busy || (mode === 'orchestrate' && !orchestratorRole)}
              aria-pressed={currentMode === mode}
              title={
                mode === 'orchestrate' && !orchestratorRole
                  ? intl.formatMessage(i18n.noOrchestrator)
                  : undefined
              }
              data-testid={`workspace-mode-${mode}`}
              onClick={() => pickMode(mode)}
            >
              {modeLabel(mode)}
            </Button>
          ))}
          {orchestratorRole === null && (
            <span
              className="min-w-0 truncate text-xs text-text-secondary"
              data-testid="workspace-mode-note"
            >
              {intl.formatMessage(i18n.noOrchestrator)}
            </span>
          )}
        </div>
        <PaneMenu layout={layout} onOpen={openPane} menuRef={paneMenuRef} />
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 min-h-0 relative">
          {children}
          <div className={isOnPairRoute ? 'contents' : 'hidden'}>{chat}</div>
        </div>

        {layout.dock.length > 0 && (
          <Dock
            layout={layout}
            store={store}
            chrome={chrome}
            renderPane={renderPane}
            onClosed={paneClosed}
          />
        )}
      </div>
    </div>
  );
}
