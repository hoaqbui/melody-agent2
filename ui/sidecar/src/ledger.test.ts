import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HttpError } from './http.js';
import { ledgerFileFor, ledgerRoutes, readLedger } from './ledger.js';

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

  it('two checkouts with the same basename get different files', () => {
    expect(ledgerFileFor(ledgerDir, '/a/repo')).not.toBe(ledgerFileFor(ledgerDir, '/b/repo'));
    expect(path.basename(ledgerFileFor(ledgerDir, '/a/repo'))).toMatch(/^repo-[0-9a-f]{8}\.jsonl$/);
  });
});
