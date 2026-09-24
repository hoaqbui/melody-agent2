// Roles (task 131): where each role's work went, whether it survived the session, and how
// that moved week by week — ribbons, the board, the lines. Numbers on the surface; the why
// on hover.

import { useEffect, useMemo, useState } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { useConfig } from '../../../components/ConfigContext';
import { acpSessionChildren } from '../../../acp/sessions';
import { readLedger, type LedgerEvent } from '../../../native/ledger';
import type { ProviderDetails } from '../../../types/providers';
import { cn } from '../../../utils';
import { usePaneContext } from '../../pane-context';
import { runtimeLabel } from '../../session-controls';
import { fmtK, seatColour } from './charts';
import { bucketStart, rangeEnding } from './telemetry-buckets';
import { shortModel } from './telemetry-now';
import {
  childRecord,
  flows,
  passRate,
  roleRows,
  weeklyCleanDone,
  workersIn,
  type ChildRecord,
  type Flow,
  type RoleRow,
  type TrendLine,
  type Verdict,
} from './telemetry-roles';
import { loadProjectEntry, saveProjectEntry } from '../../project-storage';
import { GRAIN_SPAN, type Grain } from './telemetry-state';
import { Why } from './Why';

// One stable default: a fresh closure per render would re-fire every effect that reads it.
const defaultNow = (): Date => new Date();

const i18n = defineMessages({
  routing: { id: 'telemetryRoles.routing', defaultMessage: 'Routing — role → seat' },
  hoverRole: { id: 'telemetryRoles.hoverRole', defaultMessage: 'hover a role' },
  roles: { id: 'telemetryRoles.roles', defaultMessage: 'Roles' },
  trend: { id: 'telemetryRoles.trend', defaultMessage: 'Clean-done by role' },
  weekly: { id: 'telemetryRoles.weekly', defaultMessage: 'this quarter · weekly · hover a line' },
  routingChanged: { id: 'telemetryRoles.routingChanged', defaultMessage: 'routing change' },
  routingChangedWhy: {
    id: 'telemetryRoles.routingChangedWhy',
    defaultMessage:
      'The day the routing rule changed (AGENTS.md §Model routing) — the app cannot read that file, so you set the date here; the chart marks it so what bends after it is the change working or not.',
  },
  empty: { id: 'telemetryRoles.empty', defaultMessage: 'No delegated work in this range.' },
  loading: { id: 'telemetryRoles.loading', defaultMessage: 'Reading the ledger…' },
  retry: { id: 'telemetryRoles.retry', defaultMessage: 'Retry' },
  thRole: { id: 'telemetryRoles.thRole', defaultMessage: 'Role' },
  thSeat: { id: 'telemetryRoles.thSeat', defaultMessage: 'Seat (most)' },
  thRuns: { id: 'telemetryRoles.thRuns', defaultMessage: 'Runs' },
  thDone: { id: 'telemetryRoles.thDone', defaultMessage: 'Done' },
  thBlocked: { id: 'telemetryRoles.thBlocked', defaultMessage: 'Blocked' },
  thCorrected: { id: 'telemetryRoles.thCorrected', defaultMessage: 'Corrected' },
  thPass: { id: 'telemetryRoles.thPass', defaultMessage: 'Review PASS' },
  thMedian: { id: 'telemetryRoles.thMedian', defaultMessage: 'Median' },
  thTokens: { id: 'telemetryRoles.thTokens', defaultMessage: 'Tok / run' },
  thTrend: { id: 'telemetryRoles.thTrend', defaultMessage: 'Trend' },
  thVerdict: { id: 'telemetryRoles.thVerdict', defaultMessage: 'Verdict' },
  effective: { id: 'telemetryRoles.effective', defaultMessage: 'Effective' },
  watch: { id: 'telemetryRoles.watch', defaultMessage: 'Watch' },
  failing: { id: 'telemetryRoles.failing', defaultMessage: 'Failing' },
  runs: { id: 'telemetryRoles.runs', defaultMessage: '{count} runs' },
});

const COLUMN_WHY: Record<string, { why: string; from: string }> = {
  role: {
    why: 'The role file that was delegated.',
    from: '.agents/agents/<role>.md · DelegationUpdate.source',
  },
  seat: {
    why: "The seat that took most of this role's runs, from the role file's own weights.",
    from: 'mode of provider · model per role',
  },
  runs: {
    why: "Delegations in the range. Only work that went through delegate is here — the session's own subagents never touch this wire.",
    from: 'count DelegationUpdate per source',
  },
  done: {
    why: 'Returned text without error. Includes BLOCKED returns, jobs the session rewrote, and done runs no commit has matched yet — clean-done is the number that takes those out.',
    from: 'DelegationUpdate.status = done',
  },
  blocked: {
    why: "Returned BLOCKED: the plan's assumption failed against the tree. A failure of the plan, not the seat. Never clean, even if its files later land.",
    from: 'the job outcome fold: job.blocked, outcome = blocked',
  },
  corrected: {
    why: "The session edited the worker's files after it returned Done, and nothing else about the job outranks it. The one number that says the seat cost more than it saved.",
    from: 'the job outcome fold: correction or a "fixed it" verdict, outcome = corrected',
  },
  pass: {
    why: "The range's review verdicts as one rate — branch-level, not attributed to a role: a worker carries no branch on the wire.",
    from: 'review verdicts in the range ÷ reviews',
  },
  median: { why: 'Median wall clock per run.', from: 'child createdAt → lastMessageAt' },
  tokens: {
    why: "Tokens the role burns per run — its price at the seat's rate.",
    from: 'child session totals ÷ runs',
  },
  trend: {
    why: 'Clean-done, weekly, per the job outcome fold: landed, and nothing else — a done run with no matching commit yet reads unknown, not clean.',
    from: 'landed jobs ÷ runs per week',
  },
  verdict: {
    why: 'Effective: clean-done ≥ 80% (and PASS ≥ 80% when attributed). Watch: below either. Failing: corrected ≥ half the runs, or clean-done under 50%.',
    from: 'the columns to the left',
  },
};

const ROUTING_CHANGE_KEY = 'goose.workspace.telemetry.routingChangedAt';

// The ISO-week index, within the quarter holding `now`, of a date the user typed; null when
// unset or outside the quarter.
function markerWeek(date: string, now: Date): number | null {
  if (!date) return null;
  const at = new Date(date + 'T12:00:00');
  if (Number.isNaN(at.getTime())) return null;
  const q0 = bucketStart('quarters', now);
  if (at < q0 || at > now) return null;
  const w0 = bucketStart('weeks', q0);
  return Math.floor((bucketStart('weeks', at).getTime() - w0.getTime()) / (7 * 864e5));
}

const PILL: Record<Verdict, string> = {
  effective: 'bg-text-success/15 text-text-success',
  watch: 'bg-text-warning/20 text-text-warning',
  failing: 'bg-text-danger/15 text-text-danger',
};

// The prototype's ribbons: roles on the left, seats on the right, one cubic path per flow
// whose width is its runs; a dashed danger thread for the failed runs among them.
function Ribbons({
  rows,
  seatLabel,
  testId,
}: {
  rows: Flow[];
  seatLabel(s: { provider: string; model: string }): string;
  testId: string;
}) {
  const [hot, setHot] = useState<string | null>(null);
  const W = 640;
  const H = 270;
  const LX = 8;
  const RX = 632;
  const NW = 6;
  const PAD = 8;
  const MINH = 24;
  const roles = [...new Set(rows.map((f) => f.source))];
  const seats = [...new Set(rows.map((f) => `${f.provider}|${f.model}`))];
  const roleRuns = roles.map((r) =>
    rows.filter((f) => f.source === r).reduce((a, f) => a + f.runs, 0)
  );
  const seatRuns = seats.map((s) =>
    rows.filter((f) => `${f.provider}|${f.model}` === s).reduce((a, f) => a + f.runs, 0)
  );
  const layout = (counts: number[]) => {
    let scale =
      (H - PAD * (counts.length + 1)) /
      Math.max(
        counts.reduce((a, b) => a + b, 0),
        1
      );
    for (let k = 0; k < 6; k++) {
      const hs = counts.map((c) => Math.max(c * scale, MINH));
      const over = hs.reduce((a, b) => a + b, 0) + PAD * (counts.length + 1) - H;
      if (over <= 0) break;
      scale *= 1 - over / hs.reduce((a, b) => a + b, 0);
    }
    const pos: { y: number; h: number; ribbon: number }[] = [];
    let y = PAD;
    counts.forEach((c) => {
      const h = Math.max(c * scale, MINH);
      pos.push({ y, h, ribbon: c * scale });
      y += h + PAD;
    });
    return { pos, scale };
  };
  const L = layout(roleRuns);
  const R = layout(seatRuns);
  const lOff = roles.map(() => 0);
  const rOff = seats.map(() => 0);
  const x1 = LX + NW + 96;
  const x2 = RX - NW - 140;
  const c = (x1 + x2) / 2;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      data-testid={testId}
      onMouseLeave={() => setHot(null)}
    >
      {rows.map((f, k) => {
        const ri = roles.indexOf(f.source);
        const si = seats.indexOf(`${f.provider}|${f.model}`);
        const h1 = f.runs * L.scale;
        const h2 = f.runs * R.scale;
        const y1 = L.pos[ri].y + (L.pos[ri].h - L.pos[ri].ribbon) / 2 + lOff[ri] + h1 / 2;
        const y2 = R.pos[si].y + (R.pos[si].h - R.pos[si].ribbon) / 2 + rOff[si] + h2 / 2;
        lOff[ri] += h1;
        rOff[si] += h2;
        const d = `M${x1},${y1} C${c},${y1} ${c},${y2} ${x2},${y2}`;
        const dim = hot !== null && hot !== f.source;
        return (
          <g key={k} onMouseEnter={() => setHot(f.source)}>
            <Why
              as="g"
              why={`${f.runs} runs, ${f.failed} came back failed.`}
              from="DelegationUpdate.source → provider · model"
              head={`${f.source} → ${seatLabel(f)}`}
            >
              <path
                d={d}
                fill="none"
                stroke={seatColour(si)}
                strokeWidth={Math.max((h1 + h2) / 2, 2)}
                opacity={dim ? 0.08 : hot === f.source ? 0.95 : 0.55}
                className="transition-opacity duration-200"
              />
              {f.failed > 0 && (
                <path
                  d={`M${x1},${y1 + h1 / 2 - 1.5} C${c},${y1 + h1 / 2 - 1.5} ${c},${y2 + h2 / 2 - 1.5} ${x2},${y2 + h2 / 2 - 1.5}`}
                  fill="none"
                  stroke="var(--color-text-danger)"
                  strokeWidth={1.5}
                  strokeDasharray="6 5"
                  opacity={dim ? 0.1 : 0.85}
                />
              )}
            </Why>
          </g>
        );
      })}
      {roles.map((r, i) => (
        <g
          key={r}
          onMouseEnter={() => setHot(r)}
          opacity={hot !== null && hot !== r ? 0.3 : 1}
          className="transition-opacity duration-200"
        >
          <rect
            x={LX + 96}
            y={L.pos[i].y}
            width={NW}
            height={L.pos[i].h}
            rx={3}
            fill="var(--color-text-info)"
            opacity={0.9}
          />
          <text
            x={LX + 90}
            y={L.pos[i].y + L.pos[i].h / 2 + 4}
            textAnchor="end"
            className="fill-text-primary text-[11px]"
          >
            {r}
          </text>
          <text
            x={LX + 90}
            y={L.pos[i].y + L.pos[i].h / 2 + 15}
            textAnchor="end"
            className="fill-text-tertiary font-mono text-[10px]"
          >
            {roleRuns[i]} runs
          </text>
        </g>
      ))}
      {seats.map((s, j) => {
        const [provider, model] = s.split('|');
        return (
          <g key={s}>
            <rect
              x={RX - NW - 140}
              y={R.pos[j].y}
              width={NW}
              height={R.pos[j].h}
              rx={3}
              fill={seatColour(j)}
            />
            <text
              x={RX - 134}
              y={R.pos[j].y + R.pos[j].h / 2 + 4}
              className="fill-text-primary text-[11px]"
            >
              {seatLabel({ provider, model })}{' '}
              <tspan className="fill-text-tertiary font-mono text-[10px]">{seatRuns[j]}</tspan>
            </text>
            <text
              x={RX - 134}
              y={R.pos[j].y + R.pos[j].h / 2 + 15}
              className="fill-text-tertiary font-mono text-[10px]"
            >
              {model}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function TrendLines({
  lines,
  testId,
  marker,
  markerLabel,
}: {
  lines: TrendLine[];
  testId: string;
  // The week index of the routing change, when one is set.
  marker: number | null;
  markerLabel: string;
}) {
  const [hot, setHot] = useState<number | null>(null);
  const W = 640;
  const H = 180;
  const L = 40;
  const R = 122;
  const T = 14;
  const B = 22;
  const n = Math.max(lines[0]?.labels.length ?? 1, 2);
  const x = (i: number): number => L + (i * (W - L - R)) / (n - 1);
  const y = (v: number): number => T + (H - T - B) * (1 - v / 100);
  const labels = lines
    .map((l, k) => {
      const last = [...l.points].reverse().find((p) => p !== null);
      return { k, name: l.source, y: y(last ?? 0) };
    })
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++)
    if (labels[i].y - labels[i - 1].y < 12) labels[i].y = labels[i - 1].y + 12;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      data-testid={testId}
      onMouseLeave={() => setHot(null)}
    >
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line
            x1={L}
            x2={W - R}
            y1={y(g)}
            y2={y(g)}
            stroke="var(--color-border-primary)"
            strokeWidth={1}
          />
          <text
            x={L - 6}
            y={y(g) + 3}
            textAnchor="end"
            className="fill-text-tertiary font-mono text-[10px]"
          >
            {g}%
          </text>
        </g>
      ))}
      {marker !== null && marker >= 0 && marker < n && (
        <g data-testid={`${testId}-marker`}>
          <line
            x1={x(marker)}
            x2={x(marker)}
            y1={T}
            y2={H - B}
            stroke="var(--color-text-tertiary)"
            strokeDasharray="3 3"
          />
          <text x={x(marker) + 4} y={T + 9} className="fill-text-tertiary font-mono text-[10px]">
            {markerLabel}
          </text>
        </g>
      )}
      {(lines[0]?.labels ?? []).map(
        (label, i) =>
          i % 2 === 0 && (
            <text
              key={label}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="fill-text-tertiary font-mono text-[10px]"
            >
              {label}
            </text>
          )
      )}
      {lines.map((line, k) => {
        const segments: string[] = [];
        let current: string[] = [];
        line.points.forEach((p, i) => {
          if (p === null) {
            if (current.length) segments.push(current.join(' '));
            current = [];
          } else current.push(`${x(i)},${y(p)}`);
        });
        if (current.length) segments.push(current.join(' '));
        const first = line.points.find((p) => p !== null) ?? 0;
        const last = [...line.points].reverse().find((p) => p !== null) ?? 0;
        return (
          <g
            key={line.source}
            onMouseEnter={() => setHot(k)}
            opacity={hot !== null && hot !== k ? 0.15 : 1}
            className="transition-opacity duration-200"
          >
            <Why
              as="g"
              why={`${first}% → ${last}% clean-done across the quarter (${last - first >= 0 ? '+' : ''}${last - first} pts).`}
              from="landed jobs ÷ runs per week"
              head={line.source}
            >
              {segments.map((points, s) => (
                <polyline
                  key={s}
                  points={points}
                  fill="none"
                  stroke={seatColour(k)}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              ))}
              {line.points.map(
                (p, i) =>
                  p !== null && <circle key={i} cx={x(i)} cy={y(p)} r={2.5} fill={seatColour(k)} />
              )}
            </Why>
          </g>
        );
      })}
      {labels.map((l) => (
        <text key={l.k} x={W - R + 8} y={l.y + 4} className="text-[10px]" fill={seatColour(l.k)}>
          {l.name}
        </text>
      ))}
    </svg>
  );
}

interface Loaded {
  events: LedgerEvent[];
  children: Map<string, ChildRecord>;
}

async function loadAll(cwd: string, grain: Grain, now: Date): Promise<Loaded> {
  const events = await readLedger(cwd);
  const parents = new Set(workersIn(events, rangeEnding(grain, now)).map((w) => w.sessionId));
  const children = new Map<string, ChildRecord>();
  await Promise.all(
    [...parents].map((parent) =>
      acpSessionChildren(parent)
        .then((items) => {
          for (const item of items) children.set(item.id, childRecord(item));
        })
        .catch(() => {})
    )
  );
  return { events, children };
}

export function TelemetryRoles({ grain, now = defaultNow }: { grain: Grain; now?: () => Date }) {
  const intl = useIntl();
  const { cwd } = usePaneContext();
  const { getProviders } = useConfig();
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  useEffect(() => {
    getProviders(false).then(setProviders);
  }, [getProviders]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The routing change's date, kept per project; the chart marks its week.
  const [routingChangedAt, setRoutingChangedAt] = useState<string>(() => {
    const saved = loadProjectEntry(ROUTING_CHANGE_KEY, cwd);
    return typeof saved === 'string' ? saved : '';
  });
  useEffect(() => {
    const saved = loadProjectEntry(ROUTING_CHANGE_KEY, cwd);
    setRoutingChangedAt(typeof saved === 'string' ? saved : '');
  }, [cwd]);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadAll(cwd, grain, now())
      .then((result) => {
        if (!cancelled) setLoaded(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, grain, now, attempt]);

  const model = useMemo(() => {
    if (!loaded) return null;
    const at = now();
    const range = rangeEnding(grain, at);
    const workers = workersIn(loaded.events, range);
    return {
      flows: flows(workers),
      rows: roleRows(workers, loaded.events, at.getTime(), loaded.children),
      pass: passRate(loaded.events, range),
      lines: weeklyCleanDone(loaded.events, at),
    };
  }, [loaded, grain, now]);

  const seatLabel = (s: { provider: string; model: string }): string =>
    `${runtimeLabel(s.provider, providers)} · ${shortModel(s.model)}`;
  const span = GRAIN_SPAN[grain].chip;
  const card = 'rounded-panel bg-background-secondary p-3 shadow-[var(--shadow-sm)] min-w-0';
  const h2 =
    'mb-2 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wider text-text-tertiary';
  const small = 'font-mono text-[10.5px] normal-case tracking-normal';
  const th = (id: string, label: string, right = false) => (
    <Why
      as="th"
      key={id}
      why={COLUMN_WHY[id].why}
      from={COLUMN_WHY[id].from}
      head={label}
      className={cn(
        'whitespace-nowrap pb-1.5 pr-2 text-[11px] font-medium text-text-tertiary',
        right ? 'text-right' : 'text-left'
      )}
    >
      {label}
    </Why>
  );
  const meter = (value: number, colour: string) => (
    <>
      <span className="mr-1.5 inline-block h-1.5 w-11 overflow-hidden rounded-full bg-background-tertiary/60 align-middle">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.round(value * 100)}%`, background: colour }}
        />
      </span>
      {Math.round(value * 100)}%
    </>
  );
  const verdictLabel = (v: Verdict) =>
    intl.formatMessage({ effective: i18n.effective, watch: i18n.watch, failing: i18n.failing }[v]);

  if (error) {
    return (
      <div className="p-4 text-sm" data-testid="telemetry-roles-error">
        <p className="text-text-danger">{error}</p>
        <button
          type="button"
          className="mt-2 rounded-control bg-background-secondary px-3 py-1 text-xs shadow-[var(--shadow-sm)]"
          onClick={() => setAttempt((k) => k + 1)}
        >
          {intl.formatMessage(i18n.retry)}
        </button>
      </div>
    );
  }
  if (!model) {
    return (
      <p className="p-4 text-sm text-text-secondary" data-testid="telemetry-roles-loading">
        {intl.formatMessage(i18n.loading)}
      </p>
    );
  }
  if (model.rows.length === 0) {
    return (
      <p className="p-4 text-sm text-text-secondary" data-testid="telemetry-roles-empty">
        {intl.formatMessage(i18n.empty)}
      </p>
    );
  }
  const rowWhy = (r: RoleRow): string =>
    `${r.runs} runs on ${seatLabel(r)}: ${r.done} done, ${r.blocked} blocked, ${r.corrected} corrected by the session, ${r.failed} failed — clean-done ${Math.round(r.cleanDone * 100)}%.`;

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="telemetry-roles">
      <section className={card}>
        <Why
          as="h2"
          className={h2}
          why="Where each role's work went. Width = runs. A dashed red thread is the runs that came back failed — the seat didn't answer. Only work that went through delegate is here."
          from="DelegationUpdate.source → provider · model"
        >
          <span>{intl.formatMessage(i18n.routing)}</span>
          <span className={small}>
            {span} · {intl.formatMessage(i18n.hoverRole)}
          </span>
        </Why>
        <Ribbons rows={model.flows} seatLabel={seatLabel} testId="telemetry-routing" />
      </section>

      <section className={card}>
        <Why
          as="h2"
          className={h2}
          why="Is each role worth its seat? Done alone lies: a BLOCKED return and a diff the session rewrote both count as Done on the wire. Corrected is the number that decides."
          from="ledger: worker · correction · review"
        >
          <span>{intl.formatMessage(i18n.roles)}</span>
          <span className={small}>{span}</span>
        </Why>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs" data-testid="telemetry-roles-board">
            <thead>
              <tr>
                {th('role', intl.formatMessage(i18n.thRole))}
                {th('seat', intl.formatMessage(i18n.thSeat))}
                {th('runs', intl.formatMessage(i18n.thRuns), true)}
                {th('done', intl.formatMessage(i18n.thDone))}
                {th('blocked', intl.formatMessage(i18n.thBlocked), true)}
                {th('corrected', intl.formatMessage(i18n.thCorrected), true)}
                {th('pass', intl.formatMessage(i18n.thPass))}
                {th('median', intl.formatMessage(i18n.thMedian), true)}
                {th('tokens', intl.formatMessage(i18n.thTokens), true)}
                {th('trend', intl.formatMessage(i18n.thTrend))}
                {th('verdict', intl.formatMessage(i18n.thVerdict))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((r) => {
                const line = model.lines.find((l) => l.source === r.source);
                const points = (line?.points ?? [])
                  .map((p, i, arr) =>
                    p === null
                      ? null
                      : `${2 + (i * 68) / Math.max(arr.length - 1, 1)},${18 - (p / 100) * 16}`
                  )
                  .filter((p): p is string => p !== null);
                return (
                  <Why
                    key={r.source}
                    as="tr"
                    why={rowWhy(r)}
                    from={`${r.source}.md · DelegationUpdate`}
                    head={r.source}
                    className="border-t border-border-primary/40 align-middle hover:bg-background-secondary/40"
                    data-testid="telemetry-roles-row"
                    data-role={r.source}
                    data-verdict={r.verdict}
                  >
                    <td className="py-1.5 pr-2 font-medium text-text-info">{r.source}</td>
                    <td className="whitespace-nowrap py-1.5 pr-2">
                      {seatLabel(r)}{' '}
                      <span className="font-mono text-[11px] text-text-tertiary">{r.provider}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{r.runs}</td>
                    <td className="whitespace-nowrap py-1.5 pr-2">
                      {meter(
                        r.runs ? r.done / r.runs : 0,
                        r.corrected >= r.runs / 2
                          ? 'var(--color-text-tertiary)'
                          : 'var(--color-text-success)'
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{r.blocked}</td>
                    <td
                      className={cn(
                        'py-1.5 pr-2 text-right font-mono tabular-nums',
                        r.corrected >= r.runs / 2 && r.runs > 0 && 'text-text-danger'
                      )}
                    >
                      {r.corrected}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-2">
                      {model.pass.rate === null ? (
                        <span className="rounded-chip bg-background-tertiary/60 px-2 py-px text-[10.5px] text-text-tertiary">
                          n/a
                        </span>
                      ) : (
                        meter(
                          model.pass.rate,
                          model.pass.rate >= 0.8
                            ? 'var(--color-text-success)'
                            : 'var(--color-text-warning)'
                        )
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                      {r.medianMinutes === null ? '—' : `${Math.round(r.medianMinutes)} m`}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                      {r.tokensPerRun === null ? '—' : fmtK(r.tokensPerRun)}
                    </td>
                    <td className="py-1.5 pr-2">
                      <svg
                        viewBox="0 0 72 20"
                        className="inline-block h-5 w-[72px] align-middle"
                        aria-hidden="true"
                      >
                        {points.length > 1 && (
                          <polyline
                            points={points.join(' ')}
                            fill="none"
                            stroke={
                              r.verdict === 'effective'
                                ? 'var(--color-text-success)'
                                : r.verdict === 'watch'
                                  ? 'var(--color-text-warning)'
                                  : 'var(--color-text-danger)'
                            }
                            strokeWidth={1.5}
                          />
                        )}
                      </svg>
                    </td>
                    <td className="py-1.5">
                      <span
                        className={cn(
                          'inline-block rounded-chip px-2 py-px text-[10.5px] font-semibold',
                          PILL[r.verdict]
                        )}
                      >
                        {verdictLabel(r.verdict)}
                      </span>
                    </td>
                  </Why>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <Why
          as="h2"
          className={h2}
          why="Clean-done rate per role, weekly, across the quarter. A line that bends after a routing change is the change working or not."
          from="landed jobs ÷ runs per role per week"
        >
          <span>{intl.formatMessage(i18n.trend)}</span>
          <span className={small}>{intl.formatMessage(i18n.weekly)}</span>
        </Why>
        <div className="mb-2 flex items-center gap-2 text-[11px] text-text-tertiary">
          <Why
            why={intl.formatMessage(i18n.routingChangedWhy)}
            from="workspace.telemetry.routingChangedAt · per project"
            head={intl.formatMessage(i18n.routingChanged)}
          >
            <label htmlFor="telemetry-routing-changed">
              {intl.formatMessage(i18n.routingChanged)}
            </label>
          </Why>
          <input
            id="telemetry-routing-changed"
            type="date"
            value={routingChangedAt}
            data-testid="telemetry-routing-changed"
            onChange={(event) => {
              setRoutingChangedAt(event.target.value);
              saveProjectEntry(ROUTING_CHANGE_KEY, cwd, event.target.value);
            }}
            className="rounded-control bg-background-tertiary/60 px-2 py-0.5 font-mono text-[11px] text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          />
        </div>
        <TrendLines
          lines={model.lines}
          testId="telemetry-role-trend"
          marker={markerWeek(routingChangedAt, now())}
          markerLabel={intl.formatMessage(i18n.routingChanged)}
        />
      </section>
    </div>
  );
}
