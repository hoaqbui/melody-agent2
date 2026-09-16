import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { GitStatusEntry } from '../../../native/sidecar';
import type { Message } from '../../../types/message';
import {
  actionablePath,
  commitBlocker,
  createGitDraftStore,
  GIT_PANE_STATES,
  hasToolCallInProgress,
  paneState,
  splitStatus,
} from './git-state';

const request = (id: string): Message => ({
  role: 'assistant',
  created: 0,
  content: [{ type: 'toolRequest', id, toolCall: { status: 'success', value: { name: 'shell' } } }],
  metadata: { agentVisible: true, userVisible: true },
});

const response = (id: string): Message => ({
  role: 'user',
  created: 0,
  content: [{ type: 'toolResponse', id, toolResult: { status: 'success', value: {} } }],
  metadata: { agentVisible: true, userVisible: true },
});

const entry = (index: string, worktree: string, path: string): GitStatusEntry => ({
  index,
  worktree,
  path,
});

const noLists = { staged: [], unstaged: [], conflicted: [] };

describe('hasToolCallInProgress', () => {
  it('is false with no tool calls', () => {
    expect(hasToolCallInProgress([])).toBe(false);
  });

  it('is true while a request has no response, even after later messages', () => {
    expect(hasToolCallInProgress([request('a'), response('a'), request('b')])).toBe(true);
  });

  it('is false once every request has its response', () => {
    expect(hasToolCallInProgress([request('a'), request('b'), response('b'), response('a')])).toBe(
      false
    );
  });
});

describe('splitStatus', () => {
  it('sorts porcelain codes into staged, unstaged and conflicted', () => {
    const lists = splitStatus([
      entry('M', ' ', 'staged.ts'),
      entry(' ', 'M', 'unstaged.ts'),
      entry('M', 'M', 'both.ts'),
      entry('?', '?', 'new.ts'),
      entry('U', 'U', 'clash.ts'),
      entry('A', ' ', 'added.ts'),
    ]);
    expect(lists.staged.map((e) => e.path)).toEqual(['staged.ts', 'both.ts', 'added.ts']);
    expect(lists.unstaged.map((e) => e.path)).toEqual(['unstaged.ts', 'both.ts', 'new.ts']);
    expect(lists.conflicted.map((e) => e.path)).toEqual(['clash.ts']);
  });

  it('acts on the new side of a rename', () => {
    expect(actionablePath(entry('R', ' ', 'old.ts -> new.ts'))).toBe('new.ts');
    expect(actionablePath(entry('M', ' ', 'plain.ts'))).toBe('plain.ts');
  });
});

describe('commitBlocker', () => {
  const staged = { ...noLists, staged: [entry('M', ' ', 'a.ts')] };

  it('disables Commit while a tool call is in progress, before anything else', () => {
    expect(commitBlocker({ running: true, lists: staged, message: 'fix' })).toBe('running');
  });

  it('disables Commit on conflicts, with nothing staged, and with no message', () => {
    const conflicted = { ...staged, conflicted: [entry('U', 'U', 'c.ts')] };
    expect(commitBlocker({ running: false, lists: conflicted, message: 'fix' })).toBe('conflicts');
    expect(commitBlocker({ running: false, lists: noLists, message: 'fix' })).toBe('nothingStaged');
    expect(commitBlocker({ running: false, lists: staged, message: '  ' })).toBe('noMessage');
  });

  it('allows Commit with a staged file and a message once the tool call finished', () => {
    expect(commitBlocker({ running: false, lists: staged, message: 'fix' })).toBeNull();
  });
});

describe('paneState', () => {
  it('reads a non-repository as empty and any other status failure as error', () => {
    const base = { loaded: false, running: false, lists: noLists };
    expect(paneState({ ...base, error: 'fatal: not a git repository (or any parent)' })).toBe(
      'empty'
    );
    expect(paneState({ ...base, error: 'fatal: bad object' })).toBe('error');
  });

  it('is loading until the first status, running during a tool call, partial on conflicts', () => {
    expect(paneState({ error: null, loaded: false, running: false, lists: noLists })).toBe(
      'loading'
    );
    expect(paneState({ error: null, loaded: true, running: true, lists: noLists })).toBe('running');
    const conflicted = { ...noLists, conflicted: [entry('U', 'U', 'c.ts')] };
    expect(paneState({ error: null, loaded: true, running: false, lists: conflicted })).toBe(
      'partial'
    );
    expect(paneState({ error: null, loaded: true, running: false, lists: noLists })).toBe('ready');
  });

  it('names the rows of DESIGN.md §Shared component states, plus ready', () => {
    const design = readFileSync(resolve(process.cwd(), '../../DESIGN.md'), 'utf8');
    const section = design.split('## Shared component states')[1].split('\n## ')[0];
    const rows = [...section.matchAll(/^\| ([A-Z][a-z]+) \|/gm)]
      .map((match) => match[1].toLowerCase())
      .filter((row) => row !== 'state');
    expect(rows.length).toBeGreaterThan(0);
    expect([...GIT_PANE_STATES].filter((state) => state !== 'ready').sort()).toEqual(rows.sort());
  });
});

describe('draft store', () => {
  it('keeps the message and notifies only on change', () => {
    const store = createGitDraftStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.set('fix');
    store.set('fix');
    expect(store.getState()).toBe('fix');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
