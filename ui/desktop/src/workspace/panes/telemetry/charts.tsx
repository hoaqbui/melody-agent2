// The Telemetry pane's charts (task 130): inline SVG to the prototype's picture
// (docs/mockups/2026-09-20-work-ledger.html), no chart library. Every mark explains itself
// through `Why`; bars transition between grains; reduced motion is respected by CSS.

import { type ReactNode } from 'react';
import { Why } from './Why';

// Seat colours are the chart's, not the runtime's (DESIGN.md §Tokens: runtime identity has no
// colour role) — a fixed cycle over the semantic roles plus two neutrals, by share order.
const SEAT_COLOURS = [
  'var(--color-text-info)',
  'var(--color-text-warning)',
  'var(--color-text-success)',
  'var(--color-text-danger)',
  'var(--color-text-secondary)',
  'var(--color-text-tertiary)',
];
export const seatColour = (index: number): string => SEAT_COLOURS[index % SEAT_COLOURS.length];

// 64.2k · 200k · 1.5M — one decimal until the number has three digits before the unit.
export const fmtK = (v: number): string =>
  v >= 1e6
    ? `${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1).replace(/\.0$/, '')}M`
    : v >= 1e3
      ? `${(v / 1e3).toFixed(v >= 1e5 ? 0 : 1).replace(/\.0$/, '')}k`
      : String(Math.round(v));

// A tick step that lands on 1 · 2 · 5 × 10ⁿ.
export function niceStep(max: number, ticks = 4): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / power;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * power;
}

export interface StackSegment {
  seatIndex: number;
  label: string;
  value: number;
  share: number;
}
export interface StackBar {
  key: string;
  label: string;
  tick: string;
  total: number;
  segments: StackSegment[];
  why: string;
  from: string;
  live?: boolean;
}

const W = 640;
const H = 190;
const AXIS_W = 42;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 24;

export function StackedBars({ bars, testId }: { bars: StackBar[]; testId: string }) {
  const max = Math.max(...bars.map((b) => b.total), 1) * 1.08;
  const y = (v: number): number => PAD_T + (H - PAD_T - PAD_B) * (1 - v / max);
  const n = Math.max(bars.length, 1);
  const w = (W - AXIS_W - PAD_R) / n;
  const gap = Math.max(4, w * 0.18);
  const step = niceStep(max);
  const gridlines: number[] = [];
  for (let g = 0; g <= max; g += step) gridlines.push(g);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" data-testid={testId}>
      {gridlines.map((g) => (
        <g key={g}>
          <line
            x1={AXIS_W}
            x2={W - PAD_R}
            y1={y(g)}
            y2={y(g)}
            stroke="var(--color-border-primary)"
            strokeWidth={1}
          />
          <text
            x={AXIS_W - 6}
            y={y(g) + 3}
            textAnchor="end"
            className="fill-text-tertiary font-mono text-[10px]"
          >
            {g ? fmtK(g) : '0'}
          </text>
        </g>
      ))}
      {bars.map((bar, j) => {
        let acc = 0;
        const x = AXIS_W + j * w + gap / 2;
        return (
          <g key={bar.key} data-testid={`${testId}-bar`} data-key={bar.key}>
            <Why as="g" why={bar.why} from={bar.from} head={`${bar.label} · ${fmtK(bar.total)}`}>
              {bar.segments.map((segment) => {
                const top = y(acc + segment.value);
                const height = y(acc) - top;
                acc += segment.value;
                return (
                  <rect
                    key={segment.seatIndex}
                    x={x}
                    width={Math.max(w - gap, 1)}
                    y={top}
                    height={height}
                    rx={2}
                    fill={seatColour(segment.seatIndex)}
                    className={
                      bar.live && segment === bar.segments[0]
                        ? 'transition-[y,height,x,width] duration-500 ease-out motion-reduce:transition-none animate-pulse'
                        : 'transition-[y,height,x,width] duration-500 ease-out motion-reduce:transition-none'
                    }
                  />
                );
              })}
              {bar.total === 0 && (
                <rect
                  x={x}
                  width={Math.max(w - gap, 1)}
                  y={y(0) - 1}
                  height={1}
                  fill="var(--color-border-primary)"
                />
              )}
            </Why>
            <text
              x={x + (w - gap) / 2}
              y={H - 8}
              textAnchor="middle"
              className="fill-text-tertiary font-mono text-[10px]"
            >
              {bar.tick}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface LinePoint {
  label: string;
  value: number;
  running: number;
  why: string;
  from: string;
}

// A line over points with the running total filled behind it (cost per week).
export function LineWithRunning({
  points,
  testId,
  prefix = '$',
}: {
  points: LinePoint[];
  testId: string;
  prefix?: string;
}) {
  const LW = 310;
  const LH = 150;
  const L = 36;
  const R = 8;
  const T = 10;
  const B = 22;
  const max = Math.max(...points.map((p) => p.value), 1) * 1.15;
  const runMax = Math.max(points[points.length - 1]?.running ?? 0, 1) * 1.05;
  const x = (i: number): number => L + (i * (LW - L - R)) / Math.max(points.length - 1, 1);
  const y = (v: number): number => T + (LH - T - B) * (1 - v / max);
  const yr = (v: number): number => T + (LH - T - B) * (1 - v / runMax);
  const step = niceStep(max, 3);
  const gridlines: number[] = [];
  for (let g = 0; g <= max; g += step) gridlines.push(g);
  const area = points.map((p, i) => `${x(i)},${yr(p.running)}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${LW} ${LH}`}
      className="block h-auto w-full"
      role="img"
      data-testid={testId}
    >
      {gridlines.map((g) => (
        <g key={g}>
          <line
            x1={L}
            x2={LW - R}
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
            {prefix}
            {g}
          </text>
        </g>
      ))}
      {points.length > 1 && (
        <polygon
          points={`${L},${LH - B} ${area} ${x(points.length - 1)},${LH - B}`}
          fill="var(--color-text-info)"
          opacity={0.14}
        />
      )}
      <polyline
        points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
        fill="none"
        stroke="var(--color-text-info)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <g key={p.label}>
          <Why as="g" why={p.why} from={p.from} head={p.label}>
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={3}
              fill="var(--color-text-info)"
              className="hover:r-[4.5]"
            />
          </Why>
          {i % 3 === 0 && (
            <text
              x={x(i)}
              y={LH - 6}
              textAnchor="middle"
              className="fill-text-tertiary font-mono text-[10px]"
            >
              {p.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export interface DonutPart {
  seatIndex: number;
  label: string;
  share: number;
  why: string;
  from: string;
}

export function Donut({
  parts,
  centre,
  sub,
  testId,
}: {
  parts: DonutPart[];
  centre: string;
  sub: string;
  testId: string;
}) {
  const r = 44;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg
      viewBox="0 0 120 120"
      className="block size-[120px] flex-none"
      role="img"
      data-testid={testId}
    >
      {parts.map((part) => {
        const dash = c * part.share;
        const el = (
          <Why key={part.seatIndex} as="g" why={part.why} from={part.from} head={part.label}>
            <circle
              cx={60}
              cy={60}
              r={r}
              fill="none"
              stroke={seatColour(part.seatIndex)}
              strokeWidth={14}
              strokeDasharray={`${dash} ${c}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 60 60)"
              className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
            />
          </Why>
        );
        offset += dash;
        return el;
      })}
      <text
        x={60}
        y={57}
        textAnchor="middle"
        className="fill-text-primary font-mono text-[15px] font-semibold"
      >
        {centre}
      </text>
      <text x={60} y={72} textAnchor="middle" className="fill-text-tertiary font-mono text-[10px]">
        {sub}
      </text>
    </svg>
  );
}

// A labelled horizontal bar — shares, runtimes.
export function BarRow({
  label,
  value,
  max,
  colour,
  text,
  why,
  from,
  testId,
}: {
  label: ReactNode;
  value: number;
  max: number;
  colour: string;
  text: string;
  why: string;
  from: string;
  testId?: string;
}) {
  return (
    <Why
      as="div"
      why={why}
      from={from}
      head={typeof label === 'string' ? label : undefined}
      className="grid grid-cols-[72px_1fr_52px] items-center gap-2 py-[3px] text-xs"
      data-testid={testId}
    >
      <span className="truncate">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-background-tertiary/60">
        <span
          className="block h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${max ? Math.round((value / max) * 100) : 0}%`, background: colour }}
        />
      </span>
      <span className="text-right font-mono text-[11.5px] tabular-nums text-text-secondary">
        {text}
      </span>
    </Why>
  );
}

// A small line under a headline number.
export function Sparkline({ values, colour }: { values: number[]; colour: string }) {
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => `${(i * 100) / Math.max(values.length - 1, 1)},${24 - (v / max) * 22}`)
    .join(' ');
  return (
    <svg
      viewBox="0 0 100 26"
      preserveAspectRatio="none"
      className="mt-1.5 block h-[26px] w-full"
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={colour}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
