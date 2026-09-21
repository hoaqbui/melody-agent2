// The Trends card (task 132): the three largest movements between this range and the one
// before it, written from templates — the one card on the pane that carries sentences.

import { useEffect, useMemo, useState } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { useConfig } from '../../../components/ConfigContext';
import type { ProviderDetails } from '../../../types/providers';
import { runtimeLabel } from '../../session-controls';
import { rangeEnding, unitsOf } from './telemetry-buckets';
import type { TelemetryData } from './telemetry-data';
import { shortModel } from './telemetry-now';
import { GRAIN_SPAN, type Grain } from './telemetry-state';
import { topTrends, trendCandidates } from './telemetry-trends';
import { Why } from './Why';

// One stable default: a fresh closure per render would re-fire every effect that reads it.
const defaultNow = (): Date => new Date();

const i18n = defineMessages({
  trends: { id: 'telemetryTrends.title', defaultMessage: 'Trends' },
  vsPrior: { id: 'telemetryTrends.vsPrior', defaultMessage: '{span} vs prior {span}' },
  empty: {
    id: 'telemetryTrends.empty',
    defaultMessage: 'No movement yet — two ranges of turns are needed.',
  },
});

export function TelemetryTrends({
  grain,
  data,
  now = defaultNow,
}: {
  grain: Grain;
  data: TelemetryData | null;
  now?: () => Date;
}) {
  const intl = useIntl();
  const { getProviders } = useConfig();
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  useEffect(() => {
    getProviders(false).then(setProviders);
  }, [getProviders]);
  const trends = useMemo(() => {
    if (!data) return null;
    const units = unitsOf(data.sessions, data.events);
    const label = (s: { provider: string; model: string }) =>
      `${runtimeLabel(s.provider, providers)} · ${shortModel(s.model)}`;
    return topTrends(trendCandidates(units, data.events, rangeEnding(grain, now()), label));
  }, [data, grain, now, providers]);
  const span = GRAIN_SPAN[grain].chip;
  return (
    <section
      className="mx-3 mt-1 rounded-panel bg-background-secondary p-3 shadow-[var(--shadow-sm)]"
      data-testid="telemetry-trends"
      data-count={trends?.length ?? 0}
    >
      <h2 className="mb-1.5 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        <span>{intl.formatMessage(i18n.trends)}</span>
        <span className="font-mono text-[10.5px] normal-case tracking-normal">
          {intl.formatMessage(i18n.vsPrior, { span })}
        </span>
      </h2>
      {trends === null ? (
        <div className="space-y-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-3.5 w-3/4 rounded bg-background-tertiary/60" />
          ))}
        </div>
      ) : trends.length === 0 ? (
        <p className="text-sm text-text-secondary" data-testid="telemetry-trends-empty">
          {intl.formatMessage(i18n.empty)}
        </p>
      ) : (
        <ol className="m-0 list-decimal space-y-1 pl-5 text-[13.5px] text-text-secondary">
          {trends.map((trend) => (
            <Why
              key={trend.id}
              as="li"
              why={trend.why}
              from={trend.from}
              head=""
              focusable
              data-testid="telemetry-trend"
              data-id={trend.id}
            >
              {trend.parts.map((part, i) =>
                part.b ? (
                  <b key={i} className="font-semibold text-text-primary">
                    {part.text}
                  </b>
                ) : part.n ? (
                  <span key={i} className="font-mono tabular-nums">
                    {part.text}
                  </span>
                ) : (
                  <span key={i}>{part.text}</span>
                )
              )}
            </Why>
          ))}
        </ol>
      )}
    </section>
  );
}
