import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createEditorStore,
  diskChanged,
  edited,
  EDITOR_PANE_STATES,
  isDirty,
  isMarkdown,
  keepMine,
  loaded,
  loadFailed,
  newDoc,
  paneState,
  reload,
  saveDone,
  saveFailed,
  saveStarted,
} from './editor-store';

const PATH = '/repo/notes.md';

describe('editor doc', () => {
  it('is clean after a load and dirty once edited', () => {
    const doc = loaded(newDoc(PATH), 'one\n');
    expect(isDirty(doc)).toBe(false);
    expect(isDirty(edited(doc, 'one\ntwo\n'))).toBe(true);
  });

  it('follows disk while clean and holds the change back while dirty', () => {
    const clean = loaded(newDoc(PATH), 'one\n');
    const followed = diskChanged(clean, 'two\n');
    expect(followed.text).toBe('two\n');
    expect(followed.incoming).toBeNull();
    expect(followed.revision).toBe(clean.revision + 1);

    const dirty = edited(clean, 'one\nmine\n');
    const held = diskChanged(dirty, 'two\n');
    expect(held.text).toBe('one\nmine\n');
    expect(held.incoming).toBe('two\n');
    expect(paneState(held)).toBe('partial');
  });

  it('ignores the echo of its own save', () => {
    const saved = saveDone(edited(loaded(newDoc(PATH), 'one\n'), 'two\n'), 'two\n');
    expect(isDirty(saved)).toBe(false);
    expect(diskChanged(saved, 'two\n')).toBe(saved);
  });

  it('reloads into the incoming content, or keeps the edits and lets the save win', () => {
    const held = diskChanged(edited(loaded(newDoc(PATH), 'one\n'), 'mine\n'), 'theirs\n');
    const reloaded = reload(held);
    expect(reloaded.text).toBe('theirs\n');
    expect(isDirty(reloaded)).toBe(false);
    expect(reloaded.editor).toBeNull();

    const kept = keepMine(held);
    expect(kept.text).toBe('mine\n');
    expect(kept.disk).toBe('theirs\n');
    expect(kept.incoming).toBeNull();
    expect(isDirty(kept)).toBe(true);
  });

  it('stays dirty when the user types during the save', () => {
    const saving = saveStarted(edited(loaded(newDoc(PATH), 'one\n'), 'two\n'));
    const typed = edited(saving, 'two\nthree\n');
    const done = saveDone(typed, 'two\n');
    expect(done.saving).toBe(false);
    expect(isDirty(done)).toBe(true);
  });

  it('knows markdown by extension', () => {
    expect(isMarkdown('/a/README.md')).toBe(true);
    expect(isMarkdown('/a/notes.MARKDOWN')).toBe(true);
    expect(isMarkdown('/a/main.rs')).toBe(false);
  });
});

describe('pane state', () => {
  it('declares only states from DESIGN.md §Shared component states, plus ready', () => {
    const design = readFileSync(resolve(__dirname, '../../../../../../DESIGN.md'), 'utf8');
    const table = design.split('## Shared component states')[1].split('\n## ')[0];
    const named = [...table.matchAll(/^\| (\w+) \|/gm)].map((match) => match[1].toLowerCase());
    expect(named).toContain('empty');
    for (const state of EDITOR_PANE_STATES) {
      if (state !== 'ready') expect(named).toContain(state);
    }
  });

  it('follows the PRD lines for the Editor', () => {
    expect(paneState(null)).toBe('empty');
    const doc = newDoc(PATH);
    expect(paneState(doc)).toBe('loading');
    expect(paneState(loadFailed(doc, 'ENOENT'))).toBe('error');
    const ready = loaded(doc, 'one\n');
    expect(paneState(ready)).toBe('ready');
    expect(paneState(saveFailed(ready, 'EACCES'))).toBe('error');
    expect(paneState(diskChanged(edited(ready, 'x'), 'y'))).toBe('partial');
  });
});

describe('editor store', () => {
  it('creates a doc on first open and keeps it across opens', () => {
    const store = createEditorStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const first = store.open(PATH);
    expect(first.load.status).toBe('loading');
    expect(store.open(PATH)).toBe(first);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('applies updates by path and skips no-ops', () => {
    const store = createEditorStore();
    store.open(PATH);
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply(PATH, (doc) => loaded(doc, 'one\n'));
    store.apply(PATH, (doc) => edited(doc, 'one\n'));
    store.apply('/elsewhere', (doc) => loaded(doc, 'x'));
    expect(store.getState()[PATH].text).toBe('one\n');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
