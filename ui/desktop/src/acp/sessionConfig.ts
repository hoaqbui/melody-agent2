// The ACP session config options (provider, mode, model, thinking_effort — whatever the
// server publishes), kept per session for the workspace's Session controls (task 58).
// Fed from session/new, session/load, set_config_option and the config_option_update
// notification; the workspace reads them here and never imports the SDK.

import { useSyncExternalStore } from 'react';
import { methods, type SessionConfigOption } from '@agentclientprotocol/sdk';
import { getAcpClient } from './acpConnection';

export type { SessionConfigOption };

const NO_OPTIONS: readonly SessionConfigOption[] = [];
const optionsBySession = new Map<string, readonly SessionConfigOption[]>();
const listeners = new Set<() => void>();

export function rememberSessionConfigOptions(
  sessionId: string,
  options: readonly SessionConfigOption[] | null | undefined
): void {
  if (!options) return;
  optionsBySession.set(sessionId, options);
  for (const listener of listeners) listener();
}

export function getSessionConfigOptions(sessionId: string): readonly SessionConfigOption[] {
  return optionsBySession.get(sessionId) ?? NO_OPTIONS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionConfigOptions(sessionId: string): readonly SessionConfigOption[] {
  return useSyncExternalStore(
    subscribe,
    () => getSessionConfigOptions(sessionId),
    () => getSessionConfigOptions(sessionId)
  );
}

export interface ConfigChoice {
  value: string;
  name: string;
}

// A select option's values, groups flattened; a boolean option has none.
export function configChoices(option: SessionConfigOption): ConfigChoice[] {
  if (option.type !== 'select') return [];
  return option.options.flatMap((entry) =>
    'options' in entry
      ? entry.options.map(({ value, name }) => ({ value, name }))
      : [{ value: entry.value, name: entry.name }]
  );
}

export function selectedConfigValue(
  options: readonly SessionConfigOption[],
  configId: string
): string | undefined {
  const option = options.find((candidate) => candidate.id === configId);
  return option?.type === 'select' ? option.currentValue : undefined;
}

export async function acpSetSessionConfigOption(
  sessionId: string,
  configId: string,
  value: string
): Promise<readonly SessionConfigOption[]> {
  const client = await getAcpClient();
  const response = await client.connection.agent.request(methods.agent.session.setConfigOption, {
    sessionId,
    configId,
    value,
  });
  rememberSessionConfigOptions(sessionId, response.configOptions);
  return response.configOptions;
}
