// Every number on the Telemetry pane explains itself on hover or focus (PRD criterion 7):
// one tooltip for the whole pane, fed by the nearest `data-why` / `data-from` pair. The words
// live here and nowhere else on the surface.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '../../../utils';

interface Tip {
  head: string;
  why: string;
  from?: string;
  x: number;
  y: number;
}

const WhyContext = createContext<{ show(tip: Tip): void; hide(): void } | null>(null);

interface WhyProps extends HTMLAttributes<HTMLElement> {
  // Why the number matters — one or two sentences.
  why: string;
  // Where it reads from — the field, the call, the file.
  from?: string;
  // The tooltip's first line; the element's own text when omitted.
  head?: string;
  as?: 'span' | 'div' | 'li' | 'th' | 'td' | 'tr' | 'h2';
  // A tab stop — for headline numbers and controls, not for every cell of a table.
  focusable?: boolean;
  children: ReactNode;
}

export function Why({
  why,
  from,
  head,
  as = 'span',
  focusable = false,
  className,
  children,
  ...rest
}: WhyProps) {
  const ctx = useContext(WhyContext);
  const ref = useRef<HTMLElement>(null);
  const show = useCallback(
    (x: number, y: number) => {
      if (!ctx) return;
      const text = head ?? ref.current?.querySelector('[data-why-head]')?.textContent ?? '';
      ctx.show({ head: text.trim(), why, from, x, y });
    },
    [ctx, head, why, from]
  );
  const Tag = as as 'span';
  return (
    <Tag
      ref={ref as never}
      data-why={why}
      data-from={from}
      tabIndex={focusable ? 0 : undefined}
      className={cn(
        'cursor-help outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
        className
      )}
      onMouseEnter={(event) => show(event.clientX, event.clientY)}
      onMouseMove={(event) => show(event.clientX, event.clientY)}
      onMouseLeave={() => ctx?.hide()}
      onFocus={() => {
        const rect = ref.current?.getBoundingClientRect();
        if (rect) show(rect.right, rect.top);
      }}
      onBlur={() => ctx?.hide()}
      {...rest}
    >
      {children}
    </Tag>
  );
}

// Hosts the one tooltip; wraps the pane.
export function WhyProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const show = useCallback((next: Tip) => setTip(next), []);
  const hide = useCallback(() => setTip(null), []);
  useEffect(() => {
    if (!tip) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTip(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tip]);
  const width = 300;
  const left = tip ? Math.min(tip.x + 14, window.innerWidth - width - 8) : 0;
  const top = tip ? Math.min(tip.y - 10, window.innerHeight - 120) : 0;
  // Stable, so a moving pointer re-renders the tooltip alone, never every wrapped cell.
  const value = useMemo(() => ({ show, hide }), [show, hide]);
  return (
    <WhyContext.Provider value={value}>
      {children}
      {tip && (
        <div
          role="tooltip"
          data-testid="telemetry-why"
          className="pointer-events-none fixed z-50 max-w-[300px] rounded-control bg-background-inverse px-3 py-2 text-xs leading-snug text-text-inverse shadow-[var(--shadow-md)]"
          style={{ left, top }}
        >
          {tip.head && (
            <div
              className="mb-1 font-mono text-[10.5px] opacity-70"
              data-testid="telemetry-why-head"
            >
              {tip.head}
            </div>
          )}
          <div data-testid="telemetry-why-text">{tip.why}</div>
          {tip.from && (
            <div
              className="mt-1 font-mono text-[10.5px] opacity-70"
              data-testid="telemetry-why-from"
            >
              {tip.from}
            </div>
          )}
        </div>
      )}
    </WhyContext.Provider>
  );
}
