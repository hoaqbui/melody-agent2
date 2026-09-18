import { describe, it, expect } from 'vitest';
import { parseDiffFileSet } from './turn-undo';

describe('turn-undo', () => {
  it('parses diff file set from name-status output', async () => {
    const diff = 'M\tfile1.txt\nA\tfile2.txt\nD\tfile3.txt\n';
    const files = await parseDiffFileSet(diff);
    expect(files).toEqual(new Set(['file1.txt', 'file2.txt', 'file3.txt']));
  });

  it('handles empty diff', async () => {
    const diff = '';
    const files = await parseDiffFileSet(diff);
    expect(files.size).toBe(0);
  });

  it('handles multiline diff with extra whitespace', async () => {
    const diff = 'M\tdir/file1.txt\nA\tnew.md\n\n';
    const files = await parseDiffFileSet(diff);
    expect(files).toEqual(new Set(['dir/file1.txt', 'new.md']));
  });
});
