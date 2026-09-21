// The work ledger's client (task 127): the sidecar keeps one JSONL per repository under
// goose's state dir (`ui/sidecar/src/ledger.ts`); the renderer appends events as they happen
// and folds them for the Telemetry pane. Nothing here speaks ACP.

import { sidecarFetch } from './sidecar';

export const LEDGER_EVENT_KINDS = [
  'turn',
  'worker',
  'correction',
  'confirm',
  'review',
  'undo',
  'handoff',
] as const;
export type LedgerEventKind = (typeof LEDGER_EVENT_KINDS)[number];

export interface LedgerEventBase {
  at: string;
  kind: LedgerEventKind;
  sessionId: string;
}

// One reply from a model: the message carrying `metadata.usage` (one per turn).
export interface TurnEvent extends LedgerEventBase {
  kind: 'turn';
  messageId?: string;
  who: 'session' | 'worker';
  provider: string;
  requestedModel: string;
  resolvedModel?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cost?: number;
  costSource?: 'provider_reported' | 'estimated';
  elapsedMs?: number;
  timeToFirstTokenMs?: number;
}

// A delegated child returned.
export interface WorkerEvent extends LedgerEventBase {
  kind: 'worker';
  workerSessionId: string;
  source?: string;
  provider?: string;
  model?: string;
  status: 'done' | 'failed';
  error?: string;
  // The child answered BLOCKED (the Implementer's contract) — Done on the wire, not clean.
  blocked: boolean;
  // Paths under the return's `## Files Changed`; what a later session edit is checked against.
  filesChanged: string[];
  parentToolCallId?: string;
}

// The session edited a file a worker had returned as changed.
export interface CorrectionEvent extends LedgerEventBase {
  kind: 'correction';
  workerSessionId: string;
  path: string;
  toolCallId: string;
}

export interface ReviewEvent extends LedgerEventBase {
  kind: 'review';
  verdict: 'PASS' | 'PASS WITH ISSUES' | 'FAIL';
  branch?: string;
  base?: string;
}

export interface UndoEvent extends LedgerEventBase {
  kind: 'undo';
  turnId: string;
}

export type LedgerEvent =
  | TurnEvent
  | WorkerEvent
  | CorrectionEvent
  | ReviewEvent
  | UndoEvent
  | (LedgerEventBase & { kind: 'confirm' | 'handoff'; [key: string]: unknown });

export interface LedgerReadResponse {
  events: LedgerEvent[];
  file: string;
}

export async function appendLedger(cwd: string, event: LedgerEvent): Promise<void> {
  await sidecarFetch<{ ok: true; file: string }>('/ledger/append', { cwd, event });
}

export async function readLedger(cwd: string, since?: string): Promise<LedgerEvent[]> {
  const { events } = await sidecarFetch<LedgerReadResponse>('/ledger/read', { cwd, since });
  return events;
}
