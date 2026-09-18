/* global WebSocket */
// One live terminal per chat session, kept outside React: the pane remounts when it moves
// between the side panel and the centre (DESIGN.md Nothing Lost Rule), and the pty on the
// sidecar outlives every client (ui/sidecar/src/pty.ts), so the xterm buffer, the socket
// and the armed Ctrl live here and the component only mounts the element.

import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Terminal, type ITheme, type ILink, type ILinkProvider } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import {
  sidecarSocket,
  type PtyClientMessage,
  type PtyServerMessage,
} from '../../../native/sidecar';
import type { ThemeVariant } from '../../../theme/theme-tokens';
import { FILE_LINE, linkPathCandidates } from '../../file-links';
import { withCtrl } from './terminal-keys';

export type TerminalStatus =
  | { kind: 'starting' }
  | { kind: 'running' }
  | { kind: 'exited'; code: number }
  | { kind: 'lost'; reason: string };

export interface TerminalState {
  status: TerminalStatus;
  ctrl: boolean;
}

export interface LinkHandlers {
  openFile(path: string, line: number): void;
  openUrl(url: string): void;
}

export interface TerminalSession {
  getState(): TerminalState;
  subscribe(listener: () => void): () => void;
  mount(host: HTMLElement): void;
  unmount(): void;
  fit(): void;
  // Attaches to the pty by id; the sidecar creates the shell on the first attach and
  // replays its scrollback on every later one.
  connect(): void;
  // Drops the socket and attaches again: a backgrounded phone's socket can be dead
  // without ever closing, so a plain connect would keep waiting on it.
  reattach(): void;
  input(data: string): void;
  paste(text: string): void;
  setCtrl(armed: boolean): void;
  focus(): void;
  syncTheme(variant: ThemeVariant): void;
  dispose(): void;
  setLinkHandlers(handlers: LinkHandlers): void;
  getSelection(): string;
  hasSelection(): boolean;
  onSelectionChange(listener: () => void): () => void;
  search: SearchAddon;
}

const SCROLLBACK_LINES = 5000;
const FONT_SIZE_PX = 12;

// Monokai's canonical ANSI palette on the charcoal ground, for every dark variant. The
// background is opaque, not the translucent token: xterm drops alpha unless
// allowTransparency is set at open().
const MONOKAI_TERMINAL_THEME: ITheme = {
  background: '#1c1c1c',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  selectionBackground: '#3a3a3a',
  black: '#272822',
  red: '#f92672',
  green: '#a6e22e',
  yellow: '#f4bf75',
  blue: '#66d9ef',
  magenta: '#ae81ff',
  cyan: '#a1efe4',
  white: '#f8f8f2',
  brightBlack: '#75715e',
  brightRed: '#f92672',
  brightGreen: '#a6e22e',
  brightYellow: '#f4bf75',
  brightBlue: '#66d9ef',
  brightMagenta: '#ae81ff',
  brightCyan: '#a1efe4',
  brightWhite: '#f9f8f5',
};

const sessions = new Map<string, TerminalSession>();

// Who wants to know that a shell wrote something, by pty id — the rail's Terminal dot
// (task 69). Outside the session's own state so a burst of output never re-renders the pane.
const outputListeners = new Set<(id: string) => void>();

export function subscribeTerminalOutput(listener: (id: string) => void): () => void {
  outputListeners.add(listener);
  return () => outputListeners.delete(listener);
}

export function terminalSession(id: string, cwd: string): TerminalSession {
  let session = sessions.get(id);
  if (!session) {
    session = createTerminalSession(id, cwd);
    sessions.set(id, session);
  }
  return session;
}

// Every live shell, on the phone's return to the foreground (PRD step 13).
export function reattachTerminals(): void {
  sessions.forEach((session) => session.reattach());
}

function createTerminalSession(id: string, cwd: string): TerminalSession {
  const element = document.createElement('div');
  element.className = 'h-full w-full';
  const term = new Terminal({
    cursorBlink: true,
    scrollback: SCROLLBACK_LINES,
    fontSize: FONT_SIZE_PX,
  });
  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(searchAddon);

  let state: TerminalState = { status: { kind: 'starting' }, ctrl: false };
  const listeners = new Set<() => void>();
  const setState = (next: Partial<TerminalState>) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  };

  let opened = false;
  let socket: WebSocket | null = null;
  let connecting = false;
  let attachedBefore = false;
  let linkHandlers: LinkHandlers | null = null;
  const selectionListeners = new Set<() => void>();

  const post = (message: PtyClientMessage) => {
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  term.onData((data) => {
    const payload = state.ctrl ? withCtrl(data) : data;
    if (state.ctrl) setState({ ctrl: false });
    post({ type: 'input', data: payload });
  });
  term.onResize(({ cols, rows }) => post({ type: 'resize', cols, rows }));
  term.onSelectionChange(() => {
    selectionListeners.forEach((listener) => listener());
  });

  const registerLinkProviders = () => {
    if (!linkHandlers) return;

    const urlProvider: ILinkProvider = {
      provideLinks: (bufferLineNumber, callback) => {
        const line = term.buffer.active.getLine(bufferLineNumber);
        if (!line) {
          callback([]);
          return;
        }
        const lineStr = line.translateToString();
        const links: ILink[] = [];
        const urlRegex = /https?:\/\/[^\s]+/g;
        for (const match of lineStr.matchAll(urlRegex)) {
          const url = match[0];
          links.push({
            range: {
              start: { x: match.index! + 1, y: bufferLineNumber + 1 },
              end: { x: match.index! + url.length + 1, y: bufferLineNumber + 1 },
            },
            text: url,
            activate: () => linkHandlers!.openUrl(url),
          });
        }
        callback(links);
      },
    };

    const fileProvider: ILinkProvider = {
      provideLinks: (bufferLineNumber, callback) => {
        const line = term.buffer.active.getLine(bufferLineNumber);
        if (!line) {
          callback([]);
          return;
        }
        const lineStr = line.translateToString();
        const links: ILink[] = [];
        for (const match of lineStr.matchAll(FILE_LINE)) {
          const path = match[1]!;
          const lineNum = Number(match[2]!);
          // Try the cwd first, then repo root; a path printed after cd may miss (decision 10).
          const candidates = linkPathCandidates(path, cwd, cwd);
          const text = match[0];
          links.push({
            range: {
              start: { x: match.index! + 1, y: bufferLineNumber + 1 },
              end: { x: match.index! + text.length + 1, y: bufferLineNumber + 1 },
            },
            text,
            activate: () => linkHandlers!.openFile(candidates[0]!, lineNum),
          });
        }
        callback(links);
      },
    };

    term.registerLinkProvider(urlProvider);
    term.registerLinkProvider(fileProvider);
  };

  const fit = () => {
    if (!element.isConnected || element.clientWidth === 0 || element.clientHeight === 0) return;
    fitAddon.fit();
  };

  const connect = async () => {
    // A second attach while one is pending would double every byte the pty broadcasts.
    if (connecting || (socket && socket.readyState <= socket.OPEN)) return;
    connecting = true;
    setState({ status: { kind: 'starting' } });
    let next: WebSocket;
    try {
      next = await sidecarSocket('/pty', {
        id,
        cwd,
        cols: String(term.cols),
        rows: String(term.rows),
      });
    } catch (error) {
      setState({ status: { kind: 'lost', reason: (error as Error).message } });
      return;
    } finally {
      connecting = false;
    }
    socket = next;
    let exited = false;
    next.onopen = () => {
      // The sidecar replays the scrollback on a reattach; the buffer already holds it.
      if (attachedBefore) term.reset();
      attachedBefore = true;
      post({ type: 'resize', cols: term.cols, rows: term.rows });
    };
    next.onmessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as PtyServerMessage;
      switch (message.type) {
        case 'attached':
          setState({ status: { kind: 'running' } });
          break;
        case 'output':
          term.write(message.data);
          outputListeners.forEach((listener) => listener(id));
          break;
        case 'exit':
          exited = true;
          setState({ status: { kind: 'exited', code: message.code } });
          break;
      }
    };
    const lost = (reason: string) => {
      if (socket === next) socket = null;
      if (!exited && state.status.kind !== 'lost') setState({ status: { kind: 'lost', reason } });
    };
    // A refused connection (CSP, sidecar down) may fire error without a close.
    next.onerror = () => lost(`could not reach ${next.url}`);
    next.onclose = (event) => lost(event.reason || `connection closed (${event.code})`);
  };

  // An exited shell stays exited: Restart is the user's call, not the foreground's.
  const reattach = () => {
    if (state.status.kind === 'exited') return;
    const current = socket;
    socket = null;
    if (current) {
      current.onmessage = null;
      current.onerror = null;
      current.onclose = null;
      current.close();
    }
    void connect();
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    mount: (host) => {
      host.appendChild(element);
      if (!opened) {
        term.open(element);
        opened = true;
      }
      fit();
    },
    unmount: () => element.remove(),
    fit,
    connect: () => void connect(),
    reattach,
    input: (data) => term.input(data),
    paste: (text) => term.paste(text),
    setCtrl: (armed) => setState({ ctrl: armed }),
    focus: () => term.focus(),
    syncTheme: (variant) => {
      const root = window.getComputedStyle(document.documentElement);
      const token = (name: string) => root.getPropertyValue(name).trim();
      term.options.theme =
        variant === 'dark'
          ? MONOKAI_TERMINAL_THEME
          : {
              background: token('--color-background-primary'),
              foreground: token('--color-text-primary'),
              cursor: token('--color-text-primary'),
            };
      term.options.fontFamily = token('--font-mono') || 'monospace';
    },
    dispose: () => {
      socket?.close();
      sessions.delete(id);
      term.dispose();
    },
    setLinkHandlers: (handlers) => {
      linkHandlers = handlers;
      registerLinkProviders();
    },
    getSelection: () => term.getSelection(),
    hasSelection: () => term.hasSelection(),
    onSelectionChange: (listener) => {
      selectionListeners.add(listener);
      return () => selectionListeners.delete(listener);
    },
    search: searchAddon,
  };
}
