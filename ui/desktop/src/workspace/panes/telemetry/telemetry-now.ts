// The Now view's pure state (task 129): what the open session runs on, and one row per turn —
// the model that answered it — with the workers nested under the turn that delegated them
// and the outcome the ledger recorded. No React, no ACP.

import type { Delegation } from '../../../acp/delegations';
import type { LedgerEvent } from '../../../native/ledger';
import type { TokenState } from '../../../types/chat';
import type { Message } from '../../../types/message';
import type { Session } from '../../../types/session';
import { runtimeLabel } from '../../session-controls';
import type { ProviderDetails } from '../../../types/providers';
import { getToolRequests } from '../../../types/message';
import { fmtK } from './charts';
import { jobsOf, outcomeOf } from './ledger-outcome';

export { fmtK };

export interface Setting {
  id: string;
  label: string;
  value: string;
  // The machine text under the value (an id, a key), mono.
  detail: string;
}

// The one place a provider id and the permission gate show on the default surface
// (DESIGN.md: Telemetry is a Diagnostics-tier surface).
export function sessionSettings(
  session: Session | undefined,
  providers: readonly ProviderDetails[],
  thinkingEffort: string | undefined,
  tokens: TokenState | undefined
): Setting[] {
  if (!session) return [];
  const providerId = session.provider_name ?? '';
  const model = session.model_config?.model_name ?? '';
  const used = tokens?.totalTokens ?? session.usage?.total_tokens ?? 0;
  const limit = tokens?.contextLimit ?? session.model_config?.context_limit ?? undefined;
  return [
    {
      id: 'runtime',
      label: 'Runtime',
      value: runtimeLabel(providerId, providers),
      detail: providerId,
    },
    { id: 'model', label: 'Model', value: shortModel(model), detail: model },
    {
      id: 'effort',
      label: 'Thinking effort',
      value: thinkingEffort ?? '—',
      detail: 'thinking_effort',
    },
    {
      id: 'gate',
      label: 'Permission gate',
      value: gateWord(session.goose_mode),
      detail: `GOOSE_MODE=${session.goose_mode ?? 'auto'}`,
    },
    {
      id: 'context',
      label: 'Context',
      value: limit ? `${fmtK(used)} / ${fmtK(limit)}` : fmtK(used),
      detail: limit
        ? `${Math.round((used / limit) * 100)}% of context_limit`
        : 'context_limit unknown',
    },
  ];
}

const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

// The model's short name for the value line: the id stays beneath it in mono.
export function shortModel(id: string): string {
  const m = /(opus|sonnet|haiku|fable|astra|sol|flash|pro|grok)/i.exec(id);
  return m ? capitalize(m[1].toLowerCase()) : id || '—';
}

// Upstream's words for its gate (`components/settings/mode/ModeSelectionItem.tsx`).
export function gateWord(mode: Session['goose_mode'] | undefined): string {
  switch (mode) {
    case 'approve':
      return 'Manual';
    case 'smart_approve':
      return 'Smart';
    case 'chat':
      return 'Chat only';
    default:
      return 'Autonomous';
  }
}

export const OUTCOMES = [
  'running',
  'landed',
  'reworked',
  'corrected',
  'blocked',
  'undone',
  'failed',
  'unknown',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface TurnRow {
  id: string;
  at: number;
  who: 'session' | 'worker';
  role?: string;
  provider: string;
  requestedModel: string;
  resolvedModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  elapsedMs?: number;
  timeToFirstTokenMs?: number;
  cost?: number;
  costSource?: 'provider_reported' | 'estimated';
  outcome: Outcome;
  workerSessionId?: string;
}

// A turn opens with a user message and runs until the next one; usage sits on its last
// assistant message. Returns the turn's user message id, its assistant messages, and the tool
// call ids it made — what a worker's `parentToolCallId` is matched against.
export function turnsOf(messages: readonly Message[]): {
  id: string;
  at: number;
  assistant: Message[];
  toolCallIds: Set<string>;
}[] {
  const turns: { id: string; at: number; assistant: Message[]; toolCallIds: Set<string> }[] = [];
  let current: (typeof turns)[number] | null = null;
  messages.forEach((message, index) => {
    if (message.role === 'user') {
      current = {
        id: message.id ?? `turn-${index}`,
        at: message.created,
        assistant: [],
        toolCallIds: new Set(),
      };
      turns.push(current);
      return;
    }
    if (!current) {
      current = { id: `turn-${index}`, at: message.created, assistant: [], toolCallIds: new Set() };
      turns.push(current);
    }
    current.assistant.push(message);
    for (const request of getToolRequests(message)) current.toolCallIds.add(request.id);
  });
  return turns;
}

export function turnRows(
  messages: readonly Message[],
  delegations: readonly Delegation[],
  events: readonly LedgerEvent[],
  streaming: boolean,
  now: number
): TurnRow[] {
  const undone = new Set(
    events.filter((e) => e.kind === 'undo').map((e) => (e as { turnId: string }).turnId)
  );
  // The job outcome fold (266): a worker row reads whatever the ledger decided for its job —
  // never landed just because DelegationUpdate says done.
  const jobs = jobsOf(events);
  const turns = turnsOf(messages);
  const rows: TurnRow[] = [];
  turns.forEach((turn, index) => {
    const last =
      [...turn.assistant].reverse().find((m) => m.metadata.usage) ??
      turn.assistant[turn.assistant.length - 1];
    const isLast = index === turns.length - 1;
    if (last) {
      const usage = last.metadata.usage ?? undefined;
      const inference = last.metadata.inference ?? undefined;
      rows.push({
        id: turn.id,
        at: last.created,
        who: 'session',
        provider: inference?.provider ?? '',
        requestedModel: inference?.requestedModel ?? '',
        resolvedModel: inference?.resolvedModel ?? undefined,
        inputTokens: usage?.inputTokens ?? undefined,
        outputTokens: usage?.outputTokens ?? undefined,
        cacheReadTokens: usage?.cacheReadTokens ?? undefined,
        elapsedMs: usage?.elapsedMs ?? undefined,
        timeToFirstTokenMs: usage?.timeToFirstTokenMs ?? undefined,
        cost: usage?.cost ?? undefined,
        costSource: usage?.costSource ?? undefined,
        outcome: isLast && streaming ? 'running' : undone.has(turn.id) ? 'undone' : 'landed',
      });
    } else if (isLast && streaming) {
      rows.push({
        id: turn.id,
        at: turn.at,
        who: 'session',
        provider: '',
        requestedModel: '',
        outcome: 'running',
      });
    }
    for (const delegation of delegations) {
      if (!delegation.parentToolCallId || !turn.toolCallIds.has(delegation.parentToolCallId))
        continue;
      const worker = delegation.subagentSessionId;
      const job = jobs.find((j) => j.workerSessionId === worker);
      rows.push({
        id: `worker:${worker}`,
        at: last?.created ?? turn.at,
        who: 'worker',
        role: delegation.source ?? 'ad hoc',
        provider: delegation.provider ?? '',
        requestedModel: delegation.model ?? '',
        outcome:
          delegation.status === 'failed'
            ? 'failed'
            : delegation.status !== 'done'
              ? 'running'
              : job
                ? outcomeOf(job, events, now).outcome
                : 'unknown',
        workerSessionId: worker,
      });
    }
  });
  return rows.reverse();
}
