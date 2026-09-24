// One-tap verdict and "Fixes…" (task 268): pure reads over the ledger for a done worker row.
// The row's own tap writes a `verdict` line and, through "Fixes…", a `link` line — both native
// (`native/ledger.ts`) appends the row makes directly; this file only reads what is already
// there, so the row can show the latest verdict and offer earlier jobs to name as fixed. The
// latest verdict wins (266's fold, `ledger-outcome.ts` `outcomeOf`); a suggestion here is a
// hint, never a link — only the user's own pick writes one.

import type { LedgerEvent } from '../../../native/ledger';
import { jobsOf, overlap, type Job } from '../telemetry/ledger-outcome';

export type Verdict = Extract<LedgerEvent, { kind: 'verdict' }>['verdict'];

const time = (at: string): number => Date.parse(at);

// The most recent verdict line for this job, or null when none was ever tapped.
export function latestVerdict(
  events: readonly LedgerEvent[],
  workerSessionId: string
): Verdict | null {
  let found: { at: string; verdict: Verdict } | null = null;
  for (const event of events) {
    if (event.kind !== 'verdict' || event.workerSessionId !== workerSessionId) continue;
    if (!found || time(event.at) >= time(found.at))
      found = { at: event.at, verdict: event.verdict };
  }
  return found?.verdict ?? null;
}

export interface FixCandidate {
  workerSessionId: string;
  // What names the job to a human: its delegation title while this app still holds it, else its
  // task reference, else the role that ran it, else its id.
  label: string;
  // File overlap against this job's own `filesChanged` — a hint only, never written.
  paths: string[];
}

// This repository's earlier jobs — every other worker line the ledger holds that happened
// before this one, newest first, with the file-overlap hint against this job's own return.
// This job's own `worker` line may not have landed yet (`useLedgerWriter` is async, and the
// pane's own read is a snapshot from before the tap); until it does, "before this one" cannot
// be judged, so every other job counts as earlier — anything already durably in the ledger
// happened at or before now, and this job's own line, once it lands, will too.
export function fixCandidates(
  events: readonly LedgerEvent[],
  workerSessionId: string,
  titleOf: (job: Job) => string | undefined
): FixCandidate[] {
  const jobs = jobsOf(events);
  const self = jobs.find((job) => job.workerSessionId === workerSessionId);
  return jobs
    .filter((job) => job.workerSessionId !== workerSessionId)
    .filter((job) => !self || time(job.at) < time(self.at))
    .sort((a, b) => time(b.at) - time(a.at))
    .map((job) => ({
      workerSessionId: job.workerSessionId,
      label: titleOf(job) || job.taskRef || job.source || job.workerSessionId,
      paths: self ? overlap(self.filesChanged, job.filesChanged) : [],
    }));
}
