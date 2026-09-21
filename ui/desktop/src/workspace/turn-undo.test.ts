import { describe, it, expect } from 'vitest';
import { intersects, laterTurns, parseDiffFileSet } from './turn-undo';

describe('turn-undo', () => {
  it('parses diff file set from name-status output', () => {
    const diff = 'M\tfile1.txt\nA\tfile2.txt\nD\tfile3.txt\n';
    const files = parseDiffFileSet(diff);
    expect(files).toEqual(new Set(['file1.txt', 'file2.txt', 'file3.txt']));
  });

  it('handles empty diff', () => {
    const diff = '';
    const files = parseDiffFileSet(diff);
    expect(files.size).toBe(0);
  });

  it('handles multiline diff with extra whitespace', () => {
    const diff = 'M\tdir/file1.txt\nA\tnew.md\n\n';
    const files = parseDiffFileSet(diff);
    expect(files).toEqual(new Set(['dir/file1.txt', 'new.md']));
  });

  it('detects intersection between file sets', () => {
    const setA = new Set(['file1.txt', 'file2.txt']);
    const setB = new Set(['file2.txt', 'file3.txt']);
    const result = intersects(setA, [setB]);
    expect(result).toBe('file2.txt');
  });

  it('returns undefined when no intersection', () => {
    const setA = new Set(['file1.txt']);
    const setB = new Set(['file2.txt']);
    const result = intersects(setA, [setB]);
    expect(result).toBeUndefined();
  });

  it('names the later turns with both snapshots, in transcript order', () => {
    const snaps = {
      a: { start: '1', end: '2' },
      b: { start: '2', end: '3' },
      c: { start: '3', end: '' },
      d: { start: '4', end: '5' },
    };
    expect(laterTurns(['a', 'b', 'c', 'd'], 'a', snaps)).toEqual(['b', 'd']);
    expect(laterTurns(['a', 'b', 'c', 'd'], 'd', snaps)).toEqual([]);
    expect(laterTurns(['a', 'b'], 'zz', snaps)).toEqual([]);
  });
});
