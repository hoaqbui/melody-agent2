import { describe, expect, it, vi } from 'vitest';
import type { Message } from '../../types/message';
import { getAcpClient } from '../acpConnection';
import { isAcpConnectionLost } from '../errors';
import type { GooseAcpClient } from '../gooseAcpClient';
import { acpPromptSession, messageToAcpPromptContent } from '../prompt';

vi.mock('../acpConnection', () => ({
  getAcpClient: vi.fn(),
}));

function clientRejectingPrompt(error: Error, socketClosed: boolean): GooseAcpClient {
  const controller = new AbortController();
  if (socketClosed) {
    controller.abort(error);
  }
  return {
    connection: {
      signal: controller.signal,
      agent: { request: vi.fn().mockRejectedValue(error) },
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
  it('reports a prompt lost with its socket as a lost connection', async () => {
    const closed = new Error('ACP connection closed');
    vi.mocked(getAcpClient).mockResolvedValue(clientRejectingPrompt(closed, true));

    const error = await acpPromptSession('session-1', prompt).catch((cause: unknown) => cause);

    expect(isAcpConnectionLost(error)).toBe(true);
    expect((error as Error).cause).toBe(closed);
  });

  it('passes other prompt failures through unchanged', async () => {
    const failure = new Error('provider exploded');
    vi.mocked(getAcpClient).mockResolvedValue(clientRejectingPrompt(failure, false));

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
