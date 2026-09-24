// The job outcome fold (task 266): one rule that reads each delegated worker run — a job,
// keyed by its `workerSessionId` — as exactly one outcome from the work ledger, so "clean"
// means landed and nothing else. Pure: the ledger's events and `now` in, no I/O, no React.

import type { LedgerEvent, UndoEvent, WorkerEvent } from '../../../native/ledger';

export const JOB_OUTCOMES = [
  'failed',
  'blocked',
  'undone',
  'reworked',
  'corrected',
  'landed',
  'unknown',
] as const;
export type JobOutcome = (typeof JOB_OUTCOMES)[number];

export type Job = WorkerEvent;
type Verdict = Extract<LedgerEvent, { kind: 'verdict' }>['verdict'];

// A later job that touched the same files: offered to the user as a possible fix, never
// counted — only a `link` makes a job reworked.
export interface ReworkSuggestion {
  workerSessionId: string;
  paths: string[];
}

export interface JobReading {
  outcome: JobOutcome;
  clean: boolean;
  // No land and no failure yet, but still inside the window a commit could arrive in.
  awaiting: boolean;
  verdict: Verdict | null;
  suggestions: ReworkSuggestion[];
}

export const AWAITING_MS = 7 * 24 * 60 * 60 * 1000;

const time = (at: string): number => Date.parse(at);

// A seat's `## Files Changed` may list absolute or repo-relative paths; a commit's are
// repo-relative. Exact or a whole-segment suffix, never a basename alone.
const samePath = (a: string, b: string): boolean => {
  const x = a.replace(/^\.\//, '');
  const y = b.replace(/^\.\//, '');
  return x === y || x.endsWith('/' + y) || y.endsWith('/' + x);
};

// Exported for the Agents pane's "Fixes…" control (task 268): the same file-overlap hint,
// offered there against a job's earlier jobs instead of its later ones.
export const overlap = (paths: readonly string[], files: readonly string[]): string[] =>
  paths.filter((path) => files.some((file) => samePath(path, file)));

// What makes two ledger lines the same line: a reconnect or a re-seed replays events the
// ledger already holds. An undo and its redo share a turn, so both the flag and the time
// are part of their identity.
function lineKey(event: LedgerEvent): string {
  switch (event.kind) {
    case 'worker':
      return `worker:${event.workerSessionId}`;
    case 'turn':
      return `turn:${event.sessionId}:${event.messageId ?? event.at}`;
    case 'correction':
      return `correction:${event.toolCallId}:${event.path}`;
    case 'undo':
      return `undo:${event.turnId}:${event.redo === true}:${event.at}`;
    case 'land':
      return `land:${event.sha}`;
    case 'verdict':
      return `verdict:${event.workerSessionId}:${event.at}`;
    case 'link':
      return `link:${event.workerSessionId}:${event.fromWorkerSessionId ?? event.fromSha ?? event.at}`;
    default:
      return `${event.kind}:${event.sessionId}:${event.at}`;
  }
}

function dedupe(events: readonly LedgerEvent[]): LedgerEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = lineKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// One job per `workerSessionId`. A replayed worker line may carry a later `at` (a re-seed with
// no response message falls back to now), so the earliest line is the job's return.
export function jobsOf(events: readonly LedgerEvent[]): Job[] {
  const jobs = new Map<string, Job>();
  for (const event of events) {
    if (event.kind !== 'worker') continue;
    const held = jobs.get(event.workerSessionId);
    if (!held || time(event.at) < time(held.at)) jobs.set(event.workerSessionId, event);
  }
  return [...jobs.values()];
}

const byTime = <T extends { at: string }>(a: T, b: T): number => time(a.at) - time(b.at);

export function outcomeOf(job: Job, events: readonly LedgerEvent[], now: number): JobReading {
  const lines = dedupe(events);
  const id = job.workerSessionId;
  const jobAt = time(job.at);

  const verdict =
    lines
      .filter(
        (e): e is Extract<LedgerEvent, { kind: 'verdict' }> =>
          e.kind === 'verdict' && e.workerSessionId === id
      )
      .sort(byTime)
      .at(-1)?.verdict ?? null;

  const lastUndo = job.turnId
    ? lines
        .filter((e): e is UndoEvent => e.kind === 'undo' && e.turnId === job.turnId)
        .sort(byTime)
        .at(-1)
    : undefined;
  const undone = lastUndo !== undefined && lastUndo.redo !== true;

  const links = lines.filter(
    (e): e is Extract<LedgerEvent, { kind: 'link' }> =>
      e.kind === 'link' && e.workerSessionId === id
  );
  const corrected =
    verdict === 'fixed' || lines.some((e) => e.kind === 'correction' && e.workerSessionId === id);
  const landed = lines.some(
    (e) => e.kind === 'land' && time(e.at) >= jobAt && overlap(e.paths, job.filesChanged).length > 0
  );

  const outcome: JobOutcome =
    job.status === 'failed' || verdict === 'wrong'
      ? 'failed'
      : job.blocked
        ? 'blocked'
        : undone
          ? 'undone'
          : links.length > 0
            ? 'reworked'
            : corrected
              ? 'corrected'
              : landed
                ? 'landed'
                : 'unknown';

  const linkedFixers = new Set(links.map((link) => link.fromWorkerSessionId));
  const suggestions: ReworkSuggestion[] = jobsOf(events)
    .filter(
      (later) =>
        later.workerSessionId !== id &&
        later.status === 'done' &&
        time(later.at) > jobAt &&
        !linkedFixers.has(later.workerSessionId)
    )
    .map((later) => ({
      workerSessionId: later.workerSessionId,
      paths: overlap(later.filesChanged, job.filesChanged),
    }))
    .filter((suggestion) => suggestion.paths.length > 0);

  return {
    outcome,
    clean: outcome === 'landed',
    awaiting: outcome === 'unknown' && now - jobAt < AWAITING_MS,
    verdict,
    suggestions,
  };
}
