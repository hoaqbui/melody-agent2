import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createDiffStore, DIFF_PANE_STATES } from './diff-store';

describe('diff-store', () => {
  it('keeps the base, view and selection across subscribers', () => {
    const store = createDiffStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.select('a.txt');
    store.setView('split');
    expect(store.getState()).toEqual({ base: 'head', view: 'split', path: 'a.txt' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('drops the selection when the base changes, since the file list changes with it', () => {
    const store = createDiffStore({ base: 'head', view: 'unified', path: 'a.txt' });
    store.setBase('session');
    expect(store.getState().path).toBeNull();
  });

  it('does not notify when nothing changes', () => {
    const store = createDiffStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setView('unified');
    store.select(null);
    expect(listener).not.toHaveBeenCalled();
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
