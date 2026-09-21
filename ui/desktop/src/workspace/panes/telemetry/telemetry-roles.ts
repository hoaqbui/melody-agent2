// Roles' pure state (task 131): where each role's work went (routing flows), whether it
// survived the session (the board), and how that moved week by week — all from the ledger's
// worker · correction · review events plus the children's session records. No React, no ACP.

import type { LedgerEvent, ReviewEvent, WorkerEvent } from '../../../native/ledger';
import type { SessionListItem } from '../../../acp/sessions';
import { bucketKey, bucketStart, bucketStep, type Range } from './telemetry-buckets';

export interface Flow {
  source: string;
  provider: string;
  model: string;
  runs: number;
  // Runs that came back failed — the seat did not answer (a quota re-roll, a crash).
  failed: number;
}

const roleOf = (w: WorkerEvent): string => w.source ?? 'ad hoc';

export function workersIn(events: readonly LedgerEvent[], range: Range): WorkerEvent[] {
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  return events.filter(
    (e): e is WorkerEvent => e.kind === 'worker' && e.at >= fromIso && e.at < toIso
  );
}

export function flows(workers: readonly WorkerEvent[]): Flow[] {
  const by = new Map<string, Flow>();
  for (const w of workers) {
    const key = `${roleOf(w)}|${w.provider ?? ''}|${w.model ?? ''}`;
    const flow = by.get(key) ?? {
      source: roleOf(w),
      provider: w.provider ?? '',
      model: w.model ?? '',
      runs: 0,
      failed: 0,
    };
    flow.runs += 1;
    if (w.status === 'failed') flow.failed += 1;
    by.set(key, flow);
  }
  return [...by.values()].sort((a, b) => b.runs - a.runs);
}

export const VERDICTS = ['effective', 'watch', 'failing'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface RoleRow {
  source: string;
  // The seat that took most of the role's runs.
  provider: string;
  model: string;
  runs: number;
  done: number;
  failed: number;
  blocked: number;
  corrected: number;
  // (done − blocked − corrected) ÷ runs.
  cleanDone: number;
  // Median wall clock per run in minutes; null until the children's records are known.
  medianMinutes: number | null;
  // Tokens per run from the children's totals; null until known.
  tokensPerRun: number | null;
  verdict: Verdict;
  // A row from a hand count, not the wire.
  hand?: boolean;
}

export interface ChildRecord {
  id: string;
  createdAt: string;
  lastMessageAt?: string;
  tokens?: number;
}

export const childRecord = (item: SessionListItem): ChildRecord => ({
  id: item.id,
  createdAt: item.createdAt,
  lastMessageAt: item.lastMessageAt,
  tokens:
    item.accumulatedInputTokens !== undefined || item.accumulatedOutputTokens !== undefined
      ? (item.accumulatedInputTokens ?? 0) + (item.accumulatedOutputTokens ?? 0)
      : undefined,
});

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// Effective: clean-done ≥ 80% (and the review PASS rate ≥ 80% when one is attributed);
// Watch: below either; Failing: corrected ≥ half the runs, or clean-done under 50%.
export function verdictOf(
  row: Pick<RoleRow, 'runs' | 'corrected' | 'cleanDone'>,
  passRate: number | null = null
): Verdict {
  if (row.runs === 0) return 'watch';
  if (row.corrected >= row.runs / 2 || row.cleanDone < 0.5) return 'failing';
  if (row.cleanDone >= 0.8 && (passRate === null || passRate >= 0.8)) return 'effective';
  return 'watch';
}

export function roleRows(
  workers: readonly WorkerEvent[],
  corrections: readonly { workerSessionId: string }[],
  children: ReadonlyMap<string, ChildRecord> = new Map()
): RoleRow[] {
  const correctedWorkers = new Set(corrections.map((c) => c.workerSessionId));
  const by = new Map<string, WorkerEvent[]>();
  for (const w of workers) {
    const list = by.get(roleOf(w)) ?? [];
    list.push(w);
    by.set(roleOf(w), list);
  }
  return [...by.entries()]
    .map(([source, list]) => {
      const seats = new Map<string, number>();
      for (const w of list) {
        const key = `${w.provider ?? ''}|${w.model ?? ''}`;
        seats.set(key, (seats.get(key) ?? 0) + 1);
      }
      const [provider, model] = (
        [...seats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '|'
      ).split('|');
      const done = list.filter((w) => w.status === 'done').length;
      const failed = list.filter((w) => w.status === 'failed').length;
      const blocked = list.filter((w) => w.status === 'done' && w.blocked).length;
      const corrected = list.filter((w) => correctedWorkers.has(w.workerSessionId)).length;
      const runs = list.length;
      const minutes: number[] = [];
      const tokens: number[] = [];
      for (const w of list) {
        const child = children.get(w.workerSessionId);
        if (!child) continue;
        if (child.lastMessageAt) {
          const ms = Date.parse(child.lastMessageAt) - Date.parse(child.createdAt);
          if (ms >= 0) minutes.push(ms / 60e3);
        }
        if (child.tokens !== undefined) tokens.push(child.tokens);
      }
      const cleanDone = runs ? (done - blocked - corrected) / runs : 0;
      const row: RoleRow = {
        source,
        provider,
        model,
        runs,
        done,
        failed,
        blocked,
        corrected,
        cleanDone,
        medianMinutes: median(minutes),
        tokensPerRun: tokens.length ? tokens.reduce((a, b) => a + b, 0) / tokens.length : null,
        verdict: 'watch',
      };
      row.verdict = verdictOf(row);
      return row;
    })
    .sort((a, b) => b.runs - a.runs);
}

// The range's review verdicts as one rate — branch-level, not attributed to a role: a worker
// carries no branch on the wire, so the board's PASS column is this number with the hover
// saying so (plan-vs-found, task 131).
export function passRate(
  events: readonly LedgerEvent[],
  range: Range
): { rate: number | null; reviews: number } {
  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();
  const reviews = events.filter(
    (e): e is ReviewEvent => e.kind === 'review' && e.at >= fromIso && e.at < toIso
  );
  if (!reviews.length) return { rate: null, reviews: 0 };
  const passed = reviews.filter(
    (r) => r.verdict === 'PASS' || r.verdict === 'PASS WITH ISSUES'
  ).length;
  return { rate: passed / reviews.length, reviews: reviews.length };
}

export interface TrendLine {
  source: string;
  // One point per ISO week of the quarter holding `now`, oldest first; null where the role
  // had no runs that week.
  points: (number | null)[];
  labels: string[];
}

// Clean-done per role per week over the quarter holding `now`.
export function weeklyCleanDone(
  events: readonly LedgerEvent[],
  corrections: readonly { workerSessionId: string }[],
  now: Date
): TrendLine[] {
  const q0 = bucketStart('quarters', now);
  const starts: Date[] = [];
  for (let start = bucketStart('weeks', q0); start <= now; start = bucketStep('weeks', start, 1))
    starts.push(start);
  const labels = starts.map((_, i) => `W${i + 1}`);
  const corrected = new Set(corrections.map((c) => c.workerSessionId));
  const workers = events.filter(
    (e): e is WorkerEvent => e.kind === 'worker' && new Date(e.at) >= q0
  );
  const roles = [...new Set(workers.map(roleOf))].sort();
  return roles.map((source) => ({
    source,
    labels,
    points: starts.map((start) => {
      const key = bucketKey('weeks', start);
      const inWeek = workers.filter(
        (w) => roleOf(w) === source && bucketKey('weeks', new Date(w.at)) === key
      );
      if (!inWeek.length) return null;
      const clean = inWeek.filter(
        (w) => w.status === 'done' && !w.blocked && !corrected.has(w.workerSessionId)
      ).length;
      return Math.round((clean / inWeek.length) * 100);
    }),
  }));
}
