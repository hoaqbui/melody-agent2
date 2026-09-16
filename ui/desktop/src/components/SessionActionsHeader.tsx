import { useCallback, useMemo, useState, type KeyboardEvent } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit2,
  FileJson,
  LoaderCircle,
} from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import {
  useSessionActions,
  type FullTextSelection,
  type SessionActions,
} from '../hooks/useSessionActions';
import { getSessionDisplayName } from '../sessions';
import type { Session } from '../types/session';
import { cn } from '../utils';
import { Button } from './ui/button';
import { ConfirmationModal } from './ui/ConfirmationModal';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const i18n = defineMessages({
  actionsLabel: {
    id: 'sessionActionsHeader.actionsLabel',
    defaultMessage: 'Session actions',
  },
  renameSession: {
    id: 'sessionActionsHeader.renameSession',
    defaultMessage: 'Rename session',
  },
  duplicateSession: {
    id: 'sessionActionsHeader.duplicateSession',
    defaultMessage: 'Duplicate session',
  },
  viewJson: {
    id: 'sessionActionsHeader.viewJson',
    defaultMessage: 'View session JSON',
  },
  viewModelInteractions: {
    id: 'sessionActionsHeader.viewModelInteractions',
    defaultMessage: 'View recent model interactions',
  },
  renameTitle: {
    id: 'sessionActionsHeader.renameTitle',
    defaultMessage: 'Rename Session',
  },
  renamePlaceholder: {
    id: 'sessionActionsHeader.renamePlaceholder',
    defaultMessage: 'Enter session name',
  },
  cancel: {
    id: 'sessionActionsHeader.cancel',
    defaultMessage: 'Cancel',
  },
  save: {
    id: 'sessionActionsHeader.save',
    defaultMessage: 'Save',
  },
  saving: {
    id: 'sessionActionsHeader.saving',
    defaultMessage: 'Saving...',
  },
  jsonTitle: {
    id: 'sessionActionsHeader.jsonTitle',
    defaultMessage: 'Session JSON',
  },
  modelInteractionsTitle: {
    id: 'sessionActionsHeader.modelInteractionsTitle',
    defaultMessage: 'Recent model interactions',
  },
  loadingJson: {
    id: 'sessionActionsHeader.loadingJson',
    defaultMessage: 'Loading JSON...',
  },
  close: {
    id: 'sessionActionsHeader.close',
    defaultMessage: 'Close',
  },
  copyJson: {
    id: 'sessionActionsHeader.copyJson',
    defaultMessage: 'Copy JSON',
  },
  fullTextTitle: {
    id: 'sessionActionsHeader.fullTextTitle',
    defaultMessage: 'Text value',
  },
  copyText: {
    id: 'sessionActionsHeader.copyText',
    defaultMessage: 'Copy text',
  },
  deleteTitle: { id: 'sessionActions.deleteTitle', defaultMessage: 'Delete session' },
  deleteMessage: {
    id: 'sessionActions.deleteMessage',
    defaultMessage: 'Delete "{name}"? This cannot be undone.',
  },
});

const LONG_STRING_THRESHOLD = 180;
const STRING_PREVIEW_START = 96;
const STRING_PREVIEW_END = 56;

interface SessionActionsHeaderProps {
  session?: Session;
  // On the workspace route the rail's ⋯ is the session's menu (task 69); the header keeps
  // out of the way there and renders nothing, dialogs included.
  hidden?: boolean;
  className?: string;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNodePath(parentPath: string, key: string, isArrayItem: boolean): string {
  if (isArrayItem) {
    return `${parentPath}[${key}]`;
  }

  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${parentPath}.${key}`
    : `${parentPath}[${JSON.stringify(key)}]`;
}

function getStringPreview(value: string): string {
  if (value.length <= LONG_STRING_THRESHOLD) {
    return JSON.stringify(value);
  }

  return JSON.stringify(
    `${value.slice(0, STRING_PREVIEW_START)} ... ${value.slice(-STRING_PREVIEW_END)}`
  );
}

function JsonPrimitiveValue({
  value,
  path,
  onOpenText,
}: {
  value: unknown;
  path: string;
  onOpenText: (selection: FullTextSelection) => void;
}) {
  if (typeof value === 'string') {
    const isLong = value.length > LONG_STRING_THRESHOLD;
    const preview = getStringPreview(value);

    if (isLong) {
      return (
        <button
          type="button"
          className="min-w-0 rounded-sm text-left text-blue-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-active dark:text-blue-300 break-all"
          onClick={() => onOpenText({ path, value })}
          title={path}
        >
          {preview}
        </button>
      );
    }

    return (
      <span className="min-w-0 text-emerald-700 dark:text-emerald-300 break-all">{preview}</span>
    );
  }

  if (typeof value === 'number') {
    return <span className="text-purple-700 dark:text-purple-300">{value}</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-amber-700 dark:text-amber-300">{String(value)}</span>;
  }

  if (value === null) {
    return <span className="text-text-secondary">null</span>;
  }

  return <span className="text-text-secondary">{String(value)}</span>;
}

function JsonTreeNode({
  label,
  value,
  depth,
  path,
  isArrayItem = false,
  onOpenText,
}: {
  label?: string;
  value: unknown;
  depth: number;
  path: string;
  isArrayItem?: boolean;
  onOpenText: (selection: FullTextSelection) => void;
}) {
  const isArray = Array.isArray(value);
  const isRecord = isJsonRecord(value);
  const isContainer = isArray || isRecord;
  const [isOpen, setIsOpen] = useState(depth < 3);

  const labelNode =
    label === undefined ? null : (
      <span className="text-text-secondary">{isArrayItem ? label : JSON.stringify(label)}:</span>
    );

  if (!isContainer) {
    return (
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 px-1 py-0.5">
        {labelNode}
        <JsonPrimitiveValue value={value} path={path} onOpenText={onOpenText} />
      </div>
    );
  }

  const entries = isArray
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value);
  const openToken = isArray ? '[' : '{';
  const closeToken = isArray ? ']' : '}';
  const countLabel = isArray
    ? `${entries.length} ${entries.length === 1 ? 'item' : 'items'}`
    : `${entries.length} ${entries.length === 1 ? 'key' : 'keys'}`;

  return (
    <div className="min-w-0">
      <button
        type="button"
        className="flex max-w-full items-baseline gap-1 rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-background-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-active"
        onClick={() => entries.length > 0 && setIsOpen((open) => !open)}
      >
        {entries.length > 0 ? (
          isOpen ? (
            <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-text-secondary" />
          ) : (
            <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-text-secondary" />
          )
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex flex-wrap items-baseline gap-x-1">
          {labelNode}
          <span>{openToken}</span>
          {!isOpen && entries.length > 0 && (
            <span className="text-text-secondary">{countLabel}</span>
          )}
          {(!isOpen || entries.length === 0) && <span>{closeToken}</span>}
        </span>
      </button>

      {isOpen && entries.length > 0 && (
        <div className="ml-3 border-l border-border-primary/70 pl-3">
          {entries.map(([key, childValue]) => (
            <JsonTreeNode
              key={`${path}.${key}`}
              label={key}
              value={childValue}
              depth={depth + 1}
              path={getNodePath(path, key, isArray)}
              isArrayItem={isArray}
              onOpenText={onOpenText}
            />
          ))}
          <div className="px-1 py-0.5">{closeToken}</div>
        </div>
      )}
    </div>
  );
}

function JsonTree({
  value,
  onOpenText,
}: {
  value: unknown;
  onOpenText: (selection: FullTextSelection) => void;
}) {
  return (
    <div className="min-w-0 font-mono text-xs leading-5 text-text-primary">
      <JsonTreeNode value={value} depth={0} path="root" onOpenText={onOpenText} />
    </div>
  );
}

// The dialogs behind the session's actions — rename, the JSON views, the full-text view
// and the delete confirm — rendered by whoever runs the hook (the header, the rail's ⋯).
export function SessionActionDialogs({ actions }: { actions: SessionActions }) {
  const intl = useIntl();
  const {
    session,
    renameOpen,
    setRenameOpen,
    renameValue,
    setRenameValue,
    renaming,
    rename,
    jsonOpen,
    setJsonOpen,
    jsonKind,
    jsonValue,
    jsonText,
    jsonLoading,
    modelInteractionsLoading,
    copyJson,
    fullText,
    setFullText,
    copyFullText,
    deleteOpen,
    confirmDelete,
    cancelDelete,
  } = actions;

  const handleRenameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        void rename();
      }
    },
    [rename]
  );

  return (
    <>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md" data-testid="session-rename-dialog">
          <DialogHeader>
            <DialogTitle>{intl.formatMessage(i18n.renameTitle)}</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={handleRenameKeyDown}
            placeholder={intl.formatMessage(i18n.renamePlaceholder)}
            className="w-full rounded-lg border border-border-primary bg-background-primary p-3 text-text-primary outline-none focus:ring-2 focus:ring-border-active"
            disabled={renaming}
            maxLength={200}
            data-testid="session-rename-input"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={renaming}>
              {intl.formatMessage(i18n.cancel)}
            </Button>
            <Button
              onClick={() => void rename()}
              disabled={renaming || !renameValue.trim()}
              data-testid="session-rename-save"
            >
              {renaming ? intl.formatMessage(i18n.saving) : intl.formatMessage(i18n.save)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={jsonOpen} onOpenChange={setJsonOpen}>
        <DialogContent className="grid max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              {intl.formatMessage(
                jsonKind === 'modelInteractions' ? i18n.modelInteractionsTitle : i18n.jsonTitle
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-hidden rounded-lg border border-border-primary bg-background-secondary">
            {jsonLoading || modelInteractionsLoading ? (
              <div className="flex h-64 items-center justify-center gap-2 text-sm text-text-secondary">
                <LoaderCircle className="size-4 animate-spin" />
                {intl.formatMessage(i18n.loadingJson)}
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-auto p-3">
                <JsonTree value={jsonValue} onOpenText={setFullText} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJsonOpen(false)}>
              {intl.formatMessage(i18n.close)}
            </Button>
            <Button
              onClick={() => void copyJson()}
              disabled={!jsonText || jsonLoading || modelInteractionsLoading}
            >
              {intl.formatMessage(i18n.copyJson)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fullText} onOpenChange={(open) => !open && setFullText(null)}>
        <DialogContent className="grid max-h-[80vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{intl.formatMessage(i18n.fullTextTitle)}</DialogTitle>
          </DialogHeader>
          {fullText && (
            <div className="min-h-0 space-y-3">
              <code className="block truncate rounded-md bg-background-secondary px-3 py-2 text-xs text-text-secondary">
                {fullText.path}
              </code>
              <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border-primary bg-background-secondary p-4 text-xs leading-5 text-text-primary">
                {fullText.value}
              </pre>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFullText(null)}>
              {intl.formatMessage(i18n.close)}
            </Button>
            <Button onClick={() => void copyFullText()} disabled={!fullText}>
              {intl.formatMessage(i18n.copyText)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={deleteOpen}
        title={intl.formatMessage(i18n.deleteTitle)}
        message={intl.formatMessage(i18n.deleteMessage, {
          name: session ? getSessionDisplayName(session) : '',
        })}
        confirmLabel={intl.formatMessage(i18n.deleteTitle)}
        cancelLabel={intl.formatMessage(i18n.cancel)}
        confirmVariant="destructive"
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />
    </>
  );
}

export default function SessionActionsHeader({
  session,
  hidden = false,
  className,
}: SessionActionsHeaderProps) {
  const intl = useIntl();
  const actions = useSessionActions(hidden ? undefined : session);
  const title = useMemo(() => (session ? getSessionDisplayName(session) : ''), [session]);

  if (!session || hidden) {
    return null;
  }

  const isDialogOpen = actions.renameOpen || actions.jsonOpen || actions.fullText !== null;

  return (
    <>
      <div
        className={cn(
          'no-drag absolute top-[14px] left-1/2 max-w-[min(36rem,calc(100vw-13rem))] -translate-x-1/2',
          isDialogOpen ? 'z-30' : 'z-50',
          className
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="no-drag flex h-7 max-w-full items-center gap-1 rounded-md px-2.5 text-text-primary transition-colors hover:bg-background-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-active"
              aria-label={intl.formatMessage(i18n.actionsLabel)}
            >
              <span className="truncate text-xs font-medium">{title}</span>
              <ChevronDown className="size-3.5 text-text-secondary" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-56">
            <DropdownMenuItem onSelect={actions.openRename}>
              <Edit2 className="size-4" />
              {intl.formatMessage(i18n.renameSession)}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={actions.forking} onSelect={() => void actions.fork()}>
              {actions.forking ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Copy className="size-4" />
              )}
              {intl.formatMessage(i18n.duplicateSession)}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void actions.viewJson()}>
              {actions.jsonLoading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <FileJson className="size-4" />
              )}
              {intl.formatMessage(i18n.viewJson)}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void actions.viewModelInteractions()}>
              {actions.modelInteractionsLoading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Activity className="size-4" />
              )}
              {intl.formatMessage(i18n.viewModelInteractions)}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SessionActionDialogs actions={actions} />
    </>
  );
}
