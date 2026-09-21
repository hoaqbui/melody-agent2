// The Telemetry pane (task 128; PRD docs/2026-09-20-work-ledger-prd-v1.md): one tab, three
// scopes — Now · Over time · Roles — over the work ledger, with three data-written trends at
// the top. Words live in the Trends card and the hover tooltip; every card is numbers.

import { useCallback, useEffect, useState } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { cn } from '../../../utils';
import { usePaneContext } from '../../pane-context';
import { TelemetryNow } from './TelemetryNow';
import { Why, WhyProvider } from './Why';
import {
  GRAINS,
  GRAIN_SPAN,
  loadGrain,
  loadScope,
  saveGrain,
  saveScope,
  SCOPES,
  type Grain,
  type Scope,
} from './telemetry-state';

const i18n = defineMessages({
  scopeNow: { id: 'telemetryPane.scopeNow', defaultMessage: 'Now' },
  scopeTime: { id: 'telemetryPane.scopeTime', defaultMessage: 'Over time' },
  scopeRoles: { id: 'telemetryPane.scopeRoles', defaultMessage: 'Roles' },
  grainDays: { id: 'telemetryPane.grainDays', defaultMessage: 'Days' },
  grainWeeks: { id: 'telemetryPane.grainWeeks', defaultMessage: 'Weeks' },
  grainMonths: { id: 'telemetryPane.grainMonths', defaultMessage: 'Months' },
  grainQuarters: { id: 'telemetryPane.grainQuarters', defaultMessage: 'Quarters' },
  scopeWhy: {
    id: 'telemetryPane.scopeWhy',
    defaultMessage:
      'Now is the open session. Over time is every session on this Mac, bucketed by when its turns landed. Roles is every delegation, judged by what became of its work.',
  },
  grainWhy: {
    id: 'telemetryPane.grainWhy',
    defaultMessage:
      "The grain of every chart in Over time and Roles. Quarters show the year's shape; Days show what last week cost.",
  },
  rangeWhy: {
    id: 'telemetryPane.rangeWhy',
    defaultMessage:
      'How far back the charts look; every delta compares against the same span before it.',
  },
  comingTime: {
    id: 'telemetryPane.comingTime',
    defaultMessage: 'No turns in this range — widen it.',
  },
  comingRoles: {
    id: 'telemetryPane.comingRoles',
    defaultMessage: 'No delegated work in this range.',
  },
});

const SCOPE_LABEL = { now: i18n.scopeNow, time: i18n.scopeTime, roles: i18n.scopeRoles } as const;
const GRAIN_LABEL = {
  days: i18n.grainDays,
  weeks: i18n.grainWeeks,
  months: i18n.grainMonths,
  quarters: i18n.grainQuarters,
} as const;

// A row of pressed/unpressed buttons — the lever's shape, the tab bar's shadow.
function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
  testId,
}: {
  options: readonly T[];
  value: T;
  onChange(next: T): void;
  label(option: T): string;
  testId: string;
}) {
  return (
    <span
      className="inline-flex rounded-control bg-background-secondary p-[3px] shadow-[var(--shadow-sm)]"
      role="group"
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          data-testid={`${testId}-${option}`}
          onClick={() => onChange(option)}
          className={cn(
            'rounded-[9px] px-3 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
            option === value
              ? 'bg-background-primary text-text-primary shadow-[var(--shadow-sm)]'
              : 'text-text-tertiary hover:text-text-secondary'
          )}
        >
          {label(option)}
        </button>
      ))}
    </span>
  );
}

// What a scope renders until its task lands (130 Over time · 131 Roles): the PRD's Empty line.
function Placeholder({ text, testId }: { text: string; testId: string }) {
  return (
    <p className="p-4 text-sm text-text-secondary" data-testid={testId}>
      {text}
    </p>
  );
}

export function TelemetryPane() {
  const intl = useIntl();
  const { cwd } = usePaneContext();
  const [scope, setScope] = useState<Scope>(() => loadScope(cwd));
  const [grain, setGrain] = useState<Grain>(() => loadGrain(cwd));
  useEffect(() => {
    setScope(loadScope(cwd));
    setGrain(loadGrain(cwd));
  }, [cwd]);
  const pickScope = useCallback(
    (next: Scope) => {
      setScope(next);
      saveScope(cwd, next);
    },
    [cwd]
  );
  const pickGrain = useCallback(
    (next: Grain) => {
      setGrain(next);
      saveGrain(cwd, next);
    },
    [cwd]
  );

  const view =
    scope === 'now' ? (
      <TelemetryNow />
    ) : scope === 'time' ? (
      <Placeholder text={intl.formatMessage(i18n.comingTime)} testId="telemetry-time-empty" />
    ) : (
      <Placeholder text={intl.formatMessage(i18n.comingRoles)} testId="telemetry-roles-empty" />
    );

  return (
    <WhyProvider>
      <div
        className="flex h-full min-h-0 flex-col"
        data-testid="telemetry-pane"
        data-scope={scope}
        data-grain={grain}
      >
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <Why why={intl.formatMessage(i18n.scopeWhy)} from="scope" head="" focusable>
            <Seg
              options={SCOPES}
              value={scope}
              onChange={pickScope}
              label={(option) => intl.formatMessage(SCOPE_LABEL[option])}
              testId="telemetry-scope"
            />
          </Why>
          {scope !== 'now' && (
            <Why
              why={intl.formatMessage(i18n.grainWhy)}
              from="ledger · bucketed by turn time"
              head=""
            >
              <Seg
                options={GRAINS}
                value={grain}
                onChange={pickGrain}
                label={(option) => intl.formatMessage(GRAIN_LABEL[option])}
                testId="telemetry-range"
              />
            </Why>
          )}
          <span className="flex-1" />
          {scope !== 'now' && (
            <Why
              why={intl.formatMessage(i18n.rangeWhy)}
              from={`${GRAIN_SPAN[grain].buckets} × ${grain}`}
              head=""
            >
              <span
                className="rounded-chip bg-background-secondary px-2.5 py-1 font-mono text-[11px] text-text-secondary shadow-[var(--shadow-sm)]"
                data-testid="telemetry-range-label"
              >
                {GRAIN_SPAN[grain].chip}
              </span>
            </Why>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{view}</div>
      </div>
    </WhyProvider>
  );
}
