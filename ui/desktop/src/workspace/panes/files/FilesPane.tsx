/* global WebSocket */
// The Files pane (PRD step 4): the session cwd as a tree, a drill-down list at phone width,
// a dot on what the session wrote, and a click that opens the file in the Editor. Reads and
// watches the cwd through src/native only.

import { useCallback, useEffect, useMemo, useSyncExternalStore, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, File, Folder, Lock, Copy, Plus, Trash2, FolderPlus, Edit2 } from 'lucide-react';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { cn } from '../../../utils';
import {
  sidecarFetch,
  sidecarSocket,
  type FsListResponse,
  type FsWatchEvent,
  type FsDeleteResponse,
} from '../../../native/sidecar';
import { usePaneContext } from '../../pane-context';
import { toast } from 'react-toastify';
import { toastError } from '../../../toasts';
import {
  createFilesTreeStore,
  dirsToLoad,
  dirsToReload,
  enterDir,
  isWritten,
  leaveDir,
  listing,
  loadedDirs,
  markLoading,
  paneState,
  setEntries,
  setError,
  toggleDir,
  visibleRows,
  writtenPaths,
  filterRows,
  gitTint,
  parentDir,
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
  newFile: { id: 'filesPane.newFile', defaultMessage: 'New file' },
  newFolder: { id: 'filesPane.newFolder', defaultMessage: 'New folder' },
  rename: { id: 'filesPane.rename', defaultMessage: 'Rename' },
  delete: { id: 'filesPane.delete', defaultMessage: 'Delete' },
  revealInFinder: { id: 'filesPane.revealInFinder', defaultMessage: 'Reveal in Finder' },
  copyPath: { id: 'filesPane.copyPath', defaultMessage: 'Copy path' },
  addToChat: { id: 'filesPane.addToChat', defaultMessage: 'Add to chat' },
  deleted: { id: 'filesPane.deleted', defaultMessage: 'Deleted' },
  undo: { id: 'filesPane.undo', defaultMessage: 'Undo' },
});

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
  const { cwd, mode, messages, openFile, gitStatus, insertIntoChat } = usePaneContext();
  const store = storeFor(cwd);
  const tree = useTree(store);
  const written = useMemo(() => writtenPaths(messages, cwd), [messages, cwd]);
  const [filter, setFilter] = useState('');
  const [menuRow, setMenuRow] = useState<string | null>(null);
  const [inlineEditPath, setInlineEditPath] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState('');
  const [trashStack, setTrashStack] = useState<Array<{ path: string; trash: string }>>([]);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const focusedRowRef = useRef<string | null>(null);

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
    loadedDirs(store.getState()).forEach(load);
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
  const allRows = mode === 'phone' ? listing(tree) : visibleRows(tree);
  const rows = useMemo(() => filterRows(allRows, filter), [allRows, filter]);
  const top = mode === 'phone' ? tree.current : tree.root;
  const topLoad = tree.dirs[top];

  const handleNewFile = async () => {
    setInlineEditPath(top);
    setInlineEditValue('');
    setMenuRow(null);
  };

  const handleNewFolder = async () => {
    setInlineEditPath(`mkdir:${top}`);
    setInlineEditValue('');
    setMenuRow(null);
  };

  const handleRename = (rowPath: string) => {
    const name = rowPath.split('/').pop() || '';
    setInlineEditPath(`rename:${rowPath}`);
    setInlineEditValue(name);
    setMenuRow(null);
  };

  const handleDelete = async (rowPath: string) => {
    try {
      const response = await sidecarFetch<FsDeleteResponse>('/fs/delete', { path: rowPath });
      setTrashStack([...trashStack, { path: rowPath, trash: response.trash }]);
      load(parentDir(rowPath));
      const undoButton = (
        <Button
          size="xs"
          variant="outline"
          onClick={() => handleUndo(rowPath, response.trash)}
          data-testid="files-undo-button"
        >
          {intl.formatMessage(i18n.undo)}
        </Button>
      );
      toast.success(
        <div className="flex items-center gap-2">
          <span>{intl.formatMessage(i18n.deleted)}</span>
          {undoButton}
        </div>,
        { position: 'top-right', autoClose: 5000 }
      );
      setMenuRow(null);
    } catch (error) {
      toastError({
        title: intl.formatMessage(i18n.delete),
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleUndo = async (originalPath: string, trashPath: string) => {
    try {
      await sidecarFetch('/fs/rename', { path: trashPath, to: originalPath });
      setTrashStack(trashStack.filter((item) => item.path !== originalPath));
      load(parentDir(originalPath));
    } catch (error) {
      toastError({
        title: 'Undo failed',
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const handleCopyPath = async (rowPath: string) => {
    try {
      await navigator.clipboard.writeText(rowPath);
      toast.success('Copied', { autoClose: 2000 });
    } catch {
      toastError({ title: 'Copy failed', msg: 'Could not copy path' });
    }
    setMenuRow(null);
  };

  const handleAddToChat = async (rowPath: string) => {
    try {
      if (rowPath === top || rows.find((r) => r.path === rowPath)?.type === 'dir') {
        toastError({ title: 'Cannot add', msg: 'Can only add files to chat' });
        return;
      }
      const response = await sidecarFetch<{ path: string; content: string }>('/fs/read', {
        path: rowPath,
      });
      insertIntoChat({ kind: 'text', text: response.content, source: { path: rowPath } });
    } catch (error) {
      toastError({
        title: 'Add to chat failed',
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    setMenuRow(null);
  };

  const handleInlineEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineEditPath || !inlineEditValue.trim()) {
      setInlineEditPath(null);
      return;
    }

    try {
      if (inlineEditPath.startsWith('mkdir:')) {
        const dir = inlineEditPath.slice(6);
        const newPath = dir.endsWith('/') ? dir + inlineEditValue : dir + '/' + inlineEditValue;
        await sidecarFetch('/fs/mkdir', { path: newPath });
        load(dir);
      } else if (inlineEditPath.startsWith('rename:')) {
        const oldPath = inlineEditPath.slice(7);
        const oldName = oldPath.split('/').pop() || '';
        const newPath = oldPath.slice(0, -oldName.length) + inlineEditValue;
        await sidecarFetch('/fs/rename', { path: oldPath, to: newPath });
        if (cwd && parentDir(oldPath) === cwd) {
          openFile(newPath);
        }
        load(parentDir(oldPath));
      } else {
        const newPath = inlineEditPath.endsWith('/') ? inlineEditPath + inlineEditValue : inlineEditPath + '/' + inlineEditValue;
        await sidecarFetch('/fs/write', { path: newPath, content: '' });
        openFile(newPath);
        load(inlineEditPath);
      }
      setInlineEditPath(null);
      setInlineEditValue('');
    } catch (error) {
      toastError({
        title: 'Operation failed',
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  const onRow = (row: TreeRow) => {
    if (row.type === 'dir') {
      store.apply((state) =>
        mode === 'phone' ? enterDir(state, row.path) : toggleDir(state, row.path)
      );
    } else if (row.type !== 'other') {
      openFile(row.path);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && filter) {
      e.preventDefault();
      setFilter('');
      filterInputRef.current?.focus();
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const currentIndex = rows.findIndex((r) => r.path === focusedRowRef.current);
      const newIndex = e.key === 'ArrowDown' ? currentIndex + 1 : currentIndex - 1;
      if (newIndex >= 0 && newIndex < rows.length) {
        focusedRowRef.current = rows[newIndex].path;
        const rowEl = document.querySelector(`[data-testid="files-row"][data-path="${rows[newIndex].path}"]`) as HTMLElement;
        rowEl?.focus();
      }
    } else if (e.key === 'Enter') {
      const focused = rows.find((r) => r.path === focusedRowRef.current);
      if (focused) {
        onRow(focused);
      }
    } else if (e.shiftKey && e.key === 'F10') {
      e.preventDefault();
      const focused = rows.find((r) => r.path === focusedRowRef.current);
      if (focused) {
        setMenuRow(focused.path);
      }
    }
  };

  return (
    <div
      className="flex flex-col min-h-0 h-full text-sm"
      data-testid="files-pane"
      data-state={state}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border-primary">
        {mode === 'phone' && tree.current !== tree.root && (
          <Button variant="ghost" size="xs" onClick={() => store.apply(leaveDir)}>
            ‹
          </Button>
        )}
        <input
          ref={filterInputRef}
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              setFilter('');
            }
            e.stopPropagation();
          }}
          className="flex-1 min-w-0 px-2 py-0.5 text-xs bg-background-secondary text-text-primary rounded border border-border-primary outline-none focus:border-ring-primary"
          data-testid="files-filter"
        />
      </div>
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border-primary text-xs text-text-secondary">
        <span className="truncate">{tree.root}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto py-1" role="tree">
        {state === 'loading' && (
          <p className="px-3 py-1 text-text-secondary" aria-live="polite">
            Loading…
          </p>
        )}
        {state === 'empty' && (
          <p className="px-3 py-1 text-text-secondary">Nothing here</p>
        )}
        {topLoad?.status === 'error' && (
          <div className="px-3 py-1 flex flex-col gap-1" role="alert">
            <span className="text-text-danger break-all">{topLoad.message}</span>
            <Button variant="outline" size="xs" className="self-start" onClick={() => load(top)}>
              Retry
            </Button>
          </div>
        )}
        {rows.map((row) => (
          <FileRowWithMenu
            key={row.path}
            row={row}
            written={isWritten(written, row)}
            onClick={() => onRow(row)}
            onRename={() => handleRename(row.path)}
            onDelete={() => handleDelete(row.path)}
            onCopyPath={() => handleCopyPath(row.path)}
            onAddToChat={() => handleAddToChat(row.path)}
            menuOpen={menuRow === row.path}
            onMenuOpenChange={(open) => setMenuRow(open ? row.path : null)}
            gitTint={gitTint(gitStatus, tree.root, row.path)}
            intl={intl}
            i18n={i18n}
            focusedRowRef={focusedRowRef}
            revealInFinder={() => {
              void window.electron.openDirectoryInExplorer(parentDir(row.path));
              setMenuRow(null);
            }}
          />
        ))}
        {inlineEditPath && (
          <form onSubmit={handleInlineEditSubmit} className="px-2 py-0.5">
            <input
              autoFocus
              type="text"
              value={inlineEditValue}
              onChange={(e) => setInlineEditValue(e.target.value)}
              onBlur={() => setInlineEditPath(null)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setInlineEditPath(null);
                }
              }}
              className="w-full px-2 py-0.5 text-xs bg-background-secondary text-text-primary rounded border border-ring-primary outline-none"
              data-testid="files-name-input"
            />
          </form>
        )}
      </div>
      <div className="flex items-center gap-1 px-2 py-1 border-t border-border-primary text-xs">
        <Button
          variant="ghost"
          size="xs"
          onClick={handleNewFile}
          data-testid="files-new-file"
          title="New file"
        >
          <Plus className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={handleNewFolder}
          data-testid="files-new-folder"
          title="New folder"
        >
          <FolderPlus className="size-3" />
        </Button>
      </div>
    </div>
  );
}

interface FileRowWithMenuProps {
  row: TreeRow;
  written: boolean;
  onClick: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCopyPath: () => void;
  onAddToChat: () => void;
  revealInFinder: () => void;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  gitTint?: 'M' | 'A' | '?' | 'D';
  intl: ReturnType<typeof useIntl>;
  i18n: typeof i18n;
  focusedRowRef: React.MutableRefObject<string | null>;
}

function FileRowWithMenu({
  row,
  written,
  onClick,
  onRename,
  onDelete,
  onCopyPath,
  onAddToChat,
  revealInFinder,
  menuOpen,
  onMenuOpenChange,
  gitTint: tint,
  intl,
  i18n,
  focusedRowRef,
}: FileRowWithMenuProps) {
  const isDir = row.type === 'dir';
  const unreadable = row.load?.status === 'error' ? row.load.message : null;
  const Chevron = row.expanded ? ChevronDown : ChevronRight;
  const gitStatusText = tint === 'M' ? 'Modified' : tint === 'A' ? 'Added' : tint === '?' ? 'Untracked' : tint === 'D' ? 'Deleted' : '';

  const gitColorClass =
    tint === 'M'
      ? 'text-text-warning'
      : tint === 'A' || tint === '?'
        ? 'text-text-success'
        : tint === 'D'
          ? 'text-text-danger'
          : '';

  return (
    <DropdownMenu open={menuOpen} onOpenChange={onMenuOpenChange}>
      <button
        type="button"
        role="treeitem"
        aria-expanded={isDir ? row.expanded : undefined}
        className={cn(
          'flex w-full items-center gap-1 px-2 py-0.5 text-left text-text-primary hover:bg-background-secondary focus:bg-background-secondary focus:outline-none',
          row.type === 'other' && 'text-text-secondary cursor-default'
        )}
        style={{ paddingLeft: `${8 + row.depth * 12}px` }}
        title={unreadable ? `Unreadable: ${unreadable}` : gitStatusText || undefined}
        data-testid="files-row"
        data-path={row.path}
        data-type={row.type}
        data-written={written || undefined}
        data-git={tint || undefined}
        onClick={() => {
          onClick();
          focusedRowRef.current = row.path;
        }}
        onFocus={() => {
          focusedRowRef.current = row.path;
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          focusedRowRef.current = row.path;
          onMenuOpenChange(true);
        }}
      >
        {isDir ? <Chevron className="size-3 shrink-0" /> : <span className="size-3 shrink-0" />}
        {isDir ? <Folder className="size-3.5 shrink-0" /> : <File className="size-3.5 shrink-0" />}
        <span className="truncate">{row.name}</span>
        {tint && <span className={cn('size-1 rounded-full shrink-0', gitColorClass)} aria-label={gitStatusText} />}
        {unreadable && <Lock className="size-3 shrink-0 text-text-secondary" aria-hidden />}
        {written && (
          <span className="ml-auto size-1.5 shrink-0 rounded-full bg-text-info">
            <span className="sr-only">Written this session</span>
          </span>
        )}
      </button>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" data-testid="files-menu">
        <DropdownMenuItem onClick={onRename} data-testid="files-menu-rename">
          <Edit2 className="size-3 mr-2" />
          {intl.formatMessage(i18n.rename)}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} data-testid="files-menu-delete">
          <Trash2 className="size-3 mr-2" />
          {intl.formatMessage(i18n.delete)}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={revealInFinder} data-testid="files-menu-reveal">
          {intl.formatMessage(i18n.revealInFinder)}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCopyPath} data-testid="files-menu-copy-path">
          <Copy className="size-3 mr-2" />
          {intl.formatMessage(i18n.copyPath)}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onAddToChat} data-testid="files-menu-add-to-chat">
          {intl.formatMessage(i18n.addToChat)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
