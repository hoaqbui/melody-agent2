import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ScheduledJobDto, ScheduleRunDto } from '@aaif/goose-acp-client';
import { SidecarError } from '../../../native/sidecar';
import {
  acceptBlocker,
  acceptCheckout,
  acceptMessage,
  acceptPaths,
  runActionError,
  runWorktreePlace,
  inboxState,
  isUnread,
  loadSeen,
  markSeen,
  pruneSeen,
  runOutcome,
  RUNS_INBOX_STATES,
  saveSeen,
  SEEN_STORAGE_KEY,
  visibleRuns,
  type SeenStorage,
} from './runs-state';

const run = (over: Partial<ScheduleRunDto> = {}): ScheduleRunDto => ({
  sessionId: 's1',
  scheduleId: 'nightly',
  startedAt: '2026-09-16T10:00:00+00:00',
  workingDir: '/repo',
  ...over,
});

const job = (over: Partial<ScheduledJobDto> = {}): ScheduledJobDto => ({
  id: 'nightly',
  source: 'nightly.yaml',
  cron: '0 0 2 * * *',
  currentlyRunning: false,
  paused: false,
  ...over,
});

const memoryStorage = (): SeenStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
};

describe('runOutcome', () => {
  it('reads the recorded outcome', () => {
    expect(runOutcome(run({ outcome: { status: 'failed', error: 'boom' } }), [])).toBe('failed');
  });

  it('is running while the schedule names the session as current', () => {
    expect(runOutcome(run(), [job({ currentSessionId: 's1' })])).toBe('running');
  });

  it('is unknown for a run recorded before outcomes were', () => {
    expect(runOutcome(run(), [job({ currentSessionId: 'other' })])).toBe('unknown');
  });
});

describe('visibleRuns', () => {
  it('drops dismissed runs', () => {
    const kept = run({ sessionId: 'kept' });
    expect(
      visibleRuns([run({ sessionId: 'gone', archivedAt: '2026-09-16T11:00:00Z' }), kept])
    ).toEqual([kept]);
  });
});

describe('acceptBlocker', () => {
  it('waits for a running run', () => {
    expect(acceptBlocker({ outcome: 'running', checkout: '/repo', sidecarCwd: '/repo' })).toBe(
      'running'
    );
  });

  it('needs the sidecar cwd', () => {
    expect(acceptBlocker({ outcome: 'done', checkout: '/repo', sidecarCwd: null })).toBe(
      'noSidecar'
    );
  });

  it('refuses another checkout', () => {
    expect(acceptBlocker({ outcome: 'done', checkout: '/other', sidecarCwd: '/repo' })).toBe(
      'otherCwd'
    );
  });

  it('accepts the same checkout with or without a trailing slash', () => {
    expect(acceptBlocker({ outcome: 'done', checkout: '/repo/', sidecarCwd: '/repo' })).toBe(null);
    expect(acceptBlocker({ outcome: 'unknown', checkout: '/repo', sidecarCwd: '/repo' })).toBe(
      null
    );
  });
});

describe('runWorktreePlace', () => {
  const worktree = { path: '/repo/.worktrees/wt-20260916-0a1b', branch: 'wt/wt-20260916-0a1b' };

  it('is null for a run on the checkout', () => {
    expect(runWorktreePlace(run())).toBeNull();
    expect(acceptCheckout(run())).toBe('/repo');
  });

  it('names the slug and the main checkout two levels above the worktree', () => {
    expect(runWorktreePlace(run({ workingDir: worktree.path, worktree }))).toEqual({
      slug: 'wt-20260916-0a1b',
      branch: 'wt/wt-20260916-0a1b',
      path: '/repo/.worktrees/wt-20260916-0a1b',
      main: '/repo',
    });
    expect(acceptCheckout(run({ workingDir: worktree.path, worktree }))).toBe('/repo');
    expect(
      runWorktreePlace(run({ worktree: { ...worktree, path: `${worktree.path}/` } }))?.main
    ).toBe('/repo');
  });

  it('lets Accept through for a worktree whose checkout is the sidecar cwd', () => {
    const checkout = acceptCheckout(run({ workingDir: worktree.path, worktree }));
    expect(acceptBlocker({ outcome: 'done', checkout, sidecarCwd: '/repo' })).toBeNull();
    expect(acceptBlocker({ outcome: 'done', checkout, sidecarCwd: '/elsewhere' })).toBe('otherCwd');
  });
});

describe('runActionError', () => {
  it("lists a 409 merge's conflicts", () => {
    const cause = new SidecarError('merge of wt/x conflicts in 1 path(s)', 409, {
      conflicts: ['notes.md', 7],
    });
    expect(runActionError(cause, 'Failed')).toEqual({
      message: 'merge of wt/x conflicts in 1 path(s)',
      conflicts: ['notes.md'],
    });
  });

  it('falls back for anything else', () => {
    expect(runActionError(new Error('boom'), 'Failed')).toEqual({ message: 'boom', conflicts: [] });
    expect(runActionError('nope', 'Failed')).toEqual({ message: 'Failed', conflicts: [] });
  });
});

describe('acceptPaths', () => {
  it('lists every touched path once, both sides of a rename', () => {
    const diff = [
      'diff --git a/notes.md b/notes.md',
      'index 1111111..2222222 100644',
      '--- a/notes.md',
      '+++ b/notes.md',
      '@@ -1 +1 @@',
      '-one',
      '+two',
      'diff --git a/old.md b/new.md',
      'similarity index 90%',
      'rename from old.md',
      'rename to new.md',
      'diff --git a/gone.md b/gone.md',
      'deleted file mode 100644',
      '--- a/gone.md',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-bye',
      '',
    ].join('\n');
    expect(acceptPaths(diff)).toEqual(['notes.md', 'old.md', 'new.md', 'gone.md']);
  });

  it('is empty for an empty diff', () => {
    expect(acceptPaths('')).toEqual([]);
  });

  it('includes untracked files only when creating new files', () => {
    const diff = '';
    const untrackedPaths = ['new-file.txt', 'another.js'];
    expect(acceptPaths(diff, untrackedPaths)).toEqual(['new-file.txt', 'another.js']);
  });
});

describe('acceptMessage', () => {
  it('names the schedule', () => {
    expect(acceptMessage('nightly')).toContain('nightly');
  });
});

describe('seen store', () => {
  it('starts empty with no storage or a broken record', () => {
    expect(loadSeen(null)).toEqual({});
    const storage = memoryStorage();
    storage.setItem(SEEN_STORAGE_KEY, '{not json');
    expect(loadSeen(storage)).toEqual({});
    storage.setItem(SEEN_STORAGE_KEY, '[1]');
    expect(loadSeen(storage)).toEqual({});
  });

  it('round-trips through storage', () => {
    const storage = memoryStorage();
    saveSeen(storage, { s1: 'done' });
    expect(loadSeen(storage)).toEqual({ s1: 'done' });
  });

  it('marks a finished run unread until opened, and again once its outcome changes', () => {
    const finished = run({ outcome: { status: 'done' } });
    expect(isUnread({}, finished, 'done')).toBe(true);
    const seen = markSeen({}, finished, 'done');
    expect(isUnread(seen, finished, 'done')).toBe(false);
    expect(markSeen(seen, finished, 'done')).toBe(seen);
    expect(isUnread(markSeen({}, run(), 'unknown'), finished, 'done')).toBe(true);
  });

  it('never marks a running run unread', () => {
    expect(isUnread({}, run(), 'running')).toBe(false);
  });

  it('prunes ids the wire no longer lists', () => {
    const seen = { s1: 'done', gone: 'failed' } as const;
    expect(pruneSeen(seen, [run()])).toEqual({ s1: 'done' });
    const same = { s1: 'done' } as const;
    expect(pruneSeen(same, [run()])).toBe(same);
  });
});

describe('inboxState', () => {
  const base = { error: null, loaded: true, acting: false, sidecarCwd: '/repo', runs: [run()] };

  it('follows the DESIGN.md table', () => {
    expect(inboxState({ ...base, error: 'nope' })).toBe('error');
    expect(inboxState({ ...base, loaded: false })).toBe('loading');
    expect(inboxState({ ...base, runs: [] })).toBe('empty');
    expect(inboxState({ ...base, acting: true })).toBe('running');
    expect(inboxState({ ...base, sidecarCwd: undefined })).toBe('partial');
    expect(inboxState(base)).toBe('ready');
  });

  it('names the rows of DESIGN.md §Shared component states, plus ready', () => {
    const design = readFileSync(resolve(process.cwd(), '../../DESIGN.md'), 'utf8');
    const section = design.split('## Shared component states')[1].split('\n## ')[0];
    const rows = [...section.matchAll(/^\| ([A-Z][a-z]+) \|/gm)]
      .map((match) => match[1].toLowerCase())
      .filter((row) => row !== 'state');
    expect(rows.length).toBeGreaterThan(0);
    expect([...RUNS_INBOX_STATES].filter((state) => state !== 'ready').sort()).toEqual(rows.sort());
  });
});
