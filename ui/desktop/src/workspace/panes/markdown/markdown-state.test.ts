import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createMarkdownStore,
  headings,
  loaded,
  loadFailed,
  loadStarted,
  MARKDOWN_PANE_STATES,
  newDoc,
  paneState,
  slug,
  selectedInside,
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

describe('slug', () => {
  it('lowercases, spaces to hyphens, drops punctuation', () => {
    expect(slug('Hello World')).toBe('hello-world');
    expect(slug('Step 1: Setup!')).toBe('step-1-setup');
    expect(slug('  trim me  ')).toBe('trim-me');
    expect(slug('a---b')).toBe('a-b');
  });

  it('is stable across calls', () => {
    expect(slug('Contents & Edit')).toBe(slug('Contents & Edit'));
  });
});

describe('headings', () => {
  it('finds ATX headings # through ######, in source order with 1-based lines', () => {
    const text = '# One\ntext\n## Two\n###### Six\n';
    expect(headings(text)).toEqual([
      { level: 1, text: 'One', id: 'one', line: 1 },
      { level: 2, text: 'Two', id: 'two', line: 3 },
      { level: 6, text: 'Six', id: 'six', line: 4 },
    ]);
  });

  it('ignores more than six leading #, a heading with no text, and non-ATX lines', () => {
    const text = '####### Seven\n#\ncode #1\n';
    expect(headings(text)).toEqual([]);
  });

  it('strips an ATX closing sequence of trailing #', () => {
    expect(headings('# Title #####\n')).toEqual([
      { level: 1, text: 'Title', id: 'title', line: 1 },
    ]);
  });

  it('ignores a heading-shaped line inside a fenced code block', () => {
    const text = '# Real\n```\n# Not a heading\n```\n~~~\n## Also not\n~~~\n## Also Real\n';
    expect(headings(text)).toEqual([
      { level: 1, text: 'Real', id: 'real', line: 1 },
      { level: 2, text: 'Also Real', id: 'also-real', line: 8 },
    ]);
  });

  it('gives repeated heading text stable, unique ids', () => {
    const text = '# Notes\n## Notes\n### Notes\n';
    const found = headings(text);
    expect(found.map((heading) => heading.id)).toEqual(['notes', 'notes-1', 'notes-2']);
    expect(headings(text)).toEqual(found);
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

describe('selectedInside', () => {
  const view = document.createElement('div');
  const paragraph = document.createElement('p');
  paragraph.textContent = 'a sentence to quote';
  view.appendChild(paragraph);
  const outside = document.createElement('p');
  outside.textContent = 'elsewhere';
  document.body.append(view, outside);

  const select = (start: [Node, number], end: [Node, number]) => {
    const range = document.createRange();
    range.setStart(...start);
    range.setEnd(...end);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection;
  };
  const words = paragraph.firstChild!;

  it('returns the text of a range inside the view', () => {
    expect(selectedInside(select([words, 2], [words, 10]), view)).toBe('sentence');
  });

  it('clamps a range that runs past the view to the view', () => {
    expect(selectedInside(select([words, 0], [outside.firstChild!, 4]), view)).toBe(
      'a sentence to quote'
    );
  });

  it('is null for a caret, a range elsewhere, or no view', () => {
    expect(selectedInside(select([words, 3], [words, 3]), view)).toBeNull();
    expect(
      selectedInside(select([outside.firstChild!, 0], [outside.firstChild!, 4]), view)
    ).toBeNull();
    expect(selectedInside(select([words, 0], [words, 4]), null)).toBeNull();
    expect(selectedInside(null, view)).toBeNull();
  });
});
