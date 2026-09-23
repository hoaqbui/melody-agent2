import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../types/session';

const submitMessageMock = vi.hoisted(() => vi.fn());
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock('../acp/chatSessionController', () => ({
  acpChatSessionController: {
    createSession: vi.fn(),
    loadSession: vi.fn().mockResolvedValue(undefined),
    restoreSession: vi.fn().mockResolvedValue(undefined),
    submitMessage: submitMessageMock,
    stop: vi.fn(),
    updateMessage: vi.fn(),
  },
}));

vi.mock('../toasts', () => ({ toastError: toastErrorMock }));

import { useChatSession } from './useChatSession';
import { acpChatSessionActions } from '../acp/chatSessionStore';

function session(id: string): Session {
  return {
    id,
    name: `Session ${id}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    working_dir: '/tmp',
    message_count: 0,
    extension_data: {},
    source: 'test',
    conversation: [],
    usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
    accumulated_usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  } as Session;
}

describe('useChatSession failed turn handling', () => {
  const sessionId = 'session-failed-turn';

  beforeEach(() => {
    submitMessageMock.mockReset();
    toastErrorMock.mockReset();
    acpChatSessionActions.deleteSnapshot(sessionId);
    acpChatSessionActions.finishSessionLoad(sessionId, session(sessionId));
  });

  afterEach(() => {
    acpChatSessionActions.deleteSnapshot(sessionId);
  });

  it('records a failed turn as classified session state instead of a toast', async () => {
    submitMessageMock.mockImplementation(async (targetSessionId, _message, options) => {
      acpChatSessionActions.startPromptAttempt(targetSessionId, 'attempt-1');
      acpChatSessionActions.finishPromptAttemptIfCurrent(targetSessionId, 'attempt-1');
      options.onFinish('ECONNRESET: the connection to claude-agent-acp closed after 41s.');
    });

    const { result } = renderHook(() => useChatSession({ sessionId, onStreamFinish: vi.fn() }));

    await act(async () => {
      await result.current.handleSubmit({ msg: 'hello', images: [] });
    });

    expect(result.current.turnFailure).toMatchObject({
      kind: 'network',
      detail: 'ECONNRESET: the connection to claude-agent-acp closed after 41s.',
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('replaces a previous failed turn once a new prompt attempt starts', async () => {
    submitMessageMock.mockImplementationOnce(async (targetSessionId, _message, options) => {
      acpChatSessionActions.startPromptAttempt(targetSessionId, 'attempt-1');
      acpChatSessionActions.finishPromptAttemptIfCurrent(targetSessionId, 'attempt-1');
      options.onFinish('Sign in to your provider, then try again.');
    });
    submitMessageMock.mockImplementationOnce(async (targetSessionId, _message, options) => {
      // startPromptAttempt (chatSessionStore.ts) clears any stale turnFailure before this
      // attempt's own outcome is recorded.
      acpChatSessionActions.startPromptAttempt(targetSessionId, 'attempt-2');
      acpChatSessionActions.finishPromptAttemptIfCurrent(targetSessionId, 'attempt-2');
      options.onFinish('ETIMEDOUT while waiting for a response.');
    });

    const { result } = renderHook(() => useChatSession({ sessionId, onStreamFinish: vi.fn() }));

    await act(async () => {
      await result.current.handleSubmit({ msg: 'first', images: [] });
    });
    expect(result.current.turnFailure?.kind).toBe('auth');

    await act(async () => {
      await result.current.handleSubmit({ msg: 'retry', images: [] });
    });
    expect(result.current.turnFailure).toMatchObject({
      kind: 'network',
      detail: 'ETIMEDOUT while waiting for a response.',
    });
  });
});
