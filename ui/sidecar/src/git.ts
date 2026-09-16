import { execFile } from 'node:child_process';

import { HttpError, type JsonHandler, requireString, requireStringArray } from './http.js';

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

const git = (cwd: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: MAX_OUTPUT_BYTES }, (error, stdout, stderr) => {
      if (error) {
        reject(new HttpError(500, stderr.trim() || error.message));
        return;
      }
      resolve(stdout);
    });
  });

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

export const gitRoutes = (cwd: string): Record<string, JsonHandler> => ({
  'POST /git/status': async () => parseStatus(await git(cwd, ['status', '--porcelain=v1', '-b'])),
  'POST /git/diff': async (body) => {
    const args = ['diff', '--no-color'];
    if (body.staged === true) args.push('--cached');
    if (typeof body.base === 'string') args.push(body.base);
    if (typeof body.path === 'string') args.push('--', body.path);
    return { diff: await git(cwd, args) };
  },
  'POST /git/stage': async (body) => {
    await git(cwd, ['add', '--', ...requireStringArray(body, 'paths')]);
    return {};
  },
  'POST /git/unstage': async (body) => {
    await git(cwd, ['restore', '--staged', '--', ...requireStringArray(body, 'paths')]);
    return {};
  },
  'POST /git/commit': async (body) => ({
    output: await git(cwd, ['commit', '-m', requireString(body, 'message')]),
  }),
});
