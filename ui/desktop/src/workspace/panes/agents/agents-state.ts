// What the Agents pane derives without React (PRD step 10): which of DESIGN.md's states the
// pane is in, what a worker row reads, and whether a child's transcript can be opened yet.
// The rows themselves come from src/acp/delegations.ts (task 65); nothing here infers a
// status the wire did not carry.

import type { Delegation, DelegationStatus } from '../../../acp/delegations';

// DESIGN.md §Shared component states, plus `ready` for a surface with nothing unresolved.
// `cancelled` and `unavailable` have no producer here — a delegate is stopped through the
// parent's own Stop, and the pane needs nothing installed — and stay for the table test.
export const AGENTS_PANE_STATES = [
  'empty',
  'loading',
  'partial',
  'running',
  'error',
  'cancelled',
  'unavailable',
  'ready',
] as const;

export type AgentsPaneState = (typeof AGENTS_PANE_STATES)[number];

// PRD step 10's four words. `waiting` has no producer today — summon runs the child as soon
// as the delegate call starts (research §Options, consequence 3) — so the row renders it
// and nothing reaches it.
export type WorkerStatus = DelegationStatus | 'waiting';

export const WORKER_STATUSES: readonly WorkerStatus[] = ['waiting', 'running', 'done', 'failed'];

// The child's session record, loaded through src/acp on a click.
export type TranscriptLoad =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

export function transcriptLoad(snapshot: {
  session?: unknown;
  sessionLoadError?: string;
}): TranscriptLoad {
  if (snapshot.sessionLoadError) return { status: 'error', message: snapshot.sessionLoadError };
  if (snapshot.session) return { status: 'ready' };
  return { status: 'loading' };
}

// A running child's `session/load` would build a second agent over a session summon is
// still driving (crates/goose/src/acp/server/load_session.rs `handle_load_session`), so a
// transcript opens once the delegate returned. A row seeded on reload carries no status;
// its session is stored and opens.
export function canOpenTranscript(row: Pick<Delegation, 'status'>): boolean {
  return row.status !== 'running';
}

export function paneState(input: {
  rows: readonly Delegation[];
  transcript: TranscriptLoad | null;
}): AgentsPaneState {
  if (input.transcript) {
    return input.transcript.status;
  }
  if (input.rows.length === 0) return 'empty';
  if (input.rows.some((row) => row.status === 'failed')) return 'error';
  if (input.rows.some((row) => row.status === 'running')) return 'running';
  if (input.rows.some((row) => row.status === undefined)) return 'partial';
  return 'ready';
}
