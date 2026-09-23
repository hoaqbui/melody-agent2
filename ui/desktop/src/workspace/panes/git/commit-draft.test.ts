import { describe, expect, it } from 'vitest';
import type { Message } from '../../../types/message';
import { draftCommitMessage } from './commit-draft';

const assistant = (text: string): Message => ({
  role: 'assistant',
  created: 0,
  content: [{ type: 'text', text }],
  metadata: { agentVisible: true, userVisible: true },
});

const user = (text: string): Message => ({
  role: 'user',
  created: 0,
  content: [{ type: 'text', text }],
  metadata: { agentVisible: true, userVisible: true },
});

describe('draft commit message', () => {
  it('takes the last assistant reply’s first sentence', () => {
    expect(draftCommitMessage([assistant('Updated greet(). It now takes a name.')])).toBe(
      'Updated greet()'
    );
  });

  it('drops a leading "Done —" and reads past it', () => {
    expect(
      draftCommitMessage([assistant('Done — switched to a template literal. Ran the tests.')])
    ).toBe('switched to a template literal');
  });

  it('caps the draft at 72 characters', () => {
    const long = 'a'.repeat(100);
    const draft = draftCommitMessage([assistant(long)]);
    expect(draft.length).toBe(72);
  });

  it('reads only the last assistant message, ignoring later user turns', () => {
    const messages = [
      assistant('First reply, ignored.'),
      user('thanks'),
      assistant('Second reply, used instead.'),
    ];
    expect(draftCommitMessage(messages)).toBe('Second reply, used instead');
  });

  it('is empty with no assistant message', () => {
    expect(draftCommitMessage([user('hello')])).toBe('');
    expect(draftCommitMessage([])).toBe('');
  });
});
