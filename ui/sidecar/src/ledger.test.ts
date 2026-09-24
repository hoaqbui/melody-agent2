import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HttpError } from './http.js';
import { defaultLedgerDir, ledgerFileFor, ledgerRoutes, readLedger } from './ledger.js';

const sh = (cwd: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });

describe('ledgerRoutes', () => {
  let scratch: string;
  let repo: string;
  let ledgerDir: string;
  let routes: ReturnType<typeof ledgerRoutes>;

  beforeAll(async () => {
    scratch = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidecar-ledger-')));
    repo = path.join(scratch, 'repo');
    await mkdir(path.join(repo, 'src'), { recursive: true });
    await sh(repo, ['init', '-q', '-b', 'main']);
    ledgerDir = path.join(scratch, 'state', 'ledger');
    routes = ledgerRoutes(repo, ledgerDir);
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  const event = (at: string, kind = 'turn') => ({ at, kind, sessionId: 's1', tokens: 12 });

  it('appends one JSON line per event under the state dir, never inside the repo', async () => {
    const first = (await routes['POST /ledger/append']({
      event: event('2026-09-20T10:00:00Z'),
    })) as {
      file: string;
    };
    await routes['POST /ledger/append']({ event: event('2026-09-20T10:05:00Z', 'worker') });
    expect(first.file).toBe(ledgerFileFor(ledgerDir, repo));
    expect(first.file.startsWith(ledgerDir)).toBe(true);
    expect(first.file.startsWith(repo)).toBe(false);
    const lines = (await readFile(first.file, 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1])).toMatchObject({ kind: 'worker', sessionId: 's1' });
  });

  it('reads every event, or only those after `since`', async () => {
    const all = (await routes['POST /ledger/read']({})) as { events: { at: string }[] };
    expect(all.events.map((e) => e.at)).toEqual(['2026-09-20T10:00:00Z', '2026-09-20T10:05:00Z']);
    const later = (await routes['POST /ledger/read']({ since: '2026-09-20T10:00:00Z' })) as {
      events: { at: string }[];
    };
    expect(later.events.map((e) => e.at)).toEqual(['2026-09-20T10:05:00Z']);
  });

  it("a subdirectory of the repo shares the toplevel's ledger", async () => {
    const sub = (await routes['POST /ledger/read']({ cwd: 'src' })) as { file: string };
    expect(sub.file).toBe(ledgerFileFor(ledgerDir, repo));
  });

  it('refuses a cwd outside the repository', async () => {
    await expect(routes['POST /ledger/read']({ cwd: scratch })).rejects.toBeInstanceOf(HttpError);
  });

  it('refuses an event with an unknown kind, a bad timestamp or no session', async () => {
    for (const bad of [
      { at: '2026-09-20T10:00:00Z', kind: 'guess', sessionId: 's1' },
      { at: 'yesterday', kind: 'turn', sessionId: 's1' },
      { at: '2026-09-20T10:00:00Z', kind: 'turn' },
      'not an object',
    ]) {
      await expect(routes['POST /ledger/append']({ event: bad })).rejects.toMatchObject({
        status: 400,
      });
    }
  });

  it('accepts land, verdict, link and gap', async () => {
    const cwd = path.join(scratch, 'job-events');
    await mkdir(cwd, { recursive: true });
    await sh(cwd, ['init', '-q', '-b', 'main']);
    const jobRoutes = ledgerRoutes(cwd, ledgerDir);
    const events = [
      {
        at: '2026-09-23T10:00:00Z',
        kind: 'land',
        sessionId: 's1',
        sha: 'abc123',
        paths: ['a.ts'],
        message: 'fix',
      },
      {
        at: '2026-09-23T10:01:00Z',
        kind: 'verdict',
        sessionId: 's1',
        workerSessionId: 'w1',
        verdict: 'good',
      },
      {
        at: '2026-09-23T10:02:00Z',
        kind: 'link',
        sessionId: 's1',
        workerSessionId: 'w1',
        by: 'user',
        fromSha: 'abc123',
      },
      {
        at: '2026-09-23T10:03:00Z',
        kind: 'gap',
        sessionId: 's1',
        from: '2026-09-22T00:00:00Z',
        to: '2026-09-23T09:00:00Z',
      },
    ];
    for (const event of events) {
      await jobRoutes['POST /ledger/append']({ event });
    }
    const { events: written } = (await jobRoutes['POST /ledger/read']({})) as {
      events: { kind: string }[];
    };
    expect(written.map((e) => e.kind)).toEqual(['land', 'verdict', 'link', 'gap']);
  });

  it('replayed append writes nothing twice', async () => {
    const cwd = path.join(scratch, 'replay');
    await mkdir(cwd, { recursive: true });
    await sh(cwd, ['init', '-q', '-b', 'main']);
    const replayRoutes = ledgerRoutes(cwd, ledgerDir);
    const worker = {
      at: '2026-09-23T12:00:00Z',
      kind: 'worker',
      sessionId: 's1',
      workerSessionId: 'w1',
      status: 'done',
    };
    const first = await replayRoutes['POST /ledger/append']({ event: worker });
    const second = await replayRoutes['POST /ledger/append']({ event: worker });
    expect(first).toMatchObject({ ok: true });
    expect(first).not.toHaveProperty('duplicate');
    expect(second).toEqual({ ok: true, duplicate: true });

    // A reconnect, a second window or a re-seed replays the same events into the same file — a
    // freshly built routes object (a new closure, standing in for a new sidecar process) still
    // catches the duplicate once it has loaded the file's keys.
    const reloadedRoutes = ledgerRoutes(cwd, ledgerDir);
    const replayed = await reloadedRoutes['POST /ledger/append']({ event: worker });
    expect(replayed).toEqual({ ok: true, duplicate: true });

    const file = ledgerFileFor(ledgerDir, cwd);
    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(1);
  });

  it('falls back to the natural id when an event carries no messageId', async () => {
    const cwd = path.join(scratch, 'natural-ids');
    await mkdir(cwd, { recursive: true });
    await sh(cwd, ['init', '-q', '-b', 'main']);
    const natRoutes = ledgerRoutes(cwd, ledgerDir);
    const cases: Record<string, unknown>[] = [
      {
        at: '2026-09-23T13:00:00Z',
        kind: 'correction',
        sessionId: 's1',
        workerSessionId: 'w1',
        path: 'a.ts',
        toolCallId: 't1',
      },
      {
        at: '2026-09-23T13:01:00Z',
        kind: 'land',
        sessionId: 's1',
        sha: 'sha1',
        paths: ['a.ts'],
        message: 'fix',
      },
      {
        at: '2026-09-23T13:02:00Z',
        kind: 'undo',
        sessionId: 's1',
        turnId: 'turn1',
      },
      {
        at: '2026-09-23T13:03:00Z',
        kind: 'verdict',
        sessionId: 's1',
        workerSessionId: 'w1',
        verdict: 'good',
      },
      {
        at: '2026-09-23T13:04:00Z',
        kind: 'gap',
        sessionId: 's1',
        from: '2026-09-22T00:00:00Z',
        to: '2026-09-23T09:00:00Z',
      },
    ];
    for (const event of cases) {
      const first = await natRoutes['POST /ledger/append']({ event });
      const second = await natRoutes['POST /ledger/append']({ event });
      expect(first).not.toHaveProperty('duplicate');
      expect(second).toEqual({ ok: true, duplicate: true });
    }
    const file = ledgerFileFor(ledgerDir, cwd);
    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(cases.length);
  });

  it('keeps a redo that shares its undo turnId', async () => {
    const cwd = path.join(scratch, 'undo-redo');
    await mkdir(cwd, { recursive: true });
    await sh(cwd, ['init', '-q', '-b', 'main']);
    const undoRoutes = ledgerRoutes(cwd, ledgerDir);
    const undo = {
      at: '2026-09-23T13:10:00Z',
      kind: 'undo',
      sessionId: 's1',
      turnId: 'turn1',
      redo: false,
    };
    const redo = { ...undo, at: '2026-09-23T13:11:00Z', redo: true };
    expect(await undoRoutes['POST /ledger/append']({ event: undo })).not.toHaveProperty(
      'duplicate'
    );
    expect(await undoRoutes['POST /ledger/append']({ event: redo })).not.toHaveProperty(
      'duplicate'
    );
    const lines = (await readFile(ledgerFileFor(ledgerDir, cwd), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('reads an empty list when no ledger exists yet and drops a torn last line', async () => {
    expect(await readLedger(path.join(scratch, 'missing.jsonl'))).toEqual([]);
    const torn = path.join(scratch, 'torn.jsonl');
    await mkdir(scratch, { recursive: true });
    await (
      await import('node:fs/promises')
    ).writeFile(
      torn,
      JSON.stringify(event('2026-09-20T10:00:00Z')) + '\n{"at":"2026-09-20T10:0',
      'utf8'
    );
    expect(await readLedger(torn)).toHaveLength(1);
  });

  it('outside any repository the spawn cwd is the boundary (the Hub on a home directory)', async () => {
    const home = path.join(scratch, 'home');
    await mkdir(path.join(home, 'sub'), { recursive: true });
    const bare = ledgerRoutes(home, ledgerDir);
    const read = (await bare['POST /ledger/read']({})) as { file: string; events: unknown[] };
    expect(read.file).toBe(ledgerFileFor(ledgerDir, home));
    expect(read.events).toEqual([]);
    const sub = (await bare['POST /ledger/read']({ cwd: 'sub' })) as { file: string };
    expect(sub.file).toBe(read.file);
    await expect(bare['POST /ledger/read']({ cwd: scratch })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('two checkouts with the same basename get different files', () => {
    expect(ledgerFileFor(ledgerDir, '/a/repo')).not.toBe(ledgerFileFor(ledgerDir, '/b/repo'));
    expect(path.basename(ledgerFileFor(ledgerDir, '/a/repo'))).toMatch(/^repo-[0-9a-f]{8}\.jsonl$/);
  });
});

describe('defaultLedgerDir', () => {
  it("keeps a walk's ledger under its own GOOSE_PATH_ROOT", () => {
    expect(defaultLedgerDir({ GOOSE_PATH_ROOT: '/tmp/walks', XDG_STATE_HOME: '/x' })).toBe(
      '/tmp/walks/state/ledger'
    );
  });

  it('falls back to XDG state when the root is unset or relative', () => {
    expect(defaultLedgerDir({ XDG_STATE_HOME: '/x' })).toBe('/x/goose/ledger');
    expect(defaultLedgerDir({ GOOSE_PATH_ROOT: 'relative', XDG_STATE_HOME: '/x' })).toBe(
      '/x/goose/ledger'
    );
  });
});
