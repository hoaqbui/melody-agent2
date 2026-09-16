import { describe, expect, it } from 'vitest';
import type { ScheduledJobDto, ScheduleRunDto } from '@aaif/goose-acp-client';
import type { SessionListItem } from '../../acp/sessions';
import type { Delegation } from '../../acp/delegations';
import {
  BOARD_COLUMNS,
  BOARD_STATES,
  boardCards,
  boardState,
  childCard,
  columnOf,
  distinctCwds,
  filterCards,
  filterChoices,
  groupByProject,
  NO_FILTER,
  sessionBranch,
  visibleSessions,
  type BoardInput,
} from './board-state';

const session = (over: Partial<SessionListItem> = {}): SessionListItem => ({
  id: 's1',
  name: 'Fix the login bug',
  workingDir: '/repo',
  updatedAt: '2026-09-16T10:05:00+00:00',
  messageCount: 3,
  createdAt: '2026-09-16T10:00:00+00:00',
  providerId: 'claude-acp',
  ...over,
});

const run = (over: Partial<ScheduleRunDto> = {}): ScheduleRunDto => ({
  sessionId: 'r1',
  scheduleId: 'nightly',
  startedAt: '2026-09-16T09:00:00+00:00',
  workingDir: '/repo/',
  outcome: { status: 'done' },
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

const input = (over: Partial<BoardInput> = {}): BoardInput => ({
  sessions: [],
  runs: [],
  schedules: [],
  seen: {},
  streams: new Map(),
  reviews: new Map(),
  ...over,
});

describe('columns', () => {
  it('names the three columns and the DESIGN states', () => {
    expect(BOARD_COLUMNS).toEqual(['running', 'review', 'done']);
    expect(BOARD_STATES).toContain('partial');
  });

  it('puts failed work in Done — it is over, and it stays', () => {
    expect(columnOf('running')).toBe('running');
    expect(columnOf('review')).toBe('review');
    expect(columnOf('done')).toBe('done');
    expect(columnOf('failed')).toBe('done');
  });
});

describe('session cards', () => {
  it('is Running while this window streams it, whatever git says', () => {
    const [card] = boardCards(
      input({
        sessions: [session()],
        streams: new Map([['s1', 'streaming']]),
        reviews: new Map([['/repo', 'dirty']]),
      })
    );
    expect(card.status).toBe('running');
    expect(card.endedAt).toBeNull();
  });

  it('needs review when its cwd has uncommitted changes, done when clean', () => {
    const dirty = boardCards(
      input({ sessions: [session()], reviews: new Map([['/repo', 'dirty']]) })
    )[0];
    const clean = boardCards(
      input({ sessions: [session()], reviews: new Map([['/repo', 'clean']]) })
    )[0];
    expect(dirty.status).toBe('review');
    expect(clean.status).toBe('done');
    expect(clean.endedAt).toBe('2026-09-16T10:05:00+00:00');
    expect(clean.reviewUnknown).toBe(false);
  });

  it('keeps its card without the check when the cwd is unreachable', () => {
    const [card] = boardCards(
      input({ sessions: [session()], reviews: new Map([['/repo', 'unreachable']]) })
    );
    expect(card.status).toBe('done');
    expect(card.reviewUnknown).toBe(true);
  });

  it('normalises a trailing slash before looking up the review', () => {
    const [card] = boardCards(
      input({
        sessions: [session({ workingDir: '/repo/' })],
        reviews: new Map([['/repo', 'dirty']]),
      })
    );
    expect(card.cwd).toBe('/repo');
    expect(card.status).toBe('review');
  });

  it('reads the worktree branch from the cwd', () => {
    expect(sessionBranch('/repo/.worktrees/wt-20260916-ab12')).toBe('wt/wt-20260916-ab12');
    expect(sessionBranch('/repo')).toBeNull();
  });

  it('drops archived sessions', () => {
    expect(visibleSessions([session(), session({ id: 's2', archivedAt: 'x' })])).toHaveLength(1);
  });

  it('reads a load error as failed', () => {
    const [card] = boardCards(
      input({ sessions: [session()], streams: new Map([['s1', 'error']]) })
    );
    expect(card.status).toBe('failed');
  });
});

describe('run cards', () => {
  it('is one card for the run and its scheduled session, with the run’s status', () => {
    const cards = boardCards(
      input({
        sessions: [session({ id: 'r1', name: 'Nightly tidy', sessionType: 'scheduled' })],
        runs: [run({ worktree: { path: '/repo/.worktrees/wt-1', branch: 'wt/wt-1' } })],
      })
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      kind: 'run',
      title: 'Nightly tidy',
      providerId: 'claude-acp',
      branch: 'wt/wt-1',
      cwd: '/repo',
    });
  });

  it('needs review until the inbox has marked its outcome read', () => {
    const unread = boardCards(input({ runs: [run()] }))[0];
    const read = boardCards(input({ runs: [run()], seen: { r1: 'done' } }))[0];
    expect(unread.status).toBe('review');
    expect(read.status).toBe('done');
  });

  it('is Running while its schedule names it current, failed once read as failed', () => {
    const running = boardCards(
      input({ runs: [run({ outcome: undefined })], schedules: [job({ currentSessionId: 'r1' })] })
    )[0];
    const failed = boardCards(
      input({ runs: [run({ outcome: { status: 'failed' } })], seen: { r1: 'failed' } })
    )[0];
    expect(running.status).toBe('running');
    expect(failed.status).toBe('failed');
  });

  it('falls back to the schedule id when the session has no title', () => {
    expect(boardCards(input({ runs: [run()] }))[0].title).toBe('nightly');
  });
});

describe('child cards', () => {
  const parent = boardCards(input({ sessions: [session()] }))[0];
  const delegation = (over: Partial<Delegation> = {}): Delegation => ({
    subagentSessionId: 'c1',
    parentSessionId: 's1',
    title: 'Research the bug',
    provider: 'codex-acp',
    ...over,
  });

  it('is Running only from a live event; a seeded row is over', () => {
    expect(childCard(parent, delegation({ status: 'running' })).status).toBe('running');
    expect(childCard(parent, delegation({ status: 'failed' })).status).toBe('failed');
    expect(childCard(parent, delegation()).status).toBe('done');
  });

  it('carries the delegation’s title and runtime under the parent’s project', () => {
    expect(childCard(parent, delegation())).toMatchObject({
      id: 'c1',
      kind: 'child',
      title: 'Research the bug',
      providerId: 'codex-acp',
      project: 'repo',
    });
  });
});

describe('ordering and grouping', () => {
  it('sorts newest first and groups a column by project', () => {
    const cards = boardCards(
      input({
        sessions: [
          session({ id: 'a', createdAt: '2026-09-16T08:00:00+00:00', workingDir: '/one' }),
          session({ id: 'b', createdAt: '2026-09-16T09:00:00+00:00', workingDir: '/two' }),
          session({ id: 'c', createdAt: '2026-09-16T07:00:00+00:00', workingDir: '/one' }),
        ],
      })
    );
    expect(cards.map((card) => card.id)).toEqual(['b', 'a', 'c']);
    expect(groupByProject(cards).map((section) => [section.label, section.cards.length])).toEqual([
      ['two', 1],
      ['one', 2],
    ]);
  });

  it('tells two checkouts with one folder name apart, as the sidebar does', () => {
    const cards = boardCards(
      input({
        sessions: [
          session({ id: 'a', workingDir: '/one/repo' }),
          session({ id: 'b', workingDir: '/two/repo' }),
          session({ id: 'c', workingDir: '/three/other' }),
        ],
      })
    );
    expect(cards.map((card) => card.project)).toEqual(['one/repo', 'two/repo', 'other']);
  });

  it('asks git once per distinct cwd', () => {
    expect(
      distinctCwds([
        session({ workingDir: '/repo/' }),
        session({ id: 's2', workingDir: '/repo' }),
        session({ id: 's3', workingDir: '/other' }),
      ])
    ).toEqual(['/other', '/repo']);
  });
});

describe('filters', () => {
  const cards = boardCards(
    input({
      sessions: [
        session({ id: 'a', workingDir: '/one', providerId: 'claude-acp' }),
        session({ id: 'b', workingDir: '/two', providerId: 'codex-acp' }),
      ],
      reviews: new Map([['/one', 'dirty']]),
    })
  );

  it('offers the projects and runtimes the cards carry', () => {
    expect(filterChoices(cards)).toEqual({
      projects: [
        { cwd: '/one', label: 'one' },
        { cwd: '/two', label: 'two' },
      ],
      runtimes: ['claude-acp', 'codex-acp'],
    });
  });

  it('narrows by project, runtime and status', () => {
    expect(filterCards(cards, NO_FILTER)).toHaveLength(2);
    expect(filterCards(cards, { ...NO_FILTER, project: '/one' }).map((c) => c.id)).toEqual(['a']);
    expect(filterCards(cards, { ...NO_FILTER, runtime: 'codex-acp' }).map((c) => c.id)).toEqual([
      'b',
    ]);
    expect(filterCards(cards, { ...NO_FILTER, status: 'review' }).map((c) => c.id)).toEqual(['a']);
  });
});

describe('boardState', () => {
  const card = boardCards(input({ sessions: [session()] }))[0];

  it('is loading until the lists and the review poll answer', () => {
    expect(boardState({ error: null, loaded: false, cards: [] })).toBe('loading');
  });

  it('is empty with nothing to show, error over everything', () => {
    expect(boardState({ error: null, loaded: true, cards: [] })).toBe('empty');
    expect(boardState({ error: 'boom', loaded: true, cards: [card] })).toBe('error');
  });

  it('is partial while a card could not be checked, ready otherwise', () => {
    expect(boardState({ error: null, loaded: true, cards: [card] })).toBe('partial');
    expect(
      boardState({ error: null, loaded: true, cards: [{ ...card, reviewUnknown: false }] })
    ).toBe('ready');
  });
});
