// What the send disc's ring shows (task 122): the most spent of the limits a session is
// under — the context window today, a seat's plan limits once a seat reports them. Pure.

export interface UsageLimit {
  id: string;
  label: string;
  used: number;
  max: number;
  // A plan window's reset, as the seat words it ("Resets in 3 hr 57 min"); the context
  // window has none.
  resets?: string;
}

export const RING_STATES = ['unknown', 'empty', 'filling', 'warm', 'full'] as const;
export type RingState = (typeof RING_STATES)[number];

export const WARM_AT = 80;

export function percentOf(limit: UsageLimit): number {
  if (!limit.max || limit.max <= 0) return 0;
  return Math.min(100, Math.round((limit.used / limit.max) * 100));
}

// The limit closest to running out; null when nothing has a limit to run against.
export function mostSpent(limits: readonly UsageLimit[]): UsageLimit | null {
  let top: UsageLimit | null = null;
  for (const limit of limits) {
    if (!limit.max || limit.max <= 0) continue;
    if (!top || percentOf(limit) > percentOf(top)) top = limit;
  }
  return top;
}

export function ringState(limits: readonly UsageLimit[]): RingState {
  const top = mostSpent(limits);
  if (!top) return 'unknown';
  const pct = percentOf(top);
  if (pct >= 100) return 'full';
  if (pct >= WARM_AT) return 'warm';
  if (pct === 0) return 'empty';
  return 'filling';
}

export function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(count);
}

// A 36 px ring of radius 16: the circumference the stroke-dasharray fills.
export const RING_CIRCUMFERENCE = 2 * Math.PI * 16;

export function dashOffset(pct: number): number {
  return RING_CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, pct)) / 100);
}
