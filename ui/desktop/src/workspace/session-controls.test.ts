import { describe, expect, it } from 'vitest';
import type { ProviderDetails } from '../types/providers';
import {
  modeOfSession,
  moreRuntimes,
  needsInstall,
  orchestratorRecipe,
  runtimeDividerMessage,
  runtimeLabel,
  RUNTIMES,
} from './session-controls';

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
    uses_acp: false,
    metadata: {
      name,
      display_name: name.toUpperCase(),
      description: '',
      default_model: '',
      model_doc_link: '',
      config_keys: [],
      known_models: [],
    },
    ...overrides,
  };
}

describe('session controls', () => {
  it('labels the four runtimes by name and everything else by the provider display name', () => {
    expect(RUNTIMES.map((runtime) => runtime.label)).toEqual(['Claude', 'Codex', 'Cursor', 'agy']);
    expect(runtimeLabel('codex-acp', [])).toBe('Codex');
    expect(runtimeLabel('openai', [provider('openai')])).toBe('OPENAI');
    expect(runtimeLabel('unknown', [])).toBe('unknown');
  });

  it('lists configured providers outside the four under More', () => {
    const listed = moreRuntimes([
      provider('claude-acp'),
      provider('openai'),
      provider('anthropic', { is_configured: false }),
    ]);
    expect(listed).toEqual([{ id: 'openai', label: 'OPENAI' }]);
  });

  it('marks an adapter whose binary is missing as needing install', () => {
    const providers = [
      provider('codex-acp', { uses_acp: true, is_available: false }),
      provider('claude-acp', { uses_acp: true, is_available: true }),
      provider('openai', { is_available: false }),
    ];
    expect(needsInstall('codex-acp', providers)).toBe(true);
    expect(needsInstall('claude-acp', providers)).toBe(false);
    expect(needsInstall('openai', providers)).toBe(false);
    expect(needsInstall('agy', providers)).toBe(false);
  });

  it('reads the mode off the session recipe', () => {
    expect(modeOfSession(undefined)).toBe('direct');
    expect(modeOfSession({ recipe: null })).toBe('direct');
    expect(modeOfSession({ recipe: { title: 'Orchestrator', description: '' } })).toBe(
      'orchestrate'
    );
  });

  it('turns the role body into recipe instructions', () => {
    expect(orchestratorRecipe({ description: 'owns the objective', content: '# Body' })).toEqual({
      title: 'Orchestrator',
      description: 'owns the objective',
      instructions: '# Body',
    });
  });

  it('builds a user-visible, agent-invisible divider', () => {
    const message = runtimeDividerMessage('id-1', '→ Codex from here');
    expect(message.metadata).toEqual({ userVisible: true, agentVisible: false });
    expect(message.content).toEqual([
      { type: 'systemNotification', notificationType: 'inlineMessage', msg: '→ Codex from here' },
    ]);
  });
});
