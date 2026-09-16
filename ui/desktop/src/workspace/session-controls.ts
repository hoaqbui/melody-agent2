// Runtime and Mode as data (PRD steps 2-3, 9). Pure: the shell reads the session
// snapshot and calls these; nothing here talks ACP.

import type { Message } from '../types/message';
import type { ProviderDetails } from '../types/providers';
import type { Session } from '../types/session';

export interface Runtime {
  id: string;
  label: string;
}

// PRODUCT.md §5: the four subscription runtimes, by Goose provider id. Everything else
// the server lists is reachable under "More…" — the list is the ACP provider option's.
export const RUNTIMES: readonly Runtime[] = [
  { id: 'claude-acp', label: 'Claude' },
  { id: 'codex-acp', label: 'Codex' },
  { id: 'cursor-acp', label: 'Cursor' },
  { id: 'agy', label: 'agy' },
];

export function runtimeLabel(providerId: string, providers: readonly ProviderDetails[]): string {
  return (
    RUNTIMES.find((runtime) => runtime.id === providerId)?.label ??
    providers.find((provider) => provider.name === providerId)?.metadata.display_name ??
    providerId
  );
}

export function moreRuntimes(providers: readonly ProviderDetails[]): Runtime[] {
  const fixed = new Set(RUNTIMES.map((runtime) => runtime.id));
  return providers
    .filter((provider) => provider.is_configured && !fixed.has(provider.name))
    .map((provider) => ({ id: provider.name, label: provider.metadata.display_name }));
}

// An ACP adapter's `is_available` is whether its binary resolves; an API-key provider
// with no entry is unknown and is not blocked here.
export function needsInstall(providerId: string, providers: readonly ProviderDetails[]): boolean {
  const provider = providers.find((candidate) => candidate.name === providerId);
  return provider !== undefined && provider.uses_acp && !provider.is_available;
}

export type Mode = 'direct' | 'orchestrate';

export const ORCHESTRATOR_ROLE = 'orchestrator';
export const ORCHESTRATOR_RECIPE_TITLE = 'Orchestrator';

// Orchestrate is decided at session/new (the role body rides as recipe instructions,
// spine-bridge plan §Approach), so the session's recipe is the mode of record.
export function modeOfSession(session: Pick<Session, 'recipe'> | undefined): Mode {
  return session?.recipe?.title === ORCHESTRATOR_RECIPE_TITLE ? 'orchestrate' : 'direct';
}

export function orchestratorRecipe(role: { description: string; content: string }) {
  return {
    title: ORCHESTRATOR_RECIPE_TITLE,
    description: role.description,
    instructions: role.content,
  };
}

export type Stop = 'easy' | 'medium' | 'hard';

export const STOPS: readonly Stop[] = ['easy', 'medium', 'hard'];

export interface StopTriple {
  provider: string;
  // The stop's model is whichever the adapter lists that matches; ids are adapter data.
  modelMatch: RegExp;
  mode: Mode;
}

// The lever's one table (task 58): a stop is a (provider, model, mode) triple.
export const LEVER: Record<Stop, StopTriple> = {
  easy: { provider: 'claude-acp', modelMatch: /sonnet/i, mode: 'direct' },
  medium: { provider: 'claude-acp', modelMatch: /opus/i, mode: 'direct' },
  hard: { provider: 'claude-code', modelMatch: /opus/i, mode: 'orchestrate' },
};

export function stopModel(
  stop: Stop,
  choices: readonly { value: string; name: string }[]
): string | undefined {
  const { modelMatch } = LEVER[stop];
  return choices.find((choice) => modelMatch.test(choice.value) || modelMatch.test(choice.name))
    ?.value;
}

// The stop whose triple the session matches; Custom when none does (Advanced left it
// somewhere the lever cannot name).
export function stopOfSession(
  session: Pick<Session, 'provider_name' | 'model_config' | 'recipe'>
): Stop | 'custom' {
  const mode = modeOfSession(session);
  const model = session.model_config?.model_name ?? '';
  return (
    STOPS.find((stop) => {
      const triple = LEVER[stop];
      return (
        triple.provider === session.provider_name &&
        triple.mode === mode &&
        triple.modelMatch.test(model)
      );
    }) ?? 'custom'
  );
}

// A client-side marker in the message list (PRD step 9); the handoff memo itself is
// the server's on the next prompt.
export function runtimeDividerMessage(id: string, text: string): Message {
  return {
    id,
    role: 'assistant',
    created: Math.floor(Date.now() / 1000),
    content: [{ type: 'systemNotification', notificationType: 'inlineMessage', msg: text }],
    metadata: { userVisible: true, agentVisible: false },
  };
}
