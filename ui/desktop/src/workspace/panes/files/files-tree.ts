// Tree state for the Files pane (PRD step 4). Pure state, no React: the pane loads
// directories through src/native and renders the rows this file derives. The state lives
// outside the component so a promote or close keeps the expansion (DESIGN.md Nothing Lost Rule).

import type { FsEntry, FsEntryType, FsWatchEvent } from '../../../native/sidecar';
import { getToolRequests, type Message } from '../../../types/message';

// The subset of DESIGN.md §Shared component states the pane reports; null is the
// resolved tree with nothing to say.
export type FilesPaneState = 'empty' | 'loading' | 'partial' | 'error';

export type DirLoad =
  | { status: 'loading' }
  | { status: 'loaded'; entries: readonly FsEntry[] }
  | { status: 'error'; message: string };

export interface TreeState {
  root: string;
  dirs: Readonly<Record<string, DirLoad>>;
  // Desktop: the directories shown open.
  expanded: ReadonlySet<string>;
  // Phone: the one directory listed; the list drills down instead of nesting.
  current: string;
}

export interface TreeRow {
  path: string;
  name: string;
  type: FsEntryType;
  depth: number;
  expanded: boolean;
  load: DirLoad | null;
}

export function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

export function parentDir(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut);
}

export function isInside(root: string, path: string): boolean {
  return path === root || path.startsWith(root.endsWith('/') ? root : `${root}/`);
}

export function initialTree(root: string): TreeState {
  return { root, dirs: {}, expanded: new Set(), current: root };
}

function withDir(state: TreeState, dir: string, load: DirLoad): TreeState {
  return { ...state, dirs: { ...state.dirs, [dir]: load } };
}

export function markLoading(state: TreeState, dir: string): TreeState {
  return withDir(state, dir, { status: 'loading' });
}

export function setEntries(state: TreeState, dir: string, entries: readonly FsEntry[]): TreeState {
  const sorted = [...entries].sort((a, b) => {
    if ((a.type === 'dir') !== (b.type === 'dir')) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return withDir(state, dir, { status: 'loaded', entries: sorted });
}

export function setError(state: TreeState, dir: string, message: string): TreeState {
  return withDir(state, dir, { status: 'error', message });
}

export function toggleDir(state: TreeState, dir: string): TreeState {
  const expanded = new Set(state.expanded);
  if (expanded.has(dir)) expanded.delete(dir);
  else expanded.add(dir);
  return { ...state, expanded };
}

export function enterDir(state: TreeState, dir: string): TreeState {
  return isInside(state.root, dir) ? { ...state, current: dir } : state;
}

export function leaveDir(state: TreeState): TreeState {
  return state.current === state.root ? state : { ...state, current: parentDir(state.current) };
}

// Directories whose entries the pane needs but has not asked for yet.
export function dirsToLoad(state: TreeState, mode: 'desktop' | 'phone'): string[] {
  const wanted = mode === 'phone' ? [state.current] : [state.root, ...state.expanded];
  return wanted.filter((dir) => !(dir in state.dirs));
}

// A watch event names a path; the directory holding it is stale if it was loaded.
export function dirsToReload(state: TreeState, event: FsWatchEvent): string[] {
  if (event.type === 'watching' || event.type === 'change') return [];
  const dir = parentDir(event.path);
  return dir in state.dirs ? [dir] : [];
}

function rowsOf(state: TreeState, dir: string, depth: number): TreeRow[] {
  const load = state.dirs[dir];
  if (!load || load.status !== 'loaded') return [];
  return load.entries.flatMap((entry) => {
    const path = joinPath(dir, entry.name);
    const expanded = entry.type === 'dir' && state.expanded.has(path);
    const row: TreeRow = {
      path,
      name: entry.name,
      type: entry.type,
      depth,
      expanded,
      load: entry.type === 'dir' ? (state.dirs[path] ?? null) : null,
    };
    return expanded ? [row, ...rowsOf(state, path, depth + 1)] : [row];
  });
}

export function visibleRows(state: TreeState): TreeRow[] {
  return rowsOf(state, state.root, 0);
}

export function listing(state: TreeState): TreeRow[] {
  const load = state.dirs[state.current];
  if (!load || load.status !== 'loaded') return [];
  return load.entries.map((entry) => ({
    path: joinPath(state.current, entry.name),
    name: entry.name,
    type: entry.type,
    depth: 0,
    expanded: false,
    load: null,
  }));
}

export function paneState(state: TreeState, mode: 'desktop' | 'phone'): FilesPaneState | null {
  const top = mode === 'phone' ? state.current : state.root;
  const load = state.dirs[top];
  if (!load || load.status === 'loading') return 'loading';
  if (load.status === 'error') return top === state.root ? 'error' : 'partial';
  if (top === state.root && load.entries.length === 0) return 'empty';
  const unreadableSubtree = [...state.expanded].some(
    (dir) => dir !== top && state.dirs[dir]?.status === 'error'
  );
  return unreadableSubtree ? 'partial' : null;
}

// Tool calls that write a file, by argument shape: goose's own editor by command, and the
// file tools an ACP runtime forwards by the argument only a write carries (the renderer gets
// the call's title, not its name, and neither kind nor locations).
const FORWARDED_WRITE_SHAPES: ReadonlyArray<[path: string, marker: string]> = [
  ['file_path', 'content'],
  ['file_path', 'old_string'],
  ['file_path', 'edits'],
  ['notebook_path', 'new_source'],
];

function writtenPathOf(name: string, args: Record<string, unknown>): string | null {
  const key = name.endsWith('text_editor')
    ? args.command !== 'view'
      ? 'path'
      : undefined
    : FORWARDED_WRITE_SHAPES.find(([, marker]) => marker in args)?.[0];
  const value = key ? args[key] : undefined;
  return typeof value === 'string' && value !== '' ? value : null;
}

// Directories the pane has entries for; a remounted pane refetches them in case the agent
// wrote while its watch was down.
export function loadedDirs(state: TreeState): string[] {
  return Object.entries(state.dirs)
    .filter(([, load]) => load.status === 'loaded')
    .map(([dir]) => dir);
}

function absolute(cwd: string, path: string): string {
  return path.startsWith('/') ? path : joinPath(cwd, path);
}

// Files the session wrote since it started, absolute, from the tool-call rows the chat holds.
export function writtenPaths(messages: readonly Message[], cwd: string): Set<string> {
  const paths = new Set<string>();
  for (const message of messages) {
    for (const request of getToolRequests(message)) {
      const value = request.toolCall.value;
      if (typeof value !== 'object' || value === null) continue;
      const { name, arguments: args } = value as { name?: unknown; arguments?: unknown };
      if (typeof name !== 'string' || typeof args !== 'object' || args === null) continue;
      const path = writtenPathOf(name, args as Record<string, unknown>);
      if (path) paths.add(absolute(cwd, path));
    }
  }
  return paths;
}

// A directory carries the dot when anything under it was written, so a collapsed tree
// still shows what the agent touched.
export function isWritten(written: ReadonlySet<string>, row: TreeRow): boolean {
  if (row.type !== 'dir') return written.has(row.path);
  for (const path of written) {
    if (isInside(row.path, path)) return true;
  }
  return false;
}

export function filterRows(rows: readonly TreeRow[], text: string): TreeRow[] {
  if (!text) return [...rows];
  const lower = text.toLowerCase();
  return rows.filter((row) => row.path.toLowerCase().includes(lower));
}

export function gitTint(
  status: { entries: readonly { path: string; index: string; worktree: string }[] } | null,
  toplevel: string | null,
  rowPath: string
): 'M' | 'A' | '?' | 'D' | undefined {
  if (!status || !toplevel || rowPath === toplevel) return undefined;
  const relative = rowPath.startsWith(toplevel + '/') ? rowPath.slice(toplevel.length + 1) : rowPath;
  for (const entry of status.entries) {
    if (entry.path === relative) {
      if (entry.index === 'D' || entry.worktree === 'D') return 'D';
      if (entry.index === 'A' || entry.worktree === 'A') return 'A';
      if (entry.worktree === '?') return '?';
      if (entry.index === 'M' || entry.worktree === 'M') return 'M';
    }
  }
  return undefined;
}

export interface FilesTreeStore {
  getState(): TreeState;
  subscribe(listener: () => void): () => void;
  apply(update: (state: TreeState) => TreeState): void;
}

export function createFilesTreeStore(root: string): FilesTreeStore {
  let state = initialTree(root);
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    apply: (update) => {
      const next = update(state);
      if (next === state) return;
      state = next;
      listeners.forEach((listener) => listener());
    },
  };
}
