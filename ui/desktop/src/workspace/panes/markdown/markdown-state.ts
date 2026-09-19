// What the Markdown pane keeps per file while it is off screen (DESIGN.md Nothing Lost
// Rule): the text last read from disk and how the read went. Pure state, no React. The pane
// is read-only, so unlike the Editor it always follows disk.

import { isMarkdown } from '../editor/editor-store';

// The subset of DESIGN.md §Shared component states the pane reports, plus `ready` for a
// rendered file with nothing unresolved.
export const MARKDOWN_PANE_STATES = ['empty', 'loading', 'partial', 'error', 'ready'] as const;

export type MarkdownPaneState = (typeof MARKDOWN_PANE_STATES)[number];

export type MarkdownLoad =
  { status: 'loading' } | { status: 'loaded'; text: string } | { status: 'error'; message: string };

export interface MarkdownDoc {
  path: string;
  load: MarkdownLoad;
}

export function newDoc(path: string): MarkdownDoc {
  return { path, load: { status: 'loading' } };
}

export function loaded(doc: MarkdownDoc, text: string): MarkdownDoc {
  return doc.load.status === 'loaded' && doc.load.text === text
    ? doc
    : { ...doc, load: { status: 'loaded', text } };
}

export function loadFailed(doc: MarkdownDoc, message: string): MarkdownDoc {
  return { ...doc, load: { status: 'error', message } };
}

export function loadStarted(doc: MarkdownDoc): MarkdownDoc {
  return doc.load.status === 'loading' ? doc : { ...doc, load: { status: 'loading' } };
}

// One heading in the document: its level, its text stripped of the `#` marks, the anchor
// id `MarkdownView` gives its rendered element, and the 1-based source line `openFile`
// takes to land the Editor there (task 95, PRD §Item 12 — Contents + Edit).
export interface Heading {
  level: number;
  text: string;
  id: string;
  line: number;
}

// GitHub's anchor algorithm: lowercase, drop everything but letters, numbers, space and
// hyphen, spaces become hyphens. Pure in the name alone — `headings` below dedupes repeats
// across a document, which `slug` on its own cannot know about.
export function slug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const ATX_HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

// ATX headings `#` … `######`; a fenced block (``` or ~~~) hides whatever looks like a
// heading inside it, same as `review-parse.ts`'s `itemsOf`. Repeated heading text gets
// GitHub's `-1`, `-2`, … suffix so every id stays unique within the document.
export function headings(text: string): Heading[] {
  const found: Heading[] = [];
  const seen = new Map<string, number>();
  let fence: string | null = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      fence = fence === marker ? null : (fence ?? marker);
      continue;
    }
    if (fence) continue;
    const match = ATX_HEADING.exec(line);
    const headingText = match?.[2]?.replace(/\s+#+\s*$/, '').trim();
    if (!headingText) continue;
    const base = slug(headingText);
    const seenCount = seen.get(base) ?? 0;
    seen.set(base, seenCount + 1);
    found.push({
      level: match![1].length,
      text: headingText,
      id: seenCount === 0 ? base : `${base}-${seenCount}`,
      line: i + 1,
    });
  }
  return found;
}

// A file that is not markdown still shows, as text under a bar saying so (DESIGN.md
// Partial: the resolved part live, one bar naming what is missing).
export function paneState(doc: MarkdownDoc | null): MarkdownPaneState {
  if (!doc) return 'empty';
  if (doc.load.status === 'loading') return 'loading';
  if (doc.load.status === 'error') return 'error';
  return isMarkdown(doc.path) ? 'ready' : 'partial';
}

export type MarkdownDocs = Readonly<Record<string, MarkdownDoc>>;

export interface MarkdownStore {
  getState(): MarkdownDocs;
  subscribe(listener: () => void): () => void;
  // Returns the doc for a path, creating it in the loading state on first sight.
  open(path: string): MarkdownDoc;
  apply(path: string, update: (doc: MarkdownDoc) => MarkdownDoc): void;
}

export function createMarkdownStore(): MarkdownStore {
  let docs: MarkdownDocs = {};
  const listeners = new Set<() => void>();
  const set = (path: string, doc: MarkdownDoc) => {
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
