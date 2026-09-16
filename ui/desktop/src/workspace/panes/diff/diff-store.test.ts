import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createDiffStore,
  DIFF_PANE_STATES,
  INITIAL_SELECTION,
  presetDiffBase,
  statusFingerprint,
  undoRequest,
} from './diff-store';

describe('diff-store', () => {
  it('keeps the base, view and selection across subscribers', () => {
    const store = createDiffStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.select('a.txt');
    store.setView('split');
    expect(store.getState()).toEqual({ ...INITIAL_SELECTION, view: 'split', path: 'a.txt' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('drops the selection when the base or scope changes, since the file list changes with it', () => {
    const store = createDiffStore({ ...INITIAL_SELECTION, path: 'a.txt' });
    store.setBase('session');
    expect(store.getState().path).toBeNull();
    store.select('a.txt');
    store.setScope('staged');
    expect(store.getState().path).toBeNull();
  });

  it('keeps the last apply for Undo, which sends it back reversed', () => {
    const store = createDiffStore();
    const applied = { patch: '--- a/x\n', cached: true, cwd: '/repo' };
    store.setLastApply(applied);
    expect(store.getState().lastApply).toBe(applied);
    expect(undoRequest(applied)).toEqual({ ...applied, reverse: true });
    expect(undoRequest({ patch: '', reverse: true })).toEqual({ patch: '', reverse: false });
  });

  it('does not notify when nothing changes', () => {
    const store = createDiffStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setView('unified');
    store.select(null);
    expect(listener).not.toHaveBeenCalled();
  });

  it('presets the base on every live store, so a route can land on Changes since session start', () => {
    const store = createDiffStore({ ...INITIAL_SELECTION, path: 'a.txt' });
    presetDiffBase('session');
    expect(store.getState().base).toBe('session');
    expect(store.getState().path).toBeNull();
    presetDiffBase('head');
    expect(store.getState().base).toBe('head');
  });
});

describe('pane states', () => {
  it('are the rows of DESIGN.md §Shared component states, plus ready', () => {
    const design = readFileSync(resolve(process.cwd(), '../../DESIGN.md'), 'utf8');
    const section = design.split('## Shared component states')[1].split('\n## ')[0];
    const rows = [...section.matchAll(/^\| ([A-Z][a-z]+) \|/gm)]
      .map((match) => match[1].toLowerCase())
      .filter((row) => row !== 'state');
    expect(rows.length).toBeGreaterThan(0);
    expect([...DIFF_PANE_STATES].filter((state) => state !== 'ready').sort()).toEqual(rows.sort());
  });
});

// Task 69: the Changes dot compares two polls of the working tree by this string.
describe('statusFingerprint', () => {
  it('is empty for a clean tree and the same whatever the order', () => {
    expect(statusFingerprint([])).toBe('');
    const a = { path: 'a.txt', index: ' ', worktree: 'M' };
    const b = { path: 'b.txt', index: 'A', worktree: ' ' };
    expect(statusFingerprint([a, b])).toBe(statusFingerprint([b, a]));
    expect(statusFingerprint([a])).not.toBe(statusFingerprint([b]));
    expect(statusFingerprint([a])).not.toBe(statusFingerprint([{ ...a, worktree: 'D' }]));
  });
});
