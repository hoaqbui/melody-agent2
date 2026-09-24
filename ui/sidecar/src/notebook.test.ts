import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HttpError } from './http.js';
import { ledgerFileFor, ledgerRoutes } from './ledger.js';
import { defaultNotebookRoot, notebookRoutes, resolveNotebookRoot } from './notebook.js';

const sh = (cwd: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });

const initRepo = async (dir: string): Promise<void> => {
  await sh(dir, ['init', '-q', '-b', 'main']);
  await sh(dir, ['config', 'user.name', 'sidecar test']);
  await sh(dir, ['config', 'user.email', 'sidecar@test.invalid']);
  await sh(dir, ['config', 'commit.gpgsign', 'false']);
};

const failure = async (promise: Promise<unknown>): Promise<HttpError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error('expected the route to fail');
};

describe('notebookRoutes', () => {
  let scratch: string;
  let root: string;
  let outside: string;
  let routes: ReturnType<typeof notebookRoutes>;
  let firstSha = '';

  beforeAll(async () => {
    scratch = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidecar-notebook-')));
    root = path.join(scratch, 'Melody');
    outside = path.join(scratch, 'outside');
    await mkdir(path.join(root, 'journal'), { recursive: true });
    await mkdir(outside, { recursive: true });
    await initRepo(root);
    await writeFile(path.join(root, 'MEMORY.md'), 'line one\nline two\n');
    await sh(root, ['add', '.']);
    await sh(root, ['commit', '-q', '-m', 'seed MEMORY.md']);
    firstSha = (await sh(root, ['rev-parse', 'HEAD'])).trim();
    await writeFile(path.join(root, 'journal', '2026-09-24.md'), 'noted\n');
    await sh(root, ['add', '.']);
    await sh(root, ['commit', '-q', '-m', 'journal: 2026-09-24']);
    routes = notebookRoutes(root);
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('exposes exactly the three read routes', () => {
    expect(Object.keys(routes).sort()).toEqual(
      ['POST /notebook/list', 'POST /notebook/log', 'POST /notebook/read'].sort()
    );
  });

  it('reads a fixture file via /notebook/read', async () => {
    const read = (await routes['POST /notebook/read']({ path: 'MEMORY.md' })) as {
      path: string;
      content: string;
    };
    expect(read.path).toBe(path.join(root, 'MEMORY.md'));
    expect(read.content).toBe('line one\nline two\n');
  });

  it('reads a file at an earlier rev with git show', async () => {
    const read = (await routes['POST /notebook/read']({
      path: 'MEMORY.md',
      rev: firstSha,
    })) as { content: string };
    expect(read.content).toBe('line one\nline two\n');
  });

  it('refuses a rev that is not a 40-hex sha with 400', async () => {
    const error = await failure(routes['POST /notebook/read']({ path: 'MEMORY.md', rev: 'HEAD' }));
    expect(error.status).toBe(400);
  });

  it('lists a fixture directory', async () => {
    const listed = (await routes['POST /notebook/list']({ dir: '.' })) as {
      entries: { name: string; type: string }[];
    };
    expect(listed.entries.map((e) => e.name)).toContain('MEMORY.md');
    expect(listed.entries.map((e) => e.name)).toContain('journal');
  });

  it("refuses '../x' with 400", async () => {
    const error = await failure(routes['POST /notebook/read']({ path: '../outside/x' }));
    expect(error.status).toBe(400);
    expect(error.message).toContain('outside the notebook');
  });

  it('refuses a symlink that escapes the notebook root with 400', async () => {
    await symlink(outside, path.join(root, 'escape'));
    const error = await failure(routes['POST /notebook/read']({ path: 'escape/x' }));
    expect(error.status).toBe(400);
    await rm(path.join(root, 'escape'));
  });

  it("/notebook/log lists the fixture git repo's commits, newest first", async () => {
    const log = (await routes['POST /notebook/log']({})) as {
      commits: { sha: string; at: string; subject: string }[];
    };
    expect(log.commits.map((c) => c.subject)).toEqual(['journal: 2026-09-24', 'seed MEMORY.md']);
    expect(log.commits[1].sha).toBe(firstSha);
    expect(log.commits[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('scopes /notebook/log to one path', async () => {
    const log = (await routes['POST /notebook/log']({ path: 'MEMORY.md' })) as {
      commits: { subject: string }[];
    };
    expect(log.commits.map((c) => c.subject)).toEqual(['seed MEMORY.md']);
  });

  it('no /notebook/* route writes: the fixture stays clean and HEAD unchanged', async () => {
    const before = (await sh(root, ['rev-parse', 'HEAD'])).trim();
    await routes['POST /notebook/list']({ dir: '.' });
    await routes['POST /notebook/read']({ path: 'MEMORY.md' });
    await routes['POST /notebook/read']({ path: 'MEMORY.md', rev: firstSha });
    await routes['POST /notebook/log']({});
    expect((await sh(root, ['status', '--porcelain'])).trim()).toBe('');
    expect((await sh(root, ['rev-parse', 'HEAD'])).trim()).toBe(before);
  });
});

describe('defaultNotebookRoot', () => {
  it('defaults to ~/Melody', () => {
    expect(defaultNotebookRoot({}, '/Users/hoa')).toBe(path.join('/Users/hoa', 'Melody'));
  });

  it('honours MELODY_NOTEBOOK', () => {
    expect(defaultNotebookRoot({ MELODY_NOTEBOOK: '/tmp/other' }, '/Users/hoa')).toBe('/tmp/other');
  });
});

describe('resolveNotebookRoot', () => {
  it('realpaths an existing notebook', async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'sidecar-notebook-root-'));
    const real = await realpath(scratch);
    const root = await resolveNotebookRoot({ MELODY_NOTEBOOK: scratch });
    expect(root).toBe(real);
    await rm(scratch, { recursive: true, force: true });
  });

  it('resolves through the nearest existing ancestor when no notebook exists yet, so spawn never fails on it', async () => {
    // `os.tmpdir()` itself is realpath'd first (macOS's /var → /private/var), since the fix
    // canonicalizes the nearest *existing* ancestor rather than leaving the whole path as-is
    // — the same ancestor-walk `notebookPath` runs per request.
    const realTmp = await realpath(os.tmpdir());
    const missing = path.join(realTmp, `sidecar-notebook-missing-${Date.now()}`);
    expect(await resolveNotebookRoot({ MELODY_NOTEBOOK: missing })).toBe(missing);
  });

  it('canonicalizes through a symlinked ancestor even when the notebook does not exist yet', async () => {
    const base = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'sidecar-notebook-ancestor-'))
    );
    const target = path.join(base, 'actual-home');
    await mkdir(target, { recursive: true });
    const linkedHome = path.join(base, 'linked-home');
    await symlink(target, linkedHome);
    const missingNotebook = path.join(linkedHome, 'Melody');

    const resolvedRoot = await resolveNotebookRoot({ MELODY_NOTEBOOK: missingNotebook });
    expect(resolvedRoot).toBe(path.join(target, 'Melody'));

    // Once the notebook is actually created, a request against the still-symlinked
    // `MELODY_NOTEBOOK` path resolves to the exact same canonical string — containment
    // keeps passing rather than 400ing because the stored root was left uncanonicalized.
    await mkdir(path.join(target, 'Melody'), { recursive: true });
    const routes = notebookRoutes(resolvedRoot);
    const listed = (await routes['POST /notebook/list']({ dir: '.' })) as { path: string };
    expect(listed.path).toBe(resolvedRoot);

    await rm(base, { recursive: true, force: true });
  });
});

describe('notebookRoutes with no notebook at the root', () => {
  it('reads as 404, not a raw ENOENT, so the tab can tell "no notebook" from a real failure', async () => {
    // The parent must already be realpath'd (as `resolveNotebookRoot` leaves a real home
    // directory) so the missing leaf itself is the only thing containment has to walk past —
    // an unresolved tmpdir symlink (macOS's /var → /private/var) would fail containment
    // before ever reaching the ENOENT this test means to exercise.
    const base = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'sidecar-notebook-missing-routes-'))
    );
    const missing = path.join(base, 'Melody');
    const routes = notebookRoutes(missing);
    const listError = await failure(routes['POST /notebook/list']({ dir: '.' }));
    expect(listError.status).toBe(404);
    const readError = await failure(routes['POST /notebook/read']({ path: 'MEMORY.md' }));
    expect(readError.status).toBe(404);
    await rm(base, { recursive: true, force: true });
  });
});

describe('/notebook/log validates and constrains to the root itself', () => {
  it('does not return commits from outside the root when MELODY_NOTEBOOK is a repo subdirectory', async () => {
    const scratch = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'sidecar-notebook-subdir-'))
    );
    const bigRepo = path.join(scratch, 'bigrepo');
    const sub = path.join(bigRepo, 'sub');
    await mkdir(sub, { recursive: true });
    await initRepo(bigRepo);
    await writeFile(path.join(bigRepo, 'top-secret.txt'), 'outside the notebook root\n');
    await sh(bigRepo, ['add', '.']);
    await sh(bigRepo, ['commit', '-q', '-m', 'top: outside the notebook root']);
    await writeFile(path.join(sub, 'inside.txt'), 'inside the notebook root\n');
    await sh(bigRepo, ['add', '.']);
    await sh(bigRepo, ['commit', '-q', '-m', 'sub: inside the notebook root']);

    const subRoutes = notebookRoutes(sub);
    const log = (await subRoutes['POST /notebook/log']({})) as { commits: { subject: string }[] };
    expect(log.commits.map((c) => c.subject)).toEqual(['sub: inside the notebook root']);

    await rm(scratch, { recursive: true, force: true });
  });

  it('refuses when the root is later replaced by a symlink pointing outside, rather than returning that history', async () => {
    const scratch = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidecar-notebook-swap-')));
    const rootDir = path.join(scratch, 'root-real');
    await mkdir(rootDir, { recursive: true });
    await initRepo(rootDir);
    await writeFile(path.join(rootDir, 'a.txt'), 'a\n');
    await sh(rootDir, ['add', '.']);
    await sh(rootDir, ['commit', '-q', '-m', 'seed root']);
    // Routes are built against the real directory, exactly as `resolveNotebookRoot` would
    // have handed them at spawn.
    const routes = notebookRoutes(rootDir);

    const secretDir = path.join(scratch, 'secret');
    await mkdir(secretDir, { recursive: true });
    await initRepo(secretDir);
    await writeFile(path.join(secretDir, 'secret.txt'), 'shh\n');
    await sh(secretDir, ['add', '.']);
    await sh(secretDir, ['commit', '-q', '-m', 'top secret commit']);

    await rm(rootDir, { recursive: true, force: true });
    await symlink(secretDir, rootDir);

    const error = await failure(routes['POST /notebook/log']({}));
    expect(error.status).toBe(400);

    await rm(scratch, { recursive: true, force: true });
  });
});

describe('ledgerRoutes — /ledger/list and /ledger/read {name}', () => {
  let scratch: string;
  let ledgerDir: string;
  let routes: ReturnType<typeof ledgerRoutes>;

  beforeAll(async () => {
    scratch = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidecar-ledger-list-')));
    ledgerDir = path.join(scratch, 'state', 'ledger');
    await mkdir(ledgerDir, { recursive: true });
    await writeFile(
      path.join(ledgerDir, 'proj-one-aaaaaaaa.jsonl'),
      JSON.stringify({ at: '2026-09-24T10:00:00Z', kind: 'turn', sessionId: 's1' }) + '\n'
    );
    await writeFile(
      path.join(ledgerDir, 'proj-two-bbbbbbbb.jsonl'),
      JSON.stringify({ at: '2026-09-24T11:00:00Z', kind: 'turn', sessionId: 's2' }) + '\n'
    );
    await writeFile(path.join(ledgerDir, 'not-a-ledger.txt'), 'ignore me\n');
    routes = ledgerRoutes(scratch, ledgerDir);
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('names every *.jsonl in the ledger dir, and nothing else', async () => {
    const listed = (await routes['POST /ledger/list']({})) as { names: string[] };
    expect(listed.names).toEqual(['proj-one-aaaaaaaa.jsonl', 'proj-two-bbbbbbbb.jsonl']);
  });

  it('reads a ledger file by bare name', async () => {
    const read = (await routes['POST /ledger/read']({ name: 'proj-two-bbbbbbbb.jsonl' })) as {
      events: { sessionId: string }[];
      file: string;
    };
    expect(read.events.map((e) => e.sessionId)).toEqual(['s2']);
    expect(read.file).toBe(path.join(ledgerDir, 'proj-two-bbbbbbbb.jsonl'));
  });

  it('refuses a name with a slash or .. with 400', async () => {
    for (const name of ['../outside.jsonl', 'sub/dir.jsonl', '..jsonl', 'a/../b.jsonl']) {
      const error = await failure(routes['POST /ledger/read']({ name }));
      expect(error.status).toBe(400);
    }
  });

  it('refuses both cwd and name together with 400', async () => {
    const error = await failure(
      routes['POST /ledger/read']({ cwd: '.', name: 'proj-one-aaaaaaaa.jsonl' })
    );
    expect(error.status).toBe(400);
  });

  it('refuses a name that resolves to a symlink escaping the ledger dir', async () => {
    const secretFile = path.join(scratch, 'secret.jsonl');
    await writeFile(
      secretFile,
      JSON.stringify({ at: '2026-09-24T09:00:00Z', kind: 'turn', sessionId: 'secret' }) + '\n'
    );
    const escapeLink = path.join(ledgerDir, 'escape.jsonl');
    await symlink(secretFile, escapeLink);
    try {
      const error = await failure(routes['POST /ledger/read']({ name: 'escape.jsonl' }));
      expect(error.status).toBe(400);
    } finally {
      await rm(escapeLink);
    }
  });

  it('reads as no ledgers, not an error, when the ledger dir does not exist yet', async () => {
    const emptyScratch = await mkdtemp(path.join(os.tmpdir(), 'sidecar-ledger-empty-'));
    const emptyRoutes = ledgerRoutes(emptyScratch, path.join(emptyScratch, 'nope'));
    const listed = (await emptyRoutes['POST /ledger/list']({})) as { names: string[] };
    expect(listed.names).toEqual([]);
    await rm(emptyScratch, { recursive: true, force: true });
  });

  it('neither cwd nor name keeps reading the spawn cwd file, as before task 271', async () => {
    const cwdScratch = await mkdtemp(path.join(os.tmpdir(), 'sidecar-ledger-cwd-')).then(realpath);
    await initRepo(cwdScratch);
    // Its own ledger dir, not the shared one above: an append here must not perturb the
    // 'names every *.jsonl' test's fixed two-file expectation.
    const cwdLedgerDir = path.join(cwdScratch, 'state', 'ledger');
    const cwdRoutes = ledgerRoutes(cwdScratch, cwdLedgerDir);
    await cwdRoutes['POST /ledger/append']({
      event: { at: '2026-09-24T12:00:00Z', kind: 'turn', sessionId: 's3' },
    });
    const read = (await cwdRoutes['POST /ledger/read']({})) as { events: { sessionId: string }[] };
    expect(read.events.map((e) => e.sessionId)).toEqual(['s3']);
    await rm(cwdScratch, { recursive: true, force: true });
  });
});

describe("ledgerRoutes — fileFor keys on the request cwd's repository", () => {
  let scratch: string;
  let home: string;
  let mainRepo: string;
  let worktree: string;
  let ledgerDir: string;
  let routes: ReturnType<typeof ledgerRoutes>;

  beforeAll(async () => {
    scratch = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidecar-ledger-rekey-')));
    home = path.join(scratch, 'home');
    mainRepo = path.join(home, 'project');
    worktree = path.join(home, 'project-elsewhere');
    ledgerDir = path.join(scratch, 'state', 'ledger');
    await mkdir(mainRepo, { recursive: true });
    await initRepo(mainRepo);
    await writeFile(path.join(mainRepo, 'a.txt'), 'a\n');
    await sh(mainRepo, ['add', '.']);
    await sh(mainRepo, ['commit', '-q', '-m', 'seed']);
    await sh(mainRepo, ['worktree', 'add', '-b', 'wt/elsewhere', worktree]);
    routes = ledgerRoutes(home, ledgerDir);
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it("spawned on the home directory, a request into the repository writes that repository's file", async () => {
    const result = (await routes['POST /ledger/append']({
      cwd: 'project',
      event: { at: '2026-09-24T13:00:00Z', kind: 'turn', sessionId: 's1' },
    })) as { file: string };
    expect(result.file).toContain('project-');
    expect(result.file.startsWith(ledgerDir)).toBe(true);
  });

  it('a linked worktree anywhere folds back to its main repository, same file as the repo itself', async () => {
    const fromRepo = (await routes['POST /ledger/read']({ cwd: 'project' })) as { file: string };
    const fromWorktree = (await routes['POST /ledger/read']({ cwd: 'project-elsewhere' })) as {
      file: string;
    };
    expect(fromWorktree.file).toBe(fromRepo.file);
  });

  it('a cwd that is not itself a repository still falls back to the spawn toplevel', async () => {
    await mkdir(path.join(home, 'plain'), { recursive: true });
    const result = (await routes['POST /ledger/read']({ cwd: 'plain' })) as { file: string };
    expect(result.file).toBe(ledgerFileFor(ledgerDir, home));
  });
});

describe('ledgerRoutes — fileFor keeps submodules distinct', () => {
  let scratch: string;
  let home: string;
  let superRepo: string;
  let ledgerDir: string;
  let routes: ReturnType<typeof ledgerRoutes>;

  beforeAll(async () => {
    scratch = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidecar-ledger-submodule-')));
    home = path.join(scratch, 'home');
    superRepo = path.join(home, 'super');
    ledgerDir = path.join(scratch, 'state', 'ledger');
    await mkdir(superRepo, { recursive: true });
    await initRepo(superRepo);
    await writeFile(path.join(superRepo, 'root.txt'), 'root\n');
    await sh(superRepo, ['add', '.']);
    await sh(superRepo, ['commit', '-q', '-m', 'seed super']);

    // Two standalone repos, added as the superproject's submodules `a` and `b` — each gets
    // its own git dir under `super/.git/modules/<name>`, the shape that collided before the
    // `.git`-suffix check (both `dirname`d to the shared `modules/` directory).
    for (const name of ['a', 'b']) {
      const seed = path.join(scratch, `seed-${name}`);
      await mkdir(seed, { recursive: true });
      await initRepo(seed);
      await writeFile(path.join(seed, `${name}.txt`), `${name}\n`);
      await sh(seed, ['add', '.']);
      await sh(seed, ['commit', '-q', '-m', `seed ${name}`]);
      await sh(superRepo, ['-c', 'protocol.file.allow=always', 'submodule', 'add', seed, name]);
    }
    await sh(superRepo, ['commit', '-q', '-m', 'add submodules']);

    routes = ledgerRoutes(home, ledgerDir);
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  it('two submodules of the same superproject keep distinct ledger files', async () => {
    const fromA = (await routes['POST /ledger/read']({ cwd: 'super/a' })) as { file: string };
    const fromB = (await routes['POST /ledger/read']({ cwd: 'super/b' })) as { file: string };
    expect(fromA.file).not.toBe(fromB.file);
    expect(path.basename(fromA.file)).toMatch(/^a-/);
    expect(path.basename(fromB.file)).toMatch(/^b-/);
  });

  it('a plain (non-worktree, non-submodule) repository still keys on its own toplevel', async () => {
    const result = (await routes['POST /ledger/read']({ cwd: 'super' })) as { file: string };
    expect(result.file).toBe(ledgerFileFor(ledgerDir, superRepo));
  });
});

describe('ledgerRoutes — fileFor keys a --separate-git-dir repository on its own toplevel', () => {
  it("does not fold a repository whose git-dir and common-dir coincide but aren't <toplevel>/.git", async () => {
    const scratch = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'sidecar-ledger-separate-gitdir-'))
    );
    const home = path.join(scratch, 'home');
    const worktreeDir = path.join(home, 'sep');
    const detachedGitDir = path.join(scratch, 'detached', '.git');
    await mkdir(home, { recursive: true });
    await mkdir(path.dirname(detachedGitDir), { recursive: true });
    await sh(scratch, [
      'init',
      '-q',
      '-b',
      'main',
      `--separate-git-dir=${detachedGitDir}`,
      worktreeDir,
    ]);
    await sh(worktreeDir, ['config', 'user.name', 'sidecar test']);
    await sh(worktreeDir, ['config', 'user.email', 'sidecar@test.invalid']);
    await sh(worktreeDir, ['config', 'commit.gpgsign', 'false']);
    await writeFile(path.join(worktreeDir, 'a.txt'), 'a\n');
    await sh(worktreeDir, ['add', '.']);
    await sh(worktreeDir, ['commit', '-q', '-m', 'seed']);

    const ledgerDir = path.join(scratch, 'state', 'ledger');
    const routes = ledgerRoutes(home, ledgerDir);
    const result = (await routes['POST /ledger/read']({ cwd: 'sep' })) as { file: string };
    expect(result.file).toBe(ledgerFileFor(ledgerDir, worktreeDir));

    await rm(scratch, { recursive: true, force: true });
  });
});
