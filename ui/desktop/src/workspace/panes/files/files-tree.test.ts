import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Message } from '../../../types/message';
import {
  createFilesTreeStore,
  dirsToLoad,
  dirsToReload,
  enterDir,
  initialTree,
  isWritten,
  leaveDir,
  listing,
  markLoading,
  paneState,
  parentDir,
  setEntries,
  setError,
  toggleDir,
  visibleRows,
  writtenPaths,
  type FilesPaneState,
  type TreeState,
} from './files-tree';

const ROOT = '/repo';

function loaded(state: TreeState, dir: string, names: string[], dirs: string[] = []): TreeState {
  return setEntries(
    state,
    dir,
    names.map((name) => ({ name, type: dirs.includes(name) ? 'dir' : 'file' }))
  );
}

const toolMessage = (name: string, args: Record<string, unknown>): Message => ({
  role: 'assistant',
  created: 0,
  content: [
    {
      type: 'toolRequest',
      id: name,
      toolCall: { status: 'success', value: { name, arguments: args } },
    },
  ],
  metadata: { agentVisible: true, userVisible: true },
});

describe('paths', () => {
  it('walks up to the filesystem root', () => {
    expect(parentDir('/repo/src/a.ts')).toBe('/repo/src');
    expect(parentDir('/a')).toBe('/');
    expect(parentDir('/')).toBe('/');
  });
});

describe('desktop tree', () => {
  it('asks for the root first, then each expanded directory once', () => {
    let state = initialTree(ROOT);
    expect(dirsToLoad(state, 'desktop')).toEqual([ROOT]);
    state = loaded(markLoading(state, ROOT), ROOT, ['src', 'b.txt', 'a.txt'], ['src']);
    expect(dirsToLoad(state, 'desktop')).toEqual([]);
    state = toggleDir(state, '/repo/src');
    expect(dirsToLoad(state, 'desktop')).toEqual(['/repo/src']);
  });

  it('lists directories first and nests the rows of an expanded one', () => {
    let state = loaded(initialTree(ROOT), ROOT, ['b.txt', 'src', 'a.txt'], ['src']);
    state = toggleDir(state, '/repo/src');
    state = loaded(state, '/repo/src', ['index.ts']);
    expect(visibleRows(state).map((row) => [row.path, row.depth])).toEqual([
      ['/repo/src', 0],
      ['/repo/src/index.ts', 1],
      ['/repo/a.txt', 0],
      ['/repo/b.txt', 0],
    ]);
    expect(visibleRows(toggleDir(state, '/repo/src')).map((row) => row.path)).toEqual([
      '/repo/src',
      '/repo/a.txt',
      '/repo/b.txt',
    ]);
  });

  it('reloads only the loaded directory a watch event lands in', () => {
    const state = loaded(initialTree(ROOT), ROOT, ['a.txt']);
    expect(dirsToReload(state, { type: 'add', path: '/repo/new.txt' })).toEqual([ROOT]);
    expect(dirsToReload(state, { type: 'add', path: '/repo/src/new.txt' })).toEqual([]);
    expect(dirsToReload(state, { type: 'change', path: '/repo/a.txt' })).toEqual([]);
    expect(dirsToReload(state, { type: 'watching', path: ROOT })).toEqual([]);
  });
});

describe('phone drill-down', () => {
  it('lists one directory and steps back up to the root, never above it', () => {
    let state = loaded(initialTree(ROOT), ROOT, ['src'], ['src']);
    state = enterDir(state, '/repo/src');
    expect(dirsToLoad(state, 'phone')).toEqual(['/repo/src']);
    state = loaded(state, '/repo/src', ['index.ts']);
    expect(listing(state).map((row) => row.path)).toEqual(['/repo/src/index.ts']);
    state = leaveDir(state);
    expect(state.current).toBe(ROOT);
    expect(leaveDir(state).current).toBe(ROOT);
    expect(enterDir(state, '/elsewhere').current).toBe(ROOT);
  });
});

describe('pane state', () => {
  const states = ['empty', 'loading', 'partial', 'error'] satisfies FilesPaneState[];

  it('declares only states from DESIGN.md §Shared component states', () => {
    const design = readFileSync(resolve(__dirname, '../../../../../../DESIGN.md'), 'utf8');
    const table = design.split('## Shared component states')[1].split('\n## ')[0];
    const named = [...table.matchAll(/^\| (\w+) \|/gm)].map((match) => match[1].toLowerCase());
    expect(named).toContain('empty');
    for (const state of states) expect(named).toContain(state);
  });

  it('follows the PRD lines for Files', () => {
    let state = initialTree(ROOT);
    expect(paneState(state, 'desktop')).toBe('loading');
    expect(paneState(setError(state, ROOT, 'EACCES'), 'desktop')).toBe('error');
    expect(paneState(loaded(state, ROOT, []), 'desktop')).toBe('empty');
    state = toggleDir(loaded(state, ROOT, ['locked'], ['locked']), '/repo/locked');
    expect(paneState(state, 'desktop')).toBeNull();
    expect(paneState(setError(state, '/repo/locked', 'EACCES'), 'desktop')).toBe('partial');
    expect(
      paneState(enterDir(setError(state, '/repo/locked', 'EACCES'), '/repo/locked'), 'phone')
    ).toBe('partial');
  });
});

describe('written this session', () => {
  it('derives absolute paths from the editing tool calls the chat holds', () => {
    const messages = [
      toolMessage('developer__text_editor', { command: 'write', path: 'src/a.ts' }),
      toolMessage('developer__text_editor', { command: 'view', path: 'README.md' }),
      toolMessage('Write', { file_path: '/repo/b.ts', content: '' }),
      toolMessage('Edit', { file_path: '/elsewhere/c.ts' }),
      toolMessage('developer__shell', { command: 'echo hi > d.ts' }),
    ];
    expect([...writtenPaths(messages, ROOT)]).toEqual([
      '/repo/src/a.ts',
      '/repo/b.ts',
      '/elsewhere/c.ts',
    ]);
  });

  it('dots the file and every directory above it', () => {
    const written = new Set(['/repo/src/a.ts']);
    const row = (path: string, type: 'file' | 'dir') => ({
      path,
      name: path,
      type,
      depth: 0,
      expanded: false,
      load: null,
    });
    expect(isWritten(written, row('/repo/src/a.ts', 'file'))).toBe(true);
    expect(isWritten(written, row('/repo/src', 'dir'))).toBe(true);
    expect(isWritten(written, row('/repo/srcs', 'dir'))).toBe(false);
    expect(isWritten(written, row('/repo/src/b.ts', 'file'))).toBe(false);
  });
});

describe('store', () => {
  it('notifies on change and keeps the state between subscribers', () => {
    const store = createFilesTreeStore(ROOT);
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.apply((state) => toggleDir(state, '/repo/src'));
    store.apply((state) => state);
    unsubscribe();
    expect(calls).toBe(1);
    expect(store.getState().expanded.has('/repo/src')).toBe(true);
  });
});
