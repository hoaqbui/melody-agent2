import { describe, expect, it } from 'vitest';
import type { LedgerEvent, WorkerEvent } from '../../../native/ledger';
import { rangeEnding } from './telemetry-buckets';
import {
  childRecord,
  flows,
  passRate,
  roleRows,
  verdictOf,
  weeklyCleanDone,
  workersIn,
} from './telemetry-roles';

const NOW = new Date(2026, 8, 20, 14, 0);
const daysAgo = (n: number): string => {
  const t = new Date(NOW);
  t.setDate(t.getDate() - n);
  return t.toISOString();
};
let n = 0;
const worker = (overrides: Partial<WorkerEvent> = {}): WorkerEvent => ({
  kind: 'worker',
  at: daysAgo(1),
  sessionId: 's1',
  workerSessionId: `child-${++n}`,
  source: 'implementer',
  provider: 'claude-code',
  model: 'claude-sonnet-5',
  status: 'done',
  blocked: false,
  filesChanged: [],
  ...overrides,
});

describe('flows', () => {
  it('counts runs per role → seat and the failed ones among them', () => {
    const workers = [
      worker(),
      worker(),
      worker({ status: 'failed', error: 'quota' }),
      worker({ source: 'researcher', provider: 'agy', model: 'gemini-3.8-flash-high' }),
    ];
    expect(flows(workers)).toEqual([
      {
        source: 'implementer',
        provider: 'claude-code',
        model: 'claude-sonnet-5',
        runs: 3,
        failed: 1,
      },
      { source: 'researcher', provider: 'agy', model: 'gemini-3.8-flash-high', runs: 1, failed: 0 },
    ]);
  });

  it('keeps only the workers inside the range', () => {
    const events: LedgerEvent[] = [worker(), worker({ at: daysAgo(40) })];
    expect(workersIn(events, rangeEnding('days', NOW))).toHaveLength(1);
  });
});

describe('roleRows and verdicts', () => {
  it('takes BLOCKED and corrected out of clean-done and reads the seat that ran most', () => {
    const workers = [
      worker({ workerSessionId: 'a' }),
      worker({ workerSessionId: 'b', blocked: true }),
      worker({ workerSessionId: 'c' }),
      worker({ workerSessionId: 'd', provider: 'agy', model: 'gemini-3.8-flash-high' }),
    ];
    const [row] = roleRows(workers, [{ workerSessionId: 'c' }]);
    expect(row).toMatchObject({
      source: 'implementer',
      provider: 'claude-code',
      model: 'claude-sonnet-5',
      runs: 4,
      done: 4,
      blocked: 1,
      corrected: 1,
      cleanDone: 0.5,
      medianMinutes: null,
      tokensPerRun: null,
      verdict: 'watch',
    });
  });

  it("reads median minutes and tokens per run from the children's records", () => {
    const workers = [worker({ workerSessionId: 'a' }), worker({ workerSessionId: 'b' })];
    const children = new Map([
      [
        'a',
        childRecord({
          id: 'a',
          name: '',
          workingDir: '',
          updatedAt: '',
          messageCount: 4,
          createdAt: '2026-09-20T10:00:00Z',
          lastMessageAt: '2026-09-20T10:06:00Z',
          accumulatedInputTokens: 80_000,
          accumulatedOutputTokens: 4_000,
        }),
      ],
      [
        'b',
        childRecord({
          id: 'b',
          name: '',
          workingDir: '',
          updatedAt: '',
          messageCount: 4,
          createdAt: '2026-09-20T11:00:00Z',
          lastMessageAt: '2026-09-20T11:20:00Z',
        }),
      ],
    ]);
    const [row] = roleRows(workers, [], children);
    expect(row.medianMinutes).toBe(20);
    expect(row.tokensPerRun).toBe(84_000);
    expect(row.verdict).toBe('effective');
  });

  it('thresholds: effective ≥ 80% clean, failing when corrected ≥ half or clean < 50%', () => {
    expect(verdictOf({ runs: 10, corrected: 1, cleanDone: 0.85 })).toBe('effective');
    expect(verdictOf({ runs: 10, corrected: 1, cleanDone: 0.85 }, 0.6)).toBe('watch');
    expect(verdictOf({ runs: 10, corrected: 2, cleanDone: 0.7 })).toBe('watch');
    expect(verdictOf({ runs: 10, corrected: 5, cleanDone: 0.5 })).toBe('failing');
    expect(verdictOf({ runs: 10, corrected: 0, cleanDone: 0.4 })).toBe('failing');
    expect(verdictOf({ runs: 0, corrected: 0, cleanDone: 0 })).toBe('watch');
  });
});

describe('passRate and weeklyCleanDone', () => {
  it("rates the range's reviews as one number and null with none", () => {
    const events: LedgerEvent[] = [
      { kind: 'review', at: daysAgo(1), sessionId: 'r1', verdict: 'PASS' },
      { kind: 'review', at: daysAgo(2), sessionId: 'r2', verdict: 'FAIL' },
      { kind: 'review', at: daysAgo(3), sessionId: 'r3', verdict: 'PASS WITH ISSUES' },
      { kind: 'review', at: daysAgo(90), sessionId: 'r4', verdict: 'FAIL' },
    ];
    expect(passRate(events, rangeEnding('days', NOW))).toEqual({ rate: 2 / 3, reviews: 3 });
    expect(passRate([], rangeEnding('days', NOW))).toEqual({ rate: null, reviews: 0 });
  });

  it('gives one point per week of the quarter, null where the role did not run', () => {
    const events: LedgerEvent[] = [
      worker({ at: daysAgo(1), workerSessionId: 'x' }),
      worker({ at: daysAgo(1), workerSessionId: 'y', blocked: true }),
      worker({ at: daysAgo(30), workerSessionId: 'z', source: 'researcher' }),
    ];
    const lines = weeklyCleanDone(events, [{ workerSessionId: 'x' }], NOW);
    expect(lines.map((l) => l.source)).toEqual(['implementer', 'researcher']);
    const impl = lines[0];
    expect(impl.points[impl.points.length - 1]).toBe(0);
    expect(impl.points.filter((p) => p === null).length).toBe(impl.points.length - 1);
    expect(impl.labels[0]).toBe('W1');
  });
});
