// Prompt a session by appending a user message and sending it (task 70, lifted for task 90).
// The message lands in the store first so Open transcript shows both sides.

import { createUserMessage } from '../types/message';
import { acpChatSessionActions, acpChatSessionStore } from '../acp/chatSessionStore';
import { acpChatSessionController } from '../acp/chatSessionController';
import { notifyTurnFinished } from '../notifications';

export async function prompt(sessionId: string, text: string, cwd: string): Promise<void> {
  if (!acpChatSessionStore.getSnapshot(sessionId)?.session) {
    await acpChatSessionController.loadSession(sessionId);
  }
  const current = acpChatSessionStore.getSnapshot(sessionId);
  if (!current?.session) {
    throw new Error(current?.sessionLoadError ?? 'session not loaded');
  }
  const message = createUserMessage(text);
  acpChatSessionActions.setMessages(sessionId, [...current.messages, message]);
  await acpChatSessionController.submitMessage(sessionId, message, {
    getCurrentSnapshot: () => acpChatSessionStore.getSnapshot(sessionId),
    onFinish: (error) => {
      if (!error) notifyTurnFinished({ sessionId, workingDir: cwd });
    },
  });
}
