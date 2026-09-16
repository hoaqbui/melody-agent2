/* global WebSocket */
// The Files pane (PRD step 4): the session cwd as a tree, a drill-down list at phone width,
// a dot on what the session wrote, and a click that opens the file in the Editor. Reads and
// watches the cwd through src/native only.

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronRight, File, Folder, Lock } from 'lucide-react';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../utils';
import {
  sidecarFetch,
  sidecarSocket,
  type FsListResponse,
  type FsWatchEvent,
} from '../../../native/sidecar';
import { usePaneContext } from '../../pane-context';
import {
  createFilesTreeStore,
  dirsToLoad,
  dirsToReload,
  enterDir,
  isWritten,
  leaveDir,
  listing,
  markLoading,
  paneState,
  setEntries,
  setError,
  toggleDir,
  visibleRows,
  writtenPaths,
  type FilesTreeStore,
  type TreeRow,
} from './files-tree';

const i18n = defineMessages({
  nothingHere: { id: 'filesPane.nothingHere', defaultMessage: 'Nothing here' },
  loading: { id: 'filesPane.loading', defaultMessage: 'Loading…' },
  retry: { id: 'filesPane.retry', defaultMessage: 'Retry' },
  unreadable: { id: 'filesPane.unreadable', defaultMessage: 'Unreadable' },
  written: { id: 'filesPane.written', defaultMessage: 'Written this session' },
  back: { id: 'filesPane.back', defaultMessage: 'Back' },
});

// One tree per cwd, kept across promote and close (DESIGN.md Nothing Lost Rule).
const stores = new Map<string, FilesTreeStore>();

function storeFor(cwd: string): FilesTreeStore {
  let store = stores.get(cwd);
  if (!store) {
    store = createFilesTreeStore(cwd);
    stores.set(cwd, store);
  }
  return store;
}

function useTree(store: FilesTreeStore) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export function FilesPane() {
  const intl = useIntl();
  const { cwd, mode, messages, openFile } = usePaneContext();
  const store = storeFor(cwd);
  const tree = useTree(store);
  const written = useMemo(() => writtenPaths(messages, cwd), [messages, cwd]);

  const load = useCallback(
    (dir: string) => {
      store.apply((state) => markLoading(state, dir));
      sidecarFetch<FsListResponse>('/fs/list', { path: dir })
        .then((response) => store.apply((state) => setEntries(state, dir, response.entries)))
        .catch((error: Error) => store.apply((state) => setError(state, dir, error.message)));
    },
    [store]
  );

  useEffect(() => {
    dirsToLoad(tree, mode).forEach(load);
  }, [load, mode, tree]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    // A watch that fails leaves the tree as it is; the rows still load on demand.
    sidecarSocket('/fs/watch', { path: cwd })
      .then((opened) => {
        if (closed) {
          opened.close();
          return;
        }
        socket = opened;
        socket.onmessage = (message: MessageEvent<string>) => {
          const event = JSON.parse(message.data) as FsWatchEvent;
          dirsToReload(store.getState(), event).forEach(load);
        };
      })
      .catch(() => undefined);
    return () => {
      closed = true;
      socket?.close();
    };
  }, [cwd, load, store]);

  const state = paneState(tree, mode);
  const rows = mode === 'phone' ? listing(tree) : visibleRows(tree);
  const top = mode === 'phone' ? tree.current : tree.root;
  const topLoad = tree.dirs[top];

  const onRow = (row: TreeRow) => {
    if (row.type === 'dir') {
      store.apply((state) =>
        mode === 'phone' ? enterDir(state, row.path) : toggleDir(state, row.path)
      );
    } else if (row.type !== 'other') {
      openFile(row.path);
    }
  };

  return (
    <div
      className="flex flex-col min-h-0 h-full text-sm"
      data-testid="files-pane"
      data-state={state}
    >
      <div
        className="flex items-center gap-1 px-2 py-1 border-b border-border-primary text-xs text-text-secondary"
        data-testid="files-root"
      >
        {mode === 'phone' && tree.current !== tree.root && (
          <Button variant="ghost" size="xs" onClick={() => store.apply(leaveDir)}>
            ‹ {intl.formatMessage(i18n.back)}
          </Button>
        )}
        <span className="truncate">{top}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto py-1" role="tree">
        {state === 'loading' && (
          <p className="px-3 py-1 text-text-secondary" aria-live="polite">
            {intl.formatMessage(i18n.loading)}
          </p>
        )}
        {state === 'empty' && (
          <p className="px-3 py-1 text-text-secondary">{intl.formatMessage(i18n.nothingHere)}</p>
        )}
        {topLoad?.status === 'error' && (
          <div className="px-3 py-1 flex flex-col gap-1" role="alert">
            <span className="text-text-danger break-all">{topLoad.message}</span>
            <Button variant="outline" size="xs" className="self-start" onClick={() => load(top)}>
              {intl.formatMessage(i18n.retry)}
            </Button>
          </div>
        )}
        {rows.map((row) => (
          <FileRow
            key={row.path}
            row={row}
            written={isWritten(written, row)}
            onClick={() => onRow(row)}
            writtenLabel={intl.formatMessage(i18n.written)}
            unreadableLabel={intl.formatMessage(i18n.unreadable)}
          />
        ))}
      </div>
    </div>
  );
}

interface FileRowProps {
  row: TreeRow;
  written: boolean;
  onClick: () => void;
  writtenLabel: string;
  unreadableLabel: string;
}

function FileRow({ row, written, onClick, writtenLabel, unreadableLabel }: FileRowProps) {
  const isDir = row.type === 'dir';
  const unreadable = row.load?.status === 'error' ? row.load.message : null;
  const Chevron = row.expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      role="treeitem"
      aria-expanded={isDir ? row.expanded : undefined}
      className={cn(
        'flex w-full items-center gap-1 px-2 py-0.5 text-left text-text-primary hover:bg-background-secondary',
        row.type === 'other' && 'text-text-secondary cursor-default'
      )}
      style={{ paddingLeft: `${8 + row.depth * 12}px` }}
      title={unreadable ? `${unreadableLabel}: ${unreadable}` : undefined}
      data-testid="files-row"
      data-path={row.path}
      data-type={row.type}
      data-written={written || undefined}
      onClick={onClick}
    >
      {isDir ? <Chevron className="size-3 shrink-0" /> : <span className="size-3 shrink-0" />}
      {isDir ? <Folder className="size-3.5 shrink-0" /> : <File className="size-3.5 shrink-0" />}
      <span className="truncate">{row.name}</span>
      {unreadable && <Lock className="size-3 shrink-0 text-text-secondary" aria-hidden />}
      {written && (
        <span className="ml-auto size-1.5 shrink-0 rounded-full bg-text-info" title={writtenLabel}>
          <span className="sr-only">{writtenLabel}</span>
        </span>
      )}
    </button>
  );
}
