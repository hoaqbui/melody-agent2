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
import { PanelBottom, PanelRight, PanelTop, Plus, X } from 'lucide-react';
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
  panelTabs,
  panels,
  positionOf,
  type DockPosition,
  type Panel,
  type PaneId,
  type PaneLayout,
  type PaneStore,
  type SavedDock,
} from './pane-store';
import { loadProjectEntry, saveProjectEntry } from './project-storage';

const i18n = defineMessages({
  bar: { id: 'workColumn.bar', defaultMessage: 'Panes' },
  add: { id: 'workColumn.add', defaultMessage: 'Add a tab' },
  empty: { id: 'workColumn.empty', defaultMessage: 'No tabs — add one with +' },
  unseen: { id: 'workColumn.unseen', defaultMessage: '{pane} — new since you looked' },
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
  // The Changes tab's file count and line stats (task 94); undefined hides it, as a clean
  // tree does.
  badge?: string;
}

// DESIGN.md §Iconography: the three dock positions, one icon each.
const POSITION_ICONS: Record<DockPosition, ComponentType<{ className?: string }>> = {
  full: PanelRight,
  top: PanelTop,
  bottom: PanelBottom,
};
const POSITION_MESSAGES = { full: i18n.full, top: i18n.top, bottom: i18n.bottom } as const;

// DESIGN.md Floating Button Rule: --shadow-sm at rest, --shadow-md lifted.

const DRAG_THRESHOLD_PX = 4;
const SEAM_KEY_STEP = 0.05;
// Long enough for the Into motion (150ms) to end even when animationend never arrives.
const CLOSE_MOTION_MS = 200;
// Narrower than this the bar cannot show every launcher with its label; the ones that are
// neither pinned nor open fold under a chevron.
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
  renderPane(id: PaneId): ReactNode;
  // The session menu's ⋯, at the bar's right end (task 69).
  trailing: ReactNode;
}

export function WorkColumn({ layout, store, chrome, renderPane, trailing }: WorkColumnProps) {
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
    // Only a keyboard user whose focus left with the closed tab is moved; focus that sits
    // elsewhere already (a menu, the chat input) stays — a late close animation must not
    // pull it back and shut an open menu.
    const active = document.activeElement;
    if (active && active !== document.body && !rootRef.current?.contains(active)) return;
    (
      rootRef.current?.querySelector<HTMLElement>(
        `[data-testid="workspace-pane-button-${target}"]`
      ) ?? rootRef.current?.querySelector<HTMLElement>('[data-testid="workspace-panel-add"]')
    )?.focus();
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

  const two = slots.top !== null && slots.bottom !== null;
  const shownPanels = panels(layout);
  // Rows: a bar and a body per panel, the seam between two.
  const rows = two
    ? `auto minmax(0, ${size}fr) 6px auto minmax(0, ${1 - size}fr)`
    : 'auto minmax(0, 1fr)';
  const bodyRow = (panel: Panel) => (panel === 'bottom' ? 5 : 2);
  const barRow = (panel: Panel) => (panel === 'bottom' ? 4 : 1);
  const open = PANE_IDS.filter((id) => tabs.includes(id));

  const tab = (id: PaneId, panel: Panel) => {
    const { title, Icon, badge } = chrome[id];
    const showing = slots[panel] === id;
    const unseen = layout.unseen.has(id);
    const name = unseen ? intl.formatMessage(i18n.unseen, { pane: title }) : title;
    return (
      <div
        key={id}
        className="group relative flex shrink-0 items-end"
        data-testid={`workspace-side-tab-${id}`}
        data-dock-tab={id}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                // An attached tab: the pressed one shares the panel's ground and covers the
                // strip's hairline with its own -1px, so tab and panel read as one surface.
                'work-tab relative -mb-px h-7 touch-none gap-1.5 rounded-b-none rounded-t-[10px] border border-b-0 border-transparent pl-2.5 pr-7 has-[>svg]:pl-2.5 has-[>svg]:pr-7 text-[13px] shadow-none hover:shadow-none',
                showing
                  ? 'border-border-primary bg-background-primary text-text-primary hover:bg-background-primary'
                  : 'text-text-secondary hover:bg-background-primary/60 hover:text-text-primary',
                drag?.id === id && 'opacity-50'
              )}
              aria-label={name}
              aria-pressed={showing}
              data-active={showing}
              data-testid={`workspace-pane-button-${id}`}
              data-unseen={unseen}
              data-open
              // A closed tab hands focus back here, and a focus-opened tooltip would linger;
              // hover still opens it, the aria-label names it.
              onFocus={(event) => event.preventDefault()}
              onPointerDown={(event) => press(event, id)}
              onClick={() => select(id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenuTab(id);
              }}
            >
              <Icon />
              {title}
              {badge && (
                <span
                  className="rounded-chip bg-background-secondary px-1 text-[10px] text-text-secondary"
                  data-testid={`workspace-tab-badge-${id}`}
                >
                  {badge}
                </span>
              )}
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
        {/* The × sits inside the tab's reserved right padding: a browser tab's close. */}
        <Button
          variant="ghost"
          size="xs"
          className="absolute right-1 bottom-1 size-5 px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100"
          aria-label={intl.formatMessage(i18n.closePane, { pane: title })}
          data-testid={`workspace-pane-close-${id}`}
          onClick={() => close(id)}
        >
          <X className="size-3" />
        </Button>
        {/* The right-click menu anchors to the tab's bottom edge; its trigger is the anchor
            alone, since the tab itself is the button above. */}
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
      </div>
    );
  };

  // Each panel's own bar: its tabs, then + for the panes not open anywhere (one pane lives
  // on one bar), the ⋯ session menu at the end of the first bar. The bottom bar's + adds to
  // the bottom panel; the other bars add to the active (full or top) one.
  const bar = (panel: Panel, first: boolean) => {
    const closed = PANE_IDS.filter((id) => !tabs.includes(id));
    const addTo = (id: PaneId) =>
      panel === 'bottom' ? store.dock(id, 'bottom') : store.openPane(id);
    return (
      <div
        key={`bar-${panel}`}
        className="no-drag flex min-w-0 select-none items-end gap-1 border-b border-border-primary bg-background-secondary px-2 pt-1 text-sm touch-none"
        style={{ gridRow: barRow(panel) }}
        role="toolbar"
        aria-label={intl.formatMessage(i18n.bar)}
        aria-orientation="horizontal"
        data-testid={first ? 'workspace-pane-menu' : `workspace-pane-menu-${panel}`}
        data-panel={panel}
      >
        <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto pb-px">
          {panelTabs(layout, panel).map((id) => tab(id, panel))}
          {closed.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  className="mb-1 w-6 shrink-0 px-0 text-text-secondary"
                  aria-label={intl.formatMessage(i18n.add)}
                  data-testid={first ? 'workspace-panel-add' : `workspace-panel-add-${panel}`}
                >
                  <Plus />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="bottom"
                align="start"
                data-testid="workspace-panel-add-menu"
              >
                {closed.map((id) => {
                  const { title, Icon, badge } = chrome[id];
                  const unseen = layout.unseen.has(id);
                  return (
                    <DropdownMenuItem
                      key={id}
                      data-testid={`workspace-panel-add-${id}`}
                      data-unseen={unseen}
                      onSelect={() => addTo(id)}
                    >
                      <Icon />
                      {title}
                      {badge && (
                        <span className="ml-auto text-[10px] text-text-secondary">{badge}</span>
                      )}
                      {unseen && (
                        <span aria-hidden className="ml-auto size-1.5 rounded-full bg-text-info" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {first && trailing}
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
        ref={slotsRef}
        className="relative grid min-h-0 flex-1 bg-background-primary"
        style={{ gridTemplateRows: rows }}
        data-testid="workspace-side-panel"
      >
        {shownPanels.length === 0 ? (
          <>
            {bar('full', true)}
            <p
              className="p-4 text-center text-xs text-text-tertiary"
              style={{ gridRow: 2 }}
              data-testid="workspace-panel-empty"
            >
              {intl.formatMessage(i18n.empty)}
            </p>
          </>
        ) : (
          shownPanels.map((panel, index) => bar(panel, index === 0))
        )}
        {open.map((id) => {
          const position = positionOf(layout, id);
          const panel: Panel = two
            ? layout.positions[id] === 'bottom'
              ? 'bottom'
              : 'top'
            : 'full';
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
              style={{ gridRow: bodyRow(panel) }}
              data-testid={`workspace-pane-${id}`}
              data-position={position ?? undefined}
              data-dock-body={position ?? undefined}
              onAnimationEnd={(event) => {
                if (closing === id && event.target === event.currentTarget) finishRef.current();
              }}
            >
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
            style={{ gridRow: 3 }}
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
