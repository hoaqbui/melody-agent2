import { describe, expect, it } from 'vitest';
import { quoteForChat } from './chat-insert';

describe('quoteForChat', () => {
  it('formats text with path header', () => {
    const result = quoteForChat({
      kind: 'text',
      text: 'some code here',
      source: { path: 'src/file.ts' },
    });
    expect(result).toBe('```src/file.ts\nsome code here\n```');
  });

  it('formats text with path and line range', () => {
    const result = quoteForChat({
      kind: 'text',
      text: 'const x = 1;',
      source: { path: 'src/index.ts', lines: [5, 10] },
    });
    expect(result).toBe('```src/index.ts:5-10\nconst x = 1;\n```');
  });

  it('formats image with path header', () => {
    const result = quoteForChat({
      kind: 'image',
      source: { path: 'screenshot.png' },
    });
    expect(result).toBe('```screenshot.png\n[image]\n```');
  });

  it('formats image with path and line range', () => {
    const result = quoteForChat({
      kind: 'image',
      source: { path: 'docs/diagram.png', lines: [1, 50] },
    });
    expect(result).toBe('```docs/diagram.png:1-50\n[image]\n```');
  });

  it('handles empty text', () => {
    const result = quoteForChat({
      kind: 'text',
      text: '',
      source: { path: 'file.txt' },
    });
    expect(result).toBe('```file.txt\n\n```');
  });

  it('handles undefined text', () => {
    const result = quoteForChat({
      kind: 'text',
      source: { path: 'file.txt' },
    });
    expect(result).toBe('```file.txt\n\n```');
  });
});
