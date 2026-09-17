// The rail's ⋯ menu (task 69), laid out as Claude Code desktop's session menu: the pane
// launchers, Background tasks, then Open in ▸ · Rename · Fork · Transcript view ▸ · Output
// style ▸ · Keep computer awake, the workspace's own switches, and Archive · Delete. One
// component over props, so whatever hosts the ⋯ (the floating rail today) renders it inside
// its own DropdownMenu; the session handlers come from useSessionActions.

import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  Activity,
  AlignJustify,
  Archive,
  Check,
  Edit2,
  FileJson,
  FolderOpen,
  GitFork,
  Kanban,
  LoaderCircle,
  MoonStar,
  Palette,
  Repeat,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import { AppEvents } from '../constants/events';
import { all_response_styles } from '../components/settings/response_styles/ResponseStyleSelectionItem';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '../components/ui/dropdown-menu';
import type { SessionActions } from '../hooks/useSessionActions';
import { toastError, toastSuccess } from '../toasts';
import type { PaneChrome } from './WorkColumn';
import { paneVisible, type PaneId, type PaneLayout } from './pane-store';

const i18n = defineMessages({
  menu: { id: 'rail.menu', defaultMessage: 'Session menu' },
  backgroundTasks: { id: 'sessionActions.backgroundTasks', defaultMessage: 'Background tasks' },
  openIn: { id: 'sessionActions.openIn', defaultMessage: 'Open in' },
  openInFinder: { id: 'sessionActions.openInFinder', defaultMessage: 'Finder' },
  openInTerminal: { id: 'sessionActions.openInTerminal', defaultMessage: 'Terminal' },
  openInEditor: { id: 'sessionActions.openInEditor', defaultMessage: 'Code editor' },
  openedIn: { id: 'sessionActions.openedIn', defaultMessage: 'Opened in {editor}' },
  openedDefault: {
    id: 'sessionActions.openedDefault',
    defaultMessage: 'Opened with the system default — no code or cursor command found',
  },
  openFailed: { id: 'sessionActions.openFailed', defaultMessage: "Couldn't open {path}" },
  rename: { id: 'sessionActions.rename', defaultMessage: 'Rename' },
  fork: { id: 'sessionActions.fork', defaultMessage: 'Fork' },
  transcriptView: { id: 'sessionActions.transcriptView', defaultMessage: 'Transcript view' },
  transcriptFull: { id: 'sessionActions.transcriptFull', defaultMessage: 'Full' },
  transcriptCompact: { id: 'sessionActions.transcriptCompact', defaultMessage: 'Compact' },
  viewJson: { id: 'sessionActions.viewJson', defaultMessage: 'View session JSON' },
  viewModelInteractions: {
    id: 'sessionActions.viewModelInteractions',
    defaultMessage: 'View recent model interactions',
  },
  outputStyle: { id: 'sessionActions.outputStyle', defaultMessage: 'Output style' },
  outputStyleEverySession: {
    id: 'sessionActions.outputStyleEverySession',
    defaultMessage: 'Applies to every session',
  },
  responseStyles: {
    id: 'sessionActions.responseStyles',
    defaultMessage: 'Settings › Response styles…',
  },
  keepAwake: { id: 'sessionActions.keepAwake', defaultMessage: 'Keep computer awake' },
  keepAwakeSession: {
    id: 'sessionActions.keepAwakeSession',
    defaultMessage: 'Only for this session',
  },
  archive: { id: 'sessionActions.archive', defaultMessage: 'Archive' },
  delete: { id: 'sessionActions.delete', defaultMessage: 'Delete' },
  noSession: { id: 'sessionActions.noSession', defaultMessage: 'Open a session first' },
  advancedControls: { id: 'workspaceShell.advancedControls', defaultMessage: 'Advanced controls' },
  openOnPhone: { id: 'workspaceShell.openOnPhone', defaultMessage: 'Open on phone…' },
  saveRoutine: { id: 'workspaceShell.saveRoutine', defaultMessage: 'Save as routine…' },
  routineNoSession: {
    id: 'workspaceShell.routineNoSession',
    defaultMessage: 'Open a session first',
  },
});

export type TranscriptView = 'full' | 'compact';

// The one pane shortcut the task names; the rest of the pane rows carry none yet.
const PANE_SHORTCUTS: Partial<Record<PaneId, string>> = { files: '⇧⌘F' };

// The letters that fire an item while the menu is open, as the screenshot lists them.
const KEYS = { r: 'rename', f: 'fork', a: 'archive', d: 'delete' } as const;

export interface RailMenuProps {
  layout: PaneLayout;
  // The panes under ⋯, in order, with their titles and icons.
  panes: readonly PaneId[];
  chrome: Record<PaneId, PaneChrome>;
  onOpenPane(id: PaneId, tear: boolean): void;
  // Undefined until a session is open: the session rows wait, disabled.
  actions?: SessionActions;
  cwd: string;
  // The web build has no shell and no power blocker (task 62's phone).
  webShim: boolean;
  transcriptView: TranscriptView;
  onTranscriptView(view: TranscriptView): void;
  keepAwake: boolean;
  onKeepAwake(on: boolean): void;
  advanced: boolean;
  onToggleAdvanced(): void;
  onOpenPhone(): void;
  onOpenResponseStyles(): void;
  onBackgroundTasks(): void;
  onSaveRoutine?: () => void;
  // Where the content opens from its trigger; the host's geometry, not the menu's.
  side: 'bottom' | 'left';
  align: 'end' | 'center';
  onClose(): void;
}

// The app-wide Response style (Settings › Response styles), read the way the tool rows do.
function useResponseStyle(): [string, (style: string) => void] {
  const [style, setStyle] = useState('concise');
  useEffect(() => {
    const read = () => window.electron.getSetting('responseStyle').then(setStyle);
    void read();
    window.addEventListener(AppEvents.RESPONSE_STYLE_CHANGED, read);
    return () => window.removeEventListener(AppEvents.RESPONSE_STYLE_CHANGED, read);
  }, []);
  const pick = (next: string) => {
    setStyle(next);
    window.electron
      .setSetting('responseStyle', next)
      .then(() => window.dispatchEvent(new CustomEvent(AppEvents.RESPONSE_STYLE_CHANGED)))
      .catch(console.error);
  };
  return [style, pick];
}

export function RailMenu({
  layout,
  panes,
  chrome,
  onOpenPane,
  actions,
  cwd,
  webShim,
  transcriptView,
  onTranscriptView,
  keepAwake,
  onKeepAwake,
  advanced,
  onToggleAdvanced,
  onOpenPhone,
  onOpenResponseStyles,
  onBackgroundTasks,
  onSaveRoutine,
  side,
  align,
  onClose,
}: RailMenuProps) {
  const intl = useIntl();
  const [responseStyle, pickResponseStyle] = useResponseStyle();
  const session = actions?.session;
  const noSession = session === undefined;
  const noSessionTitle = noSession ? intl.formatMessage(i18n.noSession) : undefined;

  // Upstream's directory opener (DirSwitcher does the same): shell.openPath on the cwd.
  const openInFinder = () => void window.electron.openDirectoryInExplorer(cwd);
  const openInEditor = () => {
    window.electron
      .openInEditor(cwd)
      .then((editor) =>
        toastSuccess({
          title:
            editor === 'default'
              ? intl.formatMessage(i18n.openedDefault)
              : intl.formatMessage(i18n.openedIn, { editor }),
        })
      )
      .catch((error: Error) =>
        toastError({
          title: intl.formatMessage(i18n.openFailed, { path: cwd }),
          msg: error.message,
        })
      );
  };

  // R · F · A · D while the menu is open (Radix's own typeahead yields to a prevented key);
  // a submenu's keys are its own, so only the root's content answers.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (!event.currentTarget.contains(event.target as Node)) return;
    const action = KEYS[event.key.toLowerCase() as keyof typeof KEYS];
    if (!action || !actions) return;
    event.preventDefault();
    onClose();
    if (action === 'rename') actions.openRename();
    else if (action === 'fork') void actions.fork();
    else if (action === 'archive') void actions.archive();
    else actions.openDelete();
  };

  const open = (id: PaneId) => (event: MouseEvent) => onOpenPane(id, event.shiftKey);

  return (
    <DropdownMenuContent
      side={side}
      align={align}
      className="min-w-56"
      data-testid="workspace-pane-more-menu"
      onKeyDown={onKeyDown}
    >
      {panes.map((id) => {
        const { Icon, title } = chrome[id];
        const shortcut = PANE_SHORTCUTS[id];
        return (
          <DropdownMenuItem
            key={id}
            className="aria-[current=true]:bg-background-secondary"
            aria-current={paneVisible(layout, id) ? 'true' : undefined}
            data-testid={`workspace-pane-item-${id}`}
            onClick={open(id)}
          >
            <Icon />
            {title}
            {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        );
      })}
      <DropdownMenuSeparator />
      {/* The Board (task 67) once it lands; the Runs inbox on Schedules until then. */}
      <DropdownMenuItem data-testid="workspace-background-tasks" onSelect={onBackgroundTasks}>
        <Kanban />
        {intl.formatMessage(i18n.backgroundTasks)}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {!webShim && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-testid="workspace-open-in">
            <FolderOpen />
            {intl.formatMessage(i18n.openIn)}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem data-testid="workspace-open-in-finder" onSelect={openInFinder}>
              {intl.formatMessage(i18n.openInFinder)}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="workspace-open-in-terminal"
              onSelect={() => onOpenPane('terminal', false)}
            >
              {intl.formatMessage(i18n.openInTerminal)}
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="workspace-open-in-editor" onSelect={openInEditor}>
              {intl.formatMessage(i18n.openInEditor)}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      <DropdownMenuItem
        disabled={noSession}
        title={noSessionTitle}
        data-testid="workspace-rename"
        onSelect={actions?.openRename}
      >
        <Edit2 />
        {intl.formatMessage(i18n.rename)}
        <DropdownMenuShortcut>R</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={noSession || actions?.forking}
        title={noSessionTitle}
        data-testid="workspace-fork"
        onSelect={() => void actions?.fork()}
      >
        {actions?.forking ? <LoaderCircle className="animate-spin" /> : <GitFork />}
        {intl.formatMessage(i18n.fork)}
        <DropdownMenuShortcut>F</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          disabled={noSession}
          title={noSessionTitle}
          data-testid="workspace-transcript-view"
        >
          <AlignJustify />
          {intl.formatMessage(i18n.transcriptView)}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={transcriptView}
            onValueChange={(view) => onTranscriptView(view as TranscriptView)}
          >
            <DropdownMenuRadioItem value="full" data-testid="workspace-transcript-full">
              {intl.formatMessage(i18n.transcriptFull)}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="compact" data-testid="workspace-transcript-compact">
              {intl.formatMessage(i18n.transcriptCompact)}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="workspace-view-json"
            onSelect={() => void actions?.viewJson()}
          >
            {actions?.jsonLoading ? <LoaderCircle className="animate-spin" /> : <FileJson />}
            {intl.formatMessage(i18n.viewJson)}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="workspace-view-model-interactions"
            onSelect={() => void actions?.viewModelInteractions()}
          >
            {actions?.modelInteractionsLoading ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Activity />
            )}
            {intl.formatMessage(i18n.viewModelInteractions)}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {/* The Response style is a presentation setting the tool rows read (Detailed opens
          them, Concise closes them); nothing of it reaches the session's prompt, so it is
          the one app-wide switch here and says so. */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-testid="workspace-output-style">
          <Palette />
          {intl.formatMessage(i18n.outputStyle)}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={responseStyle} onValueChange={pickResponseStyle}>
            {all_response_styles.map((style) => (
              <DropdownMenuRadioItem
                key={style.key}
                value={style.key}
                data-testid={`workspace-output-style-${style.key}`}
              >
                {intl.formatMessage(style.label)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-text-secondary">
            {intl.formatMessage(i18n.outputStyleEverySession)}
          </DropdownMenuLabel>
          <DropdownMenuItem data-testid="workspace-response-styles" onSelect={onOpenResponseStyles}>
            {intl.formatMessage(i18n.responseStyles)}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {!webShim && (
        <DropdownMenuItem
          role="menuitemcheckbox"
          aria-checked={keepAwake}
          disabled={noSession}
          title={noSessionTitle}
          data-testid="workspace-keep-awake"
          onSelect={() => onKeepAwake(!keepAwake)}
        >
          {keepAwake ? <Check /> : <MoonStar />}
          <span className="flex flex-col">
            {intl.formatMessage(i18n.keepAwake)}
            <span className="text-xs text-text-secondary">
              {intl.formatMessage(i18n.keepAwakeSession)}
            </span>
          </span>
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      {/* Easy ↔ Advanced (task 58): the one place the workspace's face is switched from,
          beside Settings › App. */}
      <DropdownMenuItem
        role="menuitemcheckbox"
        aria-checked={advanced}
        data-testid="workspace-advanced-controls"
        onClick={onToggleAdvanced}
      >
        <Check className={advanced ? undefined : 'invisible'} />
        {intl.formatMessage(i18n.advancedControls)}
      </DropdownMenuItem>
      {/* The phone's door (task 62): Settings › App's Phone card, the URL and its code. */}
      <DropdownMenuItem data-testid="workspace-open-phone" onClick={onOpenPhone}>
        <Smartphone />
        {intl.formatMessage(i18n.openOnPhone)}
      </DropdownMenuItem>
      {/* Easy has no Session controls chip, so the sheet (task 59) opens from here too. */}
      <DropdownMenuItem
        disabled={!onSaveRoutine}
        title={onSaveRoutine ? undefined : intl.formatMessage(i18n.routineNoSession)}
        data-testid="workspace-rail-save-routine"
        onClick={onSaveRoutine}
      >
        <Repeat />
        {intl.formatMessage(i18n.saveRoutine)}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={noSession || actions?.archiving}
        title={noSessionTitle}
        data-testid="workspace-archive"
        onSelect={() => void actions?.archive()}
      >
        {actions?.archiving ? <LoaderCircle className="animate-spin" /> : <Archive />}
        {intl.formatMessage(i18n.archive)}
        <DropdownMenuShortcut>A</DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        disabled={noSession || actions?.deleting}
        title={noSessionTitle}
        data-testid="workspace-delete"
        onSelect={actions?.openDelete}
      >
        <Trash2 />
        {intl.formatMessage(i18n.delete)}
        <DropdownMenuShortcut className="text-inherit">D</DropdownMenuShortcut>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
