// Layout state for the workspace (PRD step 8 as amended 2026-09-16, step 13). Pure state,
// no React, no ACP: the shell subscribes and renders; the panes keep their own contents.

export type PaneId =
  | 'files'
  | 'editor'
  | 'diff'
  | 'terminal'
  | 'git'
  | 'browser'
  | 'markdown'
  | 'agents'
  | 'artifact'
  | 'review'
  | 'telemetry';

export const PANE_IDS: readonly PaneId[] = [
  'files',
  'editor',
  'diff',
  'terminal',
  'git',
  'browser',
  'markdown',
  'agents',
  'artifact',
  'review',
  'telemetry',
];

export type LayoutMode = 'desktop' | 'phone';

export const PHONE_MAX_WIDTH_PX = 767;

// Where an open pane shows in the Work column (task 71): the whole column, or one half of
// it. A pane keeps its id across positions, so its contents (scrollback, buffers) survive
// repositioning (PRD criterion 5).
export type DockPosition = 'full' | 'top' | 'bottom';

export const DOCK_POSITIONS: readonly DockPosition[] = ['full', 'top', 'bottom'];

// At most two panes show at once: top + bottom, or one pane full. A full pane leaves the
// halves empty; a half whose partner is empty is never kept (it becomes full).
export interface Slots {
  top: PaneId | null;
  bottom: PaneId | null;
  full: PaneId | null;
}

// The three columns' fixed widths, in px; Chat takes what is left (task 60).
export interface Columns {
  sessions: number;
  work: number;
}

export interface PaneLayout {
  mode: LayoutMode;
  // Desktop only: every open pane, in the order it opened — the bar's record of what is
  // open. A tab not in a slot stays open with its state kept (Nothing Lost Rule).
  tabs: readonly PaneId[];
  slots: Slots;
  // The seam: the top half's share of the column's height.
  size: number;
  // Where each open tab last showed, so one click brings it back there.
  positions: Readonly<Partial<Record<PaneId, DockPosition>>>;
  // Phone only: the one thing on screen; there is no split at phone width.
  visible: 'chat' | PaneId;
  columns: Columns;
  // Panes with something the user has not looked at since it appeared (task 69): a page
  // that finished loading, shell output, a working tree that changed — while the pane was
  // off screen. The tab shows a dot; opening the pane clears it. Never persisted.
  unseen: ReadonlySet<PaneId>;
}

// The Work column as it persists per project.
export type SavedDock = Pick<PaneLayout, 'tabs' | 'slots' | 'size' | 'positions'>;

const MIN_HALF = 0.1;
const DEFAULT_SIZE = 0.5;
const EMPTY_SLOTS: Slots = { top: null, bottom: null, full: null };

export const DEFAULT_COLUMNS: Columns = { sessions: 280, work: 480 };
// Narrower than this a session row or a tab stops being readable.
export const MIN_COLUMN_PX = 200;
export const MAX_COLUMN_PX = 1200;

export function modeForWidth(widthPx: number): LayoutMode {
  return widthPx <= PHONE_MAX_WIDTH_PX ? 'phone' : 'desktop';
}

const NO_UNSEEN: ReadonlySet<PaneId> = new Set();

export function initialLayout(mode: LayoutMode = 'desktop'): PaneLayout {
  return {
    mode,
    tabs: [],
    slots: EMPTY_SLOTS,
    size: DEFAULT_SIZE,
    positions: {},
    visible: 'chat',
    columns: DEFAULT_COLUMNS,
    unseen: NO_UNSEEN,
  };
}

export function positionOf(layout: PaneLayout, id: PaneId): DockPosition | null {
  const { slots } = layout;
  return slots.full === id
    ? 'full'
    : slots.top === id
      ? 'top'
      : slots.bottom === id
        ? 'bottom'
        : null;
}

export function paneVisible(layout: PaneLayout, id: PaneId): boolean {
  if (layout.mode === 'phone') return layout.visible === id;
  return positionOf(layout, id) !== null;
}

// Something arrived in a pane the user cannot see; a visible pane shows it itself. The
// same layout comes back when nothing changes, so a burst of terminal output is one render.
export function markUnseen(layout: PaneLayout, id: PaneId): PaneLayout {
  if (paneVisible(layout, id) || layout.unseen.has(id)) return layout;
  return { ...layout, unseen: new Set([...layout.unseen, id]) };
}

// A pane brought on screen has been seen.
function seen(layout: PaneLayout, id: PaneId): PaneLayout {
  if (!layout.unseen.has(id)) return layout;
  const unseen = new Set(layout.unseen);
  unseen.delete(id);
  return { ...layout, unseen };
}

// A half whose partner is empty is the whole column.
function settle(slots: Slots): Slots {
  if (slots.full || (slots.top && slots.bottom)) return slots;
  const lone = slots.top ?? slots.bottom;
  return lone ? { top: null, bottom: null, full: lone } : EMPTY_SLOTS;
}

function without(slots: Slots, id: PaneId): Slots {
  return {
    top: slots.top === id ? null : slots.top,
    bottom: slots.bottom === id ? null : slots.bottom,
    full: slots.full === id ? null : slots.full,
  };
}

const sameSlots = (a: Slots, b: Slots) =>
  a.top === b.top && a.bottom === b.bottom && a.full === b.full;

// Per-panel tab bars (2026-09-20, tasks 117–120): the column is one panel (full) or two
// (top and bottom); every open tab belongs to exactly one panel, its slot names the panel's
// active tab. With one panel every tab is its; with two, `positions` says which half a tab
// belongs to (top when it never showed in a half).
export type Panel = DockPosition;

export function panelOf(layout: PaneLayout, id: PaneId): Panel | null {
  if (!layout.tabs.includes(id)) return null;
  if (!layout.slots.top || !layout.slots.bottom) return 'full';
  return layout.positions[id] === 'bottom' ? 'bottom' : 'top';
}

// The tabs a panel's bar shows, in opening order.
export function panelTabs(layout: PaneLayout, panel: Panel): PaneId[] {
  return layout.tabs.filter((tab) => panelOf(layout, tab) === panel);
}

// The panels showing: [full], [top, bottom], or none.
export function panels(layout: PaneLayout): Panel[] {
  const { slots } = layout;
  if (slots.full) return ['full'];
  if (slots.top && slots.bottom) return ['top', 'bottom'];
  return [];
}

// The panel a new tab joins: the full one, else the top one, else a new full panel.
function activePanel(layout: PaneLayout): Panel {
  return layout.slots.top && layout.slots.bottom ? 'top' : 'full';
}

// A tab's neighbour on its own bar: the one before it, else the one after; null when alone.
function neighbour(layout: PaneLayout, id: PaneId): PaneId | null {
  const panel = panelOf(layout, id);
  if (!panel) return null;
  const bar = panelTabs(layout, panel);
  const index = bar.indexOf(id);
  return bar[index - 1] ?? bar[index + 1] ?? null;
}

// Place a pane into a panel: a half puts it on that half's bar and makes it active there
// (splitting the column when it was one panel — the panel that showed takes the other half
// with every tab it had); full merges both bars into one and makes the pane active. The pane
// joins the tabs if it is new.
export function dock(layout: PaneLayout, id: PaneId, position: DockPosition): PaneLayout {
  if (layout.mode === 'phone') return show(layout, id);
  const tabs = layout.tabs.includes(id) ? layout.tabs : [...layout.tabs, id];
  const positions: Record<string, DockPosition> = { ...layout.positions };
  let slots: Slots;
  if (position === 'full') {
    slots = { top: null, bottom: null, full: id };
    for (const tab of tabs) positions[tab] = 'full';
  } else {
    const other = position === 'top' ? 'bottom' : 'top';
    const split = !!(layout.slots.top && layout.slots.bottom);
    if (!split) {
      // One panel becomes two: everything that was here goes to the other half.
      for (const tab of tabs) if (tab !== id) positions[tab] = other;
    }
    positions[id] = position;
    const otherActive =
      layout.slots[other] && layout.slots[other] !== id
        ? layout.slots[other]
        : split
          ? (tabs.filter((tab) => tab !== id && positions[tab] === other).at(-1) ?? null)
          : ((layout.slots.full !== id ? layout.slots.full : null) ??
            tabs.filter((tab) => tab !== id).at(-1) ??
            null);
    // A tab whose half empties when it leaves: the bar it left keeps a tab or the column
    // returns to one panel.
    const leftBar = tabs.filter((tab) => tab !== id && positions[tab] === other);
    if (!otherActive || leftBar.length === 0) {
      slots = { top: null, bottom: null, full: id };
      for (const tab of tabs) positions[tab] = 'full';
    } else {
      const half = (name: 'top' | 'bottom') => (name === position ? id : otherActive);
      slots = { top: half('top'), bottom: half('bottom'), full: null };
    }
  }
  if (tabs === layout.tabs && sameSlots(slots, layout.slots)) {
    const same = Object.keys(positions).every(
      (tab) => positions[tab] === layout.positions[tab as PaneId]
    );
    if (same) return seen(layout, id);
  }
  return seen({ ...layout, tabs, slots, positions }, id);
}

// The one entry point the launchers, a file pick and a route's ask share: a pane already
// on a bar becomes that panel's active tab; a new pane joins the active panel's bar (the
// full one, else the top one) and shows there.
export function openPane(layout: PaneLayout, id: PaneId): PaneLayout {
  if (layout.mode === 'phone') return show(layout, id);
  if (positionOf(layout, id) !== null) return seen(layout, id);
  const panel = panelOf(layout, id) ?? activePanel(layout);
  if (panel === 'full') {
    return seen(
      {
        ...layout,
        tabs: layout.tabs.includes(id) ? layout.tabs : [...layout.tabs, id],
        slots: { top: null, bottom: null, full: id },
        positions: { ...layout.positions, [id]: 'full' },
      },
      id
    );
  }
  return seen(
    {
      ...layout,
      tabs: layout.tabs.includes(id) ? layout.tabs : [...layout.tabs, id],
      slots: { ...layout.slots, [panel]: id },
      positions: { ...layout.positions, [id]: panel },
    },
    id
  );
}

// A seam drag: the top half takes the share, clamped so neither half disappears.
export function resize(layout: PaneLayout, size: number): PaneLayout {
  if (!layout.slots.top || !layout.slots.bottom) return layout;
  const clamped = Math.min(Math.max(size, MIN_HALF), 1 - MIN_HALF);
  if (clamped === layout.size) return layout;
  return { ...layout, size: clamped };
}

// Closing a tab: its bar activates the tab before it (else after); a bar that empties takes
// its panel with it — the other half becomes the whole column with its tabs.
export function closePane(layout: PaneLayout, id: PaneId): PaneLayout {
  const shown = layout.visible === id ? show(layout, 'chat') : layout;
  if (!shown.tabs.includes(id)) return shown;
  const panel = panelOf(shown, id);
  const next = neighbour(shown, id);
  const tabs = shown.tabs.filter((tab) => tab !== id);
  const positions: Record<string, DockPosition> = { ...shown.positions };
  delete positions[id];
  let slots = shown.slots;
  if (shown.mode === 'desktop' && panel) {
    const wasActive = shown.slots[panel] === id;
    if (next) {
      if (wasActive) slots = { ...shown.slots, [panel]: next };
    } else if (panel === 'full') {
      slots = EMPTY_SLOTS;
    } else {
      const other = panel === 'top' ? 'bottom' : 'top';
      slots = { top: null, bottom: null, full: shown.slots[other] };
      for (const tab of tabs) positions[tab] = 'full';
    }
  } else if (shown.mode === 'phone') {
    slots = settle(without(shown.slots, id));
  }
  return { ...shown, tabs, slots, positions };
}

export function show(layout: PaneLayout, target: 'chat' | PaneId): PaneLayout {
  const shown = layout.visible === target ? layout : { ...layout, visible: target };
  return target === 'chat' ? shown : seen(shown, target);
}

// A seam drag: the column takes the width, clamped; the chat gives or takes the difference.
export function resizeColumn(layout: PaneLayout, column: keyof Columns, width: number): PaneLayout {
  const clamped = Math.round(Math.min(Math.max(width, MIN_COLUMN_PX), MAX_COLUMN_PX));
  if (clamped === layout.columns[column]) return layout;
  return { ...layout, columns: { ...layout.columns, [column]: clamped } };
}

// A saved width that is not a usable number keeps the default.
export function restoreColumns(layout: PaneLayout, saved: Partial<Columns> | null): PaneLayout {
  if (!saved) return layout;
  let next = layout;
  for (const column of ['sessions', 'work'] as const) {
    const width = saved[column];
    if (typeof width === 'number' && Number.isFinite(width))
      next = resizeColumn(next, column, width);
  }
  return next;
}

// Shrinking folds the Work column away behind the chat; growing back opens what the phone
// showed.
export function setMode(layout: PaneLayout, mode: LayoutMode): PaneLayout {
  if (layout.mode === mode) return layout;
  if (mode === 'phone') return { ...layout, mode };
  const desktop: PaneLayout = { ...layout, mode, visible: 'chat' };
  return layout.visible === 'chat' ? desktop : openPane(desktop, layout.visible);
}

const isPane = (value: unknown): value is PaneId => PANE_IDS.includes(value as PaneId);
const isPosition = (value: unknown): value is DockPosition =>
  DOCK_POSITIONS.includes(value as DockPosition);

// Task 42's save, an array of panels: their tabs in order, the first two panels' active
// panes showing, so a layout from before task 71 comes back rather than empty.
interface SavedPanel {
  tabs?: unknown;
  active?: unknown;
}

function fromPanels(saved: readonly SavedPanel[]): SavedDock {
  const tabs = saved.flatMap((panel) => (Array.isArray(panel.tabs) ? panel.tabs : []));
  const active = saved.map((panel) => panel.active).filter(isPane);
  const slots: Slots =
    active.length > 1
      ? { top: active[0], bottom: active[1], full: null }
      : { top: null, bottom: null, full: active[0] ?? null };
  return { tabs: tabs as PaneId[], slots, size: DEFAULT_SIZE, positions: {} };
}

// A saved column comes back checked: a tab that is not a pane, or is listed twice, is
// dropped, a slot naming a pane that is not a tab empties, a full pane empties the halves,
// and an unusable size is the default. Nothing usable leaves the layout as it is.
export function restoreDock(layout: PaneLayout, saved: unknown): PaneLayout {
  const entry: Partial<SavedDock> | null = Array.isArray(saved)
    ? fromPanels(saved as SavedPanel[])
    : typeof saved === 'object'
      ? (saved as Partial<SavedDock> | null)
      : null;
  if (!entry) return layout;
  const listed = new Set<PaneId>();
  const tabs = (Array.isArray(entry.tabs) ? entry.tabs : []).filter((tab): tab is PaneId => {
    if (!isPane(tab) || listed.has(tab)) return false;
    listed.add(tab);
    return true;
  });
  if (tabs.length === 0) return layout;
  const slot = (value: unknown) => (isPane(value) && listed.has(value) ? value : null);
  const full = slot(entry.slots?.full);
  const slots = settle(
    full
      ? { top: null, bottom: null, full }
      : { top: slot(entry.slots?.top), bottom: slot(entry.slots?.bottom), full: null }
  );
  const positions: Partial<Record<PaneId, DockPosition>> = {};
  for (const [tab, position] of Object.entries(entry.positions ?? {})) {
    if (isPane(tab) && listed.has(tab) && isPosition(position)) positions[tab] = position;
  }
  for (const tab of tabs) {
    const shown = positionOf({ ...layout, slots }, tab);
    if (shown) positions[tab] = shown;
  }
  const size =
    typeof entry.size === 'number' && Number.isFinite(entry.size)
      ? Math.min(Math.max(entry.size, MIN_HALF), 1 - MIN_HALF)
      : DEFAULT_SIZE;
  return { ...layout, tabs, slots, size, positions };
}

export interface PaneStore {
  getState(): PaneLayout;
  subscribe(listener: () => void): () => void;
  openPane(id: PaneId): void;
  dock(id: PaneId, position: DockPosition): void;
  resize(size: number): void;
  resizeColumn(column: keyof Columns, width: number): void;
  closePane(id: PaneId): void;
  show(target: 'chat' | PaneId): void;
  setMode(mode: LayoutMode): void;
  markUnseen(id: PaneId): void;
}

export function createPaneStore(initial: PaneLayout = initialLayout()): PaneStore {
  let state = initial;
  const listeners = new Set<() => void>();
  const apply = (next: PaneLayout) => {
    if (next === state) return;
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    openPane: (id) => apply(openPane(state, id)),
    dock: (id, position) => apply(dock(state, id, position)),
    resize: (size) => apply(resize(state, size)),
    resizeColumn: (column, width) => apply(resizeColumn(state, column, width)),
    closePane: (id) => apply(closePane(state, id)),
    show: (target) => apply(show(state, target)),
    setMode: (mode) => apply(setMode(state, mode)),
    markUnseen: (id) => apply(markUnseen(state, id)),
  };
}
