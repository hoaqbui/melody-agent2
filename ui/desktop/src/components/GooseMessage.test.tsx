import { render, screen } from '@testing-library/react';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { Message, ToolRequestMessageContent } from '../types/message';
import type { ToolRenderState } from './messageRowContext';
import { IntlTestWrapper } from '../i18n/test-utils';
import GooseMessage from './GooseMessage';

// Radix Tooltip positioning (floating-ui) needs ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

vi.mock('./ui/icons', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    Copy: () => <div data-testid="copy-icon">📋</div>,
  };
});

const createMessage = (content: Message['content']): Message => ({
  id: 'test-message',
  role: 'assistant',
  created: Math.floor(Date.now() / 1000),
  content,
  metadata: {
    userVisible: true,
    agentVisible: true,
  },
});

describe('GooseMessage', () => {
  describe('copy with tool calls', () => {
    it('shows copy link when message has text and tool calls', async () => {
      const toolRequest: ToolRequestMessageContent = {
        type: 'toolRequest',
        id: 'tool-1',
        toolCall: {
          status: 'success',
          value: {
            name: 'developer__shell',
            arguments: {
              command: 'echo hello',
            },
          },
        },
      };

      const message = createMessage([
        {
          type: 'text',
          text: 'Here is the result:',
        },
        toolRequest,
      ]);

      const toolState: ToolRenderState = {
        requestId: 'tool-1',
        response: undefined,
        isPending: false,
        confirmation: undefined,
        confirmationDiff: undefined,
      };

      render(
        <GooseMessage
          sessionId="test-session"
          message={message}
          hideTimestamp={false}
          toolStates={[toolState]}
          toolNotifications={[undefined]}
          toolConfirmationShownInline={false}
          append={() => {}}
          isStreaming={false}
          submitElicitationResponse={undefined}
        />,
        { wrapper: IntlTestWrapper }
      );

      // The copy link should be visible even when there are tool calls
      const copyButton = await screen.findByRole('button', { name: /copy/i });
      expect(copyButton).toBeInTheDocument();
    });
  });
});
