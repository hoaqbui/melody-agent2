// Layout state for the workspace (PRD step 8 as amended 2026-09-15, step 13). Pure state,
// no React, no ACP: the shell subscribes and renders; the panes keep their own contents.

export type PaneId = 'files' | 'editor' | 'diff' | 'terminal' | 'git' | 'browser' | 'markdown';

export const PANE_IDS: readonly PaneId[] = [
  'files',
  'editor',
  'diff',
  'terminal',
  'git',
  'browser',
  'markdown',
];

export type LayoutMode = 'desktop' | 'phone';

export const PHONE_MAX_WIDTH_PX = 767;

// A panel keeps its id across moves and resizes; a pane keeps its id across panels, so
// pane contents (scrollback, buffers) survive repositioning (PRD criterion 5).
export interface Panel {
  id: string;
  tabs: readonly PaneId[];
  active: PaneId;
  // Fraction of the dock's height; the dock's sizes sum to 1.
  size: number;
}

// The three columns' fixed widths, in px; Chat takes what is left (task 60).
export interface Columns {
  sessions: number;
  work: number;
}

export interface PaneLayout {
  mode: LayoutMode;
  // Desktop only: the right dock, top to bottom; empty is chat alone.
  dock: readonly Panel[];
  // Phone only: the one thing on screen; there is no split at phone width.
  visible: 'chat' | PaneId;
  columns: Columns;
  // Panes with something the user has not looked at since it appeared (task 69): a page
  // that finished loading, shell output, a working tree that changed — while the pane was
  // off screen. The rail shows a dot; opening the pane clears it. Never persisted.
  unseen: ReadonlySet<PaneId>;
}

// A panel as it persists: the id is minted again on restore, since ids are never reused.
export type SavedPanel = Pick<Panel, 'tabs' | 'active' | 'size'>;

const MIN_PANEL_SIZE = 0.1;

export const DEFAULT_COLUMNS: Columns = { sessions: 280, work: 480 };
// Narrower than this a session row or a pane strip stops being readable.
export const MIN_COLUMN_PX = 200;
export const MAX_COLUMN_PX = 1200;

export function modeForWidth(widthPx: number): LayoutMode {
  return widthPx <= PHONE_MAX_WIDTH_PX ? 'phone' : 'desktop';
}

const NO_UNSEEN: ReadonlySet<PaneId> = new Set();

export function initialLayout(mode: LayoutMode = 'desktop'): PaneLayout {
  return { mode, dock: [], visible: 'chat', columns: DEFAULT_COLUMNS, unseen: NO_UNSEEN };
}

export function paneVisible(layout: PaneLayout, id: PaneId): boolean {
  if (layout.mode === 'phone') return layout.visible === id;
  return layout.dock.some((panel) => panel.active === id);
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

// Ids are never reused, so a panel that disappears and a later one never share a key.
let panelCount = 0;

function newPanel(tab: PaneId, size: number): Panel {
  panelCount += 1;
  return { id: `panel-${panelCount}`, tabs: [tab], active: tab, size };
}

function panelOf(dock: readonly Panel[], id: PaneId): number {
  return dock.findIndex((panel) => panel.tabs.includes(id));
}

function replaceAt(dock: readonly Panel[], index: number, panel: Panel): Panel[] {
  return dock.map((current, i) => (i === index ? panel : current));
}

function removeTab(dock: readonly Panel[], id: PaneId): Panel[] {
  const index = panelOf(dock, id);
  const panel = dock[index];
  if (panel.tabs.length > 1) {
    const at = panel.tabs.indexOf(id);
    const tabs = panel.tabs.filter((tab) => tab !== id);
    const active = panel.active === id ? tabs[Math.min(at, tabs.length - 1)] : panel.active;
    return replaceAt(dock, index, { ...panel, tabs, active });
  }
  // An emptied panel disappears into its neighbour: the one above, or below from the top.
  const rest = dock.filter((_, i) => i !== index);
  const heir = index === 0 ? 0 : index - 1;
  return rest.map((current, i) =>
    i === heir ? { ...current, size: current.size + panel.size } : current
  );
}

// The new panel takes half of the one it splits from; it is the whole dock when empty.
function splitBelow(dock: readonly Panel[], index: number, id: PaneId): Panel[] {
  if (dock.length === 0) return [newPanel(id, 1)];
  const half = dock[index].size / 2;
  const next = replaceAt(dock, index, { ...dock[index], size: half });
  next.splice(index + 1, 0, newPanel(id, half));
  return next;
}

export function openPane(layout: PaneLayout, id: PaneId): PaneLayout {
  if (layout.mode === 'phone') return show(layout, id);
  const { dock } = layout;
  const index = panelOf(dock, id);
  if (index >= 0) {
    if (dock[index].active === id) return seen(layout, id);
    return seen({ ...layout, dock: replaceAt(dock, index, { ...dock[index], active: id }) }, id);
  }
  if (dock.length === 0) return seen({ ...layout, dock: [newPanel(id, 1)] }, id);
  const first = { ...dock[0], tabs: [...dock[0].tabs, id], active: id };
  return seen({ ...layout, dock: replaceAt(dock, 0, first) }, id);
}

export function tearOff(layout: PaneLayout, id: PaneId): PaneLayout {
  if (layout.mode === 'phone') return show(layout, id);
  const { dock } = layout;
  const index = panelOf(dock, id);
  if (index < 0) return seen({ ...layout, dock: splitBelow(dock, dock.length - 1, id) }, id);
  if (dock[index].tabs.length === 1) return seen(layout, id);
  return seen({ ...layout, dock: splitBelow(removeTab(dock, id), index, id) }, id);
}

// `panelIndex` counts the dock before the move; the source panel may collapse on the way.
export function moveTab(
  layout: PaneLayout,
  id: PaneId,
  panelIndex: number,
  position: number
): PaneLayout {
  const { dock } = layout;
  const source = panelOf(dock, id);
  if (source < 0) return layout;
  const target = dock[panelIndex];
  if (source === panelIndex) {
    const tabs = target.tabs.filter((tab) => tab !== id);
    tabs.splice(position, 0, id);
    if (tabs.every((tab, i) => tab === target.tabs[i])) return seen(layout, id);
    return seen(
      { ...layout, dock: replaceAt(dock, panelIndex, { ...target, tabs, active: id }) },
      id
    );
  }
  const moved = removeTab(dock, id).map((panel) => {
    if (panel.id !== target.id) return panel;
    const tabs = [...panel.tabs];
    tabs.splice(position, 0, id);
    return { ...panel, tabs, active: id };
  });
  return seen({ ...layout, dock: moved }, id);
}

export function movePanel(layout: PaneLayout, from: number, to: number): PaneLayout {
  if (from === to) return layout;
  const dock = [...layout.dock];
  const [panel] = dock.splice(from, 1);
  dock.splice(to, 0, panel);
  return { ...layout, dock };
}

// A seam drag: the panel and its lower neighbour (upper for the last) trade the difference.
export function resize(layout: PaneLayout, index: number, size: number): PaneLayout {
  const { dock } = layout;
  if (dock.length < 2) return layout;
  const partner = index === dock.length - 1 ? index - 1 : index + 1;
  const pair = dock[index].size + dock[partner].size;
  const clamped = Math.min(Math.max(size, MIN_PANEL_SIZE), pair - MIN_PANEL_SIZE);
  if (clamped === dock[index].size) return layout;
  const resized = dock.map((panel, i) => {
    if (i === index) return { ...panel, size: clamped };
    if (i === partner) return { ...panel, size: pair - clamped };
    return panel;
  });
  return { ...layout, dock: resized };
}

export function closePane(layout: PaneLayout, id: PaneId): PaneLayout {
  const shown = layout.visible === id ? show(layout, 'chat') : layout;
  if (panelOf(shown.dock, id) < 0) return shown;
  return { ...shown, dock: removeTab(shown.dock, id) };
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

// Shrinking folds the dock away behind the chat; growing back opens what the phone showed.
export function setMode(layout: PaneLayout, mode: LayoutMode): PaneLayout {
  if (layout.mode === mode) return layout;
  if (mode === 'phone') return { ...layout, mode };
  const desktop: PaneLayout = { ...layout, mode, visible: 'chat' };
  return layout.visible === 'chat' ? desktop : openPane(desktop, layout.visible);
}

// A saved dock comes back with fresh panel ids; a tab that is not a pane, or is listed
// twice, is dropped, and sizes are made to sum to 1 again. Nothing usable leaves the
// layout as it is.
export function restoreDock(layout: PaneLayout, saved: readonly SavedPanel[]): PaneLayout {
  const seen = new Set<PaneId>();
  const panels: Panel[] = [];
  for (const entry of saved) {
    const tabs = (entry.tabs ?? []).filter((tab): tab is PaneId => {
      if (!PANE_IDS.includes(tab) || seen.has(tab)) return false;
      seen.add(tab);
      return true;
    });
    if (tabs.length === 0) continue;
    const size = Number.isFinite(entry.size) && entry.size > 0 ? entry.size : 1;
    const panel = newPanel(tabs[0], size);
    panels.push({ ...panel, tabs, active: tabs.includes(entry.active) ? entry.active : tabs[0] });
  }
  if (panels.length === 0) return layout;
  const total = panels.reduce((sum, panel) => sum + panel.size, 0);
  return { ...layout, dock: panels.map((panel) => ({ ...panel, size: panel.size / total })) };
}

export interface PaneStore {
  getState(): PaneLayout;
  subscribe(listener: () => void): () => void;
  openPane(id: PaneId): void;
  tearOff(id: PaneId): void;
  moveTab(id: PaneId, panelIndex: number, position: number): void;
  movePanel(from: number, to: number): void;
  resize(index: number, size: number): void;
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
    tearOff: (id) => apply(tearOff(state, id)),
    moveTab: (id, panelIndex, position) => apply(moveTab(state, id, panelIndex, position)),
    movePanel: (from, to) => apply(movePanel(state, from, to)),
    resize: (index, size) => apply(resize(state, index, size)),
    resizeColumn: (column, width) => apply(resizeColumn(state, column, width)),
    closePane: (id) => apply(closePane(state, id)),
    show: (target) => apply(show(state, target)),
    setMode: (mode) => apply(setMode(state, mode)),
    markUnseen: (id) => apply(markUnseen(state, id)),
  };
}
