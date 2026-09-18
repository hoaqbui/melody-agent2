import { execFile } from 'node:child_process';
import { copyFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { HttpError, type JsonHandler, requireString, requireStringArray } from './http.js';

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const WORKTREES_DIR = '.worktrees';
// The slug lands in a branch name and a path under .worktrees/; anything looser
// lets a tailnet peer walk out of the directory.
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const git = (
  cwd: string,
  args: string[],
  stdin?: string,
  env?: Record<string, string>
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = execFile(
      'git',
      args,
      { cwd, maxBuffer: MAX_OUTPUT_BYTES, env: env ? { ...process.env, ...env } : undefined },
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

interface GhResult {
  stdout: string;
  stderr: string;
  code: number;
}

// The token stays in gh's own keyring: the sidecar shells to the binary and never sees it.
// Prompting is off because there is no terminal to answer it, and the update banner is off
// because a route reports stderr's first line as the reason gh is unavailable.
const gh = (cwd: string, args: string[]): Promise<GhResult> =>
  new Promise((resolve, reject) => {
    execFile(
      'gh',
      args,
      {
        cwd,
        maxBuffer: MAX_OUTPUT_BYTES,
        env: { ...process.env, GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' },
      },
      (error, stdout, stderr) => {
        if (error?.code === 'ENOENT') {
          reject(
            new HttpError(503, 'gh not available: gh is not installed', { reason: 'missing' })
          );
          return;
        }
        if (error && typeof error.code !== 'number') {
          reject(new HttpError(500, stderr.trim() || error.message));
          return;
        }
        // gh exits 4 when the command needs a login it does not have.
        if (error?.code === 4) {
          const line = stderr.trim().split('\n')[0] || 'not logged in';
          reject(new HttpError(503, `gh not available: ${line}`, { reason: 'auth' }));
          return;
        }
        resolve({ stdout, stderr, code: typeof error?.code === 'number' ? error.code : 0 });
      }
    );
  });

const ghOk = async (cwd: string, args: string[]): Promise<string> => {
  const result = await gh(cwd, args);
  if (result.code !== 0) {
    throw new HttpError(500, result.stderr.trim() || `gh exited ${result.code}`);
  }
  return result.stdout;
};

export const toplevelOf = async (cwd: string): Promise<string> =>
  realpath((await git(cwd, ['rev-parse', '--show-toplevel'])).trim());

const currentBranch = async (cwd: string): Promise<string> => {
  const branch = (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  if (branch === 'HEAD') throw new HttpError(400, 'HEAD is detached: check out a branch first');
  return branch;
};

export const isInside = (target: string, root: string): boolean =>
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

interface Status {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  entries: StatusEntry[];
}

// The branch line is `## <branch>[...<upstream> [ahead N, behind M]]`; `[gone]` names an
// upstream whose ref no longer exists, which counts as none for a push.
const parseStatus = (output: string): Status => {
  const lines = output.split('\n').filter((line) => line.length > 0);
  const status: Status = { branch: null, upstream: null, ahead: 0, behind: 0, entries: [] };
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const [head, tracking] = line.slice(3).split('...');
      status.branch = head ?? null;
      if (tracking !== undefined) {
        const [upstream, counts] = tracking.split(' [');
        status.upstream = upstream ?? null;
        status.ahead = Number(counts?.match(/ahead (\d+)/)?.[1] ?? 0);
        status.behind = Number(counts?.match(/behind (\d+)/)?.[1] ?? 0);
        if (counts?.startsWith('gone')) status.upstream = null;
      }
      continue;
    }
    status.entries.push({ index: line[0] ?? ' ', worktree: line[1] ?? ' ', path: line.slice(3) });
  }
  return status;
};

const PR_VIEW_FIELDS = 'number,url,state,isDraft,mergeable,statusCheckRollup';

type CheckState = 'pending' | 'pass' | 'fail' | 'skipped';

interface Check {
  name: string;
  state: CheckState;
  link: string;
}

// gh's `bucket` does the same sort; mapping `state` here keeps the fields the renderer
// asked for and one place to read when GitHub adds a conclusion.
const checkState = (state: string): CheckState => {
  switch (state.toUpperCase()) {
    case 'SUCCESS':
      return 'pass';
    case 'FAILURE':
    case 'ERROR':
    case 'TIMED_OUT':
    case 'ACTION_REQUIRED':
    case 'STARTUP_FAILURE':
      return 'fail';
    case 'SKIPPED':
    case 'NEUTRAL':
    case 'CANCELLED':
      return 'skipped';
    default:
      return 'pending';
  }
};

const parseJson = <T>(output: string, what: string): T => {
  try {
    return JSON.parse(output) as T;
  } catch {
    throw new HttpError(500, `gh ${what} did not return JSON`);
  }
};

// `pr view` exits 1 for a branch without a PR; `pr checks` exits 1 for a PR without checks
// and 8 while any check is still running, with the list on stdout either way.
const prView = async (cwd: string): Promise<Record<string, unknown> | null> => {
  const result = await gh(cwd, ['pr', 'view', '--json', PR_VIEW_FIELDS]);
  if (result.code !== 0) {
    // gh 2.100 (probed 2026-09-16): both read as "nothing to show", not a failure.
    if (/no pull requests found|no git remotes found/i.test(result.stderr)) return null;
    throw new HttpError(500, result.stderr.trim() || `gh exited ${result.code}`);
  }
  return parseJson<Record<string, unknown>>(result.stdout, 'pr view');
};

const prChecks = async (cwd: string): Promise<Check[]> => {
  const result = await gh(cwd, ['pr', 'checks', '--json', 'name,state,link']);
  if (result.code !== 0 && result.code !== 8) {
    if (/no checks reported/i.test(result.stderr)) return [];
    throw new HttpError(500, result.stderr.trim() || `gh exited ${result.code}`);
  }
  const raw = parseJson<{ name?: string; state?: string; link?: string }[]>(
    result.stdout.trim() || '[]',
    'pr checks'
  );
  return raw.map((check) => ({
    name: check.name ?? '',
    state: checkState(check.state ?? ''),
    link: check.link ?? '',
  }));
};

// origin/HEAD is set by clone, not by `remote add`, so the usual names follow it.
const defaultBase = async (cwd: string): Promise<string | null> => {
  for (const candidate of ['refs/remotes/origin/HEAD', 'origin/main', 'origin/master']) {
    try {
      const ref = (await git(cwd, ['rev-parse', '--abbrev-ref', '-q', '--verify', candidate]))
        .trim()
        .replace(/^origin\//, '');
      if (ref) return ref;
    } catch {
      continue;
    }
  }
  return null;
};

const resolveBase = async (cwd: string, base: string): Promise<string | null> => {
  for (const candidate of [`origin/${base}`, base]) {
    try {
      await git(cwd, ['rev-parse', '-q', '--verify', '--end-of-options', `${candidate}^{commit}`]);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
};

const parseLog = (output: string): { sha: string; subject: string }[] =>
  output
    .split('\0')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [sha = '', ...subject] = line.split(' ');
      return { sha, subject: subject.join(' ') };
    });

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
    if (body.numstat === true) args.push('--numstat');
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
  'POST /git/discard': async (body) => {
    const cwd = await requestCwd(spawnCwd, body);
    const message = `goose discard ${Date.now()}`;
    await git(cwd, ['stash', 'push', '-u', '-m', message]);
    return { stash: message };
  },
  'POST /git/discard/undo': async (body) => {
    const cwd = await requestCwd(spawnCwd, body);
    const stash = requireString(body, 'stash');
    const stashList = (await git(cwd, ['stash', 'list'])).split('\n').filter((line) => line.length > 0);
    const entry = stashList.find((line) => line.includes(stash));
    if (!entry) {
      throw new HttpError(404, `stash entry not found: ${stash}`);
    }
    const stashRef = entry.split(':')[0];
    await git(cwd, ['stash', 'apply', stashRef]);
    await git(cwd, ['stash', 'drop', stashRef]);
    return {};
  },
  'POST /git/commit': async (body) => ({
    output: await git(await requestCwd(spawnCwd, body), [
      'commit',
      '-m',
      requireString(body, 'message'),
    ]),
  }),
  // git reports a successful push on stderr, which git() drops; the caller reads the
  // result back from /git/status.
  'POST /git/push': async (body) => {
    const cwd = await requestCwd(spawnCwd, body);
    const args = ['push'];
    if (body.setUpstream === true) args.push('-u', 'origin', await currentBranch(cwd));
    await git(cwd, args);
    return {};
  },
  // What a PR sheet is prefilled from: the commits on this branch since `base` (the
  // remote's default branch when none is given), newest first. A base git cannot resolve
  // yields the last commit alone rather than a failure, so the sheet still opens.
  'POST /git/log': async (body) => {
    const cwd = await requestCwd(spawnCwd, body);
    const base =
      typeof body.base === 'string' ? await resolveBase(cwd, body.base) : await defaultBase(cwd);
    const range = base === null ? ['-1'] : [`${base}..HEAD`];
    const output = await git(cwd, ['log', '-z', '--format=%H %s', ...range]);
    return { base: base?.replace(/^origin\//, '') ?? null, commits: parseLog(output) };
  },
  // Nothing posts without this call: the renderer's sheet is the only caller and the body
  // is the user's text as edited there. gh prints the new PR's URL alone.
  'POST /git/pr/create': async (body) => {
    const cwd = await requestCwd(spawnCwd, body);
    const args = [
      'pr',
      'create',
      '--head',
      await currentBranch(cwd),
      '--title',
      requireString(body, 'title'),
      '--body',
      requireString(body, 'body'),
    ];
    if (typeof body.base === 'string') args.push('--base', body.base);
    if (body.draft === true) args.push('--draft');
    const url = (await ghOk(cwd, args)).trim().split('\n').pop() ?? '';
    const number = Number(url.match(/\/pull\/(\d+)/)?.[1]);
    if (!url || Number.isNaN(number)) {
      throw new HttpError(500, `gh pr create did not print a PR URL: ${url}`);
    }
    return { url, number };
  },
  'POST /git/pr/status': async (body) => {
    const cwd = await requestCwd(spawnCwd, body);
    const pr = await prView(cwd);
    if (pr === null) return { pr: null, checks: [] };
    return { pr, checks: await prChecks(cwd) };
  },
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
  'POST /git/snapshot': async (body) => {
    const toplevel = await toplevelOf(await requestCwd(spawnCwd, body));
    const tempIndexPath = path.join(os.tmpdir(), `git-index-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      await copyFile(path.join(toplevel, '.git', 'index'), tempIndexPath);
      await git(toplevel, ['add', '-A'], undefined, { GIT_INDEX_FILE: tempIndexPath });
      const tree = (await git(toplevel, ['write-tree'], undefined, { GIT_INDEX_FILE: tempIndexPath })).trim();
      return { tree };
    } finally {
      await rm(tempIndexPath, { force: true });
    }
  },
});
