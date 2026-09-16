// Turns one CodeMirror merge chunk plus the two whole documents into a unified patch that
// `git apply --recount` accepts in either direction (docs/2026-09-16-hunk-review-research-v1.md
// §The surprise: the pane fetches at FULL_CONTEXT, so git's own hunks are one per file and
// the review units on screen are CodeMirror chunks with char offsets, not git's).

import type { Text } from '@codemirror/state';
import type { DiffKind } from './unified-diff';

export const CONTEXT_LINES = 3;

// The four offsets of `Chunk` (@codemirror/merge): `toA`/`toB` are one past the last line's
// newline and may point one past the document when that line has none.
export interface ChunkRange {
  fromA: number;
  toA: number;
  fromB: number;
  toB: number;
}

interface PatchLine {
  text: string;
  // False only for a document's last line when the document does not end in a newline.
  newline: boolean;
}

// A document built from a string that ends in "\n" carries a phantom empty last line;
// the real lines are the ones that start before the document's end.
const isRealLine = (doc: Text, from: number): boolean => from < doc.length;

const lineAt = (doc: Text, pos: number): PatchLine & { from: number; next: number } => {
  const line = doc.lineAt(pos);
  return { text: line.text, newline: line.to < doc.length, from: line.from, next: line.to + 1 };
};

const sameLine = (a: PatchLine, b: PatchLine): boolean =>
  a.text === b.text && a.newline === b.newline;

const changedLines = (doc: Text, from: number, to: number): PatchLine[] => {
  const end = Math.min(to, doc.length);
  if (from >= end) return [];
  const text = doc.sliceString(from, end);
  const lines = text.split('\n');
  const newline = text.endsWith('\n');
  if (newline) lines.pop();
  return lines.map((line, index) => ({
    text: line,
    newline: newline || index < lines.length - 1,
  }));
};

const format = (marker: string, line: PatchLine): string =>
  line.newline
    ? `${marker}${line.text}\n`
    : `${marker}${line.text}\n\\ No newline at end of file\n`;

// Context is the text that is identical at aligned offsets on both sides, walked outward
// from the chunk: `apply -R` matches it against the working tree, `apply --cached` against
// the index, so lifting it from one document alone fails one direction whenever a
// neighbouring chunk sits within CONTEXT_LINES.
function contextBefore(a: Text, b: Text, chunk: ChunkRange): PatchLine[] {
  const lines: PatchLine[] = [];
  let posA = chunk.fromA;
  let posB = chunk.fromB;
  while (lines.length < CONTEXT_LINES && posA > 0 && posB > 0) {
    const lineA = lineAt(a, posA - 1);
    const lineB = lineAt(b, posB - 1);
    if (!sameLine(lineA, lineB)) break;
    lines.unshift(lineA);
    posA = lineA.from;
    posB = lineB.from;
  }
  return lines;
}

function contextAfter(a: Text, b: Text, chunk: ChunkRange): PatchLine[] {
  const lines: PatchLine[] = [];
  let posA = Math.min(chunk.toA, a.length);
  let posB = Math.min(chunk.toB, b.length);
  while (lines.length < CONTEXT_LINES && isRealLine(a, posA) && isRealLine(b, posB)) {
    const lineA = lineAt(a, posA);
    const lineB = lineAt(b, posB);
    if (!sameLine(lineA, lineB)) break;
    lines.push(lineA);
    posA = lineA.next;
    posB = lineB.next;
  }
  return lines;
}

export interface ChunkPatchInput {
  path: string;
  kind: DiffKind;
  old: Text;
  new: Text;
  chunk: ChunkRange;
}

export function chunkPatch({ path, kind, old: a, new: b, chunk }: ChunkPatchInput): string {
  const before = contextBefore(a, b, chunk);
  const after = contextAfter(a, b, chunk);
  const removed = changedLines(a, chunk.fromA, chunk.toA);
  const added = changedLines(b, chunk.fromB, chunk.toB);
  const oldCount = before.length + removed.length + after.length;
  const newCount = before.length + added.length + after.length;
  // A side with no lines at all is numbered from 0, as git writes an added or deleted file.
  const oldStart = oldCount === 0 ? 0 : a.lineAt(chunk.fromA).number - before.length;
  const newStart = newCount === 0 ? 0 : b.lineAt(chunk.fromB).number - before.length;
  return [
    `--- ${kind === 'added' ? '/dev/null' : `a/${path}`}\n`,
    `+++ ${kind === 'deleted' ? '/dev/null' : `b/${path}`}\n`,
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n`,
    ...before.map((line) => format(' ', line)),
    ...removed.map((line) => format('-', line)),
    ...added.map((line) => format('+', line)),
    ...after.map((line) => format(' ', line)),
  ].join('');
}
