import { describe, expect, it } from 'vitest';
import { RequestError } from '@agentclientprotocol/sdk';
import {
  AUTH_REQUIRED_MESSAGE,
  classifyTurnError,
  formatAcpError,
  isRunReplayOverflowError,
  parseAcpCreditsExhaustedError,
} from '../errors';

describe('isRunReplayOverflowError', () => {
  it('recognises the refusal to re-attach an overflowed run', () => {
    expect(
      isRunReplayOverflowError(
        new RequestError(-32603, 'Internal error', {
          reason: 'active_run_replay_overflow',
          message: 'load it again after the run ends',
        })
      )
    ).toBe(true);
  });

  it('ignores other load failures', () => {
    expect(isRunReplayOverflowError(new RequestError(-32603, 'Internal error', 'boom'))).toBe(
      false
    );
    expect(isRunReplayOverflowError(new Error('ACP connection closed'))).toBe(false);
  });
});

describe('formatAcpError', () => {
  it('explains how to recover from an authentication error', () => {
    expect(formatAcpError(RequestError.authRequired())).toBe(
      'Sign in to your provider, then try again.'
    );
  });
});

describe('parseAcpCreditsExhaustedError', () => {
  it('parses structured ACP credits exhausted errors', () => {
    expect(
      parseAcpCreditsExhaustedError({
        code: -32603,
        message: 'Please add credits to your account, then resend your message to continue.',
        data: {
          reason: 'credits_exhausted',
          url: 'https://router.tetrate.ai/billing',
        },
      })
    ).toEqual({
      message: 'Please add credits to your account, then resend your message to continue.',
      url: 'https://router.tetrate.ai/billing',
    });
  });

  it('parses wrapped JSON-RPC errors', () => {
    expect(
      parseAcpCreditsExhaustedError({
        error: {
          code: -32603,
          message: 'Add credits to continue.',
          data: {
            reason: 'credits_exhausted',
          },
        },
      })
    ).toEqual({
      message: 'Add credits to continue.',
    });
  });

  it('ignores non-credits-exhausted errors', () => {
    expect(
      parseAcpCreditsExhaustedError({
        code: -32603,
        message: 'Something failed.',
        data: {
          reason: 'provider_error',
        },
      })
    ).toBeNull();
  });
});

describe('classifyTurnError', () => {
  it('classifies the formatAcpError auth sentence as auth', () => {
    expect(classifyTurnError(AUTH_REQUIRED_MESSAGE)).toEqual({
      kind: 'auth',
      detail: AUTH_REQUIRED_MESSAGE,
    });
  });

  it('classifies a credits_exhausted-shaped message as quota', () => {
    const message = 'Please add credits to your account (reason: credits_exhausted).';
    expect(classifyTurnError(message)).toEqual({ kind: 'quota', detail: message });
  });

  it('classifies a rate-limit message as quota', () => {
    const message = 'Rate limit reached for gpt-5.1 in organization on tokens per min (TPM).';
    expect(classifyTurnError(message)).toEqual({ kind: 'quota', detail: message });
  });

  it('classifies a stream-level rejection as network', () => {
    const message =
      'Error in agent response stream: Codex process has exited with code 1: ProcessTransport closed';
    expect(classifyTurnError(message)).toEqual({ kind: 'network', detail: message });
  });

  it('classifies an ECONNRESET message as network', () => {
    const message = 'ECONNRESET: the connection to claude-agent-acp closed after 41s.';
    expect(classifyTurnError(message)).toEqual({ kind: 'network', detail: message });
  });

  it('falls back to other for an unrecognized message', () => {
    const message = 'The model declined to continue.';
    expect(classifyTurnError(message)).toEqual({ kind: 'other', detail: message });
  });

  it('trims the message before classifying and reporting the detail', () => {
    expect(classifyTurnError(`  ${AUTH_REQUIRED_MESSAGE}  `)).toEqual({
      kind: 'auth',
      detail: AUTH_REQUIRED_MESSAGE,
    });
  });
});
