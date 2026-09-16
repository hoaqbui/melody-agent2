import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { gitRoutes } from './git.js';
import { HttpError } from './http.js';

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

const commitAll = async (dir: string, message: string): Promise<void> => {
  await sh(dir, ['add', '-A']);
  await sh(dir, ['commit', '-q', '-m', message]);
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

describe('gitRoutes', () => {
  let scratch: string;
  let repo: string;
  let outside: string;
  let routes: ReturnType<typeof gitRoutes>;

  beforeAll(async () => {
    scratch = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidecar-git-')));
    repo = path.join(scratch, 'repo');
    outside = path.join(scratch, 'outside');
    await mkdir(path.join(repo, 'sub'), { recursive: true });
    await mkdir(outside);
    await initRepo(repo);
    await writeFile(path.join(repo, 'a.txt'), 'one\ntwo\nthree\n');
    await writeFile(path.join(repo, 'sub', 'b.txt'), 'b\n');
    await commitAll(repo, 'init');
    await initRepo(outside);
    routes = gitRoutes(repo);
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  describe('cwd guard', () => {
    it('defaults to the spawn cwd', async () => {
      const status = (await routes['POST /git/status']({})) as { branch: string };
      expect(status.branch).toBe('main');
    });

    it('accepts a subdirectory of the toplevel', async () => {
      const status = (await routes['POST /git/status']({ cwd: path.join(repo, 'sub') })) as {
        branch: string;
      };
      expect(status.branch).toBe('main');
    });

    it('refuses a cwd outside the toplevel with 400', async () => {
      const error = await failure(routes['POST /git/status']({ cwd: outside }));
      expect(error.status).toBe(400);
      expect(error.message).toContain('outside the repository');
      const dotdot = await failure(routes['POST /git/status']({ cwd: `${repo}/../outside` }));
      expect(dotdot.status).toBe(400);
    });

    it('refuses a symlinked cwd that leaves the toplevel with 400', async () => {
      await symlink(outside, path.join(repo, 'link'));
      const error = await failure(routes['POST /git/status']({ cwd: path.join(repo, 'link') }));
      expect(error.status).toBe(400);
      expect(error.message).toContain('outside the repository');
    });

    it('refuses a missing cwd and a non-string cwd with 400', async () => {
      expect(
        (await failure(routes['POST /git/status']({ cwd: path.join(repo, 'nope') }))).status
      ).toBe(400);
      expect((await failure(routes['POST /git/status']({ cwd: 7 }))).status).toBe(400);
    });
  });

  describe('worktree', () => {
    it('refuses a slug that walks out of .worktrees with 400 before any git call', async () => {
      for (const slug of ['../x', 'Upper', 'a b', '', '-lead', 'x'.repeat(65)]) {
        const error = await failure(routes['POST /git/worktree/add']({ slug }));
        expect(error.status, slug).toBe(400);
      }
      expect((await failure(routes['POST /git/worktree/remove']({ slug: '../x' }))).status).toBe(
        400
      );
      expect((await failure(routes['POST /git/merge']({ slug: '../x' }))).status).toBe(400);
    });

    it('adds, lists and reaches a worktree through cwd', async () => {
      const added = (await routes['POST /git/worktree/add']({ slug: 'feat-1' })) as {
        path: string;
        branch: string;
      };
      expect(added).toEqual({ path: path.join(repo, '.worktrees', 'feat-1'), branch: 'wt/feat-1' });

      const listed = (await routes['POST /git/worktree/list']({})) as {
        worktrees: { path: string; branch: string | null; locked: boolean }[];
      };
      expect(listed.worktrees.map((entry) => entry.branch)).toEqual(['main', 'wt/feat-1']);
      expect(listed.worktrees[1]).toMatchObject({ path: added.path, locked: false });

      const status = (await routes['POST /git/status']({ cwd: added.path })) as { branch: string };
      expect(status.branch).toBe('wt/feat-1');
    });

    it('accepts a sibling worktree when spawned inside one', async () => {
      const inner = gitRoutes(path.join(repo, '.worktrees', 'feat-1'));
      await routes['POST /git/worktree/add']({ slug: 'feat-2' });
      const status = (await inner['POST /git/status']({
        cwd: path.join(repo, '.worktrees', 'feat-2'),
      })) as { branch: string };
      expect(status.branch).toBe('wt/feat-2');
      await routes['POST /git/worktree/remove']({ slug: 'feat-2' });
    });

    it('refuses to remove a dirty or locked worktree unless forced', async () => {
      const worktree = path.join(repo, '.worktrees', 'feat-1');
      await writeFile(path.join(worktree, 'dirty.txt'), 'x\n');
      const dirty = await failure(routes['POST /git/worktree/remove']({ slug: 'feat-1' }));
      expect(dirty.status).toBe(500);
      expect(dirty.message).toContain('--force');
      await rm(path.join(worktree, 'dirty.txt'));

      await sh(repo, ['worktree', 'lock', worktree]);
      const locked = await failure(routes['POST /git/worktree/remove']({ slug: 'feat-1' }));
      expect(locked.status).toBe(500);
      expect(locked.message).toContain('locked');
      const listed = (await routes['POST /git/worktree/list']({})) as {
        worktrees: { locked: boolean }[];
      };
      expect(listed.worktrees[1]?.locked).toBe(true);

      await writeFile(path.join(worktree, 'dirty.txt'), 'x\n');
      await routes['POST /git/worktree/remove']({ slug: 'feat-1', force: true });
      const after = (await routes['POST /git/worktree/list']({})) as { worktrees: unknown[] };
      expect(after.worktrees).toHaveLength(1);
    });
  });

  describe('merge', () => {
    it('merges a worktree branch with --no-ff and returns the merge sha', async () => {
      const added = (await routes['POST /git/worktree/add']({ slug: 'merge-ok' })) as {
        path: string;
      };
      await writeFile(path.join(added.path, 'new.txt'), 'new\n');
      await commitAll(added.path, 'add new.txt');

      const merged = (await routes['POST /git/merge']({ slug: 'merge-ok' })) as { sha: string };
      expect(merged.sha).toMatch(/^[0-9a-f]{40}$/);
      expect((await sh(repo, ['rev-parse', 'HEAD'])).trim()).toBe(merged.sha);
      expect(
        (await sh(repo, ['rev-list', '--parents', '-1', 'HEAD'])).trim().split(' ')
      ).toHaveLength(3);
      expect(await readFile(path.join(repo, 'new.txt'), 'utf8')).toBe('new\n');
    });

    it('answers a conflict with 409, the conflict list and an aborted merge', async () => {
      const added = (await routes['POST /git/worktree/add']({ slug: 'merge-bad' })) as {
        path: string;
      };
      await writeFile(path.join(added.path, 'a.txt'), 'theirs\ntwo\nthree\n');
      await commitAll(added.path, 'theirs');
      await writeFile(path.join(repo, 'a.txt'), 'ours\ntwo\nthree\n');
      await commitAll(repo, 'ours');
      const head = (await sh(repo, ['rev-parse', 'HEAD'])).trim();

      const error = await failure(routes['POST /git/merge']({ slug: 'merge-bad' }));
      expect(error.status).toBe(409);
      expect(error.details).toEqual({ conflicts: ['a.txt'] });
      expect((await sh(repo, ['rev-parse', 'HEAD'])).trim()).toBe(head);
      await expect(sh(repo, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).rejects.toThrow();
      expect(await readFile(path.join(repo, 'a.txt'), 'utf8')).toBe('ours\ntwo\nthree\n');
    });

    it('leaves a merge the user already has in progress alone', async () => {
      await sh(repo, ['branch', 'user-branch', 'wt/merge-bad']);
      await expect(sh(repo, ['merge', '--no-edit', 'user-branch'])).rejects.toThrow();
      const mergeHead = (await sh(repo, ['rev-parse', 'MERGE_HEAD'])).trim();

      const error = await failure(routes['POST /git/merge']({ slug: 'merge-bad' }));
      expect(error.status).toBe(500);
      expect(error.message).toContain('unmerged files');
      expect((await sh(repo, ['rev-parse', 'MERGE_HEAD'])).trim()).toBe(mergeHead);
      await sh(repo, ['merge', '--abort']);
    });
  });

  describe('apply', () => {
    beforeAll(async () => {
      await writeFile(path.join(repo, 'a.txt'), 'ours\ntwo\nthree\n');
      await sh(repo, ['add', '-A']);
      await sh(repo, ['commit', '-q', '--allow-empty', '-m', 'apply base']);
    });

    const patch = [
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1,3 +1,3 @@',
      ' ours',
      '-two',
      '+TWO',
      ' three',
      '',
    ].join('\n');

    it('applies forward, in reverse, and refuses drift leaving the tree untouched', async () => {
      await routes['POST /git/apply']({ patch });
      expect(await readFile(path.join(repo, 'a.txt'), 'utf8')).toBe('ours\nTWO\nthree\n');

      await routes['POST /git/apply']({ patch, reverse: true });
      expect(await readFile(path.join(repo, 'a.txt'), 'utf8')).toBe('ours\ntwo\nthree\n');

      await writeFile(path.join(repo, 'a.txt'), 'ours\ndrifted\nthree\n');
      const error = await failure(routes['POST /git/apply']({ patch }));
      expect(error.status).toBe(500);
      expect(error.message).toContain('does not apply');
      expect(await readFile(path.join(repo, 'a.txt'), 'utf8')).toBe('ours\ndrifted\nthree\n');
      await sh(repo, ['checkout', '--', 'a.txt']);
    });

    it('stages with cached and applies at the toplevel from a subdirectory cwd', async () => {
      await routes['POST /git/apply']({ patch, cached: true, cwd: path.join(repo, 'sub') });
      expect(await readFile(path.join(repo, 'a.txt'), 'utf8')).toBe('ours\ntwo\nthree\n');
      expect(await sh(repo, ['diff', '--cached', '--name-only'])).toBe('a.txt\n');
      await sh(repo, ['reset', '-q', '--', 'a.txt']);
    });
  });
});
