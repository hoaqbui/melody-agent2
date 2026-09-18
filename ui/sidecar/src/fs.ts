import chokidar from 'chokidar';
import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { WebSocket } from 'ws';

import { isInside, toplevelOf } from './git.js';
import { HttpError, type JsonHandler, requireString } from './http.js';

type EntryType = 'file' | 'dir' | 'symlink' | 'other';

const WORKTREES_DIR = '.worktrees';
// chokidar 4+ takes no globs: a glob string here is a literal path and node_modules gets walked.
const WATCH_IGNORED = /(^|[\\/])(node_modules|\.git|\.worktrees)([\\/]|$)/;

const resolveIn = (cwd: string, target: string): string => path.resolve(cwd, target);

// The sidecar is unauthenticated on the tailnet, so a request path may only be
// inside the spawn cwd's repository or a sibling worktree of it. realpath the
// path or its closest existing parent to catch symlink escapes.
const requestPath = async (spawnCwd: string, body: Record<string, unknown>): Promise<string> => {
  const pathStr = requireString(body, 'path');
  const requested = path.resolve(spawnCwd, pathStr);
  let resolved: string;
  let toplevel: string;
  try {
    toplevel = await toplevelOf(spawnCwd);
    try {
      resolved = await realpath(requested);
    } catch {
      let checkPath = path.dirname(requested);
      let realParent: string | null = null;
      while (realParent === null) {
        try {
          realParent = await realpath(checkPath);
        } catch {
          const nextPath = path.dirname(checkPath);
          if (nextPath === checkPath) {
            throw new Error('cannot find parent directory');
          }
          checkPath = nextPath;
        }
      }
      const subpath = requested.slice(realParent.length);
      resolved = path.join(realParent, subpath);
    }
  } catch (error) {
    throw new HttpError(400, `path is not usable: ${(error as Error).message}`);
  }
  const roots = [toplevel];
  const parent = path.dirname(toplevel);
  if (path.basename(parent) === WORKTREES_DIR) roots.push(parent);
  if (!roots.some((root) => isInside(resolved, root))) {
    throw new HttpError(400, 'path is outside the repository the sidecar was started in');
  }
  return resolved;
};

export const fsRoutes = (cwd: string): Record<string, JsonHandler> => ({
  'POST /fs/list': async (body) => {
    const target = await requestPath(cwd, body);
    const dirents = await readdir(target, { withFileTypes: true });
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
  'POST /fs/read': async (body) => {
    const target = await requestPath(cwd, body);
    return { path: target, content: await readFile(target, 'utf8') };
  },
  'POST /fs/write': async (body) => {
    const target = await requestPath(cwd, body);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, requireString(body, 'content'), 'utf8');
    return { path: target };
  },
});

export const attachFsWatch = (socket: WebSocket, cwd: string, target: string | null): void => {
  const root = resolveIn(cwd, target ?? '.');
  const watcher = chokidar.watch(root, { ignoreInitial: true, ignored: WATCH_IGNORED });
  watcher.on('all', (type, changedPath) => {
    socket.send(JSON.stringify({ type, path: changedPath }));
  });
  watcher.on('error', (error) => {
    socket.close(1011, error instanceof Error ? error.message.slice(0, 120) : 'watch error');
  });
  socket.on('close', () => {
    void watcher.close();
  });
  socket.send(JSON.stringify({ type: 'watching', path: root }));
};
