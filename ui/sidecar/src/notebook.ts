// Task 271 (PRD `docs/2026-09-23-team-tabs-prd-v1.md` §Data sources 1): a second, read-only
// root beside the `/fs/*` boundary — the notebook, `~/Melody` by default — so Team health and
// Usage can read it (and every companion's journal) regardless of which repository the sidecar
// spawned in. No route here writes; git runs only `log` and `show <sha>:<path>`, never a shell.

import { readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { realpathThroughAncestor } from './fs.js';
import { git, isInside } from './git.js';
import { HttpError, type JsonHandler, requireString } from './http.js';

type EntryType = 'file' | 'dir' | 'symlink' | 'other';

const REV = /^[0-9a-f]{40}$/;
// git log's own field separator: none of a sha, an ISO date or a subject line contains it.
const FIELD_SEP = '\x1f';

// The default before realpath — `MELODY_NOTEBOOK` or `~/Melody` — resolved once at spawn
// (`index.ts`), same shape as `defaultLedgerDir`.
export const defaultNotebookRoot = (
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string => (env.MELODY_NOTEBOOK ? path.resolve(env.MELODY_NOTEBOOK) : path.join(home, 'Melody'));

// The fixed root has no git toplevel of its own to fall back on — unlike `/fs/*`'s spawn cwd,
// nothing else stands in for it — so a request path may only land inside `root` itself.
const notebookPath = async (
  root: string,
  body: Record<string, unknown>,
  key: string = 'path'
): Promise<string> => {
  const pathStr = requireString(body, key);
  const requested = path.resolve(root, pathStr);
  let resolved: string;
  try {
    resolved = await realpathThroughAncestor(requested);
  } catch (error) {
    throw new HttpError(400, `path is not usable: ${(error as Error).message}`);
  }
  if (!isInside(resolved, root)) {
    throw new HttpError(400, 'path is outside the notebook');
  }
  return resolved;
};

// `%x1f` fields inside one `-z`-delimited record per commit.
const parseNotebookLog = (output: string): { sha: string; at: string; subject: string }[] =>
  output
    .split('\0')
    .filter((record) => record.length > 0)
    .map((record) => {
      const [sha = '', at = '', ...subject] = record.split(FIELD_SEP);
      return { sha, at, subject: subject.join(FIELD_SEP) };
    });

// A missing notebook (no `~/Melody` yet, or `MELODY_NOTEBOOK` pointed at nothing) reads as
// `404`, not the raw `ENOENT`, so the tab's own "no notebook" state can tell it apart from a
// real read failure without parsing an error string.
const notFound = (error: unknown, root: string): never => {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new HttpError(404, `no notebook at ${root}`);
  }
  throw error;
};

export const notebookRoutes = (root: string): Record<string, JsonHandler> => ({
  'POST /notebook/list': async (body) => {
    const target = await notebookPath(root, body, 'dir');
    const dirents = await readdir(target, { withFileTypes: true }).catch((error) =>
      notFound(error, root)
    );
    const entries = dirents
      .map((dirent) => {
        let type: EntryType = 'other';
        if (dirent.isDirectory()) type = 'dir';
        else if (dirent.isFile()) type = 'file';
        else if (dirent.isSymbolicLink()) type = 'symlink';
        return { name: dirent.name, type };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { path: target, entries };
  },
  'POST /notebook/read': async (body) => {
    const target = await notebookPath(root, body);
    if (body.rev === undefined) {
      const content = await readFile(target, 'utf8').catch((error) => notFound(error, root));
      return { path: target, content };
    }
    const rev = requireString(body, 'rev');
    if (!REV.test(rev)) {
      throw new HttpError(400, 'rev must be a 40-character hex sha');
    }
    // cwd-relative (`./…`) rather than toplevel-relative: correct whether `root` is a
    // repository's own toplevel or a subdirectory of a larger one.
    const relative = `./${path.relative(root, target).split(path.sep).join('/')}`;
    return { path: target, content: await git(root, ['show', `${rev}:${relative}`]) };
  },
  // `path` defaults to the root itself, never omitted from the call below: without it, `root`
  // would go unvalidated (a root swapped for an outward symlink after spawn would go
  // undetected) and git would run with no pathspec at all, returning history for the whole
  // repository `root` sits in rather than only what's under it — a real leak when `root` is a
  // subdirectory of a larger repository, not just a symlink escape.
  'POST /notebook/log': async (body) => {
    const target = await notebookPath(root, {
      path: typeof body.path === 'string' ? body.path : '.',
    });
    // `./` (cwd-relative), not a bare relative path: a path component starting with `:` is
    // pathspec magic after `--` (`:(top)`, `:/…`) that escapes back to the repo's top level —
    // reachable in principle when the notebook sits inside the spawn repository. `./` alone
    // is itself a valid pathspec for the root-itself case.
    const relative = path.relative(root, target).split(path.sep).join('/');
    const args = ['log', '-z', `--format=%H${FIELD_SEP}%aI${FIELD_SEP}%s`];
    if (typeof body.since === 'string') args.push(`--since=${body.since}`);
    args.push('--', `./${relative}`);
    return { commits: parseNotebookLog(await git(root, args)) };
  },
});

// Canonicalized through the nearest existing ancestor (same as a per-request path, not a bare
// `realpath().catch(() => root)`): a symlinked home directory resolves the same way `/fs/*`'s
// toplevel does, and — when the notebook does not exist yet — the *ancestor* is still
// canonicalized so that once it's created, `notebookPath`'s own ancestor-walk resolves the
// same string and containment still passes, rather than 400ing forever because the stored
// root was left uncanonicalized while a request's fully-resolved path was not.
export const resolveNotebookRoot = async (
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): Promise<string> => {
  const root = defaultNotebookRoot(env, home);
  return realpathThroughAncestor(root).catch(() => root);
};
