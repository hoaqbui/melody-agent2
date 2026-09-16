// The one poll of `schedules/runs` (task 68): the Runs inbox (task 53) and the finish
// notifications read the same list, so it is fetched once every 15 s while either is
// listening and never twice. A failed list keeps the last runs and carries the error.

import { useSyncExternalStore } from 'react';
import type { ScheduleRunDto } from '@aaif/goose-acp-client';
import { errorMessage } from '../utils/conversionUtils';
import { acpListScheduleRuns } from './schedules';

export const RUNS_POLL_MS = 15_000;
export const RUNS_POLL_LIMIT = 50;

export interface ScheduleRunsSnapshot {
  // null until the first list answers.
  runs: readonly ScheduleRunDto[] | null;
  error: string | null;
}

let snapshot: ScheduleRunsSnapshot = { runs: null, error: null };
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;

function publish(next: ScheduleRunsSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function getScheduleRuns(): ScheduleRunsSnapshot {
  return snapshot;
}

// One list at a time: a Retry during a poll joins it rather than racing it.
export function refreshScheduleRuns(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = acpListScheduleRuns(RUNS_POLL_LIMIT)
    .then((runs) => publish({ runs, error: null }))
    .catch((cause) => publish({ ...snapshot, error: errorMessage(cause, 'Failed to list runs') }))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function subscribeScheduleRuns(listener: () => void): () => void {
  listeners.add(listener);
  if (interval === null) {
    void refreshScheduleRuns();
    interval = setInterval(() => void refreshScheduleRuns(), RUNS_POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval !== null) {
      clearInterval(interval);
      interval = null;
    }
  };
}

export function useScheduleRuns(): ScheduleRunsSnapshot {
  return useSyncExternalStore(subscribeScheduleRuns, getScheduleRuns, getScheduleRuns);
}
