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
  'land',
  'verdict',
  'link',
  'gap',
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
  // Job identity (task 264): who ran it, under which charter, for which task, from which base —
  // so an outcome can be traced and rerun later. `null` marks a field the builder cannot fill
  // yet, not one that was skipped.
  turnId?: string | null;
  member?: string | null;
  charterSha?: string | null;
  taskRef?: string | null;
  taskHash?: string | null;
  baseSha?: string | null;
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

// Task 264's four new kinds — a commit that took a job's files (written by 267), the user's
// one-tap judgment on a worker row (268), a later job or commit named as fixing an earlier one
// (267's commit trailer or 268's "Fixes…" — the only way a job reads reworked), and a gap
// between two heartbeats while the app was closed (267, on launch). Typed by payload only: the
// kind itself is this object's own key, so `land`/`verdict`/`link`/`gap` are spelled out once
// each, in `LEDGER_EVENT_KINDS` above — a writer that wants one on its own narrows `LedgerEvent`
// by that kind in its own file, not restated here.
interface LedgerPayloadByKind {
  land: { sha: string; paths: string[]; message: string };
  verdict: { workerSessionId: string; verdict: 'good' | 'fixed' | 'wrong'; why?: string };
  link: {
    workerSessionId: string;
    by: 'user' | 'melody';
    fromWorkerSessionId?: string;
    fromSha?: string;
  };
  gap: { from: string; to: string };
}

type LedgerPayloadEvent = {
  [K in keyof LedgerPayloadByKind]: LedgerEventBase & { kind: K } & LedgerPayloadByKind[K];
}[keyof LedgerPayloadByKind];

export type LedgerEvent =
  | TurnEvent
  | WorkerEvent
  | CorrectionEvent
  | ReviewEvent
  | UndoEvent
  | LedgerPayloadEvent
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
