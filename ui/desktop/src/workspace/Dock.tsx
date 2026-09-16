// The right dock (DESIGN.md §Frame): panels stacked top to bottom on one CSS grid — a seam,
// a strip and a body per panel — with every open pane rendered once, in a fixed order, so a
// pane moved between panels keeps its DOM and its contents (pane-store.ts `Panel`). Drag is
// pointer events: a tab or a strip lifts after a few pixels, a ghost follows the pointer, and
// the drop lands on a strip (move the tab) or a seam (tear off, or reorder the panel).

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { defineMessages, useIntl } from '../i18n';
import { cn } from '../utils';
import {
  PANE_IDS,
  type PaneId,
  type PaneLayout,
  type PaneStore,
  type Panel as PanelState,
  type SavedPanel,
} from './pane-store';
import { Panel, type PaneChrome } from './Panel';

const i18n = defineMessages({
  resize: { id: 'dock.resize', defaultMessage: 'Resize' },
});

const DRAG_THRESHOLD_PX = 4;
const SEAM_KEY_STEP = 0.05;
// Long enough for the Into motion (150ms) to end even when animationend never arrives.
const CLOSE_MOTION_MS = 200;
const DOCK_STORAGE_KEY = 'goose.workspace.dock';

// Seam s sits above panel s; seam n is the bottom edge. Grid rows are 1-based.
const seamRow = (seam: number) => 3 * seam + 1;
const stripRow = (index: number) => 3 * index + 2;
const bodyRow = (index: number) => 3 * index + 3;

type DropTarget =
  { kind: 'strip'; panel: number; position: number } | { kind: 'seam'; seam: number };

interface Drag {
  kind: 'tab' | 'panel';
  id: PaneId | null;
  from: number;
  x: number;
  y: number;
  over: DropTarget | null;
}

// A press that has not travelled the threshold yet: a click until it does.
interface Pending {
  kind: 'tab' | 'panel';
  id: PaneId | null;
  from: number;
  x: number;
  y: number;
}

interface SeamDrag {
  index: number;
  startY: number;
  startSize: number;
  // The height the fr rows share, so a pointer delta maps onto a size fraction.
  free: number;
}

// One key holds every project's dock, as task 19's shim holds the settings.
export function loadDock(project: string): SavedPanel[] {
  try {
    const all = JSON.parse(window.localStorage.getItem(DOCK_STORAGE_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
    const saved = all[project];
    return Array.isArray(saved) ? (saved as SavedPanel[]) : [];
  } catch {
    return [];
  }
}

export function saveDock(project: string, dock: readonly PanelState[]): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(DOCK_STORAGE_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
    all[project] = dock.map(({ tabs, active, size }) => ({ tabs, active, size }));
    window.localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage disabled or full: the layout lives for this window only.
  }
}

function targetAt(x: number, y: number, drag: Drag): DropTarget | null {
  const hit = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>('[data-dock-strip], [data-dock-seam], [data-dock-body]');
  if (!hit) return null;
  if (hit.dataset.dockSeam !== undefined) {
    return { kind: 'seam', seam: Number(hit.dataset.dockSeam) };
  }
  if (hit.dataset.dockBody !== undefined) {
    const index = Number(hit.dataset.dockBody);
    const rect = hit.getBoundingClientRect();
    return { kind: 'seam', seam: y < rect.top + rect.height / 2 ? index : index + 1 };
  }
  const panel = Number(hit.dataset.dockStrip);
  if (drag.kind === 'panel') return { kind: 'seam', seam: panel };
  let position = 0;
  for (const tab of hit.querySelectorAll<HTMLElement>('[data-dock-tab]')) {
    if (tab.dataset.dockTab === drag.id) continue;
    const rect = tab.getBoundingClientRect();
    if (x > rect.left + rect.width / 2) position += 1;
  }
  return { kind: 'strip', panel, position };
}

interface DockProps {
  layout: PaneLayout;
  store: PaneStore;
  chrome: Record<PaneId, PaneChrome>;
  renderPane(id: PaneId): ReactNode;
  // After a pane closed alone in its panel, so the shell can put focus somewhere.
  onClosed(): void;
}

export function Dock({ layout, store, chrome, renderPane, onClosed }: DockProps) {
  const intl = useIntl();
  const { dock } = layout;
  const rootRef = useRef<HTMLElement>(null);
  const pending = useRef<Pending | null>(null);
  const seamDrag = useRef<SeamDrag | null>(null);
  // The document listeners outlive a render; they read the latest dock and drag from here.
  const dockRef = useRef(dock);
  dockRef.current = dock;
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The click that ends a drag must not also select the tab.
  const swallowClick = useRef(false);
  const [closing, setClosing] = useState<PaneId | null>(null);
  const finishRef = useRef(() => {});

  // Where focus goes once the closed pane's panel has re-rendered: its tab now in front.
  const focusAfterClose = useRef<{ strip: number; tab: PaneId } | null>(null);

  finishRef.current = () => {
    if (!closing) return;
    const strip = dock.findIndex((panel) => panel.tabs.includes(closing));
    setClosing(null);
    store.closePane(closing);
    const kept = store.getState().dock[strip];
    if (dock[strip].tabs.length > 1 && kept) {
      focusAfterClose.current = { strip, tab: kept.active };
    } else {
      onClosed();
    }
  };

  useEffect(() => {
    const target = focusAfterClose.current;
    if (!target) return;
    focusAfterClose.current = null;
    rootRef.current
      ?.querySelector<HTMLElement>(
        `[data-dock-strip="${target.strip}"] [data-dock-tab="${target.tab}"]`
      )
      ?.focus();
  });

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => finishRef.current(), CLOSE_MOTION_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  const close = (id: PaneId) => {
    if (!closing) setClosing(id);
  };

  const select = (id: PaneId) => {
    if (swallowClick.current) return;
    store.openPane(id);
  };

  const press = (event: ReactPointerEvent<HTMLElement>, kind: Drag['kind'], id: PaneId | null) => {
    if (event.button !== 0) return;
    const strip = event.currentTarget.closest<HTMLElement>('[data-dock-strip]');
    // Capture keeps the pointer's up reaching us from outside the window too.
    event.currentTarget.setPointerCapture(event.pointerId);
    pending.current = {
      kind,
      id,
      from: Number(strip?.dataset.dockStrip),
      x: event.clientX,
      y: event.clientY,
    };
  };

  useEffect(() => {
    const setLive = (live: Drag | null) => {
      dragRef.current = live;
      setDrag(live);
    };
    const movePanelToSeam = (from: number, seam: number) => {
      store.movePanel(from, seam > from ? seam - 1 : seam);
    };
    const drop = (live: Drag) => {
      if (!live.over) return;
      if (live.over.kind === 'strip' && live.id) {
        store.moveTab(live.id, live.over.panel, live.over.position);
        return;
      }
      const seam = live.over.kind === 'seam' ? live.over.seam : live.over.panel;
      if (!live.id || dockRef.current[live.from].tabs.length === 1) {
        movePanelToSeam(live.from, seam);
        return;
      }
      // tearOff parks the new panel right under its source; the seam says where it goes.
      store.tearOff(live.id);
      store.movePanel(live.from + 1, seam);
    };
    const move = (event: MouseEvent) => {
      const seam = seamDrag.current;
      if (seam) {
        store.resize(seam.index, seam.startSize + (event.clientY - seam.startY) / seam.free);
        return;
      }
      const pressed = pending.current;
      if (pressed) {
        if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < DRAG_THRESHOLD_PX) {
          return;
        }
        pending.current = null;
        const live: Drag = { ...pressed, x: event.clientX, y: event.clientY, over: null };
        setLive({ ...live, over: targetAt(event.clientX, event.clientY, live) });
        return;
      }
      const live = dragRef.current;
      if (!live) return;
      const x = event.clientX;
      const y = event.clientY;
      setLive({ ...live, x, y, over: targetAt(x, y, live) });
    };
    const up = () => {
      seamDrag.current = null;
      pending.current = null;
      const live = dragRef.current;
      if (!live) return;
      setLive(null);
      swallowClick.current = true;
      window.setTimeout(() => {
        swallowClick.current = false;
      }, 0);
      drop(live);
    };
    // Capture phase: a pane's own editor or terminal may stop these from bubbling, and a
    // swallowed pointerup would leave the ghost hanging.
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    return () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
    };
  }, [store]);

  const pressSeam = (event: ReactPointerEvent<HTMLElement>, seam: number) => {
    if (event.button !== 0 || !rootRef.current) return;
    const bodies = rootRef.current.querySelectorAll<HTMLElement>('[data-dock-body]');
    const free = Array.from(bodies).reduce((sum, body) => sum + body.offsetHeight, 0);
    event.currentTarget.setPointerCapture(event.pointerId);
    seamDrag.current = {
      index: seam - 1,
      startY: event.clientY,
      startSize: dock[seam - 1].size,
      free,
    };
  };

  const keySeam = (event: ReactKeyboardEvent<HTMLElement>, seam: number) => {
    const step =
      event.key === 'ArrowUp' ? -SEAM_KEY_STEP : event.key === 'ArrowDown' ? SEAM_KEY_STEP : 0;
    if (!step) return;
    event.preventDefault();
    store.resize(seam - 1, dock[seam - 1].size + step);
  };

  const overSeam = drag?.over?.kind === 'seam' ? drag.over.seam : null;
  const overStrip = drag?.over?.kind === 'strip' ? drag.over : null;
  const rows = dock
    .map((panel, index) => `${index === 0 ? '2px' : '6px'} auto minmax(0, ${panel.size}fr)`)
    .concat('2px')
    .join(' ');
  const open = PANE_IDS.filter((id) => dock.some((panel) => panel.tabs.includes(id)));
  const panelOf = (id: PaneId) => dock.findIndex((panel) => panel.tabs.includes(id));

  return (
    <aside
      ref={rootRef}
      className="relative grid w-2/5 min-w-72 shrink-0 min-h-0 border-l border-border-primary"
      style={{ gridTemplateRows: rows }}
      data-testid="workspace-side-panel"
      data-dragging={drag ? drag.kind : undefined}
    >
      {dock.map((panel, index) => (
        <Panel
          key={panel.id}
          panel={panel}
          index={index}
          count={dock.length}
          chrome={chrome}
          gridRow={stripRow(index)}
          dragging={drag?.kind === 'tab' ? drag.id : null}
          over={overStrip?.panel === index ? overStrip.position : null}
          onSelect={select}
          onClose={close}
          onTearOff={store.tearOff}
          onMove={store.movePanel}
          onTabPointerDown={(event, id) => press(event, 'tab', id)}
          onHeaderPointerDown={(event) => press(event, 'panel', null)}
        />
      ))}
      {Array.from({ length: dock.length + 1 }, (_, seam) => {
        const inner = seam > 0 && seam < dock.length;
        return (
          <div
            key={`seam-${seam}`}
            role={inner ? 'separator' : undefined}
            tabIndex={inner ? 0 : undefined}
            aria-orientation={inner ? 'horizontal' : undefined}
            aria-label={inner ? intl.formatMessage(i18n.resize) : undefined}
            aria-valuenow={inner ? Math.round(dock[seam - 1].size * 100) : undefined}
            className={cn(
              'touch-none',
              inner &&
                'cursor-row-resize hover:bg-background-secondary focus-visible:bg-background-secondary outline-none',
              overSeam === seam && 'bg-text-primary'
            )}
            style={{ gridRow: seamRow(seam) }}
            data-dock-seam={seam}
            data-testid={`workspace-dock-seam-${seam}`}
            onPointerDown={inner ? (event) => pressSeam(event, seam) : undefined}
            onKeyDown={inner ? (event) => keySeam(event, seam) : undefined}
          />
        );
      })}
      {open.map((id) => {
        const index = panelOf(id);
        const shown = dock[index].active === id;
        return (
          <div
            key={id}
            hidden={!shown}
            className={cn(
              'min-h-0 overflow-auto origin-top ease-[var(--ease-g2)] duration-150',
              closing === id
                ? 'animate-out fade-out-0 zoom-out-95 fill-mode-forwards'
                : 'animate-in fade-in-0 zoom-in-95'
            )}
            style={{ gridRow: bodyRow(index) }}
            data-testid={`workspace-pane-${id}`}
            data-dock-body={index}
            onAnimationEnd={(event) => {
              if (closing === id && event.target === event.currentTarget) finishRef.current();
            }}
          >
            {renderPane(id)}
          </div>
        );
      })}
      {drag &&
        // The ghost is fixed to the viewport, so it lives outside any transformed ancestor.
        createPortal(
          <div
            className="pointer-events-none fixed z-[70] flex items-center gap-1 rounded-md border border-border-primary bg-background-primary px-2 py-1 text-sm shadow-[var(--shadow-md)]"
            style={{ left: drag.x + 12, top: drag.y + 12 }}
            data-testid="workspace-dock-ghost"
          >
            {(drag.kind === 'tab' && drag.id ? [drag.id] : dock[drag.from].tabs).map((id) => {
              const { title, Icon } = chrome[id];
              return (
                <span key={id} className="flex items-center gap-1">
                  <Icon className="size-4" />
                  {title}
                </span>
              );
            })}
          </div>,
          document.body
        )}
    </aside>
  );
}
