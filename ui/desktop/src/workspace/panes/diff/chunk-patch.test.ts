import { Chunk } from '@codemirror/merge';
import { Text } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { chunkPatch } from './chunk-patch';
import { parseUnifiedDiff, type DiffKind } from './unified-diff';

// Chunks come from Chunk.build on the same two documents the pane hands CodeMirror, so the
// geometry under test is the editor's own. Every patch here was also run through
// `git apply --recount --check` forward against the index and reverse against the working
// tree in a scratch repo (git 2.55, 2026-09-16, scratchpad/t50/probe.ts).
const docs = (old: string, next: string) => ({
  old: Text.of(old.split('\n')),
  new: Text.of(next.split('\n')),
});

const patches = (path: string, kind: DiffKind, old: string, next: string) => {
  const sides = docs(old, next);
  return Chunk.build(sides.old, sides.new).map((chunk) =>
    chunkPatch({ path, kind, old: sides.old, new: sides.new, chunk })
  );
};

describe('chunkPatch', () => {
  it('numbers each chunk from its real lines with three lines of context', () => {
    const [first, second] = patches(
      'two.txt',
      'modified',
      'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nl10\n',
      'l1\nL2\nl3\nl4\nl5\nl6\nl7\nl8\nL9\nl10\n'
    );
    expect(first).toBe(
      '--- a/two.txt\n+++ b/two.txt\n@@ -1,5 +1,5 @@\n l1\n-l2\n+L2\n l3\n l4\n l5\n'
    );
    expect(second).toBe(
      '--- a/two.txt\n+++ b/two.txt\n@@ -6,5 +6,5 @@\n l6\n l7\n l8\n-l9\n+L9\n l10\n'
    );
  });

  it('stops the context at a neighbouring chunk so the patch applies in both directions', () => {
    const [first, second] = patches('near.txt', 'modified', 'a\nb\nc\nd\ne\n', 'A\nb\nc\nD\ne\n');
    expect(first).toBe('--- a/near.txt\n+++ b/near.txt\n@@ -1,3 +1,3 @@\n-a\n+A\n b\n c\n');
    expect(second).toBe('--- a/near.txt\n+++ b/near.txt\n@@ -2,4 +2,4 @@\n b\n c\n-d\n+D\n e\n');
  });

  it('starts a top-of-file insertion at line 1', () => {
    const [patch] = patches('top.txt', 'modified', 'x\ny\n', 'new\nx\ny\n');
    expect(patch).toBe('--- a/top.txt\n+++ b/top.txt\n@@ -1,2 +1,3 @@\n+new\n x\n y\n');
  });

  it('uses /dev/null and line 0 for an added and a deleted file', () => {
    expect(patches('added.txt', 'added', '', 'new\n')).toEqual([
      '--- /dev/null\n+++ b/added.txt\n@@ -0,0 +1,1 @@\n+new\n',
    ]);
    expect(patches('gone.txt', 'deleted', 'x\n', '')).toEqual([
      '--- a/gone.txt\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-x\n',
    ]);
  });

  it('re-emits the no-newline marker on whichever side lacks the trailing newline', () => {
    expect(patches('nonl.txt', 'modified', 'a\nb', 'a\nc')).toEqual([
      '--- a/nonl.txt\n+++ b/nonl.txt\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n',
    ]);
    expect(patches('gainnl.txt', 'modified', 'a\nb', 'a\nb\n')).toEqual([
      '--- a/gainnl.txt\n+++ b/gainnl.txt\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n',
    ]);
  });

  it('round-trips through the parser for the recorded shapes', () => {
    const cases: [string, DiffKind, string, string][] = [
      ['added.txt', 'added', '', 'new\n'],
      ['gone.txt', 'deleted', 'x\n', ''],
      ['nonl.txt', 'modified', 'a\nb', 'a\nc'],
      ['top.txt', 'modified', 'x\ny\n', 'new\nx\ny\n'],
      ['append.txt', 'modified', 'a\n', 'a\nb\n'],
    ];
    for (const [path, kind, old, next] of cases) {
      const [patch] = patches(path, kind, old, next);
      const [file] = parseUnifiedDiff(`diff --git a/${path} b/${path}\n${patch}`);
      expect(file, path).toMatchObject({ path, kind, old, new: next });
    }
  });
});
