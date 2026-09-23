// What the commit box prefills with when it is empty (tasks 166, 168): the last
// assistant reply's first sentence, capped at 72 characters, with a leading "Done —"
// dropped. Used by the Git pane's own box on focus, and by the Changes bar's inline
// Commit… box (ChangesBar.tsx) when it opens. Never overwrites a message the user
// already typed, and never commits anything itself.

import { getTextAndImageContent, type Message } from '../../../types/message';

const MAX_LENGTH = 72;
const DONE_PREFIX = /^done\s*[—–-]\s*/i;
const SENTENCE_END = /[.!?\n]/;

function lastAssistantReply(messages: readonly Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      return getTextAndImageContent(messages[i]).textContent;
    }
  }
  return '';
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const end = trimmed.search(SENTENCE_END);
  return (end === -1 ? trimmed : trimmed.slice(0, end)).trim();
}

export function draftCommitMessage(messages: readonly Message[]): string {
  const reply = lastAssistantReply(messages).trim().replace(DONE_PREFIX, '');
  const sentence = firstSentence(reply);
  return sentence.slice(0, MAX_LENGTH).trim();
}
