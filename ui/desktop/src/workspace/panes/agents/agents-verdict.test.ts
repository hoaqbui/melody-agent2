import { describe, expect, it } from 'vitest';
import type { LedgerEvent, WorkerEvent } from '../../../native/ledger';
import { fixCandidates, latestVerdict } from './agents-verdict';

const T0 = Date.parse('2026-09-23T10:00:00.000Z');
const iso = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();

const worker = (overrides: Partial<WorkerEvent> = {}): WorkerEvent => ({
  kind: 'worker',
  at: iso(0),
  sessionId: 'parent',
  workerSessionId: 'job-a',
  status: 'done',
  blocked: false,
  filesChanged: ['ui/desktop/src/a.ts'],
  ...overrides,
});

const verdict = (
  offsetMs: number,
  value: 'good' | 'fixed' | 'wrong',
  workerSessionId = 'job-a'
): LedgerEvent => ({
  kind: 'verdict',
  at: iso(offsetMs),
  sessionId: 'parent',
  workerSessionId,
  verdict: value,
});

describe('latestVerdict', () => {
  it('is null when the job has no verdict line', () => {
    expect(latestVerdict([worker()], 'job-a')).toBeNull();
  });

  it('reads the one verdict line for the job', () => {
    expect(latestVerdict([worker(), verdict(1000, 'good')], 'job-a')).toBe('good');
  });

  it('the later of two verdict lines wins, whatever order they arrive in', () => {
    const events = [verdict(2000, 'wrong'), verdict(1000, 'good')];
    expect(latestVerdict(events, 'job-a')).toBe('wrong');
    expect(latestVerdict(events.slice().reverse(), 'job-a')).toBe('wrong');
  });

  it("never reads another job's verdict", () => {
    const events = [verdict(1000, 'wrong', 'job-b')];
    expect(latestVerdict(events, 'job-a')).toBeNull();
  });
});

const noTitle = () => undefined;

describe('fixCandidates', () => {
  it('names a job by its delegation title when the app still holds one', () => {
    const events: LedgerEvent[] = [
      worker({ workerSessionId: 'job-a', at: iso(0) }),
      worker({ workerSessionId: 'job-b', at: iso(1000) }),
    ];
    const [candidate] = fixCandidates(events, 'job-b', (job) =>
      job.workerSessionId === 'job-a' ? 'task 1: an earlier job' : undefined
    );
    expect(candidate.label).toBe('task 1: an earlier job');
  });

  it('lists every other job in the ledger, newest first', () => {
    const events = [
      worker({ workerSessionId: 'job-a', at: iso(0) }),
      worker({ workerSessionId: 'job-b', at: iso(1000), taskRef: 'task 12' }),
      worker({ workerSessionId: 'job-c', at: iso(2000), source: 'implementer' }),
    ];
    const candidates = fixCandidates(events, 'job-c', noTitle);
    expect(candidates.map((c) => c.workerSessionId)).toEqual(['job-b', 'job-a']);
    expect(candidates[0].label).toBe('task 12');
  });

  it('falls back to the source, then the id, when a job has no task reference', () => {
    const events = [
      worker({ workerSessionId: 'job-a', at: iso(0), source: 'implementer' }),
      worker({ workerSessionId: 'job-b', at: iso(500) }),
    ];
    const candidates = fixCandidates(events, 'job-b', noTitle);
    expect(candidates[0]).toMatchObject({ workerSessionId: 'job-a', label: 'implementer' });
  });

  it('never offers the job itself', () => {
    const events = [worker({ workerSessionId: 'job-a' })];
    expect(fixCandidates(events, 'job-a', noTitle)).toEqual([]);
  });

  it('never offers a later job once this one is itself in the ledger', () => {
    const events = [
      worker({ workerSessionId: 'job-a', at: iso(0) }),
      worker({ workerSessionId: 'job-b', at: iso(1000) }),
    ];
    expect(fixCandidates(events, 'job-a', noTitle)).toEqual([]);
  });

  it("hints the file overlap against this job's own return, exact or a path suffix", () => {
    const events = [
      worker({
        workerSessionId: 'job-a',
        at: iso(0),
        filesChanged: ['ui/desktop/src/a.ts', 'ui/desktop/src/b.ts'],
      }),
      worker({
        workerSessionId: 'job-b',
        at: iso(1000),
        filesChanged: ['src/a.ts', 'ui/desktop/src/c.ts'],
      }),
    ];
    const [candidate] = fixCandidates(events, 'job-b', noTitle);
    expect(candidate).toMatchObject({ workerSessionId: 'job-a', paths: ['src/a.ts'] });
  });

  it("has no overlap hint when this job's own worker line has not landed yet", () => {
    const events = [worker({ workerSessionId: 'job-a' })];
    const candidates = fixCandidates(events, 'job-not-in-ledger-yet', noTitle);
    expect(candidates).toEqual([{ workerSessionId: 'job-a', label: 'job-a', paths: [] }]);
  });
});
