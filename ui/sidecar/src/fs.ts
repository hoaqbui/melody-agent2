import chokidar from 'chokidar';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { WebSocket } from 'ws';

import { type JsonHandler, requireString } from './http.js';

type EntryType = 'file' | 'dir' | 'symlink' | 'other';

// chokidar 4+ takes no globs: a glob string here is a literal path and node_modules gets walked.
const WATCH_IGNORED = /(^|[\\/])(node_modules|\.git|\.worktrees)([\\/]|$)/;

const resolveIn = (cwd: string, target: string): string => path.resolve(cwd, target);

export const fsRoutes = (cwd: string): Record<string, JsonHandler> => ({
  'POST /fs/list': async (body) => {
    const target = resolveIn(cwd, requireString(body, 'path'));
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
    const target = resolveIn(cwd, requireString(body, 'path'));
    return { path: target, content: await readFile(target, 'utf8') };
  },
  'POST /fs/write': async (body) => {
    const target = resolveIn(cwd, requireString(body, 'path'));
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
