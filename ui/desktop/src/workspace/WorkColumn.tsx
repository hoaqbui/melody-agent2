// The Work column's contents (DESIGN.md §Frame, task 71): a permanent tab bar — every pane
// launcher as a tab, the session menu at its right end — over the slots: one pane full, or
// top and bottom halves with a seam between. Every open pane is rendered once, in a fixed
// order, so a pane moved between positions keeps its DOM and its contents (pane-store.ts
// `Slots`). Drag is pointer events: a tab lifts after a few pixels, a ghost follows the
// pointer, and the drop on the column's top or bottom half docks the pane there.

import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, PanelBottom, PanelRight, PanelTop, X } from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/Tooltip';
import { cn } from '../utils';
import {
  DOCK_POSITIONS,
  PANE_IDS,
  positionOf,
  type DockPosition,
  type PaneId,
  type PaneLayout,
  type PaneStore,
  type SavedDock,
} from './pane-store';
import { loadProjectEntry, saveProjectEntry } from './project-storage';

const i18n = defineMessages({
  bar: { id: 'workColumn.bar', defaultMessage: 'Panes' },
  more: { id: 'workColumn.more', defaultMessage: 'More panes' },
  unseen: { id: 'workColumn.unseen', defaultMessage: '{pane} — new since you looked' },
  position: { id: 'workColumn.position', defaultMessage: 'Dock position' },
  full: { id: 'workColumn.full', defaultMessage: 'Full' },
  top: { id: 'workColumn.top', defaultMessage: 'Top half' },
  bottom: { id: 'workColumn.bottom', defaultMessage: 'Bottom half' },
  close: { id: 'workColumn.close', defaultMessage: 'Close' },
  closePane: { id: 'workColumn.closePane', defaultMessage: 'Close {pane}' },
  resize: { id: 'workColumn.resize', defaultMessage: 'Resize' },
});

export interface PaneChrome {
  title: string;
  Icon: ComponentType<{ className?: string }>;
}

// DESIGN.md §Iconography: the three dock positions, one icon each.
const POSITION_ICONS: Record<DockPosition, ComponentType<{ className?: string }>> = {
  full: PanelRight,
  top: PanelTop,
  bottom: PanelBottom,
};
const POSITION_MESSAGES = { full: i18n.full, top: i18n.top, bottom: i18n.bottom } as const;

// DESIGN.md Floating Button Rule: --shadow-sm at rest, --shadow-md lifted.
const floating = 'shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)]';

const DRAG_THRESHOLD_PX = 4;
const SEAM_KEY_STEP = 0.05;
// Long enough for the Into motion (150ms) to end even when animationend never arrives.
const CLOSE_MOTION_MS = 200;
// Narrower than this the bar cannot show every launcher with its label; the ones that are
// neither pinned nor open fold under a chevron.
const OVERFLOW_BELOW_PX = 520;
const DOCK_STORAGE_KEY = 'goose.workspace.dock';

interface Drag {
  id: PaneId;
  x: number;
  y: number;
  over: 'top' | 'bottom' | null;
}

// A press that has not travelled the threshold yet: a click until it does.
interface Pending {
  id: PaneId;
  x: number;
  y: number;
}

interface SeamDrag {
  startY: number;
  startSize: number;
  // The height the halves share, so a pointer delta maps onto a share.
  free: number;
}

export function loadDock(project: string): unknown {
  return loadProjectEntry(DOCK_STORAGE_KEY, project);
}

export function saveDock(project: string, layout: PaneLayout): void {
  const saved: SavedDock = {
    tabs: layout.tabs,
    slots: layout.slots,
    size: layout.size,
    positions: layout.positions,
  };
  saveProjectEntry(DOCK_STORAGE_KEY, project, saved);
}

interface PositionControlProps {
  id: PaneId;
  position: DockPosition | null;
  onDock(id: PaneId, position: DockPosition): void;
}

// The three-icon control, on the pane's header: the pressed one is where the pane shows.
function PositionControl({ id, position, onDock }: PositionControlProps) {
  const intl = useIntl();
  return (
    <div
      role="group"
      aria-label={intl.formatMessage(i18n.position)}
      className="flex items-center gap-0.5"
      data-testid="workspace-dock-positions"
    >
      {DOCK_POSITIONS.map((candidate) => {
        const Icon = POSITION_ICONS[candidate];
        return (
          <Button
            key={candidate}
            variant="ghost"
            size="xs"
            className="w-6 px-0 aria-pressed:bg-background-secondary"
            aria-label={intl.formatMessage(POSITION_MESSAGES[candidate])}
            aria-pressed={position === candidate}
            data-testid={`workspace-dock-position-${candidate}`}
            onClick={() => onDock(id, candidate)}
          >
            <Icon />
          </Button>
        );
      })}
    </div>
  );
}

// The tab in flight: a lifted copy under the pointer (DESIGN.md §Motion).
function Ghost({ title, Icon }: PaneChrome) {
  return (
    <span className="flex items-center gap-1">
      <Icon className="size-4" />
      {title}
    </span>
  );
}

interface WorkColumnProps {
  layout: PaneLayout;
  store: PaneStore;
  chrome: Record<PaneId, PaneChrome>;
  // The launchers that stay in the bar however narrow it is; the rest fold under a chevron.
  primary: readonly PaneId[];
  renderPane(id: PaneId): ReactNode;
  // The session menu's ⋯, at the bar's right end (task 69).
  trailing: ReactNode;
}

export function WorkColumn({
  layout,
  store,
  chrome,
  primary,
  renderPane,
  trailing,
}: WorkColumnProps) {
  const intl = useIntl();
  const { tabs, slots, size } = layout;
  const rootRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);
  const pending = useRef<Pending | null>(null);
  const seamDrag = useRef<SeamDrag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The click that ends a drag must not also open the tab.
  const swallowClick = useRef(false);
  const [closing, setClosing] = useState<PaneId | null>(null);
  // The tab whose right-click menu is open.
  const [menuTab, setMenuTab] = useState<PaneId | null>(null);
  const finishRef = useRef(() => {});
  // A closed tab disappears into its launcher (Into Rule): focus lands there once it has
  // re-rendered as a launcher.
  const focusAfterClose = useRef<PaneId | null>(null);

  finishRef.current = () => {
    if (!closing) return;
    setClosing(null);
    store.closePane(closing);
    focusAfterClose.current = closing;
  };

  useEffect(() => {
    const target = focusAfterClose.current;
    if (!target) return;
    focusAfterClose.current = null;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-testid="workspace-pane-button-${target}"]`)
      ?.focus();
  });

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => finishRef.current(), CLOSE_MOTION_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  const close = (id: PaneId) => {
    if (closing) return;
    // A parked tab has no body to shrink; it leaves at once.
    if (positionOf(layout, id) === null) {
      store.closePane(id);
      focusAfterClose.current = id;
      return;
    }
    setClosing(id);
  };

  const select = (id: PaneId) => {
    if (swallowClick.current) return;
    store.openPane(id);
  };

  const press = (event: ReactPointerEvent<HTMLElement>, id: PaneId) => {
    if (event.button !== 0) return;
    // Capture keeps the pointer's up reaching us from over a pane's own editor or webview.
    event.currentTarget.setPointerCapture(event.pointerId);
    pending.current = { id, x: event.clientX, y: event.clientY };
  };

  useEffect(() => {
    const setLive = (live: Drag | null) => {
      dragRef.current = live;
      setDrag(live);
    };
    // The column's top half or bottom half, under the bar.
    const halfAt = (x: number, y: number): 'top' | 'bottom' | null => {
      const rect = slotsRef.current?.getBoundingClientRect();
      if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        return null;
      }
      return y < rect.top + rect.height / 2 ? 'top' : 'bottom';
    };
    const move = (event: MouseEvent) => {
      const seam = seamDrag.current;
      if (seam) {
        store.resize(seam.startSize + (event.clientY - seam.startY) / seam.free);
        return;
      }
      const pressed = pending.current;
      if (pressed) {
        if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) < DRAG_THRESHOLD_PX) {
          return;
        }
        pending.current = null;
        setLive({
          id: pressed.id,
          x: event.clientX,
          y: event.clientY,
          over: halfAt(event.clientX, event.clientY),
        });
        return;
      }
      const live = dragRef.current;
      if (!live) return;
      const x = event.clientX;
      const y = event.clientY;
      setLive({ ...live, x, y, over: halfAt(x, y) });
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
      if (live.over) store.dock(live.id, live.over);
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

  const pressSeam = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !slotsRef.current) return;
    const bodies = slotsRef.current.querySelectorAll<HTMLElement>('[data-dock-body]');
    const free = Array.from(bodies).reduce((sum, body) => sum + body.offsetHeight, 0);
    event.currentTarget.setPointerCapture(event.pointerId);
    seamDrag.current = { startY: event.clientY, startSize: size, free };
  };

  const keySeam = (event: ReactKeyboardEvent<HTMLElement>) => {
    const step =
      event.key === 'ArrowUp' ? -SEAM_KEY_STEP : event.key === 'ArrowDown' ? SEAM_KEY_STEP : 0;
    if (!step) return;
    event.preventDefault();
    store.resize(size + step);
  };

  const order = [...primary, ...PANE_IDS.filter((id) => !primary.includes(id))];
  const narrow = layout.columns.work < OVERFLOW_BELOW_PX;
  const shown = narrow ? order.filter((id) => primary.includes(id) || tabs.includes(id)) : order;
  const folded = order.filter((id) => !shown.includes(id));
  const two = slots.top !== null && slots.bottom !== null;
  const rows = two ? `minmax(0, ${size}fr) 6px minmax(0, ${1 - size}fr)` : 'minmax(0, 1fr)';
  const open = PANE_IDS.filter((id) => tabs.includes(id));

  const tab = (id: PaneId) => {
    const { title, Icon } = chrome[id];
    const isOpen = tabs.includes(id);
    const showing = positionOf(layout, id) !== null;
    const unseen = layout.unseen.has(id);
    const name = unseen ? intl.formatMessage(i18n.unseen, { pane: title }) : title;
    return (
      <div
        key={id}
        className="group relative flex shrink-0 items-center"
        data-testid={`workspace-side-tab-${id}`}
        data-dock-tab={isOpen ? id : undefined}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showing ? 'secondary' : 'ghost'}
              size="xs"
              className={cn(
                'work-tab relative touch-none',
                showing && floating,
                !isOpen && 'text-text-secondary',
                drag?.id === id && 'opacity-50'
              )}
              aria-label={name}
              aria-pressed={showing}
              data-active={showing}
              data-testid={`workspace-pane-button-${id}`}
              data-unseen={unseen}
              data-open={isOpen}
              // A closed tab hands focus back here, and a focus-opened tooltip would linger;
              // hover still opens it, the aria-label names it.
              onFocus={(event) => event.preventDefault()}
              onPointerDown={(event) => press(event, id)}
              onClick={() => select(id)}
              onContextMenu={
                isOpen
                  ? (event) => {
                      event.preventDefault();
                      setMenuTab(id);
                    }
                  : undefined
              }
            >
              <Icon />
              {title}
              {/* DESIGN.md: `info` marks what changed; the dot is paired with the tooltip's
                  words, never alone (§Accessibility). */}
              {unseen && (
                <span
                  aria-hidden
                  className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-text-info"
                  data-testid={`workspace-pane-dot-${id}`}
                />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{name}</TooltipContent>
        </Tooltip>
        {isOpen && (
          // Its room is reserved, so the tab does not grow when the × appears.
          <Button
            variant="ghost"
            size="xs"
            className="-ml-1 w-5 px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={intl.formatMessage(i18n.closePane, { pane: title })}
            data-testid={`workspace-pane-close-${id}`}
            onClick={() => close(id)}
          >
            <X />
          </Button>
        )}
        {isOpen && (
          // The right-click menu anchors to the tab's bottom edge; its trigger is the anchor
          // alone, since the tab itself is the button above.
          <DropdownMenu open={menuTab === id} onOpenChange={(on) => !on && setMenuTab(null)}>
            <DropdownMenuTrigger asChild>
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="bottom"
              align="start"
              data-testid="workspace-tab-menu"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                rootRef.current
                  ?.querySelector<HTMLElement>(`[data-testid="workspace-pane-button-${id}"]`)
                  ?.focus();
              }}
            >
              {DOCK_POSITIONS.map((candidate) => {
                const PositionIcon = POSITION_ICONS[candidate];
                return (
                  <DropdownMenuItem
                    key={candidate}
                    className="aria-[current=true]:bg-background-secondary"
                    aria-current={positionOf(layout, id) === candidate ? 'true' : undefined}
                    data-testid={`workspace-dock-position-${candidate}`}
                    onSelect={() => store.dock(id, candidate)}
                  >
                    <PositionIcon />
                    {intl.formatMessage(POSITION_MESSAGES[candidate])}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem data-testid="workspace-tab-close" onSelect={() => close(id)}>
                <X />
                {intl.formatMessage(i18n.close)}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 min-w-0 flex-col"
      data-dragging={drag ? 'tab' : undefined}
    >
      <div
        className="flex min-w-0 shrink-0 select-none items-center gap-1 border-b border-border-primary px-2 py-1 text-sm touch-none"
        role="toolbar"
        aria-label={intl.formatMessage(i18n.bar)}
        aria-orientation="horizontal"
        data-testid="workspace-pane-menu"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {shown.map(tab)}
          {folded.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  className="w-6 shrink-0 px-0 text-text-secondary"
                  aria-label={intl.formatMessage(i18n.more)}
                  data-testid="workspace-pane-overflow"
                >
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="start"
                data-testid="workspace-pane-overflow-menu"
              >
                {folded.map((id) => {
                  const { title, Icon } = chrome[id];
                  return (
                    <DropdownMenuItem
                      key={id}
                      data-testid={`workspace-pane-overflow-${id}`}
                      onSelect={() => store.openPane(id)}
                    >
                      <Icon />
                      {title}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {trailing}
      </div>
      <div
        ref={slotsRef}
        className="relative grid min-h-0 flex-1"
        style={{ gridTemplateRows: rows }}
        data-testid="workspace-side-panel"
      >
        {open.map((id) => {
          const position = positionOf(layout, id);
          const { title, Icon } = chrome[id];
          return (
            <div
              key={id}
              hidden={position === null}
              className={cn(
                'flex min-h-0 min-w-0 flex-col origin-top ease-[var(--ease-g2)] duration-150',
                closing === id
                  ? 'animate-out fade-out-0 zoom-out-95 fill-mode-forwards'
                  : 'animate-in fade-in-0 zoom-in-95'
              )}
              style={{ gridRow: position === 'bottom' ? 3 : 1 }}
              data-testid={`workspace-pane-${id}`}
              data-position={position ?? undefined}
              data-dock-body={position ?? undefined}
              onAnimationEnd={(event) => {
                if (closing === id && event.target === event.currentTarget) finishRef.current();
              }}
            >
              <div className="flex shrink-0 select-none items-center gap-1 px-2 py-0.5 text-xs text-text-secondary">
                <Icon className="size-3.5" />
                <span className="min-w-0 flex-1 truncate">{title}</span>
                <PositionControl id={id} position={position} onDock={store.dock} />
                <Button
                  variant="ghost"
                  size="xs"
                  className="w-6 px-0"
                  aria-label={intl.formatMessage(i18n.closePane, { pane: title })}
                  data-testid={`workspace-slot-close-${id}`}
                  onClick={() => close(id)}
                >
                  <X />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">{renderPane(id)}</div>
            </div>
          );
        })}
        {two && (
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="horizontal"
            aria-label={intl.formatMessage(i18n.resize)}
            aria-valuenow={Math.round(size * 100)}
            className="cursor-row-resize touch-none outline-none hover:bg-background-secondary focus-visible:bg-background-secondary"
            style={{ gridRow: 2 }}
            data-testid="workspace-dock-seam"
            onPointerDown={pressSeam}
            onKeyDown={keySeam}
          />
        )}
        {drag &&
          // The drop zones: the column's top half and bottom half, the one under the
          // pointer lit.
          (['top', 'bottom'] as const).map((half) => (
            <div
              key={half}
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-x-0 h-1/2 rounded-panel transition-colors',
                half === 'top' ? 'top-0' : 'bottom-0',
                drag.over === half ? 'bg-text-primary/15 ring-2 ring-inset ring-text-primary' : ''
              )}
              data-testid={`workspace-dock-drop-${half}`}
              data-over={drag.over === half}
            />
          ))}
      </div>
      {drag &&
        // The ghost is fixed to the viewport, so it lives outside any transformed ancestor.
        createPortal(
          <div
            className="pointer-events-none fixed z-[70] flex items-center gap-1 rounded-md border border-border-primary bg-background-primary px-2 py-1 text-sm shadow-[var(--shadow-md)]"
            style={{ left: drag.x + 12, top: drag.y + 12 }}
            data-testid="workspace-dock-ghost"
          >
            <Ghost {...chrome[drag.id]} />
          </div>,
          document.body
        )}
    </div>
  );
}
