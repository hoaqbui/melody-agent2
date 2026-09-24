import { describe, expect, it } from 'vitest';
import type { LedgerEvent, WorkerEvent } from '../../../native/ledger';
import { AWAITING_MS, type JobOutcome, jobsOf, outcomeOf } from './ledger-outcome';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-09-20T10:00:00.000Z');
const iso = (offsetMs: number): string => new Date(T0 + offsetMs).toISOString();
const NOW = T0 + DAY;

const worker = (overrides: Partial<WorkerEvent> = {}): WorkerEvent => ({
  kind: 'worker',
  at: iso(0),
  sessionId: 'parent',
  workerSessionId: 'job-a',
  status: 'done',
  blocked: false,
  filesChanged: ['ui/desktop/src/a.ts'],
  turnId: 'turn-1',
  ...overrides,
});

const land = (offsetMs: number, paths: string[], sha = `sha-${offsetMs}`): LedgerEvent => ({
  kind: 'land',
  at: iso(offsetMs),
  sessionId: 'parent',
  sha,
  paths,
  message: 'commit',
});
const verdict = (offsetMs: number, value: 'good' | 'fixed' | 'wrong'): LedgerEvent => ({
  kind: 'verdict',
  at: iso(offsetMs),
  sessionId: 'parent',
  workerSessionId: 'job-a',
  verdict: value,
});
const correction = (offsetMs: number): LedgerEvent => ({
  kind: 'correction',
  at: iso(offsetMs),
  sessionId: 'parent',
  workerSessionId: 'job-a',
  path: 'ui/desktop/src/a.ts',
  toolCallId: `edit-${offsetMs}`,
});
const undo = (offsetMs: number, redo = false): LedgerEvent => ({
  kind: 'undo',
  at: iso(offsetMs),
  sessionId: 'parent',
  turnId: 'turn-1',
  redo,
});
const link = (offsetMs: number, fromWorkerSessionId = 'job-b'): LedgerEvent => ({
  kind: 'link',
  at: iso(offsetMs),
  sessionId: 'parent',
  workerSessionId: 'job-a',
  by: 'user',
  fromWorkerSessionId,
});

const read = (job: WorkerEvent, rest: LedgerEvent[], now = NOW) =>
  outcomeOf(job, [job, ...rest], now);

describe('outcomeOf', () => {
  it('a land on the job files after it returned reads landed and clean', () => {
    const reading = read(worker(), [land(1000, ['ui/desktop/src/a.ts'])]);
    expect(reading).toMatchObject({ outcome: 'landed', clean: true, awaiting: false });
  });

  it('a land before the job, or on other files, is not its landing', () => {
    expect(read(worker(), [land(-1000, ['ui/desktop/src/a.ts'])]).outcome).toBe('unknown');
    expect(read(worker(), [land(1000, ['ui/desktop/src/b.ts'])]).outcome).toBe('unknown');
    expect(read(worker(), [land(1000, ['other/src/a.ts'])]).outcome).toBe('unknown');
  });

  it('an absolute Files Changed path meets a repo-relative commit path', () => {
    const job = worker({ filesChanged: ['/Users/me/repo/ui/desktop/src/a.ts'] });
    expect(read(job, [land(1000, ['ui/desktop/src/a.ts'])]).outcome).toBe('landed');
  });

  it('a correction reads corrected, even after a land', () => {
    const reading = read(worker(), [land(1000, ['ui/desktop/src/a.ts']), correction(500)]);
    expect(reading).toMatchObject({ outcome: 'corrected', clean: false });
  });

  it('a "fixed it" verdict reads corrected', () => {
    expect(read(worker(), [verdict(500, 'fixed')]).outcome).toBe('corrected');
  });

  it('a linked later fix reads reworked', () => {
    const later = worker({ workerSessionId: 'job-b', at: iso(2000), turnId: 'turn-2' });
    const reading = read(worker(), [land(1000, ['ui/desktop/src/a.ts']), later, link(3000)]);
    expect(reading).toMatchObject({ outcome: 'reworked', clean: false, suggestions: [] });
  });

  it('file overlap alone is a suggestion, never reworked', () => {
    const later = worker({
      workerSessionId: 'job-b',
      at: iso(2000),
      turnId: 'turn-2',
      filesChanged: ['ui/desktop/src/a.ts', 'ui/desktop/src/c.ts'],
    });
    const reading = read(worker(), [land(1000, ['ui/desktop/src/a.ts']), later]);
    expect(reading.outcome).toBe('landed');
    expect(reading.suggestions).toEqual([
      { workerSessionId: 'job-b', paths: ['ui/desktop/src/a.ts'] },
    ]);
  });

  it('BLOCKED is never landed, even when its files land', () => {
    const reading = read(worker({ blocked: true }), [land(1000, ['ui/desktop/src/a.ts'])]);
    expect(reading).toMatchObject({ outcome: 'blocked', clean: false, awaiting: false });
  });

  it('no land after 7 days reads unknown and no longer awaiting', () => {
    const reading = read(worker(), [], T0 + AWAITING_MS + DAY);
    expect(reading).toMatchObject({ outcome: 'unknown', clean: false, awaiting: false });
  });

  it('no land under 7 days reads unknown, awaiting', () => {
    const reading = read(worker(), [], T0 + 6 * DAY);
    expect(reading).toMatchObject({ outcome: 'unknown', clean: false, awaiting: true });
  });

  it('a "good" verdict with no land is still unknown, not clean', () => {
    expect(read(worker(), [verdict(500, 'good')])).toMatchObject({
      outcome: 'unknown',
      clean: false,
      verdict: 'good',
    });
  });

  it('the latest verdict wins', () => {
    const landed = land(1000, ['ui/desktop/src/a.ts']);
    expect(read(worker(), [landed, verdict(500, 'wrong'), verdict(900, 'good')])).toMatchObject({
      outcome: 'landed',
      verdict: 'good',
    });
    expect(read(worker(), [landed, verdict(500, 'good'), verdict(900, 'wrong')])).toMatchObject({
      outcome: 'failed',
      verdict: 'wrong',
    });
  });

  it('an undo reads undone until a later redo cancels it', () => {
    const landed = land(1000, ['ui/desktop/src/a.ts']);
    expect(read(worker(), [landed, undo(2000)]).outcome).toBe('undone');
    expect(read(worker(), [landed, undo(2000), undo(3000, true)]).outcome).toBe('landed');
    expect(read(worker(), [landed, undo(2000), undo(3000, true), undo(4000)]).outcome).toBe(
      'undone'
    );
  });

  it('an undo of another turn, or a job with no turn, is not undone', () => {
    const landed = land(1000, ['ui/desktop/src/a.ts']);
    expect(read(worker({ turnId: 'turn-9' }), [landed, undo(2000)]).outcome).toBe('landed');
    expect(read(worker({ turnId: null }), [landed, undo(2000)]).outcome).toBe('landed');
  });

  it('a replayed undo/redo pair keeps its order', () => {
    const landed = land(1000, ['ui/desktop/src/a.ts']);
    const pair = [undo(2000), undo(3000, true)];
    expect(read(worker(), [landed, ...pair, ...pair]).outcome).toBe('landed');
  });

  // One job carrying every signal; each row removes the winning one and the next takes over.
  it('follows the precedence failed > blocked > undone > reworked > corrected > landed > unknown', () => {
    const later = worker({ workerSessionId: 'job-b', at: iso(2000), turnId: 'turn-2' });
    const signals = {
      failed: { status: 'failed' as const },
      blocked: { blocked: true },
      undone: [undo(4000)],
      reworked: [later, link(3000)],
      corrected: [correction(500)],
      landed: [land(1000, ['ui/desktop/src/a.ts'])],
    };
    const table: [string[], JobOutcome][] = [
      [['failed', 'blocked', 'undone', 'reworked', 'corrected', 'landed'], 'failed'],
      [['blocked', 'undone', 'reworked', 'corrected', 'landed'], 'blocked'],
      [['undone', 'reworked', 'corrected', 'landed'], 'undone'],
      [['reworked', 'corrected', 'landed'], 'reworked'],
      [['corrected', 'landed'], 'corrected'],
      [['landed'], 'landed'],
      [[], 'unknown'],
    ];
    for (const [present, expected] of table) {
      const job = worker({
        ...(present.includes('failed') ? signals.failed : {}),
        ...(present.includes('blocked') ? signals.blocked : {}),
      });
      const rest = (['undone', 'reworked', 'corrected', 'landed'] as const)
        .filter((signal) => present.includes(signal))
        .flatMap((signal) => signals[signal]);
      const reading = read(job, rest);
      expect({ present, outcome: reading.outcome }).toEqual({ present, outcome: expected });
      expect(reading.clean).toBe(expected === 'landed');
      expect(reading.awaiting).toBe(expected === 'unknown');
    }
  });

  it('a "wrong" verdict reads failed over every other signal', () => {
    const reading = read(worker({ blocked: true }), [
      undo(4000),
      link(3000),
      correction(500),
      land(1000, ['ui/desktop/src/a.ts']),
      verdict(5000, 'wrong'),
    ]);
    expect(reading.outcome).toBe('failed');
  });
});

describe('jobsOf', () => {
  it('a replayed duplicate worker event is one job', () => {
    const job = worker();
    const replay = worker({ at: iso(60_000) });
    const other = worker({ workerSessionId: 'job-b', at: iso(2000), turnId: 'turn-2' });
    const jobs = jobsOf([job, land(1000, ['ui/desktop/src/a.ts']), replay, other, job]);
    expect(jobs.map((j) => j.workerSessionId)).toEqual(['job-a', 'job-b']);
    expect(jobs[0].at).toBe(job.at);
  });

  it('a replayed later job is one suggestion, and a replayed land one landing', () => {
    const later = worker({ workerSessionId: 'job-b', at: iso(2000), turnId: 'turn-2' });
    const landed = land(1000, ['ui/desktop/src/a.ts']);
    const events = [worker(), landed, later, later, landed, worker()];
    const [job] = jobsOf(events);
    const reading = outcomeOf(job, events, NOW);
    expect(reading.outcome).toBe('landed');
    expect(reading.suggestions).toHaveLength(1);
  });
});
