import { describe, it, expect } from 'vitest';
import { fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches exact text', () => {
    expect(fuzzyMatch('Terminal', 'Terminal')).toBe(true);
  });

  it('matches case-insensitive', () => {
    expect(fuzzyMatch('Terminal', 'terminal')).toBe(true);
    expect(fuzzyMatch('TERMINAL', 'terminal')).toBe(true);
  });

  it('ignores spaces, underscores, and dashes', () => {
    expect(fuzzyMatch('Open in Editor', 'open-in-editor')).toBe(true);
    expect(fuzzyMatch('open_in_editor', 'open in editor')).toBe(true);
  });

  it('matches substring', () => {
    expect(fuzzyMatch('Terminal', 'term')).toBe(true);
    expect(fuzzyMatch('Claude Code', 'code')).toBe(true);
  });

  it('returns false for non-matching text', () => {
    expect(fuzzyMatch('Terminal', 'xyz')).toBe(false);
    expect(fuzzyMatch('Files', 'edit')).toBe(false);
  });

  it('handles empty query', () => {
    expect(fuzzyMatch('Terminal', '')).toBe(true);
  });

  it('handles empty text', () => {
    expect(fuzzyMatch('', 'term')).toBe(false);
  });
});
