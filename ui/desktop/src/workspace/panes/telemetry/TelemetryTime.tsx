// Over time (task 130): the range's headline (Tokens · Cost · Turns with their deltas), tokens
// by model bucket by bucket, cost per week, share of tokens, quarters, by runtime, top
// sessions — every number hoverable, no sentence on the surface.

import { useEffect, useMemo, useState } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { useConfig } from '../../../components/ConfigContext';
import type { TelemetryData } from './telemetry-data';
import type { ProviderDetails } from '../../../types/providers';
import { cn } from '../../../utils';
import { runtimeLabel } from '../../session-controls';
import {
  BarRow,
  Donut,
  LineWithRunning,
  Sparkline,
  StackedBars,
  fmtK,
  seatColour,
  type StackBar,
} from './charts';
import { shortModel } from './telemetry-now';
import {
  buckets,
  byRuntime,
  delta,
  inRange,
  priorRange,
  quarterRows,
  rangeEnding,
  seatKey,
  seatShares,
  topSessions,
  totals,
  unitsOf,
  bucketStart,
  bucketStep,
} from './telemetry-buckets';
import { GRAIN_SPAN, type Grain } from './telemetry-state';
import { Why } from './Why';

const i18n = defineMessages({
  tokens: { id: 'telemetryTime.tokens', defaultMessage: 'Tokens' },
  cost: { id: 'telemetryTime.cost', defaultMessage: 'Cost' },
  turns: { id: 'telemetryTime.turns', defaultMessage: 'Turns' },
  byModel: { id: 'telemetryTime.byModel', defaultMessage: 'Tokens by model' },
  hoverBar: { id: 'telemetryTime.hoverBar', defaultMessage: 'hover a bar' },
  costPerWeek: { id: 'telemetryTime.costPerWeek', defaultMessage: 'Cost per week' },
  share: { id: 'telemetryTime.share', defaultMessage: 'Share of tokens' },
  quarters: { id: 'telemetryTime.quarters', defaultMessage: 'Quarters' },
  byRuntime: { id: 'telemetryTime.byRuntime', defaultMessage: 'By runtime' },
  topSessions: { id: 'telemetryTime.topSessions', defaultMessage: 'Top sessions' },
  empty: { id: 'telemetryTime.empty', defaultMessage: 'No turns in this range — widen it.' },
  loading: { id: 'telemetryTime.loading', defaultMessage: 'Reading the ledger…' },
  error: { id: 'telemetryTime.error', defaultMessage: '{cause}' },
  retry: { id: 'telemetryTime.retry', defaultMessage: 'Retry' },
  unpriced: { id: 'telemetryTime.unpriced', defaultMessage: '{count} turns unpriced' },
  vsPrior: { id: 'telemetryTime.vsPrior', defaultMessage: 'vs prior {span}' },
  thQuarter: { id: 'telemetryTime.thQuarter', defaultMessage: 'Quarter' },
  thSessions: { id: 'telemetryTime.thSessions', defaultMessage: 'Sessions' },
  thCostPerTurn: { id: 'telemetryTime.thCostPerTurn', defaultMessage: '$ / turn' },
  thTokPerTurn: { id: 'telemetryTime.thTokPerTurn', defaultMessage: 'tok / turn' },
  thTop: { id: 'telemetryTime.thTop', defaultMessage: 'Top model' },
  thSession: { id: 'telemetryTime.thSession', defaultMessage: 'Session' },
  thModel: { id: 'telemetryTime.thModel', defaultMessage: 'Model' },
});

const fromList = (t: { fromList: number }): string =>
  t.fromList
    ? ` · ${t.fromList} sessions at session grain (no recorded turns; bucketed by their creation day, turns ≈ messages ÷ 2)`
    : '';

function Headline({
  label,
  value,
  change,
  span,
  sub,
  spark,
  colour,
  why,
  from,
  testId,
}: {
  label: string;
  value: string;
  change: number | null;
  span: string;
  sub: string;
  spark: number[];
  colour: string;
  why: string;
  from: string;
  testId: string;
}) {
  const intl = useIntl();
  return (
    <Why
      as="div"
      why={why}
      from={from}
      head={value}
      focusable
      className="min-w-0 rounded-panel bg-background-secondary p-3 shadow-[var(--shadow-sm)]"
      data-testid={testId}
    >
      <h2 className="mb-1 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        <span>{label}</span>
        <span className="font-mono normal-case tracking-normal">{span}</span>
      </h2>
      <div
        className="font-mono text-2xl font-semibold tabular-nums tracking-tight"
        data-testid={`${testId}-value`}
      >
        {value}
      </div>
      <div
        className={cn(
          'font-mono text-[11.5px]',
          change === null
            ? 'text-text-tertiary'
            : change > 0
              ? 'text-text-danger'
              : change < 0
                ? 'text-text-success'
                : 'text-text-tertiary'
        )}
      >
        {change === null
          ? '—'
          : `${change > 0 ? '▲' : change < 0 ? '▼' : '—'} ${Math.abs(change)}% ${intl.formatMessage(i18n.vsPrior, { span })}`}
      </div>
      <div className="truncate font-mono text-[11px] text-text-tertiary">{sub}</div>
      <Sparkline values={spark} colour={colour} />
    </Why>
  );
}

const usd = (v: number, d = 2): string => `$${v.toFixed(d)}`;

export function TelemetryTime({
  grain,
  data,
  error,
  retry,
  now = () => new Date(),
}: {
  grain: Grain;
  data: TelemetryData | null;
  error: string | null;
  retry(): void;
  now?: () => Date;
}) {
  const intl = useIntl();
  const { getProviders } = useConfig();
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  useEffect(() => {
    getProviders(false).then(setProviders);
  }, [getProviders]);
  const loaded = data;

  const model = useMemo(() => {
    if (!loaded) return null;
    const at = now();
    const units = unitsOf(loaded.sessions, loaded.events);
    const range = rangeEnding(grain, at);
    const prior = priorRange(range);
    const cur = inRange(units, range);
    const prev = inRange(units, prior);
    const t = totals(cur);
    const p = totals(prev);
    const stack = buckets(units, range);
    const nb = 14;
    const sparkBins = Array.from({ length: nb }, () => ({ t: 0, c: 0, n: 0 }));
    const spanMs = range.to.getTime() - range.from.getTime();
    for (const u of cur) {
      const i = Math.min(
        nb - 1,
        Math.floor(((u.at.getTime() - range.from.getTime()) / spanMs) * nb)
      );
      sparkBins[i].t += u.inputTokens + u.outputTokens;
      sparkBins[i].c += u.cost ?? 0;
      sparkBins[i].n += u.turns;
    }
    // Cost per week over the quarter holding now, the running total behind.
    const q0 = bucketStart('quarters', at);
    const weeks: { label: string; value: number; turns: number }[] = [];
    for (let start = bucketStart('weeks', q0); start <= at; start = bucketStep('weeks', start, 1)) {
      const end = bucketStep('weeks', start, 1);
      const inWeek = units.filter((u) => u.at >= start && u.at < end && u.at >= q0);
      const wt = totals(inWeek);
      weeks.push({ label: `W${weeks.length + 1}`, value: wt.cost, turns: wt.turns });
    }
    let running = 0;
    const line = weeks.map((w) => {
      running += w.value;
      return {
        label: w.label,
        value: w.value,
        running,
        why: `${usd(w.value)} over ${w.turns} turns — ${w.turns ? usd(w.value / w.turns, 3) : '—'} per turn; ${usd(running)} so far this quarter.`,
        from: 'Σ usage.cost per ISO week · est. where unreported',
      };
    });
    const quarterUnits = units.filter((u) => u.at >= q0);
    const shares = seatShares(quarterUnits);
    const quarterTotal = totals(quarterUnits);
    return {
      units,
      range,
      prior,
      cur,
      t,
      p,
      stack,
      sparkBins,
      line,
      shares,
      quarterTotal,
      quarters: quarterRows(units, at, 4),
      runtimes: byRuntime(cur),
      top: topSessions(cur),
    };
  }, [loaded, grain, now]);

  if (error) {
    return (
      <div className="p-4 text-sm" data-testid="telemetry-time-error">
        <p className="text-text-danger">{intl.formatMessage(i18n.error, { cause: error })}</p>
        <button
          type="button"
          className="mt-2 rounded-control bg-background-secondary px-3 py-1 text-xs shadow-[var(--shadow-sm)]"
          onClick={retry}
        >
          {intl.formatMessage(i18n.retry)}
        </button>
      </div>
    );
  }
  if (!model) {
    return (
      <p className="p-4 text-sm text-text-secondary" data-testid="telemetry-time-loading">
        {intl.formatMessage(i18n.loading)}
      </p>
    );
  }
  const { t, p, stack, sparkBins, line, shares, quarterTotal, quarters, runtimes, top } = model;
  const span = GRAIN_SPAN[grain].chip;
  if (t.turns === 0 && p.turns === 0) {
    return (
      <p className="p-4 text-sm text-text-secondary" data-testid="telemetry-time-empty">
        {intl.formatMessage(i18n.empty)}
      </p>
    );
  }
  const seatIndex = new Map(stack.seats.map((s, i) => [seatKey(s), i]));
  const seatLabel = (s: { provider: string; model: string }): string =>
    `${runtimeLabel(s.provider, providers)} · ${shortModel(s.model)}`;
  const bars: StackBar[] = stack.buckets.map((b, j) => {
    const segments = stack.seats
      .map((s, i) => ({
        seatIndex: i,
        label: seatLabel(s),
        value: b.bySeat.get(seatKey(s)) ?? 0,
        share: b.tokens ? (b.bySeat.get(seatKey(s)) ?? 0) / b.tokens : 0,
      }))
      .filter((seg) => seg.value > 0);
    const tick = grain === 'days' || grain === 'weeks' ? (j % 2 === 0 ? b.label : '') : b.label;
    return {
      key: b.key,
      label: b.label,
      tick,
      total: b.tokens,
      segments,
      live: j === stack.buckets.length - 1,
      why: segments.length
        ? segments
            .map((seg) => `${seg.label} ${fmtK(seg.value)} · ${Math.round(seg.share * 100)}%`)
            .join(' — ') + ` · ${b.turns} turns${b.cost ? ` · ${usd(b.cost)}` : ''}`
        : 'Nothing ran.',
      from: 'Σ tokens by inference.resolvedModel per bucket',
    };
  });
  const card = 'rounded-panel bg-background-secondary p-3 shadow-[var(--shadow-sm)] min-w-0';
  const h2 =
    'mb-2 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wider text-text-tertiary';
  const small = 'font-mono text-[10.5px] normal-case tracking-normal';

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="telemetry-time">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Headline
          label={intl.formatMessage(i18n.tokens)}
          value={fmtK(t.tokens)}
          change={delta(t.tokens, p.tokens)}
          span={span}
          sub={`in ${fmtK(t.inputTokens)} · out ${fmtK(t.outputTokens)}`}
          spark={sparkBins.map((b) => b.t)}
          colour="var(--color-text-info)"
          why={`Total tokens through every seat in the range. Rising with the same turns is context bloat; rising with more turns is more work.${fromList(t)}`}
          from="Σ usage.totalTokens per turn · session list totals where no turns are recorded"
          testId="telemetry-time-headline-tokens"
        />
        <Headline
          label={intl.formatMessage(i18n.cost)}
          value={usd(t.cost)}
          change={delta(t.cost, p.cost)}
          span={span}
          sub={`${usd(t.cost / Math.max(1, (model.range.to.getTime() - model.range.from.getTime()) / 864e5))} / day · ${intl.formatMessage(i18n.unpriced, { count: t.unpriced })}`}
          spark={sparkBins.map((b) => b.c)}
          colour="var(--color-text-warning)"
          why="What the range cost, on the turns that carry a price. The subscription seats report none — their turns are counted, never priced, so this is a floor."
          from="usage.cost where costSource = provider_reported or estimated"
          testId="telemetry-time-headline-cost"
        />
        <Headline
          label={intl.formatMessage(i18n.turns)}
          value={String(t.turns)}
          change={delta(t.turns, p.turns)}
          span={span}
          sub={`${t.sessions} sessions · ${t.workers} workers · ${fmtK(t.tokens / Math.max(t.turns, 1))} tok/turn`}
          spark={sparkBins.map((b) => b.n)}
          colour="var(--color-text-success)"
          why={`One turn is one reply from a model. Tokens ÷ turns is the unit price that should fall as routing improves.${fromList(t)}`}
          from="messages carrying usage · DelegationUpdate per worker"
          testId="telemetry-time-headline-turns"
        />
      </div>

      <section className={card}>
        <Why
          as="h2"
          className={h2}
          why="Which model did the work, bucket by bucket. A stack that changes colour is a routing change; one that only grows is scope growth."
          from="inference.resolvedModel per turn · workers under the seat the roll picked"
        >
          <span data-testid="telemetry-stack-title">{intl.formatMessage(i18n.byModel)}</span>
          <span className={small}>{intl.formatMessage(i18n.hoverBar)}</span>
        </Why>
        <StackedBars bars={bars} testId="telemetry-stack" />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text-secondary">
          {stack.seats.map((s, i) => (
            <Why
              key={seatKey(s)}
              why={`${seatLabel(s)}: ${s.provider}`}
              from={s.model || '—'}
              head={seatLabel(s)}
            >
              <i
                className="mr-1.5 inline-block size-[9px] rounded-[3px] align-[-1px]"
                style={{ background: seatColour(i) }}
              />
              {seatLabel(s)}{' '}
              <span className="font-mono text-[10.5px] text-text-tertiary">{s.model}</span>
            </Why>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className={card}>
          <Why
            as="h2"
            className={h2}
            why="Spend per ISO week; the fill behind is the quarter's running total. A week above trend with no more turns is a model change or context growth."
            from="Σ usage.cost per week"
          >
            <span>{intl.formatMessage(i18n.costPerWeek)}</span>
            <span className={small}>
              {quarters[0]?.label} · {usd(quarterTotal.cost)}
            </span>
          </Why>
          <LineWithRunning points={line} testId="telemetry-cost-line" />
        </section>
        <section className={card}>
          <Why
            as="h2"
            className={h2}
            why="Who carries the quarter. The dearest seat above 60% means the cheaper seats aren't taking their share of the roll."
            from="Σ tokens by inference.resolvedModel · this quarter"
          >
            <span>{intl.formatMessage(i18n.share)}</span>
            <span className={small}>{quarters[0]?.label}</span>
          </Why>
          <div className="flex items-center gap-3">
            <Donut
              parts={shares.map((s) => ({
                seatIndex: seatIndex.get(seatKey(s)) ?? stack.seats.length,
                label: seatLabel(s),
                share: s.share,
                why: `${Math.round(s.share * 100)}% of the quarter's tokens (${fmtK(s.tokens)}) over ${s.turns} turns.`,
                from: s.model,
              }))}
              centre={fmtK(quarterTotal.tokens)}
              sub="tokens"
              testId="telemetry-share"
            />
            <div className="min-w-0 flex-1">
              {shares.slice(0, 6).map((s) => (
                <BarRow
                  key={seatKey(s)}
                  label={shortModel(s.model)}
                  value={s.share}
                  max={1}
                  colour={seatColour(seatIndex.get(seatKey(s)) ?? stack.seats.length)}
                  text={`${Math.round(s.share * 100)}%`}
                  why={`${seatLabel(s)}: ${fmtK(s.tokens)} tokens, ${s.turns} turns${s.cost ? `, ${usd(s.cost)}` : ''} this quarter.`}
                  from={s.model}
                  testId="telemetry-share-row"
                />
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className={card}>
        <Why
          as="h2"
          className={h2}
          why="Quarter on quarter. $ per turn and tokens per turn should fall as routing improves; sessions and turns may rise."
          from="ledger + session list bucketed by quarter"
        >
          <span>{intl.formatMessage(i18n.quarters)}</span>
        </Why>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" data-testid="telemetry-quarters">
            <thead>
              <tr className="text-[11px] font-medium text-text-tertiary">
                <th className="pb-1.5 pr-2 text-left">{intl.formatMessage(i18n.thQuarter)}</th>
                <Why
                  as="th"
                  className="pb-1.5 pr-2 text-right"
                  why="All tokens, all seats."
                  from="Σ usage.totalTokens"
                >
                  {intl.formatMessage(i18n.tokens)}
                </Why>
                <Why
                  as="th"
                  className="pb-1.5 pr-2 text-right"
                  why="Provider-reported plus estimates; the subscription seats add nothing."
                  from="Σ usage.cost"
                >
                  {intl.formatMessage(i18n.cost)}
                </Why>
                <Why
                  as="th"
                  className="pb-1.5 pr-2 text-right"
                  why="Replies from a model, workers included."
                  from="messages carrying usage"
                >
                  {intl.formatMessage(i18n.turns)}
                </Why>
                <Why
                  as="th"
                  className="pb-1.5 pr-2 text-right"
                  why="Chats started; workers not counted."
                  from="session list"
                >
                  {intl.formatMessage(i18n.thSessions)}
                </Why>
                <Why
                  as="th"
                  className="pb-1.5 pr-2 text-right"
                  why="The unit price on priced turns. Should fall as cheaper seats take more turns."
                  from="cost ÷ priced turns"
                >
                  {intl.formatMessage(i18n.thCostPerTurn)}
                </Why>
                <Why
                  as="th"
                  className="pb-1.5 pr-2 text-right"
                  why="Context weight per reply. Rising means bigger prompts, not more work."
                  from="tokens ÷ turns"
                >
                  {intl.formatMessage(i18n.thTokPerTurn)}
                </Why>
                <Why
                  as="th"
                  className="pb-1.5 text-left"
                  why="The seat carrying the most tokens."
                  from="max by inference.resolvedModel"
                >
                  {intl.formatMessage(i18n.thTop)}
                </Why>
              </tr>
            </thead>
            <tbody>
              {quarters.map((q) => (
                <tr
                  key={q.key}
                  className="border-t border-border-primary/40"
                  data-testid="telemetry-quarter-row"
                >
                  <td className="py-1.5 pr-2">{q.label}</td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                    {fmtK(q.tokens)}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{usd(q.cost)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                    {q.turns.toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{q.sessions}</td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                    {q.costPerTurn === null ? '—' : usd(q.costPerTurn, 3)}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                    {fmtK(q.tokensPerTurn)}
                  </td>
                  <td className="py-1.5">
                    {q.top ? (
                      <>
                        {seatLabel(q.top)}{' '}
                        <span className="font-mono text-[11px] text-text-tertiary">
                          {Math.round(q.top.share * 100)}%
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className={card}>
          <Why
            as="h2"
            className={h2}
            why="Turns by runtime, workers under the seat the roll picked. One runtime above 75% means the others aren't in the roll."
            from="inference.provider per turn"
          >
            <span>{intl.formatMessage(i18n.byRuntime)}</span>
            <span className={small}>{span}</span>
          </Why>
          {runtimes.map((r, i) => (
            <BarRow
              key={r.provider || 'unknown'}
              label={runtimeLabel(r.provider, providers) || '—'}
              value={r.turns}
              max={runtimes[0]?.turns ?? 1}
              colour={seatColour(i)}
              text={String(r.turns)}
              why={`${r.turns} turns on ${runtimeLabel(r.provider, providers)}.`}
              from={r.provider || 'no provider recorded'}
              testId="telemetry-runtime-row"
            />
          ))}
        </section>
        <section className={card}>
          <Why
            as="h2"
            className={h2}
            why="Where the money went. One session carrying a quarter of the range is a session to read."
            from="Σ usage.cost per session, workers under the parent"
          >
            <span>{intl.formatMessage(i18n.topSessions)}</span>
            <span className={small}>{span}</span>
          </Why>
          <table className="w-full border-collapse text-xs" data-testid="telemetry-top-sessions">
            <thead>
              <tr className="text-[11px] font-medium text-text-tertiary">
                <th className="pb-1.5 pr-2 text-left">{intl.formatMessage(i18n.thSession)}</th>
                <th className="pb-1.5 pr-2 text-left">{intl.formatMessage(i18n.thModel)}</th>
                <th className="pb-1.5 pr-2 text-right">{intl.formatMessage(i18n.turns)}</th>
                <th className="pb-1.5 text-right">{intl.formatMessage(i18n.cost)}</th>
              </tr>
            </thead>
            <tbody>
              {top.map((s) => {
                const listed = loaded?.sessions.find((x) => x.id === s.sessionId);
                return (
                  <Why
                    key={s.sessionId}
                    as="tr"
                    className="border-t border-border-primary/40"
                    why={`${s.turns} turns on ${seatLabel(s)} — ${t.cost ? Math.round(((s.cost ?? 0) / t.cost) * 100) : 0}% of the range's cost, ${t.tokens ? Math.round((s.tokens / t.tokens) * 100) : 0}% of its tokens.`}
                    from={s.sessionId}
                  >
                    <td className="max-w-[160px] truncate py-1.5 pr-2">
                      {listed?.name || s.sessionId}
                    </td>
                    <td className="py-1.5 pr-2">
                      {shortModel(s.model)}{' '}
                      <span className="font-mono text-[11px] text-text-tertiary">{s.model}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{s.turns}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">
                      {s.cost === null ? '—' : usd(s.cost)}
                    </td>
                  </Why>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
