// What the Changes pane keeps while it is off screen (DESIGN.md Nothing Lost Rule): the
// base, the view and the selected file. Pure state; the pane refetches contents on mount.

// DESIGN.md §Shared component states, plus `ready` for a surface with nothing unresolved.
export const DIFF_PANE_STATES = [
  'empty',
  'loading',
  'partial',
  'running',
  'error',
  'cancelled',
  'unavailable',
  'ready',
] as const;

export type DiffPaneState = (typeof DIFF_PANE_STATES)[number];

export type DiffBase = 'head' | 'session';

export type DiffView = 'unified' | 'split';

export interface DiffSelection {
  base: DiffBase;
  view: DiffView;
  path: string | null;
}

export interface DiffStore {
  getState(): DiffSelection;
  subscribe(listener: () => void): () => void;
  setBase(base: DiffBase): void;
  setView(view: DiffView): void;
  select(path: string | null): void;
}

export function createDiffStore(
  initial: DiffSelection = { base: 'head', view: 'unified', path: null }
): DiffStore {
  let state = initial;
  const listeners = new Set<() => void>();
  const apply = (next: Partial<DiffSelection>) => {
    const merged = { ...state, ...next };
    if (merged.base === state.base && merged.view === state.view && merged.path === state.path) {
      return;
    }
    state = merged;
    listeners.forEach((listener) => listener());
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setBase: (base) => apply({ base, path: null }),
    setView: (view) => apply({ view }),
    select: (path) => apply({ path }),
  };
}
