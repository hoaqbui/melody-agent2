// What the Changes pane keeps while it is off screen (DESIGN.md Nothing Lost Rule): the
// base, the scope, the view, the selected file and the last hunk applied, so Undo survives
// a promote or close. Pure state; the pane refetches contents on mount.

import type { GitApplyRequest } from '../../../native/sidecar';

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

// Unstaged is what the working tree holds beyond the index (or beyond the session base);
// Staged is what the index holds beyond the base (`git diff --cached`).
export type DiffScope = 'unstaged' | 'staged';

export type DiffView = 'unified' | 'split';

export interface DiffSelection {
  base: DiffBase;
  scope: DiffScope;
  view: DiffView;
  path: string | null;
  // The last /git/apply that succeeded; Undo sends it back with `reverse` flipped.
  lastApply: GitApplyRequest | null;
}

export function undoRequest(applied: GitApplyRequest): GitApplyRequest {
  return { ...applied, reverse: !applied.reverse };
}

export interface DiffStore {
  getState(): DiffSelection;
  subscribe(listener: () => void): () => void;
  setBase(base: DiffBase): void;
  setScope(scope: DiffScope): void;
  setView(view: DiffView): void;
  select(path: string | null): void;
  setLastApply(request: GitApplyRequest | null): void;
}

export const INITIAL_SELECTION: DiffSelection = {
  base: 'head',
  scope: 'unstaged',
  view: 'unified',
  path: null,
  lastApply: null,
};

// The pane's store is private to it; a route that lands on Changes with a base already
// picked (the Runs inbox's Open, task 53) presets every live store instead.
const liveStores = new Set<DiffStore>();

export function presetDiffBase(base: DiffBase): void {
  liveStores.forEach((store) => store.setBase(base));
}

export function createDiffStore(initial: DiffSelection = INITIAL_SELECTION): DiffStore {
  let state = initial;
  const listeners = new Set<() => void>();
  const apply = (next: Partial<DiffSelection>) => {
    const merged = { ...state, ...next };
    if (
      (Object.keys(merged) as (keyof DiffSelection)[]).every((key) => merged[key] === state[key])
    ) {
      return;
    }
    state = merged;
    listeners.forEach((listener) => listener());
  };
  const store: DiffStore = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setBase: (base) => apply({ base, path: null }),
    setScope: (scope) => apply({ scope, path: null }),
    setView: (view) => apply({ view }),
    select: (path) => apply({ path }),
    setLastApply: (lastApply) => apply({ lastApply }),
  };
  liveStores.add(store);
  return store;
}
