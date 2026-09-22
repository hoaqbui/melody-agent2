import { describe, expect, it } from 'vitest';
import type { SessionListItem } from '../acp/sessions';
import {
  ALL,
  ELSEWHERE,
  dayOf,
  filterSessions,
  groupByDay,
  repoChips,
  repositoryOf,
  sortSessions,
  tempRoots,
} from './sidebar-sessions';

const NOW = new Date('2026-09-22T15:00:00').getTime();
const ROOTS = ['/private/var/folders', '/var/folders', '/tmp'];

function session(id: string, name: string, workingDir: string, hoursAgo: number): SessionListItem {
  const at = new Date(NOW - hoursAgo * 3_600_000).toISOString();
  return { id, name, workingDir, updatedAt: at, createdAt: at, messageCount: 1 };
}

const sessions = [
  session('1', 'Composer row, round 2', '/Users/me/github/melody-agent2', 1),
  session(
    '2',
    'Review: wt/aa58 vs main',
    '/Users/me/github/melody-agent2/.worktrees/wt-20260921-aa58',
    4
  ),
  session('3', 'Tab bar seam', '/Users/me/github/compo', 26),
  session('4', 'Respond with the single', '/private/var/folders/vt/x/T/goose-approve-mode-abc', 2),
  session('5', 'Ring breakdown copy', '/Users/me/github/compo', 30),
  session('6', 'Old one', '/Users/me/github/melody-agent2', 24 * 9),
];

describe('repositoryOf', () => {
  it('names a plain checkout by its leaf', () => {
    expect(repositoryOf('/Users/me/github/melody-agent2/', ROOTS)).toEqual({
      key: '/Users/me/github/melody-agent2',
      label: 'melody-agent2',
      slug: null,
    });
  });

  it('folds a worktree to its repo and names the slug', () => {
    expect(
      repositoryOf('/Users/me/github/melody-agent2/.worktrees/wt-20260921-aa58/sub', ROOTS)
    ).toEqual({
      key: '/Users/me/github/melody-agent2',
      label: 'melody-agent2',
      slug: 'wt-20260921-aa58',
    });
  });

  it('sends temp paths and empty paths to Elsewhere', () => {
    expect(repositoryOf('/private/var/folders/vt/x/T/goose-x', ROOTS).key).toBe(ELSEWHERE);
    expect(repositoryOf('', ROOTS).key).toBe(ELSEWHERE);
  });
});

describe('tempRoots', () => {
  it('adds the environment temp dir to the built-in roots', () => {
    expect(tempRoots({ TMPDIR: '/var/folders/vt/x/T/' })[0]).toBe('/var/folders/vt/x/T');
    expect(tempRoots({}).length).toBe(4);
  });
});

describe('repoChips', () => {
  it('lists All, the repos by recency, then Elsewhere, with counts', () => {
    expect(repoChips(sessions, ROOTS)).toEqual([
      { key: ALL, label: 'All', count: 6 },
      { key: '/Users/me/github/melody-agent2', label: 'melody-agent2', count: 3 },
      { key: '/Users/me/github/compo', label: 'compo', count: 2 },
      { key: ELSEWHERE, label: 'Elsewhere', count: 1 },
    ]);
  });

  it('disambiguates two repos sharing a leaf name with their parent', () => {
    const chips = repoChips(
      [session('a', 'x', '/Users/me/work/app', 1), session('b', 'y', '/Users/me/play/app', 2)],
      ROOTS
    );
    expect(chips.map((chip) => chip.label)).toEqual(['All', 'work/app', 'play/app']);
  });
});

describe('filterSessions', () => {
  it('composes the pressed repo with the typed query on title, repo and slug', () => {
    const repo = '/Users/me/github/melody-agent2';
    expect(filterSessions(sessions, { repo, query: '' }, ROOTS).map((s) => s.id)).toEqual([
      '1',
      '2',
      '6',
    ]);
    expect(filterSessions(sessions, { repo, query: 'AA58' }, ROOTS).map((s) => s.id)).toEqual([
      '2',
    ]);
    // The repo name matches its rows and a title that happens to start with it.
    expect(filterSessions(sessions, { repo: ALL, query: 'compo' }, ROOTS).map((s) => s.id)).toEqual(
      ['1', '3', '5']
    );
    expect(filterSessions(sessions, { repo: ALL, query: 'nothing here' }, ROOTS)).toEqual([]);
  });
});

describe('sortSessions', () => {
  it('orders by recency, by name, or by project then recency', () => {
    expect(sortSessions(sessions, 'recent', ROOTS).map((s) => s.id)).toEqual([
      '1',
      '4',
      '2',
      '3',
      '5',
      '6',
    ]);
    expect(sortSessions(sessions, 'name', ROOTS).map((s) => s.name[0])).toEqual([
      'C',
      'O',
      'R',
      'R',
      'R',
      'T',
    ]);
    expect(sortSessions(sessions, 'project', ROOTS).map((s) => s.id)).toEqual([
      '3',
      '5',
      '4',
      '1',
      '2',
      '6',
    ]);
  });
});

describe('dayOf and groupByDay', () => {
  it('names today, yesterday, a weekday within the week, and a date beyond it', () => {
    expect(dayOf(NOW - 3_600_000, NOW)).toBe('Today');
    expect(dayOf(NOW - 26 * 3_600_000, NOW)).toBe('Yesterday');
    expect(dayOf(NOW - 3 * 86_400_000, NOW)).toBe('Saturday');
    expect(dayOf(NOW - 9 * 86_400_000, NOW)).toBe('Sep 13');
  });

  it('cuts a recency-ordered list into day groups in order', () => {
    const groups = groupByDay(sortSessions(sessions, 'recent', ROOTS), NOW);
    expect(groups.map((g) => [g.label, g.sessions.length])).toEqual([
      ['Today', 3],
      ['Yesterday', 2],
      ['Sep 13', 1],
    ]);
  });
});
