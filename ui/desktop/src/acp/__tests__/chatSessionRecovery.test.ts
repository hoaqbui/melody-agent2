import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../types/message';
import { ChatState } from '../../types/chatState';
import type { Session } from '../../types/session';
import { acpChatSessionController, RUN_REPLAY_RETRY_MS } from '../chatSessionController';
import { acpChatSessionActions, acpChatSessionStore } from '../chatSessionStore';
import { AcpConnectionLostError } from '../errors';
import { acpCancelPrompt, acpPromptSession } from '../prompt';
import { acpLoadSession, isAcpSessionLoadInFlight, sessionInfoToSession } from '../sessions';

// The controller against the real store: only the network edges are mocked.
vi.mock('../../utils/extensionErrorUtils', () => ({
  showExtensionLoadResults: vi.fn(),
}));

vi.mock('../acpConnection', () => ({
  isAcpRecovering: vi.fn(() => false),
}));

vi.mock('../prompt', () => ({
  acpCancelPrompt: vi.fn(),
  acpPromptSession: vi.fn(),
}));

vi.mock('../sessions', () => ({
  acpLoadSession: vi.fn(),
  isAcpSessionLoadInFlight: vi.fn(),
  sessionInfoToSession: vi.fn(),
  acpForkSession: vi.fn(),
  acpTruncateSessionConversation: vi.fn(),
}));

const SESSION_ID = 'recovery-session';

const prompt: Message = {
  id: 'prompt-1',
  role: 'user',
  created: 123,
  content: [{ type: 'text', text: 'Take your time' }],
  metadata: { userVisible: true, agentVisible: true },
};

const runReplayOverflow = {
  message: 'Internal error',
  data: { reason: 'active_run_replay_overflow', message: 'load it again after the run ends' },
};

function loadResult() {
  return {
    sessionInfo: { sessionId: SESSION_ID, cwd: '/tmp', title: 'Recovery' },
    response: {},
    meta: {},
  } as unknown as Awaited<ReturnType<typeof acpLoadSession>>;
}

describe('a Stop pressed just before the socket drops (task 200)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(acpCancelPrompt).mockResolvedValue(undefined);
    vi.mocked(isAcpSessionLoadInFlight).mockReturnValue(false);
    vi.mocked(sessionInfoToSession).mockReturnValue({ id: SESSION_ID } as Session);
  });

  afterEach(() => {
    acpChatSessionActions.deleteSnapshot(SESSION_ID);
    vi.useRealTimers();
  });

  it('is resent when the replay is refused, and clears once the reload finds the run ended', async () => {
    let loseSocket: (error: unknown) => void = () => {};
    vi.mocked(acpPromptSession).mockReturnValue(
      new Promise((_, reject) => {
        loseSocket = reject;
      })
    );
    const onFinish = vi.fn();

    const submitted = acpChatSessionController.submitMessage(SESSION_ID, prompt, {
      getCurrentSnapshot: () => acpChatSessionStore.getSnapshot(SESSION_ID),
      onFinish,
    });
    const promptAttemptId = acpChatSessionStore.getSnapshot(SESSION_ID)?.activePromptAttemptId;
    expect(promptAttemptId).toBeTruthy();

    acpChatSessionController.stop(SESSION_ID);
    expect(acpCancelPrompt).toHaveBeenCalledTimes(1);
    loseSocket(new AcpConnectionLostError(new Error('ACP connection closed'), true));
    await vi.advanceTimersByTimeAsync(0);

    vi.mocked(acpLoadSession).mockRejectedValueOnce(runReplayOverflow);
    await acpChatSessionController.restoreSession(SESSION_ID);

    expect(acpCancelPrompt).toHaveBeenCalledTimes(2);
    expect(acpChatSessionStore.getSnapshot(SESSION_ID)).toMatchObject({
      chatState: ChatState.Idle,
      pendingCancelPromptAttemptId: promptAttemptId,
    });

    vi.mocked(acpLoadSession).mockResolvedValueOnce(loadResult());
    await vi.advanceTimersByTimeAsync(RUN_REPLAY_RETRY_MS);
    await submitted;

    expect(acpChatSessionStore.getSnapshot(SESSION_ID)).toMatchObject({
      chatState: ChatState.Idle,
      activePromptAttemptId: null,
      pendingCancelPromptAttemptId: null,
    });
    expect(onFinish).not.toHaveBeenCalled();
  });
});
