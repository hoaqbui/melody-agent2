import { describe, expect, it } from 'vitest';
import {
  RING_CIRCUMFERENCE,
  RING_STATES,
  dashOffset,
  formatCount,
  mostSpent,
  percentOf,
  ringState,
  type UsageLimit,
} from './usage-ring';

const ctx = (used: number, max = 128_000): UsageLimit => ({
  id: 'context',
  label: 'Context window',
  used,
  max,
});
const weekly: UsageLimit = { id: 'weekly', label: 'Weekly', used: 20, max: 100, resets: 'Sat' };

describe('usage ring', () => {
  it('rounds a limit to a whole percent and caps it at 100', () => {
    expect(percentOf(ctx(0))).toBe(0);
    expect(percentOf(ctx(64_000))).toBe(50);
    expect(percentOf(ctx(200_000))).toBe(100);
    expect(percentOf(ctx(10, 0))).toBe(0);
  });

  it('picks the most spent limit and ignores one with no maximum', () => {
    expect(mostSpent([])).toBeNull();
    expect(mostSpent([ctx(10, 0)])).toBeNull();
    expect(mostSpent([ctx(12_800), weekly])?.id).toBe('weekly');
    expect(mostSpent([ctx(64_000), weekly])?.id).toBe('context');
  });

  it('names the five states', () => {
    expect(RING_STATES).toEqual(['unknown', 'empty', 'filling', 'warm', 'full']);
    expect(ringState([])).toBe('unknown');
    expect(ringState([ctx(0)])).toBe('empty');
    expect(ringState([ctx(64_000)])).toBe('filling');
    expect(ringState([ctx(102_400)])).toBe('warm');
    expect(ringState([ctx(128_000)])).toBe('full');
    expect(ringState([ctx(1_000), { ...weekly, used: 85 }])).toBe('warm');
  });

  it('formats counts the way the row did', () => {
    expect(formatCount(950)).toBe('950');
    expect(formatCount(12_800)).toBe('12.8k');
    expect(formatCount(128_000)).toBe('128k');
    expect(formatCount(1_000_000)).toBe('1M');
  });

  it('turns a percent into the stroke offset that leaves that share drawn', () => {
    expect(dashOffset(0)).toBeCloseTo(RING_CIRCUMFERENCE);
    expect(dashOffset(50)).toBeCloseTo(RING_CIRCUMFERENCE / 2);
    expect(dashOffset(100)).toBe(0);
    expect(dashOffset(140)).toBe(0);
  });
});
