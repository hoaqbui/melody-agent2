import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Delegation } from '../../../acp/delegations';
import {
  AGENTS_PANE_STATES,
  canOpenTranscript,
  paneState,
  transcriptLoad,
  WORKER_STATUSES,
} from './agents-state';

const row = (overrides: Partial<Delegation> = {}): Delegation => ({
  subagentSessionId: 'child-1',
  parentSessionId: 'parent-1',
  source: 'spike-echo',
  provider: 'claude-acp',
  model: 'claude-sonnet-5',
  title: 'say hello',
  status: 'running',
  ...overrides,
});

describe('paneState', () => {
  it('is empty with no rows, running while a child runs, ready once every child is done', () => {
    expect(paneState({ rows: [], transcript: null })).toBe('empty');
    expect(paneState({ rows: [row()], transcript: null })).toBe('running');
    expect(paneState({ rows: [row({ status: 'done' })], transcript: null })).toBe('ready');
  });

  it('is error while a failed row stays, before a running one', () => {
    const rows = [row({ status: 'failed', error: 'quota' }), row({ subagentSessionId: 'c2' })];
    expect(paneState({ rows, transcript: null })).toBe('error');
  });

  it('is partial when a reload-seeded row has no status', () => {
    const rows = [row({ status: 'done' }), row({ subagentSessionId: 'c2', status: undefined })];
    expect(paneState({ rows, transcript: null })).toBe('partial');
  });

  it('follows the child transcript while one is open', () => {
    const rows = [row()];
    expect(paneState({ rows, transcript: { status: 'loading' } })).toBe('loading');
    expect(paneState({ rows, transcript: { status: 'error', message: 'gone' } })).toBe('error');
    expect(paneState({ rows, transcript: { status: 'ready' } })).toBe('ready');
  });

  it('names the rows of DESIGN.md §Shared component states, plus ready', () => {
    const design = readFileSync(resolve(process.cwd(), '../../DESIGN.md'), 'utf8');
    const section = design.split('## Shared component states')[1].split('\n## ')[0];
    const rows = [...section.matchAll(/^\| ([A-Z][a-z]+) \|/gm)]
      .map((match) => match[1].toLowerCase())
      .filter((state) => state !== 'state');
    expect(rows.length).toBeGreaterThan(0);
    expect([...AGENTS_PANE_STATES].filter((state) => state !== 'ready').sort()).toEqual(
      rows.sort()
    );
  });
});

describe('transcriptLoad', () => {
  it('reads the child snapshot as loading, then ready, or the load error', () => {
    expect(transcriptLoad({})).toEqual({ status: 'loading' });
    expect(transcriptLoad({ session: { id: 'child-1' } })).toEqual({ status: 'ready' });
    expect(transcriptLoad({ session: { id: 'child-1' }, sessionLoadError: 'not found' })).toEqual({
      status: 'error',
      message: 'not found',
    });
  });
});

describe('canOpenTranscript', () => {
  it('waits for a running child; done, failed and status-less rows open', () => {
    expect(canOpenTranscript(row())).toBe(false);
    expect(canOpenTranscript(row({ status: 'done' }))).toBe(true);
    expect(canOpenTranscript(row({ status: 'failed' }))).toBe(true);
    expect(canOpenTranscript(row({ status: undefined }))).toBe(true);
  });
});

describe('WORKER_STATUSES', () => {
  it('names PRD step 10’s four words, waiting first', () => {
    const prd = readFileSync(
      resolve(process.cwd(), '../../docs/2026-09-15-workspace-prd-v1.md'),
      'utf8'
    );
    expect(prd).toMatch(/status \(waiting \/ running \/ done \/ failed\)/);
    expect(WORKER_STATUSES).toEqual(['waiting', 'running', 'done', 'failed']);
  });
});
