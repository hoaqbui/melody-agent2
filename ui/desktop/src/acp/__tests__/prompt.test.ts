import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '../../types/message';
import { getAcpClient, isAcpRecoveryPendingFor } from '../acpConnection';
import { isAcpConnectionLost, type AcpConnectionLostError } from '../errors';
import type { GooseAcpClient } from '../gooseAcpClient';
import { acpPromptSession, messageToAcpPromptContent } from '../prompt';

vi.mock('../acpConnection', () => ({
  getAcpClient: vi.fn(),
  isAcpRecoveryPendingFor: vi.fn(() => true),
}));

// `closesOnSend`: the socket drops after the prompt went out. `closedBeforeSend`: it had
// already dropped, so the prompt must never be written to it.
function fakeClient(options: {
  closedBeforeSend?: boolean;
  closesOnSend?: boolean;
  outcome: () => Promise<unknown>;
}): GooseAcpClient {
  const controller = new AbortController();
  if (options.closedBeforeSend) {
    controller.abort(new Error('ACP connection closed'));
  }
  return {
    connection: {
      signal: controller.signal,
      closed: Promise.resolve(),
      agent: {
        request: vi.fn(() => {
          if (options.closesOnSend) {
            controller.abort(new Error('ACP connection closed'));
          }
          return options.outcome();
        }),
      },
    },
  } as unknown as GooseAcpClient;
}

const prompt: Message = {
  id: 'message-1',
  role: 'user',
  created: 123,
  content: [{ type: 'text', text: 'Hello' }],
  metadata: { userVisible: true, agentVisible: true },
};

describe('acpPromptSession', () => {
  beforeEach(() => {
    vi.mocked(getAcpClient).mockReset();
    vi.mocked(isAcpRecoveryPendingFor).mockReturnValue(true);
  });

  it('reports a prompt lost with its socket as a lost connection', async () => {
    const closed = new Error('ACP connection closed');
    vi.mocked(getAcpClient).mockResolvedValue(
      fakeClient({ closesOnSend: true, outcome: () => Promise.reject(closed) })
    );

    const error = await acpPromptSession('session-1', prompt).catch((cause: unknown) => cause);

    expect(isAcpConnectionLost(error)).toBe(true);
    expect((error as Error).cause).toBe(closed);
    expect((error as AcpConnectionLostError).recoveryPending).toBe(true);
  });

  it('says when the reconnect that reloads sessions has already landed', async () => {
    vi.mocked(isAcpRecoveryPendingFor).mockReturnValue(false);
    vi.mocked(getAcpClient).mockResolvedValue(
      fakeClient({
        closesOnSend: true,
        outcome: () => Promise.reject(new Error('ACP connection closed')),
      })
    );

    const error = await acpPromptSession('session-1', prompt).catch((cause: unknown) => cause);

    expect((error as AcpConnectionLostError).recoveryPending).toBe(false);
  });

  it('sends on the recovered socket, never on one that closed before the prompt went out', async () => {
    const dead = fakeClient({ closedBeforeSend: true, outcome: () => Promise.resolve({}) });
    const live = fakeClient({ outcome: () => Promise.resolve({ stopReason: 'end_turn' }) });
    vi.mocked(getAcpClient).mockResolvedValueOnce(dead).mockResolvedValueOnce(live);

    await expect(acpPromptSession('session-1', prompt)).resolves.toEqual({
      stopReason: 'end_turn',
    });
    expect(dead.connection.agent.request).not.toHaveBeenCalled();
    expect(live.connection.agent.request).toHaveBeenCalledTimes(1);
  });

  it('passes other prompt failures through unchanged', async () => {
    const failure = new Error('provider exploded');
    vi.mocked(getAcpClient).mockResolvedValue(
      fakeClient({ outcome: () => Promise.reject(failure) })
    );

    await expect(acpPromptSession('session-1', prompt)).rejects.toBe(failure);
  });
});

describe('messageToAcpPromptContent', () => {
  it('converts text and image content into ACP prompt blocks', () => {
    const message: Message = {
      id: 'message-1',
      role: 'user',
      created: 123,
      content: [
        { type: 'text', text: 'Describe this' },
        {
          type: 'image',
          data: 'abc123',
          mimeType: 'image/png',
          _meta: { source: 'acp' },
          annotations: { priority: 0.5 },
        },
      ],
      metadata: { userVisible: true, agentVisible: true },
    };

    expect(messageToAcpPromptContent(message)).toEqual([
      { type: 'text', text: 'Describe this' },
      {
        type: 'image',
        data: 'abc123',
        mimeType: 'image/png',
        _meta: { source: 'acp' },
        annotations: { priority: 0.5 },
      },
    ]);
  });

  it('omits empty text content and unsupported content blocks', () => {
    const message: Message = {
      id: 'message-1',
      role: 'user',
      created: 123,
      content: [
        { type: 'text', text: '   ' },
        {
          type: 'toolResponse',
          id: 'tool-1',
          toolResult: { status: 'success', value: [] },
        },
      ],
      metadata: { userVisible: true, agentVisible: true },
    } as Message;

    expect(messageToAcpPromptContent(message)).toEqual([]);
  });
});
