// The delegations a session started — which runtime each child runs on and
// how it ended — kept per parent session, keyed by the child session id
// (task 65). Seeded from the `session/children` read when a session loads
// (`sessions.ts`) and updated live by `delegation_update` notifications
// (`chatNotifications.ts`); the workspace's Agents pane reads them here and
// never imports the SDK.

import { useSyncExternalStore } from 'react';
import type { DelegationStatus, DelegationUpdate } from '@aaif/goose-acp-client';

export type { DelegationStatus };

// What a child session record carries (a `SessionListItem` fits).
export interface DelegatedChild {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  providerId?: string;
  modelId?: string;
}

export interface Delegation {
  subagentSessionId: string;
  parentSessionId: string;
  source?: string;
  provider?: string;
  model?: string;
  title: string;
  // Only a live event carries a status; a row seeded from the session record
  // has none rather than one inferred from message counts.
  status?: DelegationStatus;
  error?: string;
  parentToolCallId?: string;
  updatedAt?: string;
}

const NO_DELEGATIONS: readonly Delegation[] = [];
// Oldest first; a live event for a known child replaces its row in place.
const delegationsByParent = new Map<string, readonly Delegation[]>();
const listeners = new Set<() => void>();
// Fed the raw event, not the rows: the notifications module (task 68) wants to know that a
// child just ended, which the rows alone cannot tell from a seed.
const updateListeners = new Set<(update: DelegationUpdate) => void>();

function publish(parentSessionId: string, rows: readonly Delegation[]): void {
  delegationsByParent.set(parentSessionId, rows);
  for (const listener of listeners) listener();
}

function upsert(rows: readonly Delegation[], row: Delegation): Delegation[] {
  const index = rows.findIndex((entry) => entry.subagentSessionId === row.subagentSessionId);
  if (index === -1) return [...rows, row];
  const next = [...rows];
  next[index] = row;
  return next;
}

export function applyDelegationUpdate(update: DelegationUpdate): void {
  const rows = getSessionDelegations(update.parentSessionId);
  const known = rows.find((entry) => entry.subagentSessionId === update.subagentSessionId);
  publish(
    update.parentSessionId,
    upsert(rows, {
      ...known,
      subagentSessionId: update.subagentSessionId,
      parentSessionId: update.parentSessionId,
      source: update.source ?? known?.source,
      provider: update.provider,
      model: update.model,
      title: update.title,
      status: update.status,
      error: update.error ?? undefined,
      parentToolCallId: update.parentToolCallId ?? known?.parentToolCallId,
    })
  );
  for (const listener of updateListeners) listener(update);
}

export function subscribeDelegationUpdates(
  listener: (update: DelegationUpdate) => void
): () => void {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}

// The children read carries no status, so a status a live event already
// delivered for the same child survives the seed.
export function rememberSessionChildren(
  parentSessionId: string,
  children: readonly DelegatedChild[]
): void {
  const known = new Map(
    getSessionDelegations(parentSessionId).map((row) => [row.subagentSessionId, row])
  );
  const seeded = [...children]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((child): Delegation => {
      const live = known.get(child.id);
      return {
        ...live,
        subagentSessionId: child.id,
        parentSessionId,
        provider: child.providerId ?? live?.provider,
        model: child.modelId ?? live?.model,
        title: live?.title ?? child.name,
        updatedAt: child.updatedAt,
      };
    });
  const seededIds = new Set(seeded.map((row) => row.subagentSessionId));
  const liveOnly = getSessionDelegations(parentSessionId).filter(
    (row) => !seededIds.has(row.subagentSessionId)
  );
  publish(parentSessionId, [...seeded, ...liveOnly]);
}

export function getSessionDelegations(parentSessionId: string): readonly Delegation[] {
  return delegationsByParent.get(parentSessionId) ?? NO_DELEGATIONS;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionDelegations(parentSessionId: string): readonly Delegation[] {
  return useSyncExternalStore(
    subscribe,
    () => getSessionDelegations(parentSessionId),
    () => getSessionDelegations(parentSessionId)
  );
}
