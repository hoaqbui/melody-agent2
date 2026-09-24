// Per-project layout memory: one localStorage key holds every project's entry, keyed by the
// window's working dir, as task 19's shim holds the settings. The dock and the column
// widths each have a key; a project that never saved reads as null.

import type { TurnSnapshots } from './turn-undo';

const TURN_SNAPSHOTS_KEY = 'goose-turn-snapshots';
// Task 267's gap detector: one ISO timestamp per cwd, ticked every 60 s the app is open
// (`WorkspaceShell.tsx`) so the next launch can tell a closed window from a live one.
const LAST_ALIVE_KEY = 'goose-last-alive';

export function loadProjectEntry(key: string, project: string): unknown {
  try {
    const all = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    return all[project] ?? null;
  } catch {
    return null;
  }
}

export function saveProjectEntry(key: string, project: string, value: unknown): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    all[project] = value;
    window.localStorage.setItem(key, JSON.stringify(all));
  } catch {
    // Storage disabled or full: the layout lives for this window only.
  }
}

export function loadTurnSnapshots(project: string): Record<string, TurnSnapshots> {
  try {
    const all = JSON.parse(window.localStorage.getItem(TURN_SNAPSHOTS_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
    const snapshots = all[project];
    return snapshots && typeof snapshots === 'object' ? (snapshots as Record<string, TurnSnapshots>) : {};
  } catch {
    return {};
  }
}

export function saveTurnSnapshot(project: string, turnId: string, snapshots: TurnSnapshots): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(TURN_SNAPSHOTS_KEY) ?? '{}') as Record<
      string,
      unknown
    >;
    const projectSnapshots = (all[project] ??
      {}) as Record<string, TurnSnapshots>;
    projectSnapshots[turnId] = snapshots;
    all[project] = projectSnapshots;
    window.localStorage.setItem(TURN_SNAPSHOTS_KEY, JSON.stringify(all));
  } catch {
    // Storage disabled or full: snapshots live for this window only.
  }
}

export function loadHeartbeat(project: string): string | null {
  const value = loadProjectEntry(LAST_ALIVE_KEY, project);
  return typeof value === 'string' ? value : null;
}

export function saveHeartbeat(project: string, at: string): void {
  saveProjectEntry(LAST_ALIVE_KEY, project, at);
}
