import { execFile } from 'node:child_process';

import type { JsonHandler } from './http.js';

interface SeatProbe {
  installed: boolean;
  signedIn: boolean;
  detail?: string;
}

const PROBE_TIMEOUT_MS = 5000;
const SIGNED_OUT = /not (logged|signed) in/i;

// Four fixed argv arrays — never a shell, never anything from the request (plan §Security lens).
const PROBES = {
  claude: ['claude', ['auth', 'status', '--json']],
  codex: ['codex', ['login', 'status']],
  cursor: ['cursor-agent', ['status']],
  agy: ['agy', ['models']],
} as const;

const firstLine = (text: string): string | undefined => text.trim().split('\n')[0] || undefined;

// `claude auth status --json` is the one structured answer ({loggedIn, email}; claude 2.x, 2026-09);
// the other three print a sentence, read for its sign-out words.
const readSignedIn = (command: string, stdout: string): Omit<SeatProbe, 'installed'> => {
  if (command === 'claude') {
    try {
      const parsed = JSON.parse(stdout) as { loggedIn?: boolean; email?: string };
      return { signedIn: parsed.loggedIn === true, detail: parsed.email };
    } catch {
      // an older claude prints a sentence instead
    }
  }
  const line = firstLine(stdout);
  return { signedIn: line !== undefined && !SIGNED_OUT.test(stdout), detail: line };
};

const probe = (command: string, args: readonly string[]): Promise<SeatProbe> =>
  new Promise((resolve) => {
    execFile(command, [...args], { timeout: PROBE_TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        resolve({ installed: false, signedIn: false });
        return;
      }
      if (error) {
        const detail = error.killed
          ? 'timed out'
          : (firstLine(stderr) ?? firstLine(stdout) ?? error.message);
        resolve({ installed: true, signedIn: false, detail });
        return;
      }
      resolve({ installed: true, ...readSignedIn(command, stdout) });
    });
  });

export const runtimesRoutes = (): Record<string, JsonHandler> => ({
  'POST /runtimes/probe': async () => {
    const seats = await Promise.all(
      Object.entries(PROBES).map(async ([seat, [command, args]]) => [
        seat,
        await probe(command, args),
      ])
    );
    return { seat: Object.fromEntries(seats) };
  },
});
