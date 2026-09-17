import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Delegation } from '../../acp/delegations';
import { PHASES, phaseOfRole, phaseViews, RPI_STRIP_STATES, stripState } from './rpi-strip-state';

let next = 0;
const row = (source: string | undefined, overrides: Partial<Delegation> = {}): Delegation => ({
  subagentSessionId: `child-${(next += 1)}`,
  parentSessionId: 'parent-1',
  source,
  provider: 'claude-acp',
  model: 'claude-sonnet-5',
  title: source ?? 'ad hoc',
  status: 'done',
  ...overrides,
});

const view = (rows: readonly Delegation[], phase: (typeof PHASES)[number]) =>
  phaseViews(rows).find((entry) => entry.phase === phase)!;

describe('phaseOfRole', () => {
  it('maps the four worker roles by file name and lights nothing for any other', () => {
    expect(phaseOfRole('researcher', null)).toBe('research');
    expect(phaseOfRole('planner', null)).toBe('plan');
    expect(phaseOfRole('implementer', null)).toBe('implement');
    expect(phaseOfRole('reviewer', null)).toBe('review');
    expect(phaseOfRole('spike-echo', 'plan')).toBeNull();
    expect(phaseOfRole('orchestrator', 'plan')).toBeNull();
    expect(phaseOfRole(undefined, 'plan')).toBeNull();
  });

  it('sends the Advisor and its specialists to the phase they gate, Research before any', () => {
    expect(phaseOfRole('advisor', null)).toBe('research');
    expect(phaseOfRole('advisor-ux', null)).toBe('research');
    expect(phaseOfRole('advisor', 'research')).toBe('research');
    expect(phaseOfRole('advisor-architect', 'plan')).toBe('plan');
    expect(phaseOfRole('advisor-pm', 'implement')).toBe('implement');
    expect(phaseOfRole('advisor-security', 'review')).toBe('review');
  });

  it('keeps an advisor on the phase of the most recent worker, not the latest advisor', () => {
    const rows = [row('researcher'), row('advisor'), row('planner'), row('advisor-architect')];
    expect(view(rows, 'research').artifact).toBe(rows[0].subagentSessionId);
    expect(view(rows, 'plan').artifact).toBe(rows[2].subagentSessionId);
    expect(view(rows, 'plan').runs).toBe(1);
    expect(view(rows, 'implement').status).toBe('dim');
  });
});

describe('phaseViews re-runs', () => {
  it('counts a phase again once a later phase has started (Review FAIL → Implement)', () => {
    const rows = [
      row('researcher'),
      row('planner'),
      row('implementer'),
      row('reviewer', { status: 'failed', error: 'FAIL' }),
      row('implementer'),
    ];
    expect(view(rows, 'implement').runs).toBe(2);
    expect(view(rows, 'implement').artifact).toBe(rows[4].subagentSessionId);
    expect(view(rows, 'review').runs).toBe(1);
    expect(view(rows, 'research').runs).toBe(1);
  });

  it('folds consecutive workers of one phase, and its advisor, into one run', () => {
    const rows = [row('researcher'), row('researcher'), row('advisor'), row('researcher')];
    expect(view(rows, 'research').runs).toBe(1);
    expect(view(rows, 'research').artifact).toBe(rows[3].subagentSessionId);
  });

  it('does not count an advisor before any phase as a run of Research', () => {
    const rows = [row('advisor'), row('researcher')];
    expect(view(rows, 'research').runs).toBe(1);
    expect(view(rows, 'research').artifact).toBe(rows[1].subagentSessionId);
  });
});

describe('phaseViews status', () => {
  it('is dim until a child with that role starts; unknown roles light nothing', () => {
    expect(phaseViews([]).every((entry) => entry.status === 'dim')).toBe(true);
    expect(phaseViews([row('spike-echo')]).every((entry) => entry.status === 'dim')).toBe(true);
    expect(view([row('researcher', { status: 'running' })], 'research').status).toBe('active');
  });

  it('has no artifact while the child runs, then the child once it returned or failed', () => {
    const running = row('researcher', { status: 'running' });
    expect(view([running], 'research').artifact).toBeNull();
    const done = { ...running, status: 'done' as const };
    expect(view([done], 'research').artifact).toBe(done.subagentSessionId);
    const failed = { ...running, status: 'failed' as const, error: 'quota' };
    expect(view([failed], 'research')).toMatchObject({
      status: 'failed',
      artifact: failed.subagentSessionId,
    });
  });

  it('reads the latest run only: failed over active over done within it', () => {
    const rows = [
      row('implementer', { status: 'failed', error: 'tests' }),
      row('reviewer'),
      row('implementer'),
      row('implementer', { status: 'running' }),
    ];
    expect(view(rows, 'implement')).toMatchObject({ status: 'active', runs: 2 });
    expect(view(rows, 'implement').artifact).toBe(rows[2].subagentSessionId);
    expect(
      view(
        [row('researcher', { status: 'running' }), row('advisor', { status: 'failed' })],
        'research'
      ).status
    ).toBe('failed');
  });

  it('opens the worker’s handoff, not the advisor’s, when both returned', () => {
    const rows = [row('planner'), row('advisor-architect')];
    expect(view(rows, 'plan').artifact).toBe(rows[0].subagentSessionId);
    const advisorOnly = [row('advisor-ux')];
    expect(view(advisorOnly, 'research').artifact).toBe(advisorOnly[0].subagentSessionId);
  });

  it('treats a row seeded on reload, with no status, as one that ran and returned', () => {
    expect(view([row('reviewer', { status: undefined })], 'review').status).toBe('done');
  });
});

describe('stripState', () => {
  it('is empty with nothing lit, error over loading over ready', () => {
    expect(stripState(phaseViews([]))).toBe('empty');
    expect(stripState(phaseViews([row('spike-echo')]))).toBe('empty');
    expect(stripState(phaseViews([row('researcher', { status: 'running' })]))).toBe('loading');
    expect(stripState(phaseViews([row('researcher')]))).toBe('ready');
    expect(
      stripState(
        phaseViews([row('researcher', { status: 'failed' }), row('planner', { status: 'running' })])
      )
    ).toBe('error');
  });

  it('declares only states from DESIGN.md §Shared component states, plus ready', () => {
    const design = readFileSync(resolve(process.cwd(), '../../DESIGN.md'), 'utf8');
    const table = design.split('## Shared component states')[1].split('\n## ')[0];
    const named = [...table.matchAll(/^\| (\w+) \|/gm)].map((match) => match[1].toLowerCase());
    expect(named).toContain('empty');
    for (const state of RPI_STRIP_STATES) {
      if (state !== 'ready') expect(named).toContain(state);
    }
  });

  it('walks PRODUCT.md §8’s phases in order', () => {
    expect(PHASES).toEqual(['research', 'plan', 'implement', 'review']);
  });
});
