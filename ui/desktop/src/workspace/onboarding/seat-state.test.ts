import { describe, expect, it } from 'vitest';
import type { RuntimesProbeResponse } from '../../native/runtimes.js';
import { seatState, overallGateState } from './seat-state.js';

describe('seatState', () => {
  it('marks seats as ready when installed and signed in', () => {
    const probe: RuntimesProbeResponse = {
      seat: {
        claude: { installed: true, signedIn: true, detail: 'user@example.com' },
        codex: { installed: true, signedIn: true, detail: 'openai user' },
        cursor: { installed: true, signedIn: true, detail: 'cursor@example.com' },
        agy: { installed: true, signedIn: true, detail: 'model list' },
      },
    };

    const states = seatState(probe);

    expect(states.claude.state).toBe('ready');
    expect(states.codex.state).toBe('ready');
    expect(states.cursor.state).toBe('ready');
    expect(states.agy.state).toBe('ready');

    expect(states.claude.detail).toBe('user@example.com');
    expect(states.codex.detail).toBe('openai user');
  });

  it('marks seats as install when not installed', () => {
    const probe: RuntimesProbeResponse = {
      seat: {
        claude: { installed: false, signedIn: false },
        codex: { installed: false, signedIn: false },
        cursor: { installed: false, signedIn: false },
        agy: { installed: false, signedIn: false },
      },
    };

    const states = seatState(probe);

    expect(states.claude.state).toBe('install');
    expect(states.codex.state).toBe('install');
    expect(states.cursor.state).toBe('install');
    expect(states.agy.state).toBe('install');
  });

  it('marks seats as signin when installed but not signed in', () => {
    const probe: RuntimesProbeResponse = {
      seat: {
        claude: { installed: true, signedIn: false, detail: 'not logged in' },
        codex: { installed: true, signedIn: false, detail: 'not authenticated' },
        cursor: { installed: true, signedIn: false, detail: 'please sign in' },
        agy: { installed: true, signedIn: false, detail: 'auth required' },
      },
    };

    const states = seatState(probe);

    expect(states.claude.state).toBe('signin');
    expect(states.codex.state).toBe('signin');
    expect(states.cursor.state).toBe('signin');
    expect(states.agy.state).toBe('signin');

    expect(states.claude.detail).toBe('not logged in');
    expect(states.codex.detail).toBe('not authenticated');
  });

  it('handles mixed states', () => {
    const probe: RuntimesProbeResponse = {
      seat: {
        claude: { installed: true, signedIn: true, detail: 'user@anthropic.com' },
        codex: { installed: false, signedIn: false },
        cursor: { installed: true, signedIn: false, detail: 'not signed in' },
        agy: { installed: true, signedIn: true, detail: 'ready' },
      },
    };

    const states = seatState(probe);

    expect(states.claude.state).toBe('ready');
    expect(states.codex.state).toBe('install');
    expect(states.cursor.state).toBe('signin');
    expect(states.agy.state).toBe('ready');
  });

  it('preserves detail when present', () => {
    const probe: RuntimesProbeResponse = {
      seat: {
        claude: { installed: true, signedIn: true, detail: 'email@example.com' },
        codex: { installed: true, signedIn: false, detail: 'auth error' },
        cursor: { installed: false, signedIn: false },
        agy: { installed: true, signedIn: true },
      },
    };

    const states = seatState(probe);

    expect(states.claude.detail).toBe('email@example.com');
    expect(states.codex.detail).toBe('auth error');
    expect(states.cursor.detail).toBeUndefined();
    expect(states.agy.detail).toBeUndefined();
  });
});

describe('overallGateState', () => {
  it('returns ready when all seats are ready', () => {
    const states = {
      claude: { state: 'ready' as const },
      codex: { state: 'ready' as const },
      cursor: { state: 'ready' as const },
      agy: { state: 'ready' as const },
    };

    expect(overallGateState(states)).toBe('ready');
  });

  it('returns partial when some seats are ready', () => {
    const states = {
      claude: { state: 'ready' as const },
      codex: { state: 'install' as const },
      cursor: { state: 'signin' as const },
      agy: { state: 'ready' as const },
    };

    expect(overallGateState(states)).toBe('partial');
  });

  it('returns unavailable when no seats are ready', () => {
    const states = {
      claude: { state: 'install' as const },
      codex: { state: 'signin' as const },
      cursor: { state: 'install' as const },
      agy: { state: 'signin' as const },
    };

    expect(overallGateState(states)).toBe('unavailable');
  });

  it('returns partial when at least one is ready', () => {
    const states = {
      claude: { state: 'ready' as const },
      codex: { state: 'install' as const },
      cursor: { state: 'install' as const },
      agy: { state: 'install' as const },
    };

    expect(overallGateState(states)).toBe('partial');
  });
});
