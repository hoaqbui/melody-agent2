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

export interface PaneLayout {
  mode: LayoutMode;
  // Desktop only: the right dock, top to bottom; empty is chat alone.
  dock: readonly Panel[];
  // Phone only: the one thing on screen; there is no split at phone width.
  visible: 'chat' | PaneId;
  // Until task 42 rewires the shell: the last torn pane, and the pane the side panel shows.
  centre: PaneId | null;
  activeSide: PaneId | null;
}

const MIN_PANEL_SIZE = 0.1;

export function modeForWidth(widthPx: number): LayoutMode {
  return widthPx <= PHONE_MAX_WIDTH_PX ? 'phone' : 'desktop';
}

export function initialLayout(mode: LayoutMode = 'desktop'): PaneLayout {
  return { mode, dock: [], visible: 'chat', centre: null, activeSide: null };
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

// Until task 42: `centre` follows the torn pane while it stays in the dock, and the side
// panel shows the first panel that is not the centre's own.
function settle(layout: PaneLayout, dock: readonly Panel[], centre = layout.centre): PaneLayout {
  const kept = centre !== null && panelOf(dock, centre) >= 0 ? centre : null;
  const side = dock.find((panel) => panel.active !== kept);
  return { ...layout, dock, centre: kept, activeSide: side?.active ?? null };
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
    if (dock[index].active === id) return layout;
    return settle(layout, replaceAt(dock, index, { ...dock[index], active: id }));
  }
  if (dock.length === 0) return settle(layout, [newPanel(id, 1)]);
  const first = { ...dock[0], tabs: [...dock[0].tabs, id], active: id };
  return settle(layout, replaceAt(dock, 0, first));
}

export function tearOff(layout: PaneLayout, id: PaneId): PaneLayout {
  if (layout.mode === 'phone') return show(layout, id);
  const { dock } = layout;
  const index = panelOf(dock, id);
  if (index < 0) return settle(layout, splitBelow(dock, dock.length - 1, id));
  if (dock[index].tabs.length === 1) return layout;
  return settle(layout, splitBelow(removeTab(dock, id), index, id));
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
    if (tabs.every((tab, i) => tab === target.tabs[i])) return layout;
    return settle(layout, replaceAt(dock, panelIndex, { ...target, tabs, active: id }));
  }
  const moved = removeTab(dock, id).map((panel) => {
    if (panel.id !== target.id) return panel;
    const tabs = [...panel.tabs];
    tabs.splice(position, 0, id);
    return { ...panel, tabs, active: id };
  });
  return settle(layout, moved);
}

export function movePanel(layout: PaneLayout, from: number, to: number): PaneLayout {
  if (from === to) return layout;
  const dock = [...layout.dock];
  const [panel] = dock.splice(from, 1);
  dock.splice(to, 0, panel);
  return settle(layout, dock);
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
  return settle(layout, resized);
}

export function closePane(layout: PaneLayout, id: PaneId): PaneLayout {
  const shown = layout.visible === id ? show(layout, 'chat') : layout;
  if (panelOf(shown.dock, id) < 0) return shown;
  return settle(shown, removeTab(shown.dock, id));
}

export function show(layout: PaneLayout, target: 'chat' | PaneId): PaneLayout {
  if (layout.visible === target) return layout;
  return { ...layout, visible: target };
}

// Shrinking folds the dock away behind the chat; growing back opens what the phone showed.
export function setMode(layout: PaneLayout, mode: LayoutMode): PaneLayout {
  if (layout.mode === mode) return layout;
  if (mode === 'phone') return { ...layout, mode };
  const desktop: PaneLayout = { ...layout, mode, visible: 'chat' };
  return layout.visible === 'chat' ? desktop : openPane(desktop, layout.visible);
}

// Adapters until task 42 rewires the shell to the dock: the old "chat + one centre pane +
// side tabs" names over the dock. The centre is the last torn pane; the side tabs are the
// launcher row, every pane but the centre.
export function sideTabs(layout: PaneLayout): PaneId[] {
  return PANE_IDS.filter((id) => id !== layout.centre);
}

export function openCentre(layout: PaneLayout, id: PaneId): PaneLayout {
  if (layout.mode === 'phone') return show(layout, id);
  const torn = tearOff(layout, id);
  return torn.centre === id ? torn : settle(torn, torn.dock, id);
}

export const selectSide = openPane;

export function closeCentre(layout: PaneLayout): PaneLayout {
  return layout.centre === null ? layout : closePane(layout, layout.centre);
}

export interface PaneStore {
  getState(): PaneLayout;
  subscribe(listener: () => void): () => void;
  openPane(id: PaneId): void;
  tearOff(id: PaneId): void;
  moveTab(id: PaneId, panelIndex: number, position: number): void;
  movePanel(from: number, to: number): void;
  resize(index: number, size: number): void;
  closePane(id: PaneId): void;
  show(target: 'chat' | PaneId): void;
  setMode(mode: LayoutMode): void;
  // Until task 42.
  openCentre(id: PaneId): void;
  closeCentre(): void;
  selectSide(id: PaneId): void;
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
    closePane: (id) => apply(closePane(state, id)),
    show: (target) => apply(show(state, target)),
    setMode: (mode) => apply(setMode(state, mode)),
    openCentre: (id) => apply(openCentre(state, id)),
    closeCentre: () => apply(closeCentre(state)),
    selectSide: (id) => apply(selectSide(state, id)),
  };
}
