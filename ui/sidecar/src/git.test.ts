import { execFile } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
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

// A `gh` that answers from files under `state`: `mode` = auth makes every call exit 4 as a
// logged-out gh does; `pr create` records its argv and marks the PR made, after which
// `pr view` finds it; `pr checks` always exits 8 (a check still pending) with the list.
const fakeGh = (state: string): string => `#!/bin/sh
STATE="${state}"
if [ -f "$STATE/mode" ] && [ "$(cat "$STATE/mode")" = "auth" ]; then
  echo "You are not logged into any GitHub hosts. To log in, run:  gh auth login" >&2
  exit 4
fi
case "$1 $2" in
  "pr create")
    printf '%s\\n' "$@" > "$STATE/create.args"
    : > "$STATE/pr"
    echo "https://github.com/acme/repo/pull/42"
    ;;
  "pr view")
    if [ -f "$STATE/pr" ]; then
      echo '{"number":42,"url":"https://github.com/acme/repo/pull/42","state":"OPEN","isDraft":false,"mergeable":"MERGEABLE","statusCheckRollup":[]}'
    else
      echo 'no pull requests found for branch "feature"' >&2
      exit 1
    fi
    ;;
  "pr checks")
    printf '%s\\n' "$@" > "$STATE/checks.args"
    echo '[{"name":"build","state":"SUCCESS","link":"https://ci/build"},{"name":"lint","state":"FAILURE","link":"https://ci/lint"},{"name":"docs","state":"SKIPPED","link":"https://ci/docs"},{"name":"e2e","state":"IN_PROGRESS","link":"https://ci/e2e"}]'
    exit 8
    ;;
  *)
    echo "fake gh: unexpected $*" >&2
    exit 1
    ;;
esac
`;

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

  describe('diff with numstat and untracked files', () => {
    it('returns numstat with untracked files appended', async () => {
      await writeFile(path.join(repo, 'numstat-edited.txt'), 'line 1\nline 2\nline 3\n');
      await writeFile(path.join(repo, 'a.txt'), 'modified content\n');
      await writeFile(path.join(repo, 'numstat-untracked.txt'), 'untracked\nline 2\n');

      const result = (await routes['POST /git/diff']({ numstat: true })) as { diff: string };
      const lines = result.diff.trim().split('\n');

      expect(result.diff).toContain('a.txt');
      expect(result.diff).toContain('numstat-untracked.txt');
      expect(lines.some((line) => line.includes('numstat-untracked.txt'))).toBe(true);

      await rm(path.join(repo, 'numstat-edited.txt'));
      await rm(path.join(repo, 'numstat-untracked.txt'));
      await sh(repo, ['checkout', '--', 'a.txt']);
    });
  });

  describe('push, log and pr', () => {
    let pushRepo: string;
    let origin: string;
    let ghState: string;
    let pushRoutes: ReturnType<typeof gitRoutes>;
    const previousPath = process.env.PATH;

    beforeAll(async () => {
      pushRepo = path.join(scratch, 'push');
      origin = path.join(scratch, 'origin.git');
      ghState = path.join(scratch, 'gh-state');
      const bin = path.join(scratch, 'gh-bin');
      await mkdir(pushRepo);
      await mkdir(ghState);
      await mkdir(bin);
      await writeFile(path.join(bin, 'gh'), fakeGh(ghState));
      await chmod(path.join(bin, 'gh'), 0o755);
      process.env.PATH = `${bin}${path.delimiter}${previousPath ?? ''}`;

      await sh(scratch, ['init', '-q', '--bare', '-b', 'main', origin]);
      await initRepo(pushRepo);
      await writeFile(path.join(pushRepo, 'README.md'), 'base\n');
      await commitAll(pushRepo, 'base');
      await sh(pushRepo, ['remote', 'add', 'origin', origin]);
      await sh(pushRepo, ['push', '-q', '-u', 'origin', 'main']);
      await sh(pushRepo, ['checkout', '-q', '-b', 'feature']);
      await writeFile(path.join(pushRepo, 'one.txt'), 'one\n');
      await commitAll(pushRepo, 'feature: one');
      await writeFile(path.join(pushRepo, 'two.txt'), 'two\n');
      await commitAll(pushRepo, 'feature: two');
      pushRoutes = gitRoutes(pushRepo);
    });

    afterAll(() => {
      process.env.PATH = previousPath;
    });

    it('reports no upstream, then pushes with -u and reports it in sync', async () => {
      const before = (await pushRoutes['POST /git/status']({})) as {
        branch: string;
        upstream: string | null;
        ahead: number;
      };
      expect(before).toMatchObject({ branch: 'feature', upstream: null, ahead: 0 });

      await pushRoutes['POST /git/push']({ setUpstream: true });
      expect((await sh(origin, ['rev-parse', 'feature'])).trim()).toBe(
        (await sh(pushRepo, ['rev-parse', 'HEAD'])).trim()
      );
      const after = (await pushRoutes['POST /git/status']({})) as {
        upstream: string | null;
        ahead: number;
        behind: number;
      };
      expect(after).toMatchObject({ upstream: 'origin/feature', ahead: 0, behind: 0 });

      await writeFile(path.join(pushRepo, 'three.txt'), 'three\n');
      await commitAll(pushRepo, 'feature: three');
      const ahead = (await pushRoutes['POST /git/status']({})) as { ahead: number };
      expect(ahead.ahead).toBe(1);
      await pushRoutes['POST /git/push']({});
      const synced = (await pushRoutes['POST /git/status']({})) as { ahead: number };
      expect(synced.ahead).toBe(0);
    });

    it('lists the commits since the remote default branch, or since a named base', async () => {
      const log = (await pushRoutes['POST /git/log']({})) as {
        base: string | null;
        commits: { sha: string; subject: string }[];
      };
      expect(log.base).toBe('main');
      expect(log.commits.map((commit) => commit.subject)).toEqual([
        'feature: three',
        'feature: two',
        'feature: one',
      ]);
      expect(log.commits[0]?.sha).toMatch(/^[0-9a-f]{40}$/);

      const named = (await pushRoutes['POST /git/log']({ base: 'feature' })) as {
        base: string | null;
        commits: unknown[];
      };
      expect(named).toEqual({ base: 'feature', commits: [] });

      const unknown = (await pushRoutes['POST /git/log']({ base: 'nope' })) as {
        base: string | null;
        commits: { subject: string }[];
      };
      expect(unknown.base).toBeNull();
      expect(unknown.commits.map((commit) => commit.subject)).toEqual(['feature: three']);
    });

    it('answers status with no PR before one exists', async () => {
      expect(await pushRoutes['POST /git/pr/status']({})).toEqual({ pr: null, checks: [] });
    });

    it('creates the PR from the current branch and returns its number and URL', async () => {
      const created = await pushRoutes['POST /git/pr/create']({
        title: 'Feature',
        body: '- one\n- two',
        base: 'main',
        draft: true,
      });
      expect(created).toEqual({ url: 'https://github.com/acme/repo/pull/42', number: 42 });
      const argv = (await readFile(path.join(ghState, 'create.args'), 'utf8')).split('\n');
      expect(argv).toEqual([
        'pr',
        'create',
        '--head',
        'feature',
        '--title',
        'Feature',
        '--body',
        '- one',
        '- two',
        '--base',
        'main',
        '--draft',
        '',
      ]);
    });

    it('folds the checks into status, one failing, one still pending', async () => {
      const status = (await pushRoutes['POST /git/pr/status']({})) as {
        pr: { number: number; state: string; isDraft: boolean };
        checks: { name: string; state: string; link: string }[];
      };
      expect(status.pr).toMatchObject({ number: 42, state: 'OPEN', isDraft: false });
      expect(status.checks).toEqual([
        { name: 'build', state: 'pass', link: 'https://ci/build' },
        { name: 'lint', state: 'fail', link: 'https://ci/lint' },
        { name: 'docs', state: 'skipped', link: 'https://ci/docs' },
        { name: 'e2e', state: 'pending', link: 'https://ci/e2e' },
      ]);
      expect(await readFile(path.join(ghState, 'checks.args'), 'utf8')).toBe(
        'pr\nchecks\n--json\nname,state,link\n'
      );
    });

    it('answers 503 with gh not available when gh is not logged in', async () => {
      await writeFile(path.join(ghState, 'mode'), 'auth');
      const status = await failure(pushRoutes['POST /git/pr/status']({}));
      expect(status.status).toBe(503);
      expect(status.message).toBe(
        'gh not available: You are not logged into any GitHub hosts. To log in, run:  gh auth login'
      );
      expect(status.details).toEqual({ reason: 'auth' });
      const create = await failure(pushRoutes['POST /git/pr/create']({ title: 't', body: '' }));
      expect(create.status).toBe(503);
      await rm(path.join(ghState, 'mode'));
    });

    it('answers 503 with gh not installed when there is no gh on PATH', async () => {
      process.env.PATH = path.join(scratch, 'empty-bin');
      try {
        const error = await failure(pushRoutes['POST /git/pr/status']({}));
        expect(error.status).toBe(503);
        expect(error.message).toBe('gh not available: gh is not installed');
        expect(error.details).toEqual({ reason: 'missing' });
      } finally {
        process.env.PATH = `${path.join(scratch, 'gh-bin')}${path.delimiter}${previousPath ?? ''}`;
      }
    });
  });

  describe('snapshot', () => {
    it('creates a tree snapshot without touching the real index', async () => {
      await writeFile(path.join(repo, 'snapshot-test.txt'), 'test\n');
      await writeFile(path.join(repo, 'a.txt'), 'modified\n');
      const statusBefore = (await sh(repo, ['status', '--porcelain'])).trim();

      const snapshot = (await routes['POST /git/snapshot']({})) as { tree: string };
      expect(snapshot.tree).toMatch(/^[0-9a-f]{40}$/);

      const statusAfter = (await sh(repo, ['status', '--porcelain'])).trim();
      expect(statusBefore).toBe(statusAfter);
      expect(await readFile(path.join(repo, 'snapshot-test.txt'), 'utf8')).toBe('test\n');
      expect(await readFile(path.join(repo, 'a.txt'), 'utf8')).toBe('modified\n');

      await rm(path.join(repo, 'snapshot-test.txt'));
      await sh(repo, ['checkout', '--', 'a.txt']);
    });

    it('captures created, edited, and deleted files in diff between snapshots', async () => {
      const snapshot0 = (await routes['POST /git/snapshot']({})) as { tree: string };
      const tree0 = snapshot0.tree;

      await writeFile(path.join(repo, 'created.txt'), 'new file\n');
      await writeFile(path.join(repo, 'a.txt'), 'one\nTWO\nthree\n');
      await rm(path.join(repo, 'sub', 'b.txt'));

      const snapshot1 = (await routes['POST /git/snapshot']({})) as { tree: string };
      const tree1 = snapshot1.tree;

      const diff = await sh(repo, ['diff', '--no-color', '--name-only', `${tree0}..${tree1}`]);
      const names = diff.trim().split('\n').sort();
      expect(names).toContain('created.txt');
      expect(names).toContain('a.txt');
      expect(names).toContain('sub/b.txt');

      const diffContent = await sh(repo, [
        'diff',
        '--no-color',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        `${tree0}..${tree1}`,
      ]);
      expect(diffContent).toContain('new file mode');
      expect(diffContent).toContain('deleted file mode');
      expect(diffContent).toContain('-two');
      expect(diffContent).toContain('+TWO');

      await rm(path.join(repo, 'created.txt'));
      await sh(repo, ['checkout', '--', 'a.txt']);
      await sh(repo, ['checkout', '--', 'sub/b.txt']);
    });

    it('returns consistent tree hash for identical working tree state', async () => {
      const snapshot1 = (await routes['POST /git/snapshot']({})) as { tree: string };
      const snapshot2 = (await routes['POST /git/snapshot']({})) as { tree: string };
      expect(snapshot1.tree).toBe(snapshot2.tree);
    });
  });

  describe('discard and undo', () => {
    it('discards changes with stash push and returns stash message', async () => {
      // Create a dirty working tree
      await writeFile(path.join(repo, 'discard-test.txt'), 'test content\n');
      await writeFile(path.join(repo, 'a.txt'), 'modified\n');

      // Discard changes
      const discardResult = (await routes['POST /git/discard']({})) as { stash: string };
      expect(discardResult.stash).toMatch(/^goose discard \d+$/);

      // Verify tree is clean
      const status = (await sh(repo, ['status', '--porcelain'])).trim();
      expect(status).toBe('');

      // Verify the files are in the stash
      const stashList = await sh(repo, ['stash', 'list']);
      expect(stashList).toContain('goose discard');

      // Clean up stash
      await sh(repo, ['stash', 'drop']);
    });

    it('undoes a discard by applying and dropping the stash', async () => {
      // Create a dirty working tree
      await writeFile(path.join(repo, 'undo-test.txt'), 'test content\n');
      await writeFile(path.join(repo, 'a.txt'), 'undo modified\n');

      // Discard changes
      const discardResult = (await routes['POST /git/discard']({})) as { stash: string };
      const stashMessage = discardResult.stash;

      // Verify tree is clean
      let status = (await sh(repo, ['status', '--porcelain'])).trim();
      expect(status).toBe('');

      await routes['POST /git/discard-undo']({ stash: stashMessage });

      // Verify the files are back
      status = (await sh(repo, ['status', '--porcelain'])).trim();
      expect(status).toContain('undo-test.txt');
      expect(status).toContain('a.txt');
      expect(await readFile(path.join(repo, 'undo-test.txt'), 'utf8')).toBe('test content\n');

      // Clean up
      await rm(path.join(repo, 'undo-test.txt'));
      await sh(repo, ['checkout', '--', 'a.txt']);
    });

    it('fails to undo with invalid stash message', async () => {
      const error = await failure(routes['POST /git/discard-undo']({ stash: 'invalid stash message' }));
      expect(error.status).toBe(404);
      expect(error.message).toContain('stash entry not found');
    });
  });
});
