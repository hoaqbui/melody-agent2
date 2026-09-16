// What the Runs inbox derives without React (task 53): a run's outcome once the wire and
// the schedule list are read together, which rows are unread against a local last-seen,
// why Accept is disabled, the paths Accept stages, where a worktree run's branch merges
// (task 54), and the inbox's DESIGN.md state.

import type { ScheduledJobDto, ScheduleRunDto } from '@aaif/goose-acp-client';
import { SidecarError } from '../../../native/sidecar';
import { parseUnifiedDiff } from '../../../workspace/panes/diff/unified-diff';

// DESIGN.md §Shared component states, plus `ready` for a surface with nothing unresolved.
export const RUNS_INBOX_STATES = [
  'empty',
  'loading',
  'partial',
  'running',
  'error',
  'cancelled',
  'unavailable',
  'ready',
] as const;

export type RunsInboxState = (typeof RUNS_INBOX_STATES)[number];

// `unknown` is a run recorded before outcomes were (task 51): finished, but the wire cannot
// say how.
export type RunOutcome = 'running' | 'done' | 'failed' | 'killed' | 'unknown';

export type AcceptBlocker = 'running' | 'otherCwd' | 'noSidecar';

export const SEEN_STORAGE_KEY = 'runsInbox.seen';

// A missing outcome is a run still going only while its schedule names it as current;
// otherwise it predates outcome recording.
export function runOutcome(run: ScheduleRunDto, schedules: readonly ScheduledJobDto[]): RunOutcome {
  if (run.outcome) return run.outcome.status;
  const current = schedules.some((job) => job.currentSessionId === run.sessionId);
  return current ? 'running' : 'unknown';
}

export function isReviewable(outcome: RunOutcome): boolean {
  return outcome !== 'running';
}

// Dismissed runs are archived sessions; the wire keeps them, the inbox does not.
export function visibleRuns(runs: readonly ScheduleRunDto[]): ScheduleRunDto[] {
  return runs.filter((run) => !run.archivedAt);
}

const trimSlash = (path: string): string => path.replace(/\/+$/, '') || path;

export function sameCwd(a: string, b: string): boolean {
  return trimSlash(a) === trimSlash(b);
}

// A worktree run's hand-off (task 54): the slug the sidecar's merge and remove take and the
// main checkout they run in. `path` is `<toplevel>/.worktrees/<slug>`, so the checkout is
// two levels up; from inside the worktree the toplevel is the worktree itself and
// `merge wt/<slug>` would merge the branch into itself.
export interface RunWorktreePlace {
  slug: string;
  branch: string;
  path: string;
  main: string;
}

export function runWorktreePlace(run: ScheduleRunDto): RunWorktreePlace | null {
  const worktree = run.worktree;
  if (!worktree) return null;
  return {
    slug: worktree.branch.replace(/^wt\//, ''),
    branch: worktree.branch,
    path: worktree.path,
    main: worktree.path.replace(/[\\/]\.worktrees[\\/][^\\/]+[\\/]?$/, ''),
  };
}

// The checkout Accept commits in, or merges a worktree run's branch into; it has to be the
// one this window's sidecar serves.
export function acceptCheckout(run: ScheduleRunDto): string {
  return runWorktreePlace(run)?.main ?? run.workingDir;
}

export function acceptBlocker(input: {
  outcome: RunOutcome;
  checkout: string;
  sidecarCwd: string | null;
}): AcceptBlocker | null {
  if (input.outcome === 'running') return 'running';
  if (input.sidecarCwd === null) return 'noSidecar';
  if (!sameCwd(input.checkout, input.sidecarCwd)) return 'otherCwd';
  return null;
}

// A failed Accept or Dismiss as the row shows it; a 409 merge names the conflicting paths.
export interface RunActionError {
  message: string;
  conflicts: string[];
}

export function runActionError(cause: unknown, fallback: string): RunActionError {
  const conflicts =
    cause instanceof SidecarError && Array.isArray(cause.details.conflicts)
      ? cause.details.conflicts.filter((path): path is string => typeof path === 'string')
      : [];
  const message = cause instanceof Error && cause.message ? cause.message : fallback;
  return { message, conflicts };
}

// The paths a diff touches, both sides of a rename so the old name's deletion stages too.
export function acceptPaths(diff: string): string[] {
  const paths = new Set<string>();
  for (const file of parseUnifiedDiff(diff)) {
    if (file.oldPath && file.oldPath !== file.path) paths.add(file.oldPath);
    paths.add(file.path);
  }
  return [...paths];
}

export function acceptMessage(scheduleId: string): string {
  return `Accept scheduled run: ${scheduleId}`;
}

export function inboxState(input: {
  error: string | null;
  loaded: boolean;
  acting: boolean;
  sidecarCwd: string | null | undefined;
  runs: readonly ScheduleRunDto[];
}): RunsInboxState {
  if (input.error) return 'error';
  if (!input.loaded) return 'loading';
  if (input.runs.length === 0) return 'empty';
  if (input.acting) return 'running';
  if (input.sidecarCwd === undefined) return 'partial';
  return 'ready';
}

// The unread mark is one client's: a run is unread until this client opened it after its
// outcome landed. The wire carries no update time, so the outcome status is the key — a
// run seen while running reads as unread again once it finishes.
export type SeenMap = Record<string, RunOutcome>;

export interface SeenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSeen(storage: SeenStorage | null): SeenMap {
  try {
    const raw = storage?.getItem(SEEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const seen: SeenMap = {};
    for (const [id, outcome] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof outcome === 'string') seen[id] = outcome as RunOutcome;
    }
    return seen;
  } catch {
    return {};
  }
}

export function saveSeen(storage: SeenStorage | null, seen: SeenMap): void {
  try {
    storage?.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    // Storage is a convenience: with it gone every run reads unread, which is the safe side.
  }
}

export function isUnread(seen: SeenMap, run: ScheduleRunDto, outcome: RunOutcome): boolean {
  if (outcome === 'running') return false;
  return seen[run.sessionId] !== outcome;
}

export function markSeen(seen: SeenMap, run: ScheduleRunDto, outcome: RunOutcome): SeenMap {
  if (seen[run.sessionId] === outcome) return seen;
  return { ...seen, [run.sessionId]: outcome };
}

// Ids the wire no longer lists leave the map, so the store stays as small as the inbox.
export function pruneSeen(seen: SeenMap, runs: readonly ScheduleRunDto[]): SeenMap {
  const listed = new Set(runs.map((run) => run.sessionId));
  const kept = Object.entries(seen).filter(([id]) => listed.has(id));
  return kept.length === Object.keys(seen).length ? seen : Object.fromEntries(kept);
}
