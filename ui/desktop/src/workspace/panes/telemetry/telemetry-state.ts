// The Telemetry pane's pure state (task 128): the scope and range the toolbar shows, kept per
// project, and the state words the pane reports (DESIGN.md §Shared component states).

import { loadProjectEntry, saveProjectEntry } from '../../project-storage';

export const TELEMETRY_STATES = ['empty', 'loading', 'partial', 'error', 'ready'] as const;
export type TelemetryState = (typeof TELEMETRY_STATES)[number];

// Now = the open session; Over time = every session on this Mac, bucketed; Roles = every
// delegation, judged by outcome.
export const SCOPES = ['now', 'time', 'roles'] as const;
export type Scope = (typeof SCOPES)[number];

export const GRAINS = ['days', 'weeks', 'months', 'quarters'] as const;
export type Grain = (typeof GRAINS)[number];

// How many buckets a grain shows and what the range chip reads.
export const GRAIN_SPAN: Record<Grain, { buckets: number; chip: string }> = {
  days: { buckets: 14, chip: '14 d' },
  weeks: { buckets: 13, chip: '13 w' },
  months: { buckets: 12, chip: '12 mo' },
  quarters: { buckets: 5, chip: '5 q' },
};

const SCOPE_KEY = 'goose.workspace.telemetry.scope';
const GRAIN_KEY = 'goose.workspace.telemetry.grain';

export const isScope = (value: unknown): value is Scope =>
  typeof value === 'string' && (SCOPES as readonly string[]).includes(value);
export const isGrain = (value: unknown): value is Grain =>
  typeof value === 'string' && (GRAINS as readonly string[]).includes(value);

export function loadScope(project: string): Scope {
  const saved = loadProjectEntry(SCOPE_KEY, project);
  return isScope(saved) ? saved : 'time';
}

export function saveScope(project: string, scope: Scope): void {
  saveProjectEntry(SCOPE_KEY, project, scope);
}

export function loadGrain(project: string): Grain {
  const saved = loadProjectEntry(GRAIN_KEY, project);
  return isGrain(saved) ? saved : 'days';
}

export function saveGrain(project: string, grain: Grain): void {
  saveProjectEntry(GRAIN_KEY, project, grain);
}
