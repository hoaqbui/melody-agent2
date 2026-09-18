import { describe, it, expect } from 'vitest';
import { parseNumstat, aggregateStats } from './changes-bar';

describe('changes-bar', () => {
  describe('parseNumstat', () => {
    it('parses added and deleted lines', () => {
      const input = '5\t2\tsrc/file.ts\n3\t0\tnotes.md\n';
      const result = parseNumstat(input);
      expect(result).toEqual([
        { path: 'src/file.ts', added: 5, deleted: 2 },
        { path: 'notes.md', added: 3, deleted: 0 },
      ]);
    });

    it('handles binary files with - instead of counts', () => {
      const input = '-\t-\timage.png\n2\t1\tfile.ts\n';
      const result = parseNumstat(input);
      expect(result).toEqual([
        { path: 'image.png', added: null, deleted: null },
        { path: 'file.ts', added: 2, deleted: 1 },
      ]);
    });

    it('handles paths with tabs', () => {
      const input = '1\t2\tpath/with\ttab.txt\n';
      const result = parseNumstat(input);
      expect(result).toEqual([{ path: 'path/with\ttab.txt', added: 1, deleted: 2 }]);
    });

    it('handles empty input', () => {
      const result = parseNumstat('');
      expect(result).toEqual([]);
    });

    it('skips empty lines', () => {
      const input = '1\t2\tfile.ts\n\n\n3\t4\tother.ts\n';
      const result = parseNumstat(input);
      expect(result).toEqual([
        { path: 'file.ts', added: 1, deleted: 2 },
        { path: 'other.ts', added: 3, deleted: 4 },
      ]);
    });
  });

  describe('aggregateStats', () => {
    it('sums added and deleted lines', () => {
      const entries = [
        { path: 'file1.ts', added: 5, deleted: 2 },
        { path: 'file2.ts', added: 3, deleted: 1 },
      ];
      const result = aggregateStats(entries);
      expect(result).toEqual({
        fileCount: 2,
        totalAdded: 8,
        totalDeleted: 3,
        entries,
      });
    });

    it('ignores null values (binary files)', () => {
      const entries = [
        { path: 'image.png', added: null, deleted: null },
        { path: 'file.ts', added: 10, deleted: 5 },
      ];
      const result = aggregateStats(entries);
      expect(result).toEqual({
        fileCount: 2,
        totalAdded: 10,
        totalDeleted: 5,
        entries,
      });
    });

    it('handles empty entries', () => {
      const result = aggregateStats([]);
      expect(result).toEqual({
        fileCount: 0,
        totalAdded: 0,
        totalDeleted: 0,
        entries: [],
      });
    });
  });
});
