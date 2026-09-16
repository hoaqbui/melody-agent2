import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createMarkdownStore,
  loaded,
  loadFailed,
  loadStarted,
  MARKDOWN_PANE_STATES,
  newDoc,
  paneState,
} from './markdown-state';

const PATH = '/repo/README.md';

describe('markdown doc', () => {
  it('follows disk and skips a read that changed nothing', () => {
    const first = loaded(newDoc(PATH), '# one\n');
    expect(first.load).toEqual({ status: 'loaded', text: '# one\n' });
    expect(loaded(first, '# one\n')).toBe(first);
    expect(loaded(first, '# two\n').load).toEqual({ status: 'loaded', text: '# two\n' });
  });

  it('goes back to loading on retry only from a settled read', () => {
    const fresh = newDoc(PATH);
    expect(loadStarted(fresh)).toBe(fresh);
    expect(loadStarted(loadFailed(fresh, 'ENOENT')).load).toEqual({ status: 'loading' });
  });
});

describe('pane state', () => {
  it('declares only states from DESIGN.md §Shared component states, plus ready', () => {
    const design = readFileSync(resolve(__dirname, '../../../../../../DESIGN.md'), 'utf8');
    const table = design.split('## Shared component states')[1].split('\n## ')[0];
    const named = [...table.matchAll(/^\| (\w+) \|/gm)].map((match) => match[1].toLowerCase());
    expect(named).toContain('empty');
    for (const state of MARKDOWN_PANE_STATES) {
      if (state !== 'ready') expect(named).toContain(state);
    }
  });

  it('follows the PRD lines for Markdown', () => {
    expect(paneState(null)).toBe('empty');
    const doc = newDoc(PATH);
    expect(paneState(doc)).toBe('loading');
    expect(paneState(loadFailed(doc, 'ENOENT'))).toBe('error');
    expect(paneState(loaded(doc, '# hi\n'))).toBe('ready');
    expect(paneState(loaded(newDoc('/repo/main.rs'), 'fn main() {}\n'))).toBe('partial');
  });
});

describe('markdown store', () => {
  it('creates a doc on first open and keeps it across opens', () => {
    const store = createMarkdownStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const first = store.open(PATH);
    expect(first.load.status).toBe('loading');
    expect(store.open(PATH)).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('applies updates by path and skips no-ops', () => {
    const store = createMarkdownStore();
    store.open(PATH);
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply(PATH, (doc) => loaded(doc, 'one\n'));
    store.apply(PATH, (doc) => loaded(doc, 'one\n'));
    store.apply('/elsewhere', (doc) => loaded(doc, 'x'));
    expect(store.getState()[PATH].load).toEqual({ status: 'loaded', text: 'one\n' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
