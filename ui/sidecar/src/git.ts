import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import path from 'node:path';

import { HttpError, type JsonHandler, requireString, requireStringArray } from './http.js';

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const WORKTREES_DIR = '.worktrees';
// The slug lands in a branch name and a path under .worktrees/; anything looser
// lets a tailnet peer walk out of the directory.
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

const git = (cwd: string, args: string[], stdin?: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      args,
      { cwd, maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          reject(new HttpError(500, stderr.trim() || error.message));
          return;
        }
        resolve(stdout);
      }
    );
    if (stdin !== undefined && child.stdin) {
      // git may exit before reading the whole patch; the exit callback already
      // reports that, and an unhandled EPIPE here would take the sidecar down.
      child.stdin.on('error', () => {});
      child.stdin.end(stdin);
    }
  });

const toplevelOf = async (cwd: string): Promise<string> =>
  realpath((await git(cwd, ['rev-parse', '--show-toplevel'])).trim());

const isInside = (target: string, root: string): boolean =>
  target === root || target.startsWith(root + path.sep);

// The sidecar is unauthenticated on the tailnet, so a request cwd may only be
// the spawn cwd's repository or a sibling worktree of it. realpath first:
// symlinks and `..` escape a string compare.
const requestCwd = async (spawnCwd: string, body: Record<string, unknown>): Promise<string> => {
  if (body.cwd === undefined) return spawnCwd;
  const requested = path.resolve(spawnCwd, requireString(body, 'cwd'));
  let cwd: string;
  let toplevel: string;
  try {
    cwd = await realpath(requested);
    toplevel = await toplevelOf(spawnCwd);
  } catch (error) {
    throw new HttpError(400, `cwd is not usable: ${(error as Error).message}`);
  }
  const roots = [toplevel];
  const parent = path.dirname(toplevel);
  if (path.basename(parent) === WORKTREES_DIR) roots.push(parent);
  if (!roots.some((root) => isInside(cwd, root))) {
    throw new HttpError(400, 'cwd is outside the repository the sidecar was started in');
  }
  return cwd;
};

const requireSlug = (body: Record<string, unknown>): string => {
  const slug = requireString(body, 'slug');
  if (!SLUG.test(slug)) {
    throw new HttpError(400, `slug must match ${SLUG.source}`);
  }
  return slug;
};

interface StatusEntry {
  path: string;
  index: string;
  worktree: string;
}

const parseStatus = (output: string): { branch: string | null; entries: StatusEntry[] } => {
  const lines = output.split('\n').filter((line) => line.length > 0);
  let branch: string | null = null;
  const entries: StatusEntry[] = [];
  for (const line of lines) {
    if (line.startsWith('## ')) {
      branch = line.slice(3).split('...')[0] ?? null;
      continue;
    }
    entries.push({ index: line[0] ?? ' ', worktree: line[1] ?? ' ', path: line.slice(3) });
  }
  return { branch, entries };
};

interface WorktreeEntry {
  path: string;
  head: string;
  branch: string | null;
  locked: boolean;
}

const parseWorktreeList = (output: string): WorktreeEntry[] =>
  output
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const entry: WorktreeEntry = { path: '', head: '', branch: null, locked: false };
      for (const line of block.split('\n')) {
        const [key, ...rest] = line.split(' ');
        const value = rest.join(' ');
        if (key === 'worktree') entry.path = value;
        else if (key === 'HEAD') entry.head = value;
        else if (key === 'branch') entry.branch = value.replace(/^refs\/heads\//, '');
        else if (key === 'locked') entry.locked = true;
      }
      return entry;
    });

const unmergedPaths = async (toplevel: string): Promise<string[]> =>
  (await git(toplevel, ['diff', '--name-only', '--diff-filter=U']))
    .split('\n')
    .filter((line) => line.length > 0);

const hasMergeHead = async (toplevel: string): Promise<boolean> => {
  try {
    await git(toplevel, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']);
    return true;
  } catch {
    return false;
  }
};

export const gitRoutes = (spawnCwd: string): Record<string, JsonHandler> => ({
  'POST /git/status': async (body) =>
    parseStatus(await git(await requestCwd(spawnCwd, body), ['status', '--porcelain=v1', '-b'])),
  // Fixed prefixes, raw paths and no external driver: the renderer parses this output,
  // so a user's diff.noprefix, core.quotePath or diff.external must not reshape it.
  'POST /git/diff': async (body) => {
    const args = [
      '-c',
      'core.quotePath=false',
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--src-prefix=a/',
      '--dst-prefix=b/',
    ];
    if (body.staged === true) args.push('--cached');
    if (typeof body.context === 'number') args.push(`--unified=${Math.trunc(body.context)}`);
    if (typeof body.base === 'string') args.push(body.base);
    if (typeof body.path === 'string') args.push('--', body.path);
    return { diff: await git(await requestCwd(spawnCwd, body), args) };
  },
  'POST /git/rev-parse': async (body) => ({
    sha: (
      await git(await requestCwd(spawnCwd, body), [
        'rev-parse',
        '--verify',
        '--end-of-options',
        `${requireString(body, 'rev')}^{commit}`,
      ])
    ).trim(),
  }),
  'POST /git/stage': async (body) => {
    await git(await requestCwd(spawnCwd, body), [
      'add',
      '--',
      ...requireStringArray(body, 'paths'),
    ]);
    return {};
  },
  'POST /git/unstage': async (body) => {
    await git(await requestCwd(spawnCwd, body), [
      'restore',
      '--staged',
      '--',
      ...requireStringArray(body, 'paths'),
    ]);
    return {};
  },
  'POST /git/commit': async (body) => ({
    output: await git(await requestCwd(spawnCwd, body), [
      'commit',
      '-m',
      requireString(body, 'message'),
    ]),
  }),
  'POST /git/worktree/add': async (body) => {
    const slug = requireSlug(body);
    const toplevel = await toplevelOf(await requestCwd(spawnCwd, body));
    const worktree = path.join(toplevel, WORKTREES_DIR, slug);
    const branch = `wt/${slug}`;
    await git(toplevel, ['worktree', 'add', '-b', branch, worktree]);
    return { path: worktree, branch };
  },
  'POST /git/worktree/list': async (body) => {
    const toplevel = await toplevelOf(await requestCwd(spawnCwd, body));
    return {
      worktrees: parseWorktreeList(await git(toplevel, ['worktree', 'list', '--porcelain'])),
    };
  },
  // A dirty tree needs one --force, a locked one two; git refuses both without.
  'POST /git/worktree/remove': async (body) => {
    const slug = requireSlug(body);
    const toplevel = await toplevelOf(await requestCwd(spawnCwd, body));
    const force = body.force === true ? ['--force', '--force'] : [];
    await git(toplevel, ['worktree', 'remove', ...force, path.join(toplevel, WORKTREES_DIR, slug)]);
    return {};
  },
  // A conflicted merge is aborted before the 409: no route resolves or aborts
  // one, so leaving it would strand the caller mid-merge with only a terminal.
  // Only a merge this call started is aborted; one the user began in a
  // terminal makes git refuse, and that refusal passes through untouched.
  'POST /git/merge': async (body) => {
    const slug = requireSlug(body);
    const toplevel = await toplevelOf(await requestCwd(spawnCwd, body));
    const mergeInProgress = await hasMergeHead(toplevel);
    try {
      await git(toplevel, ['merge', '--no-ff', '--no-edit', `wt/${slug}`]);
    } catch (error) {
      if (mergeInProgress || !(await hasMergeHead(toplevel))) throw error;
      const conflicts = await unmergedPaths(toplevel);
      await git(toplevel, ['merge', '--abort']);
      throw new HttpError(409, `merge of wt/${slug} conflicts in ${conflicts.length} path(s)`, {
        conflicts,
      });
    }
    return { sha: (await git(toplevel, ['rev-parse', 'HEAD'])).trim() };
  },
  // Patch paths are repo-root-relative as `git diff` emits them, so apply runs
  // at the toplevel whatever subdirectory the session was opened in.
  'POST /git/apply': async (body) => {
    const patch = requireString(body, 'patch');
    const toplevel = await toplevelOf(await requestCwd(spawnCwd, body));
    const args = ['apply', '--recount'];
    if (body.reverse === true) args.push('-R');
    if (body.cached === true) args.push('--cached');
    args.push('-');
    await git(toplevel, args, patch);
    return {};
  },
});
