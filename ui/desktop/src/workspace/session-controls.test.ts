import { describe, expect, it } from 'vitest';
import type { ProviderDetails } from '../types/providers';
import {
  modeOfSession,
  moreRuntimes,
  needsInstall,
  orchestratorRecipe,
  PLAN_GATE_LINE,
  parseReviewTitle,
  reviewPrompt,
  reviewTitle,
  reviewerRecipe,
  roleRuntimes,
  runtimeDividerMessage,
  runtimeLabel,
  stopModel,
  stopOfSession,
  LEVER,
  RUNTIMES,
  STOPS,
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
    expect(
      orchestratorRecipe({ description: 'owns the objective', content: '# Body' }, false)
    ).toEqual({
      title: 'Orchestrator',
      description: 'owns the objective',
      instructions: '# Body',
    });
  });

  describe('plan gate', () => {
    it('appends the gate line to the orchestrator recipe when on', () => {
      const recipe = orchestratorRecipe(
        { description: 'owns the objective', content: '# Body' },
        true
      );
      expect(recipe.instructions).toBe(`# Body\n\n${PLAN_GATE_LINE}`);
      expect(PLAN_GATE_LINE).toContain('end your turn after the Planner');
    });

    it('leaves the recipe alone when off', () => {
      const recipe = orchestratorRecipe(
        { description: 'owns the objective', content: '# Body' },
        false
      );
      expect(recipe.instructions).toBe('# Body');
    });
  });

  it('maps the three stops to their triples', () => {
    expect(STOPS).toEqual(['easy', 'medium', 'hard']);
    expect(STOPS.map((stop) => [LEVER[stop].provider, LEVER[stop].mode])).toEqual([
      ['claude-acp', 'direct'],
      ['claude-acp', 'direct'],
      ['claude-code', 'orchestrate'],
    ]);
    const choices = [
      { value: 'default', name: 'Default' },
      { value: 'claude-sonnet-5', name: 'Sonnet' },
      { value: 'opus[1m]', name: 'Opus 1M' },
    ];
    expect(stopModel('easy', choices)).toBe('claude-sonnet-5');
    expect(stopModel('medium', choices)).toBe('opus[1m]');
    expect(stopModel('hard', choices)).toBe('opus[1m]');
    // The claude CLI lists no models: Hard takes the sole one rather than reading Custom.
    expect(stopModel('hard', [{ value: 'default', name: 'Default' }])).toBe('default');
    expect(stopModel('easy', [{ value: 'default', name: 'Default' }])).toBeUndefined();
    expect(
      stopOfSession({
        provider_name: 'claude-code',
        model_config: { model_name: 'default' },
        recipe: { title: 'Orchestrator' },
      } as never)
    ).toBe('hard');
  });

  it('reads the stop off the session and Custom off anything else', () => {
    const orchestrator = { title: 'Orchestrator', description: '' };
    const session = (provider: string, model: string, recipe: typeof orchestrator | null) => ({
      provider_name: provider,
      model_config: { model_name: model, toolshim: false },
      recipe,
    });
    expect(stopOfSession(session('claude-acp', 'claude-sonnet-5', null))).toBe('easy');
    expect(stopOfSession(session('claude-acp', 'opus[1m]', null))).toBe('medium');
    expect(stopOfSession(session('claude-code', 'claude-opus-5', orchestrator))).toBe('hard');
    expect(stopOfSession(session('claude-code', 'claude-opus-5', null))).toBe('custom');
    expect(stopOfSession(session('claude-acp', 'opus[1m]', orchestrator))).toBe('custom');
    expect(stopOfSession(session('codex-acp', 'gpt-5', null))).toBe('custom');
    expect(stopOfSession({ provider_name: 'claude-acp', model_config: null, recipe: null })).toBe(
      'custom'
    );
  });

  it('builds a user-visible, agent-invisible divider', () => {
    const message = runtimeDividerMessage('id-1', '→ Codex from here');
    expect(message.metadata).toEqual({ userVisible: true, agentVisible: false });
    expect(message.content).toEqual([
      { type: 'systemNotification', notificationType: 'inlineMessage', msg: '→ Codex from here' },
    ]);
  });

  it("reads a role's runtimes from its source properties, a missing weight as 0", () => {
    expect(roleRuntimes({})).toEqual([]);
    expect(roleRuntimes({ properties: { runtimes: 'x' } })).toEqual([]);
    expect(
      roleRuntimes({
        properties: {
          runtimes: [
            { provider: 'codex-acp', model: 'gpt-5.6-sol', weight: 9 },
            { provider: 'cursor-acp', model: 'cursor-grok-4.6-high' },
            { provider: 3 },
          ],
        },
      })
    ).toEqual([
      { provider: 'codex-acp', model: 'gpt-5.6-sol', weight: 9 },
      { provider: 'cursor-acp', model: 'cursor-grok-4.6-high', weight: 0 },
    ]);
  });

  it('tags the review session in its title and reads the tag back', () => {
    expect(reviewTitle('wt/wt-20260916-ab12', 'main')).toBe('Review: wt/wt-20260916-ab12 vs main');
    expect(parseReviewTitle('Review: wt/wt-20260916-ab12 vs main')).toEqual({
      branch: 'wt/wt-20260916-ab12',
      base: 'main',
    });
    expect(parseReviewTitle('Review: a vs b vs c')).toEqual({ branch: 'a vs b', base: 'c' });
    expect(parseReviewTitle('Reviewer')).toBeNull();
    expect(parseReviewTitle('Review: nothing')).toBeNull();
    expect(parseReviewTitle('Review:  vs main')).toBeNull();
  });

  it('builds the reviewer recipe on the rolled seat, and the first prompt apart from it', () => {
    const role = { description: 'Judges a diff', content: '# Reviewer' };
    const seat = { provider: 'codex-acp', model: 'gpt-5.6-sol' };
    expect(reviewerRecipe(role, seat)).toEqual({
      title: 'Reviewer',
      description: 'Judges a diff',
      instructions: '# Reviewer',
      settings: { goose_provider: 'codex-acp', goose_model: 'gpt-5.6-sol' },
    });
    expect(reviewPrompt('wt/x', 'main', '/repo')).toBe(
      'Review the diff of `wt/x` against `main` in `/repo`: run `git diff main...HEAD`, ' +
        'judge it against `docs/` plans and `tasks.md`, return the Return shape.'
    );
  });
});
