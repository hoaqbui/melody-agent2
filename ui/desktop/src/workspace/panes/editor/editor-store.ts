// What the Editor pane keeps per file while it is off screen (DESIGN.md Nothing Lost
// Rule): the buffer, what disk held when it was last read or written, and the CodeMirror
// state so a remount restores cursor and undo history. Pure state, no React, no DOM.

import type { EditorState } from '@codemirror/state';

// The subset of DESIGN.md §Shared component states the pane reports, plus `ready` for a
// file with nothing unresolved.
export const EDITOR_PANE_STATES = ['empty', 'loading', 'partial', 'error', 'ready'] as const;

export type EditorPaneState = (typeof EDITOR_PANE_STATES)[number];

export type EditorViewMode = 'source' | 'preview';

export type DocLoad =
  { status: 'loading' } | { status: 'loaded' } | { status: 'error'; message: string };

export interface FileDoc {
  path: string;
  load: DocLoad;
  // The content disk held when it was last read or written; the buffer is dirty while it
  // differs from this.
  disk: string;
  text: string;
  // Newer disk content held back because the buffer has unsaved edits (the reload bar).
  incoming: string | null;
  // Bumped when the buffer is replaced from outside the editor (load, reload), so the
  // mounted view knows to take the new text; edits typed into the view leave it alone.
  revision: number;
  editor: EditorState | null;
  saving: boolean;
  saveError: string | null;
  view: EditorViewMode;
}

export function newDoc(path: string): FileDoc {
  return {
    path,
    load: { status: 'loading' },
    disk: '',
    text: '',
    incoming: null,
    revision: 0,
    editor: null,
    saving: false,
    saveError: null,
    view: 'source',
  };
}

export function isDirty(doc: FileDoc): boolean {
  return doc.text !== doc.disk;
}

export function isMarkdown(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path);
}

export function loaded(doc: FileDoc, content: string): FileDoc {
  return {
    ...doc,
    load: { status: 'loaded' },
    disk: content,
    text: content,
    incoming: null,
    revision: doc.revision + 1,
    editor: null,
  };
}

export function loadFailed(doc: FileDoc, message: string): FileDoc {
  return { ...doc, load: { status: 'error', message } };
}

export function loadStarted(doc: FileDoc): FileDoc {
  return { ...doc, load: { status: 'loading' } };
}

export function edited(doc: FileDoc, text: string): FileDoc {
  return text === doc.text ? doc : { ...doc, text };
}

export function snapshot(doc: FileDoc, editor: EditorState | null): FileDoc {
  return { ...doc, editor };
}

// Disk was re-read after a watch event or a remount. The pane's own save echoes back as a
// change event, so only content that differs from what was last written counts; a clean
// buffer follows disk, a dirty one keeps its edits and raises the reload bar.
export function diskChanged(doc: FileDoc, content: string): FileDoc {
  if (doc.load.status !== 'loaded' || content === doc.disk) return doc;
  if (!isDirty(doc)) return loaded(doc, content);
  return { ...doc, incoming: content };
}

export function reload(doc: FileDoc): FileDoc {
  return doc.incoming === null ? doc : loaded(doc, doc.incoming);
}

// The bar's other exit: the edits stay and the next save overwrites what changed on disk.
export function keepMine(doc: FileDoc): FileDoc {
  return doc.incoming === null ? doc : { ...doc, disk: doc.incoming, incoming: null };
}

export function saveStarted(doc: FileDoc): FileDoc {
  return { ...doc, saving: true, saveError: null };
}

export function saveDone(doc: FileDoc, content: string): FileDoc {
  return { ...doc, saving: false, disk: content, incoming: null };
}

export function saveFailed(doc: FileDoc, message: string): FileDoc {
  return { ...doc, saving: false, saveError: message };
}

export function setView(doc: FileDoc, view: EditorViewMode): FileDoc {
  return doc.view === view ? doc : { ...doc, view };
}

export function paneState(doc: FileDoc | null): EditorPaneState {
  if (!doc) return 'empty';
  if (doc.load.status === 'loading') return 'loading';
  if (doc.load.status === 'error' || doc.saveError !== null) return 'error';
  return doc.incoming !== null ? 'partial' : 'ready';
}

export type Docs = Readonly<Record<string, FileDoc>>;

export interface EditorStore {
  getState(): Docs;
  subscribe(listener: () => void): () => void;
  // Returns the doc for a path, creating it in the loading state on first sight.
  open(path: string): FileDoc;
  apply(path: string, update: (doc: FileDoc) => FileDoc): void;
}

export function createEditorStore(): EditorStore {
  let docs: Docs = {};
  const listeners = new Set<() => void>();
  const set = (path: string, doc: FileDoc) => {
    docs = { ...docs, [path]: doc };
    listeners.forEach((listener) => listener());
  };
  return {
    getState: () => docs,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    open: (path) => {
      const existing = docs[path];
      if (existing) return existing;
      const doc = newDoc(path);
      set(path, doc);
      return doc;
    },
    apply: (path, update) => {
      const current = docs[path];
      if (!current) return;
      const next = update(current);
      if (next !== current) set(path, next);
    },
  };
}
