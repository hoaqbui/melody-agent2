// Trends (task 132): the three largest movements between this range and the one before it,
// written from templates — never a model call. Each candidate carries a weight, the sentence
// as parts (numbers stay numbers), and the tooltip's why and from.

import type { LedgerEvent } from '../../../native/ledger';
import { fmtK } from './charts';
import {
  inRange,
  priorRange,
  seatShares,
  totals,
  type Range,
  type Unit,
} from './telemetry-buckets';
import { roleRows, workersIn } from './telemetry-roles';

export interface TrendPart {
  text: string;
  // Rendered in mono: a number, a range, a percentage.
  n?: boolean;
  // Rendered bold: the lead.
  b?: boolean;
}

export interface Trend {
  id: string;
  weight: number;
  parts: TrendPart[];
  why: string;
  from: string;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const usd = (v: number, d = 3): string => `$${v.toFixed(d)}`;

export function trendCandidates(
  units: readonly Unit[],
  events: readonly LedgerEvent[],
  range: Range,
  seatLabel: (s: { provider: string; model: string }) => string,
  now: number
): Trend[] {
  const prior = priorRange(range);
  const cur = inRange(units, range);
  const prev = inRange(units, prior);
  const a = totals(cur);
  const b = totals(prev);
  const out: Trend[] = [];

  if (a.turns > 0 && b.turns > 0) {
    const tpt = a.tokens / a.turns;
    const tptP = b.tokens / b.turns;
    const heavier = tpt > tptP;
    const turnsDelta = Math.round(((a.turns - b.turns) / b.turns) * 100);
    out.push({
      id: 'tokens-per-turn',
      weight: Math.abs(tpt / tptP - 1) * 1.2,
      parts: [
        {
          text: heavier ? 'Each turn is getting heavier' : 'Each turn is getting lighter',
          b: true,
        },
        { text: ' — ' },
        { text: `${fmtK(tptP)} → ${fmtK(tpt)}`, n: true },
        { text: ' tokens per turn with turns ' },
        { text: `${turnsDelta >= 0 ? '+' : ''}${turnsDelta}%`, n: true },
        { text: heavier ? ': context weight, not more work.' : ': leaner prompts.' },
      ],
      why: 'Tokens per turn is the context weight of a reply. Rising while turns are flat means the prompt grew — compaction and worktree isolation are the levers.',
      from: 'tokens ÷ turns · this range vs the one before',
    });

    // The seat that carried the most across both ranges — the one whose share is watched.
    const shares = seatShares(cur);
    const sharesP = seatShares(prev);
    const lead = seatShares([...cur, ...prev])[0];
    const top =
      lead &&
      (shares.find((s) => s.provider === lead.provider && s.model === lead.model) ?? {
        ...lead,
        share: 0,
      });
    if (top) {
      const before =
        sharesP.find((s) => s.provider === top.provider && s.model === top.model)?.share ?? 0;
      const more = top.share > before;
      out.push({
        id: 'top-seat-share',
        weight: Math.abs(top.share - before) * 3,
        parts: [
          { text: `${seatLabel(top)} is carrying ${more ? 'more' : 'less'}`, b: true },
          { text: ' — ' },
          { text: `${pct(before)} → ${pct(top.share)}`, n: true },
          {
            text: more
              ? ' of tokens; the roll is moving work up.'
              : ' of tokens; the roll is moving work down.',
          },
        ],
        why: 'Share of tokens on the seat that carries the most. Falling is the cheaper seats taking their share of the roll.',
        from: 'Σ tokens by inference.resolvedModel',
      });
    }

    const pricedA = a.turns - a.unpriced;
    const pricedB = b.turns - b.unpriced;
    if (pricedA > 0 && pricedB > 0) {
      const cpt = a.cost / pricedA;
      const cptP = b.cost / pricedB;
      out.push({
        id: 'cost-per-turn',
        weight: Math.abs(cpt / cptP - 1),
        parts: [
          { text: `Cost per priced turn ${cpt > cptP ? 'rose' : 'fell'}`, b: true },
          { text: ' — ' },
          { text: `${usd(cptP)} → ${usd(cpt)}`, n: true },
          { text: '; ' },
          { text: String(a.unpriced), n: true },
          { text: ' turns in the range have no price at all.' },
        ],
        why: 'The unit price on turns that report a price. The subscription seats report none — their share is the number to watch, not this one.',
        from: 'cost ÷ priced turns',
      });
    }
  }

  const rowsA = roleRows(workersIn(events, range), events, now);
  const rowsB = roleRows(workersIn(events, prior), events, now);
  for (const row of rowsA) {
    const before = rowsB.find((r) => r.source === row.source);
    if (!before || row.runs < 4 || before.runs < 4) continue;
    const up = row.cleanDone > before.cleanDone;
    out.push({
      id: `clean-done:${row.source}`,
      weight: Math.abs(row.cleanDone - before.cleanDone) * 2.5,
      parts: [
        { text: `${row.source} clean-done ${up ? 'up' : 'down'}`, b: true },
        { text: ' — ' },
        { text: `${pct(before.cleanDone)} → ${pct(row.cleanDone)}`, n: true },
        { text: '; ' },
        { text: String(row.corrected), n: true },
        { text: ' of ' },
        { text: String(row.runs), n: true },
        { text: ' runs corrected by the session.' },
      ],
      why: 'Clean-done = landed, per the job outcome fold — not blocked, not undone, not reworked, not rewritten by the session, and not merely done with no commit yet. The number that says whether the role is earning its seat.',
      from: 'landed jobs ÷ runs · ledger-outcome.outcomeOf per job',
    });
  }
  return out;
}

// The three that moved most; fewer when fewer moved.
export function topTrends(candidates: readonly Trend[], count = 3): Trend[] {
  return [...candidates].sort((x, y) => y.weight - x.weight).slice(0, count);
}
