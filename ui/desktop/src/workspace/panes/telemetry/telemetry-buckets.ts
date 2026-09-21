// Over time's pure state (task 130): the session list is the base (every session, its dates,
// seat and totals), the ledger's turn events refine it where a session has them; both fold
// into Days · Weeks · Months · Quarters buckets whose keys never collide across years.

import type { LedgerEvent, TurnEvent } from '../../../native/ledger';
import type { SessionListItem } from '../../../acp/sessions';
import { GRAIN_SPAN, type Grain } from './telemetry-state';

// One unit of work with a time, a seat and a size — a ledger turn, or a whole session at
// session grain when it has no turns on the ledger.
export interface Unit {
  at: Date;
  sessionId: string;
  provider: string;
  model: string;
  who: 'session' | 'worker';
  inputTokens: number;
  outputTokens: number;
  // null: the seat reported no price and none was estimated.
  cost: number | null;
  // Turns this unit stands for (1 for a ledger turn; a session's message count ÷ 2 at
  // session grain, the honest guess the hover names).
  turns: number;
  // true when this unit is a whole session, not a recorded turn.
  fromList: boolean;
}

const seatOf = (provider?: string, model?: string): { provider: string; model: string } => ({
  provider: provider ?? '',
  model: model ?? '',
});

export function unitsOf(
  sessions: readonly SessionListItem[],
  events: readonly LedgerEvent[]
): Unit[] {
  const turns = events.filter((e): e is TurnEvent => e.kind === 'turn');
  const withTurns = new Set(turns.map((t) => t.sessionId));
  const units: Unit[] = turns.map((t) => ({
    at: new Date(t.at),
    sessionId: t.sessionId,
    ...seatOf(t.provider, t.resolvedModel ?? t.requestedModel),
    who: t.who,
    inputTokens: t.inputTokens ?? 0,
    outputTokens: t.outputTokens ?? 0,
    cost: t.cost ?? null,
    turns: 1,
    fromList: false,
  }));
  for (const s of sessions) {
    if (withTurns.has(s.id) || !s.createdAt) continue;
    const at = new Date(s.createdAt);
    if (Number.isNaN(at.getTime())) continue;
    units.push({
      at,
      sessionId: s.id,
      ...seatOf(s.providerId, s.modelId),
      who: 'session',
      inputTokens: s.accumulatedInputTokens ?? 0,
      outputTokens: s.accumulatedOutputTokens ?? 0,
      cost: s.accumulatedCost ?? null,
      turns: Math.max(1, Math.floor(s.messageCount / 2)),
      fromList: true,
    });
  }
  return units.sort((a, b) => a.at.getTime() - b.at.getTime());
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number): string => String(n).padStart(2, '0');
const isoDay = (t: Date): string =>
  `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
// ISO-8601 week: Monday-based, week 1 holds the year's first Thursday.
export function isoWeek(t: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return {
    year: d.getUTCFullYear(),
    week: Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7),
  };
}
const quarterOf = (t: Date): number => Math.floor(t.getMonth() / 3) + 1;

// The key is unique across years (the mockup's collision: "7 Sep" 2025 and 2026 were one bar);
// the label is what the axis shows.
export function bucketKey(grain: Grain, t: Date): string {
  switch (grain) {
    case 'days':
      return isoDay(t);
    case 'weeks': {
      const { year, week } = isoWeek(t);
      return `${year}-W${pad(week)}`;
    }
    case 'months':
      return `${t.getFullYear()}-${pad(t.getMonth() + 1)}`;
    case 'quarters':
      return `${t.getFullYear()}-Q${quarterOf(t)}`;
  }
}

export function bucketLabel(grain: Grain, t: Date): string {
  switch (grain) {
    case 'days':
      return `${t.getDate()} ${MON[t.getMonth()]}`;
    case 'weeks':
      return `W${isoWeek(t).week}`;
    case 'months':
      return t.getMonth() === 0
        ? `${MON[0]} ${String(t.getFullYear()).slice(2)}`
        : MON[t.getMonth()];
    case 'quarters':
      return `Q${quarterOf(t)} ${String(t.getFullYear()).slice(2)}`;
  }
}

// The start of the bucket holding `t`, and the bucket after it — how a range walks.
export function bucketStart(grain: Grain, t: Date): Date {
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  switch (grain) {
    case 'days':
      return d;
    case 'weeks': {
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - (day - 1));
      return d;
    }
    case 'months':
      return new Date(t.getFullYear(), t.getMonth(), 1);
    case 'quarters':
      return new Date(t.getFullYear(), (quarterOf(t) - 1) * 3, 1);
  }
}

export function bucketStep(grain: Grain, start: Date, steps: number): Date {
  const d = new Date(start);
  switch (grain) {
    case 'days':
      d.setDate(d.getDate() + steps);
      return d;
    case 'weeks':
      d.setDate(d.getDate() + 7 * steps);
      return d;
    case 'months':
      d.setMonth(d.getMonth() + steps);
      return d;
    case 'quarters':
      d.setMonth(d.getMonth() + 3 * steps);
      return d;
  }
}

export interface Range {
  grain: Grain;
  // The first bucket's start, and the instant after the last bucket.
  from: Date;
  to: Date;
  // The bucket starts, oldest first.
  starts: Date[];
}

// The last N buckets of the grain, ending with the bucket holding `now`.
export function rangeEnding(grain: Grain, now: Date): Range {
  const last = bucketStart(grain, now);
  const n = GRAIN_SPAN[grain].buckets;
  const from = bucketStep(grain, last, -(n - 1));
  const starts = Array.from({ length: n }, (_, i) => bucketStep(grain, from, i));
  return { grain, from, to: bucketStep(grain, last, 1), starts };
}

export function priorRange(range: Range): Range {
  const n = range.starts.length;
  const from = bucketStep(range.grain, range.from, -n);
  return {
    grain: range.grain,
    from,
    to: range.from,
    starts: Array.from({ length: n }, (_, i) => bucketStep(range.grain, from, i)),
  };
}

export const inRange = (units: readonly Unit[], range: Range): Unit[] =>
  units.filter((u) => u.at >= range.from && u.at < range.to);

export interface Totals {
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  // Units that carried no price.
  unpriced: number;
  turns: number;
  sessions: number;
  workers: number;
  // Units read from the session list rather than recorded turns.
  fromList: number;
}

export function totals(units: readonly Unit[]): Totals {
  const t: Totals = {
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    unpriced: 0,
    turns: 0,
    sessions: 0,
    workers: 0,
    fromList: 0,
  };
  const sessions = new Set<string>();
  for (const u of units) {
    t.inputTokens += u.inputTokens;
    t.outputTokens += u.outputTokens;
    t.tokens += u.inputTokens + u.outputTokens;
    if (u.cost === null) t.unpriced += u.turns;
    else t.cost += u.cost;
    t.turns += u.turns;
    if (u.who === 'worker') t.workers += u.turns;
    if (u.fromList) t.fromList += 1;
    sessions.add(u.sessionId);
  }
  t.sessions = sessions.size;
  return t;
}

// Percent change, or null when the prior is empty (never Infinity).
export const delta = (now: number, prior: number): number | null =>
  prior > 0 ? Math.round(((now - prior) / prior) * 100) : null;

export interface Seat {
  provider: string;
  model: string;
}
export const seatKey = (s: Seat): string => `${s.provider}|${s.model}`;

export interface Bucket {
  key: string;
  label: string;
  start: Date;
  // Tokens per seat key.
  bySeat: Map<string, number>;
  tokens: number;
  cost: number;
  turns: number;
}

// One bucket per start in the range, every seat present, empty buckets kept (a zero bar is
// information: nothing ran).
export function buckets(
  units: readonly Unit[],
  range: Range
): { buckets: Bucket[]; seats: Seat[] } {
  const byKey = new Map<string, Bucket>();
  for (const start of range.starts) {
    const key = bucketKey(range.grain, start);
    byKey.set(key, {
      key,
      label: bucketLabel(range.grain, start),
      start,
      bySeat: new Map(),
      tokens: 0,
      cost: 0,
      turns: 0,
    });
  }
  const seatTokens = new Map<string, { seat: Seat; tokens: number }>();
  for (const u of inRange(units, range)) {
    const bucket = byKey.get(bucketKey(range.grain, u.at));
    if (!bucket) continue;
    const key = seatKey(u);
    const size = u.inputTokens + u.outputTokens;
    bucket.bySeat.set(key, (bucket.bySeat.get(key) ?? 0) + size);
    bucket.tokens += size;
    bucket.cost += u.cost ?? 0;
    bucket.turns += u.turns;
    const seat = seatTokens.get(key) ?? {
      seat: { provider: u.provider, model: u.model },
      tokens: 0,
    };
    seat.tokens += size;
    seatTokens.set(key, seat);
  }
  // Seats ordered by their share, largest first — the stack's bottom.
  const seats = [...seatTokens.values()].sort((a, b) => b.tokens - a.tokens).map((s) => s.seat);
  return { buckets: [...byKey.values()], seats };
}

export interface SeatShare extends Seat {
  tokens: number;
  share: number;
  turns: number;
  cost: number;
}

export function seatShares(units: readonly Unit[]): SeatShare[] {
  const by = new Map<string, SeatShare>();
  let total = 0;
  for (const u of units) {
    const key = seatKey(u);
    const row = by.get(key) ?? {
      provider: u.provider,
      model: u.model,
      tokens: 0,
      share: 0,
      turns: 0,
      cost: 0,
    };
    const size = u.inputTokens + u.outputTokens;
    row.tokens += size;
    row.turns += u.turns;
    row.cost += u.cost ?? 0;
    total += size;
    by.set(key, row);
  }
  return [...by.values()]
    .map((row) => ({ ...row, share: total ? row.tokens / total : 0 }))
    .sort((a, b) => b.tokens - a.tokens);
}

export interface RuntimeCount {
  provider: string;
  turns: number;
}

export function byRuntime(units: readonly Unit[]): RuntimeCount[] {
  const by = new Map<string, number>();
  for (const u of units) by.set(u.provider, (by.get(u.provider) ?? 0) + u.turns);
  return [...by.entries()]
    .map(([provider, turns]) => ({ provider, turns }))
    .sort((a, b) => b.turns - a.turns);
}

export interface SessionCost {
  sessionId: string;
  provider: string;
  model: string;
  turns: number;
  tokens: number;
  cost: number | null;
}

export function topSessions(units: readonly Unit[], limit = 5): SessionCost[] {
  const by = new Map<string, SessionCost>();
  for (const u of units) {
    const row = by.get(u.sessionId) ?? {
      sessionId: u.sessionId,
      provider: u.provider,
      model: u.model,
      turns: 0,
      tokens: 0,
      cost: null,
    };
    row.turns += u.turns;
    row.tokens += u.inputTokens + u.outputTokens;
    if (u.cost !== null) row.cost = (row.cost ?? 0) + u.cost;
    by.set(u.sessionId, row);
  }
  return [...by.values()]
    .sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0) || b.tokens - a.tokens)
    .slice(0, limit);
}

// The quarters the units span, newest first, with the unit prices that should fall as routing
// improves.
export interface QuarterRow {
  key: string;
  label: string;
  tokens: number;
  cost: number;
  turns: number;
  sessions: number;
  costPerTurn: number | null;
  tokensPerTurn: number;
  top: SeatShare | null;
}

export function quarterRows(units: readonly Unit[], now: Date, count = 4): QuarterRow[] {
  const rows: QuarterRow[] = [];
  let start = bucketStart('quarters', now);
  for (let i = 0; i < count; i++) {
    const end = bucketStep('quarters', start, 1);
    const inQuarter = units.filter((u) => u.at >= start && u.at < end);
    const t = totals(inQuarter);
    const priced = t.turns - t.unpriced;
    rows.push({
      key: bucketKey('quarters', start),
      label: bucketLabel('quarters', start),
      tokens: t.tokens,
      cost: t.cost,
      turns: t.turns,
      sessions: t.sessions,
      costPerTurn: priced > 0 ? t.cost / priced : null,
      tokensPerTurn: t.turns > 0 ? t.tokens / t.turns : 0,
      top: seatShares(inQuarter)[0] ?? null,
    });
    start = bucketStep('quarters', start, -1);
  }
  return rows;
}
