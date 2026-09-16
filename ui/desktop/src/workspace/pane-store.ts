// Layout state for the workspace (PRD step 8, step 13). Pure state, no React, no ACP:
// the shell subscribes and renders; the panes keep their own contents.

export type PaneId = 'files' | 'editor' | 'diff' | 'terminal' | 'git';

export const PANE_IDS: readonly PaneId[] = ['files', 'editor', 'diff', 'terminal', 'git'];

export type LayoutMode = 'desktop' | 'phone';

export const PHONE_MAX_WIDTH_PX = 767;

export interface PaneLayout {
  mode: LayoutMode;
  // Every pane, in rail order. A pane promoted to the centre keeps its slot here, so it
  // returns to the same tab position when replaced or closed.
  tabs: readonly PaneId[];
  // Desktop only: the one pane shown beside the chat; null is chat alone.
  centre: PaneId | null;
  // Desktop only: the selected side-panel tab.
  activeSide: PaneId | null;
  // Phone only: the one thing on screen; there is no split at phone width.
  visible: 'chat' | PaneId;
}

export function modeForWidth(widthPx: number): LayoutMode {
  return widthPx <= PHONE_MAX_WIDTH_PX ? 'phone' : 'desktop';
}

export function initialLayout(mode: LayoutMode = 'desktop'): PaneLayout {
  return {
    mode,
    tabs: PANE_IDS,
    centre: null,
    activeSide: PANE_IDS[0],
    visible: 'chat',
  };
}

export function sideTabs(layout: PaneLayout): PaneId[] {
  return layout.tabs.filter((id) => id !== layout.centre);
}

function nearestSideTab(layout: PaneLayout, from: PaneId): PaneId | null {
  const side = sideTabs(layout);
  if (side.length === 0) return null;
  const index = layout.tabs.indexOf(from);
  return side.find((id) => layout.tabs.indexOf(id) > index) ?? side[side.length - 1];
}

export function openCentre(layout: PaneLayout, id: PaneId): PaneLayout {
  if (layout.mode === 'phone') return show(layout, id);
  if (layout.centre === id) return layout;
  const next: PaneLayout = { ...layout, centre: id };
  if (layout.activeSide === id) next.activeSide = nearestSideTab(next, id);
  else if (layout.activeSide === null && layout.centre !== null) next.activeSide = layout.centre;
  return next;
}

export function closeCentre(layout: PaneLayout): PaneLayout {
  if (layout.centre === null) return layout;
  return { ...layout, centre: null, activeSide: layout.centre };
}

export function selectSide(layout: PaneLayout, id: PaneId): PaneLayout {
  if (layout.mode === 'phone') return show(layout, id);
  if (layout.centre === id || layout.activeSide === id) return layout;
  return { ...layout, activeSide: id };
}

export function show(layout: PaneLayout, target: 'chat' | PaneId): PaneLayout {
  if (layout.visible === target) return layout;
  return { ...layout, visible: target };
}

export function setMode(layout: PaneLayout, mode: LayoutMode): PaneLayout {
  if (layout.mode === mode) return layout;
  if (mode === 'phone') {
    return { ...layout, mode, centre: null, visible: layout.centre ?? layout.visible };
  }
  const activeSide = layout.visible === 'chat' ? layout.activeSide : layout.visible;
  return { ...layout, mode, activeSide, visible: 'chat' };
}

export interface PaneStore {
  getState(): PaneLayout;
  subscribe(listener: () => void): () => void;
  openCentre(id: PaneId): void;
  closeCentre(): void;
  selectSide(id: PaneId): void;
  show(target: 'chat' | PaneId): void;
  setMode(mode: LayoutMode): void;
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
    openCentre: (id) => apply(openCentre(state, id)),
    closeCentre: () => apply(closeCentre(state)),
    selectSide: (id) => apply(selectSide(state, id)),
    show: (target) => apply(show(state, target)),
    setMode: (mode) => apply(setMode(state, mode)),
  };
}
