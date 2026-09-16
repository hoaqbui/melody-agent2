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
