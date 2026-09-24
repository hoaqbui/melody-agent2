import { describe, expect, it } from 'vitest';
import type { LedgerEvent, WorkerEvent } from '../../../native/ledger';
import { rangeEnding, unitsOf } from './telemetry-buckets';
import { topTrends, trendCandidates } from './telemetry-trends';

const NOW = new Date(2026, 8, 20, 14, 0);
const daysAgo = (n: number): string => {
  const t = new Date(NOW);
  t.setDate(t.getDate() - n);
  t.setHours(10, 0, 0, 0);
  return t.toISOString();
};
const turn = (
  at: string,
  overrides: Partial<Extract<LedgerEvent, { kind: 'turn' }>> = {}
): LedgerEvent => ({
  kind: 'turn',
  at,
  sessionId: 's1',
  who: 'session',
  provider: 'claude-code',
  requestedModel: 'claude-opus-5',
  inputTokens: 1000,
  outputTokens: 100,
  cost: 0.02,
  ...overrides,
});
let n = 0;
const worker = (at: string, overrides: Partial<WorkerEvent> = {}): WorkerEvent => ({
  kind: 'worker',
  at,
  sessionId: 's1',
  workerSessionId: `w${++n}`,
  source: 'implementer',
  provider: 'claude-code',
  model: 'claude-sonnet-5',
  status: 'done',
  blocked: false,
  filesChanged: [],
  ...overrides,
});
const label = (s: { model: string }) => s.model;
const now = NOW.getTime();

describe('trendCandidates', () => {
  it('needs two ranges of turns; with one it says nothing about tokens or cost', () => {
    const events = [turn(daysAgo(1))];
    expect(
      trendCandidates(unitsOf([], events), events, rangeEnding('days', NOW), label, now)
    ).toEqual([]);
  });

  it('ranks the largest movement first — a seat share that moved beats a flat unit price', () => {
    const events = [
      // prior fortnight: opus only
      turn(daysAgo(20)),
      turn(daysAgo(21)),
      // this fortnight: sonnet takes half the tokens, unit price unchanged
      turn(daysAgo(1)),
      turn(daysAgo(2), { requestedModel: 'claude-sonnet-5' }),
    ];
    const range = rangeEnding('days', NOW);
    const trends = topTrends(trendCandidates(unitsOf([], events), events, range, label, now));
    expect(trends[0].id).toBe('top-seat-share');
    expect(trends[0].parts.map((p) => p.text).join('')).toContain('100% → 50%');
    expect(trends.find((t) => t.id === 'cost-per-turn')?.weight).toBe(0);
    expect(trends.every((t) => t.why && t.from)).toBe(true);
  });

  it('names a role whose clean-done moved, only with four runs on both sides', () => {
    // Per the job outcome fold (266), clean-done needs an actual land on the job's files — the
    // prior fortnight's four runs all land; this fortnight's split two corrected, two landed.
    const events: LedgerEvent[] = [
      turn(daysAgo(20)),
      turn(daysAgo(1)),
      ...Array.from({ length: 4 }, (_, i) =>
        worker(daysAgo(20 + i), { filesChanged: ['prior.ts'] })
      ),
      {
        kind: 'land',
        at: daysAgo(19),
        sessionId: 's1',
        sha: 'sha-prior',
        paths: ['prior.ts'],
        message: 'commit',
      },
      ...Array.from({ length: 4 }, (_, i) =>
        worker(daysAgo(1 + i), {
          workerSessionId: `c${i}`,
          filesChanged: i >= 2 ? ['current.ts'] : [],
        })
      ),
      {
        kind: 'land',
        at: daysAgo(0),
        sessionId: 's1',
        sha: 'sha-current',
        paths: ['current.ts'],
        message: 'commit',
      },
      {
        kind: 'correction',
        at: daysAgo(1),
        sessionId: 's1',
        workerSessionId: 'c0',
        path: 'a.ts',
        toolCallId: 't',
      },
      {
        kind: 'correction',
        at: daysAgo(1),
        sessionId: 's1',
        workerSessionId: 'c1',
        path: 'b.ts',
        toolCallId: 'u',
      },
    ];
    const range = rangeEnding('days', NOW);
    const trends = trendCandidates(unitsOf([], events), events, range, label, now);
    const role = trends.find((t) => t.id === 'clean-done:implementer');
    expect(role).toBeDefined();
    expect(role!.parts.map((p) => p.text).join('')).toBe(
      'implementer clean-done down — 100% → 50%; 2 of 4 runs corrected by the session.'
    );
    const few: LedgerEvent[] = events.filter((e) => e.kind !== 'worker' || e.at > daysAgo(10));
    expect(
      trendCandidates(unitsOf([], few), few, range, label, now).some((t) =>
        t.id.startsWith('clean-done')
      )
    ).toBe(false);
  });

  it('keeps at most three', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      weight: i,
      parts: [],
      why: '',
      from: '',
    }));
    expect(topTrends(many).map((t) => t.id)).toEqual(['4', '3', '2']);
  });
});
