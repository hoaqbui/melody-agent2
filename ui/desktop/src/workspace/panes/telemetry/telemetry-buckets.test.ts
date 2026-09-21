import { describe, expect, it } from 'vitest';
import type { LedgerEvent } from '../../../native/ledger';
import type { SessionListItem } from '../../../acp/sessions';
import {
  bucketKey,
  bucketLabel,
  buckets,
  byRuntime,
  delta,
  inRange,
  isoWeek,
  priorRange,
  quarterRows,
  rangeEnding,
  seatShares,
  topSessions,
  totals,
  unitsOf,
} from './telemetry-buckets';

const NOW = new Date(2026, 8, 20, 14, 0);
const daysAgo = (n: number, hour = 10): Date => {
  const t = new Date(NOW);
  t.setDate(t.getDate() - n);
  t.setHours(hour, 0, 0, 0);
  return t;
};
const turn = (
  at: Date,
  overrides: Partial<Extract<LedgerEvent, { kind: 'turn' }>> = {}
): LedgerEvent => ({
  kind: 'turn',
  at: at.toISOString(),
  sessionId: 's1',
  who: 'session',
  provider: 'claude-code',
  requestedModel: 'claude-opus-5',
  inputTokens: 1000,
  outputTokens: 100,
  cost: 0.02,
  ...overrides,
});
const listed = (
  id: string,
  createdAt: Date,
  overrides: Partial<SessionListItem> = {}
): SessionListItem => ({
  id,
  name: id,
  workingDir: '/repo',
  updatedAt: createdAt.toISOString(),
  createdAt: createdAt.toISOString(),
  messageCount: 10,
  providerId: 'codex-acp',
  modelId: 'gpt-6-astra',
  accumulatedInputTokens: 5000,
  accumulatedOutputTokens: 500,
  ...overrides,
});

describe('bucket keys', () => {
  it('never collide across years — the day, week, month and quarter keys carry the year', () => {
    const a = new Date(2025, 8, 7),
      b = new Date(2026, 8, 7);
    for (const grain of ['days', 'weeks', 'months', 'quarters'] as const) {
      expect(bucketKey(grain, a)).not.toBe(bucketKey(grain, b));
    }
    expect(bucketLabel('days', b)).toBe('7 Sep');
    expect(bucketLabel('quarters', b)).toBe('Q3 26');
    expect(bucketLabel('months', new Date(2026, 0, 3))).toBe('Jan 26');
  });

  it('gives ISO weeks: 1 Jan 2027 is W53 of 2026, 4 Jan 2027 is W1', () => {
    expect(isoWeek(new Date(2027, 0, 1))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(new Date(2027, 0, 4))).toEqual({ year: 2027, week: 1 });
  });

  it('a range ends with the bucket holding now and the prior range is the same length before it', () => {
    const range = rangeEnding('days', NOW);
    expect(range.starts).toHaveLength(14);
    expect(range.starts[13]).toEqual(new Date(2026, 8, 20));
    expect(range.from).toEqual(new Date(2026, 8, 7));
    const prior = priorRange(range);
    expect(prior.to).toEqual(range.from);
    expect(prior.starts).toHaveLength(14);
    expect(rangeEnding('quarters', NOW).starts[0]).toEqual(new Date(2025, 6, 1));
  });
});

describe('unitsOf', () => {
  it('uses ledger turns where a session has them and the list totals where it does not', () => {
    const events = [turn(daysAgo(1)), turn(daysAgo(1, 11), { who: 'worker', cost: undefined })];
    const sessions = [listed('s1', daysAgo(1)), listed('s2', daysAgo(3))];
    const units = unitsOf(sessions, events);
    expect(units.map((u) => [u.sessionId, u.fromList, u.turns])).toEqual([
      ['s2', true, 5],
      ['s1', false, 1],
      ['s1', false, 1],
    ]);
    expect(units[0]).toMatchObject({
      provider: 'codex-acp',
      model: 'gpt-6-astra',
      inputTokens: 5000,
      cost: null,
    });
  });
});

describe('totals and delta', () => {
  it('counts tokens, unpriced turns, workers and sessions; the delta is null against nothing', () => {
    const units = unitsOf(
      [listed('s2', daysAgo(3))],
      [turn(daysAgo(1)), turn(daysAgo(1, 11), { who: 'worker', cost: undefined })]
    );
    const t = totals(inRange(units, rangeEnding('days', NOW)));
    expect(t).toMatchObject({
      tokens: 7700,
      turns: 7,
      sessions: 2,
      workers: 1,
      unpriced: 6,
      fromList: 1,
    });
    expect(t.cost).toBeCloseTo(0.02);
    expect(delta(120, 100)).toBe(20);
    expect(delta(5, 0)).toBeNull();
  });
});

describe('buckets and shares', () => {
  it('keeps every bucket of the range, empty ones included, seats ordered by share', () => {
    const events = [
      turn(daysAgo(1)),
      turn(daysAgo(1, 12), {
        provider: 'codex-acp',
        requestedModel: 'gpt-6-astra',
        inputTokens: 100,
        outputTokens: 10,
      }),
    ];
    const range = rangeEnding('days', NOW);
    const { buckets: rows, seats } = buckets(unitsOf([], events), range);
    expect(rows).toHaveLength(14);
    expect(rows.filter((b) => b.tokens > 0)).toHaveLength(1);
    expect(seats.map((s) => s.model)).toEqual(['claude-opus-5', 'gpt-6-astra']);
    const shares = seatShares(inRange(unitsOf([], events), range));
    expect(shares[0].share).toBeCloseTo(1100 / 1210);
    expect(byRuntime(unitsOf([], events))).toEqual([
      { provider: 'claude-code', turns: 1 },
      { provider: 'codex-acp', turns: 1 },
    ]);
  });

  it('ranks sessions by cost then tokens, and lays out quarters newest first', () => {
    const units = unitsOf(
      [listed('old', daysAgo(120), { accumulatedCost: 3 })],
      [turn(daysAgo(1)), turn(daysAgo(2), { sessionId: 's3', cost: 1.5 })]
    );
    expect(topSessions(units).map((s) => s.sessionId)).toEqual(['old', 's3', 's1']);
    const quarters = quarterRows(units, NOW, 2);
    expect(quarters.map((q) => q.label)).toEqual(['Q3 26', 'Q2 26']);
    expect(quarters[0].turns).toBe(2);
    expect(quarters[0].costPerTurn).toBeCloseTo(0.76);
    expect(quarters[1]).toMatchObject({ turns: 5, sessions: 1 });
    expect(quarters[1].top?.model).toBe('gpt-6-astra');
  });
});
