import { type IPty, spawn as spawnPty } from 'node-pty';
import { chmodSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { WebSocket } from 'ws';

const SCROLLBACK_BYTES = 256 * 1024;

// node-pty 1.1.0's npm tarball ships prebuilds/<platform>-<arch>/spawn-helper
// as 0644 (checked 2026-09-15), and posix_spawnp fails without the execute bit.
// Same lookup order as node-pty's loader: a node-gyp build wins over a prebuild.
export const ensureSpawnHelperExecutable = (): void => {
  const packageRoot = path.dirname(createRequire(import.meta.url).resolve('node-pty/package.json'));
  for (const dir of ['build/Release', `prebuilds/${process.platform}-${process.arch}`]) {
    const helper = path.join(packageRoot, dir, 'spawn-helper');
    let mode: number;
    try {
      mode = statSync(helper).mode;
    } catch {
      continue;
    }
    if ((mode & 0o111) === 0) {
      chmodSync(helper, 0o755);
    }
    return;
  }
};

interface PtySession {
  term: IPty;
  clients: Set<WebSocket>;
  scrollback: string;
}

export interface PtyAttachOptions {
  id: string;
  cwd: string;
  cols: number;
  rows: number;
}

type ClientMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'kill' };

// Sessions outlive their clients: a phone that backgrounds Safari reattaches
// by id and replays the scrollback instead of losing the shell.
const sessions = new Map<string, PtySession>();

const broadcast = (session: PtySession, message: unknown): void => {
  const payload = JSON.stringify(message);
  for (const client of session.clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
};

const createSession = (id: string, options: PtyAttachOptions): PtySession => {
  const shell = process.env.SHELL || '/bin/zsh';
  const term = spawnPty(shell, ['-l'], {
    name: 'xterm-256color',
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<
      string,
      string
    >,
  });
  const session: PtySession = { term, clients: new Set(), scrollback: '' };
  term.onData((data) => {
    session.scrollback = (session.scrollback + data).slice(-SCROLLBACK_BYTES);
    broadcast(session, { type: 'output', data });
  });
  term.onExit(({ exitCode, signal }) => {
    broadcast(session, { type: 'exit', code: exitCode, signal });
    for (const client of session.clients) {
      client.close(1000, 'shell exited');
    }
    sessions.delete(id);
  });
  sessions.set(id, session);
  return session;
};

export const attachPty = (socket: WebSocket, options: PtyAttachOptions): void => {
  const existing = sessions.get(options.id);
  const session = existing ?? createSession(options.id, options);
  session.clients.add(socket);
  const shell = process.env.SHELL || '/bin/zsh';
  socket.send(JSON.stringify({ type: 'attached', id: options.id, pid: session.term.pid, shell: path.basename(shell) }));
  if (existing) {
    session.term.resize(options.cols, options.rows);
    socket.send(JSON.stringify({ type: 'output', data: session.scrollback }));
  }
  socket.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }
    if (message.type === 'input') {
      session.term.write(message.data);
    } else if (message.type === 'resize') {
      session.term.resize(message.cols, message.rows);
    } else if (message.type === 'kill') {
      session.term.kill();
      for (const client of session.clients) {
        client.close(1000, 'shell killed');
      }
      sessions.delete(options.id);
    }
  });
  socket.on('close', () => {
    session.clients.delete(socket);
  });
};

export const killAllPty = (): void => {
  for (const session of sessions.values()) {
    session.term.kill();
  }
};
