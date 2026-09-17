import { describe, expect, it } from 'vitest';
import type { ProviderDetails } from '../../../types/providers';
import { REVIEW_PANE_STATES, paneState, reviewRows, rollRuntime } from './review-state';

function provider(
  name: string,
  overrides: Partial<Pick<ProviderDetails, 'is_available' | 'is_configured' | 'uses_acp'>> = {}
): ProviderDetails {
  return {
    name,
    is_configured: true,
    is_available: true,
    visible_in_setup: true,
    deprecated: false,
    provider_type: 'builtin' as ProviderDetails['provider_type'],
    uses_acp: true,
    metadata: {
      name,
      display_name: name,
      description: '',
      default_model: '',
      model_doc_link: '',
      config_keys: [],
      known_models: [],
    },
    ...overrides,
  };
}

// The Reviewer role's seats as `.agents/agents/reviewer.md` lists them.
const SEATS = [
  { provider: 'codex-acp', model: 'gpt-5.6-sol', weight: 9 },
  { provider: 'cursor-acp', model: 'cursor-grok-4.6-high', weight: 1 },
];

describe('review state', () => {
  it('rolls by weight among the installed seats', () => {
    const providers = [provider('codex-acp'), provider('cursor-acp')];
    expect(rollRuntime(SEATS, providers, () => 0)?.provider).toBe('codex-acp');
    expect(rollRuntime(SEATS, providers, () => 0.89)?.provider).toBe('codex-acp');
    expect(rollRuntime(SEATS, providers, () => 0.9)?.provider).toBe('cursor-acp');
    expect(rollRuntime(SEATS, providers, () => 0.999)?.provider).toBe('cursor-acp');
  });

  it('drops a seat whose adapter is not installed, and falls over to weight 0', () => {
    const providers = [provider('codex-acp', { is_available: false }), provider('cursor-acp')];
    expect(rollRuntime(SEATS, providers, () => 0)?.provider).toBe('cursor-acp');
    expect(
      rollRuntime(
        [
          { provider: 'codex-acp', model: 'a', weight: 0 },
          { provider: 'cursor-acp', model: 'b', weight: 0 },
        ],
        providers
      )?.provider
    ).toBe('cursor-acp');
    expect(
      rollRuntime(SEATS, [
        provider('codex-acp', { is_available: false }),
        provider('cursor-acp', { is_available: false }),
      ])
    ).toBeNull();
    expect(rollRuntime([], providers)).toBeNull();
  });

  it("lists the cwd's tagged sessions newest first and reads branch, base and runtime", () => {
    const rows = reviewRows(
      [
        { id: 'a', name: 'Review: wt/x vs main', workingDir: '/r', createdAt: '2026-09-16T01' },
        { id: 'b', name: 'Chat', workingDir: '/r', createdAt: '2026-09-16T02' },
        { id: 'c', name: 'Review: wt/x vs main', workingDir: '/other', createdAt: '2026-09-16T03' },
        {
          id: 'd',
          name: 'Review: wt/y vs main',
          workingDir: '/r',
          createdAt: '2026-09-16T04',
          providerId: 'codex-acp',
          modelId: 'gpt-5.6-sol',
        },
      ],
      '/r'
    );
    expect(rows).toEqual([
      {
        id: 'd',
        branch: 'wt/y',
        base: 'main',
        createdAt: '2026-09-16T04',
        provider: 'codex-acp',
        model: 'gpt-5.6-sol',
      },
      {
        id: 'a',
        branch: 'wt/x',
        base: 'main',
        createdAt: '2026-09-16T01',
        provider: undefined,
        model: undefined,
      },
    ]);
  });

  it('names the pane state per DESIGN.md', () => {
    expect(REVIEW_PANE_STATES).toEqual(['empty', 'loading', 'partial', 'error', 'ready']);
    const read = { streaming: false, text: '# Review', parsed: true, error: null };
    expect(paneState(undefined, false)).toBe('empty');
    expect(paneState(undefined, true)).toBe('loading');
    expect(paneState({ ...read, streaming: true }, true)).toBe('loading');
    expect(paneState({ ...read, text: null, parsed: false }, true)).toBe('partial');
    expect(paneState({ ...read, error: 'quota' }, true)).toBe('error');
    expect(paneState({ ...read, parsed: false }, true)).toBe('partial');
    expect(paneState(read, true)).toBe('ready');
  });
});
