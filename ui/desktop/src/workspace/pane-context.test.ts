import { describe, expect, it } from 'vitest';
import type { InsertChatInput } from './pane-context';
import { quoteForChat } from './chat-insert';

describe('insertIntoChat integration', () => {
  it('quotes text and dispatches INSERT_INPUT_TEXT event', () => {
    const input: InsertChatInput = {
      kind: 'text',
      text: 'const x = 1;',
      source: { path: 'src/index.ts', lines: [5, 10] },
    };

    const quoted = quoteForChat(input);
    expect(quoted).toBe('```src/index.ts:5-10\nconst x = 1;\n```');
  });

  it('quotes image and produces correct format', () => {
    const input: InsertChatInput = {
      kind: 'image',
      source: { path: 'screenshot.png', lines: [1, 50] },
    };

    const quoted = quoteForChat(input);
    expect(quoted).toBe('```screenshot.png:1-50\n[image]\n```');
  });

  it('handles text without line range', () => {
    const input: InsertChatInput = {
      kind: 'text',
      text: 'some content',
      source: { path: 'file.txt' },
    };

    const quoted = quoteForChat(input);
    expect(quoted).toBe('```file.txt\nsome content\n```');
  });
});
