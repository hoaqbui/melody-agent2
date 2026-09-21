// The send disc's usage ring (task 122): a ring on the disc's edge fills to the most spent
// limit; hovering or focusing the disc opens the breakdown above the composer. The disc
// itself is the child and keeps its click.

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { defineMessages, useIntl } from '../../i18n';
import { cn } from '../../utils';
import {
  dashOffset,
  formatCount,
  mostSpent,
  percentOf,
  RING_CIRCUMFERENCE,
  ringState,
  WARM_AT,
  type UsageLimit,
} from './usage-ring';

const i18n = defineMessages({
  ring: { id: 'usageRing.ring', defaultMessage: 'Usage' },
  ringTitle: {
    id: 'usageRing.ringTitle',
    defaultMessage: '{label}: {used} / {max} ({pct}%)',
  },
  unknown: { id: 'usageRing.unknown', defaultMessage: 'Usage: not known yet' },
  contextWindow: { id: 'usageRing.contextWindow', defaultMessage: 'Context window' },
  compactsAt: {
    id: 'usageRing.compactsAt',
    defaultMessage: 'Compacts automatically at {pct}%',
  },
  compact: { id: 'usageRing.compact', defaultMessage: 'Compact session' },
  planLimits: { id: 'usageRing.planLimits', defaultMessage: 'Plan usage' },
  notReported: {
    id: 'usageRing.notReported',
    defaultMessage: 'Plan limits: not reported by {seat}',
  },
  breakdown: { id: 'usageRing.breakdown', defaultMessage: 'See detailed breakdown' },
});

export const AUTO_COMPACT_AT = 97;

export interface UsageRingProps {
  contextTokens: number;
  contextLimit: number;
  // A seat's plan windows once it reports them; empty until a probe lands.
  planLimits?: readonly UsageLimit[];
  seatLabel: string;
  compactDisabled?: boolean;
  onCompact?: () => void;
  onBreakdown?: () => void;
  children: ReactNode;
}

export function UsageRing({
  contextTokens,
  contextLimit,
  planLimits = [],
  seatLabel,
  compactDisabled,
  onCompact,
  onBreakdown,
  children,
}: UsageRingProps) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const panelId = useId();

  const context: UsageLimit = {
    id: 'context',
    label: intl.formatMessage(i18n.contextWindow),
    used: contextTokens,
    max: contextLimit,
  };
  const limits = [context, ...planLimits];
  const top = mostSpent(limits);
  const state = ringState(limits);
  const pct = top ? percentOf(top) : 0;
  const title = top
    ? intl.formatMessage(i18n.ringTitle, {
        label: top.label,
        used: formatCount(top.used),
        max: formatCount(top.max),
        pct,
      })
    : intl.formatMessage(i18n.unknown);

  const show = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // A pointer crossing the gap between disc and panel must not shut it.
  const hide = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };
  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    },
    []
  );
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <span
      className="relative inline-grid size-9 place-items-center"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) hide();
      }}
      onKeyDown={onKey}
    >
      <svg
        className="pointer-events-none absolute inset-0 -rotate-90"
        viewBox="0 0 36 36"
        aria-hidden="true"
      >
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          className="stroke-border-primary"
          strokeWidth="2.5"
        />
        {state !== 'unknown' && (
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset(pct)}
            className={cn(
              'transition-[stroke-dashoffset] duration-[var(--motion-base)]',
              state === 'full'
                ? 'stroke-text-danger'
                : state === 'warm'
                  ? 'stroke-text-warning'
                  : 'stroke-background-inverse'
            )}
          />
        )}
      </svg>
      <span
        role="meter"
        aria-label={intl.formatMessage(i18n.ring)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={top ? pct : undefined}
        aria-describedby={open ? panelId : undefined}
        title={title}
        data-testid="usage-ring"
        data-state={state}
        data-warm={state === 'warm' || state === 'full' || undefined}
        className="relative z-[1] inline-grid place-items-center"
      >
        {children}
      </span>
      {open && (
        <div
          id={panelId}
          role="tooltip"
          data-testid="usage-breakdown"
          className="absolute right-0 bottom-[calc(100%+8px)] z-50 w-[300px] rounded-panel border border-border-primary bg-background-primary p-3 text-left text-xs text-text-secondary shadow-[var(--shadow-md)]"
          onPointerEnter={show}
          onPointerLeave={hide}
        >
          <LimitRow limit={context} tone={toneFor(percentOf(context))} showReset={false} />
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>{intl.formatMessage(i18n.compactsAt, { pct: AUTO_COMPACT_AT })}</span>
            {onCompact && (
              <button
                type="button"
                className="text-text-info hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                disabled={compactDisabled}
                data-testid="usage-compact"
                onClick={onCompact}
              >
                {intl.formatMessage(i18n.compact)}
              </button>
            )}
          </div>
          <hr className="my-2.5 border-border-primary" />
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
            {intl.formatMessage(i18n.planLimits)}
          </div>
          {planLimits.length === 0 ? (
            <p className="text-text-tertiary" data-testid="usage-not-reported">
              {intl.formatMessage(i18n.notReported, { seat: seatLabel })}
            </p>
          ) : (
            planLimits.map((limit) => (
              <LimitRow key={limit.id} limit={limit} tone={toneFor(percentOf(limit))} showReset />
            ))
          )}
          {onBreakdown && (
            <>
              <hr className="my-2.5 border-border-primary" />
              <button
                type="button"
                className="text-text-secondary hover:text-text-primary"
                data-testid="usage-see-breakdown"
                onClick={onBreakdown}
              >
                {intl.formatMessage(i18n.breakdown)}
              </button>
            </>
          )}
        </div>
      )}
    </span>
  );
}

type Tone = 'fill' | 'warm' | 'full';

function toneFor(pct: number): Tone {
  return pct >= 100 ? 'full' : pct >= WARM_AT ? 'warm' : 'fill';
}

function LimitRow({
  limit,
  tone,
  showReset,
}: {
  limit: UsageLimit;
  tone: Tone;
  showReset: boolean;
}) {
  const pct = percentOf(limit);
  return (
    <div className="mb-2" data-testid={`usage-limit-${limit.id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold text-text-primary">{limit.label}</span>
        <span className="tabular-nums">
          {showReset && limit.resets
            ? `${limit.resets} · `
            : `${formatCount(limit.used)} / ${formatCount(limit.max)} · `}
          <span className="text-text-primary">{pct}%</span>
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-border-primary">
        <div
          className={cn(
            'h-full rounded-full',
            tone === 'full'
              ? 'bg-text-danger'
              : tone === 'warm'
                ? 'bg-text-warning'
                : 'bg-background-inverse'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
