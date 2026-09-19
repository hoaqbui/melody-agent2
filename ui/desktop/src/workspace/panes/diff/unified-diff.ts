// Parses the sidecar's `git diff` output (fixed a/ b/ prefixes, raw paths; ui/sidecar/src/git.ts)
// into one entry per file, and rebuilds both sides of a file from its hunks. The sides are
// whole documents only when the diff was taken with enough context to cover the file
// (FULL_CONTEXT); with the default three lines they are fragments and only the counts matter.

import { Chunk } from '@codemirror/merge';
import { Text } from '@codemirror/state';

export const FULL_CONTEXT = 1_000_000_000;

export type DiffKind = 'added' | 'deleted' | 'modified' | 'renamed';

export interface DiffFile {
  path: string;
  oldPath: string | null;
  kind: DiffKind;
  binary: boolean;
  added: number;
  removed: number;
  old: string;
  new: string;
}

const HUNK_HEADER = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

const stripPrefix = (line: string, prefix: string): string | null => {
  const body = line.slice(4).replace(/\t$/, '');
  if (body === '/dev/null') return null;
  return body.startsWith(prefix) ? body.slice(prefix.length) : body;
};

// `diff --git a/P b/P` is ambiguous when P has spaces; both sides are the same path
// unless a rename header says otherwise, so split the line down the middle.
const pathFromGitLine = (line: string): string => {
  const rest = line.slice('diff --git '.length);
  const half = (rest.length - 5) / 2;
  const path = rest.slice(2, 2 + half);
  return rest === `a/${path} b/${path}` ? path : rest;
};

interface Sides {
  old: string[];
  new: string[];
}

const appendNoNewline = (sides: Sides, last: ('old' | 'new')[]) => {
  for (const side of last) {
    const lines = sides[side];
    if (lines.length > 0) lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1);
  }
};

export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let sides: Sides = { old: [], new: [] };
  let gitPath = '';
  let renameTo: string | null = null;
  let renameFrom: string | null = null;
  let oldRemaining = 0;
  let newRemaining = 0;
  let lastSides: ('old' | 'new')[] = [];

  const finish = () => {
    if (!file) return;
    file.old = sides.old.join('');
    file.new = sides.new.join('');
    if (renameTo) {
      file.path = renameTo;
      file.oldPath = renameFrom;
      file.kind = 'renamed';
    }
    if (!file.path) file.path = gitPath;
    files.push(file);
    file = null;
  };

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      finish();
      gitPath = pathFromGitLine(line);
      renameTo = null;
      renameFrom = null;
      oldRemaining = 0;
      newRemaining = 0;
      sides = { old: [], new: [] };
      file = {
        path: '',
        oldPath: null,
        kind: 'modified',
        binary: false,
        added: 0,
        removed: 0,
        old: '',
        new: '',
      };
      continue;
    }
    if (!file) continue;

    if (oldRemaining > 0 || newRemaining > 0) {
      const marker = line[0] ?? ' ';
      if (marker === '\\') {
        appendNoNewline(sides, lastSides);
        continue;
      }
      const body = `${line.slice(1)}\n`;
      if (marker === '-') {
        sides.old.push(body);
        oldRemaining -= 1;
        file.removed += 1;
        lastSides = ['old'];
      } else if (marker === '+') {
        sides.new.push(body);
        newRemaining -= 1;
        file.added += 1;
        lastSides = ['new'];
      } else {
        sides.old.push(body);
        sides.new.push(body);
        oldRemaining -= 1;
        newRemaining -= 1;
        lastSides = ['old', 'new'];
      }
      continue;
    }
    if (line.startsWith('\\')) {
      appendNoNewline(sides, lastSides);
      continue;
    }

    const hunk = HUNK_HEADER.exec(line);
    if (hunk) {
      oldRemaining = hunk[1] === undefined ? 1 : Number(hunk[1]);
      newRemaining = hunk[2] === undefined ? 1 : Number(hunk[2]);
      continue;
    }
    if (line.startsWith('--- ')) {
      const from = stripPrefix(line, 'a/');
      if (from === null) file.kind = 'added';
      else file.path = from;
    } else if (line.startsWith('+++ ')) {
      const to = stripPrefix(line, 'b/');
      if (to === null) file.kind = 'deleted';
      else file.path = to;
    } else if (line.startsWith('rename from ')) {
      renameFrom = line.slice('rename from '.length);
    } else if (line.startsWith('rename to ')) {
      renameTo = line.slice('rename to '.length);
    } else if (line.startsWith('new file mode ')) {
      file.kind = 'added';
    } else if (line.startsWith('deleted file mode ')) {
      file.kind = 'deleted';
    } else if (line.startsWith('Binary files ')) {
      file.binary = true;
    }
  }
  finish();
  return files;
}

export interface ToolConfirmationDiffLine {
  marker: '+' | '-' | ' ';
  text: string;
}

const sideLines = (doc: Text, from: number, to: number): string[] => {
  const end = Math.min(to, doc.length);
  if (from >= end) return [];
  const text = doc.sliceString(from, end);
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines;
};

// A tool confirmation's diff (task 89) is the whole file's two sides, not git's hunks, so
// `Chunk.build` — the same pass the Changes pane's `unifiedMergeView` runs — finds what
// changed; each chunk's removed then added lines become the card's - / + rows.
export function toolConfirmationDiffLines(
  oldText: string | undefined,
  newText: string
): ToolConfirmationDiffLine[] {
  const a = Text.of((oldText ?? '').split('\n'));
  const b = Text.of(newText.split('\n'));
  const lines: ToolConfirmationDiffLine[] = [];
  for (const chunk of Chunk.build(a, b)) {
    for (const text of sideLines(a, chunk.fromA, chunk.toA)) lines.push({ marker: '-', text });
    for (const text of sideLines(b, chunk.fromB, chunk.toB)) lines.push({ marker: '+', text });
  }
  return lines;
}
