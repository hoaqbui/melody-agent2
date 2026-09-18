import { execFile } from 'node:child_process';
import type { JsonHandler } from './http.js';

interface SeatProbe {
  installed: boolean;
  signedIn: boolean;
  detail?: string;
}

interface RuntimesProbeResponse {
  seat: Record<string, SeatProbe>;
}

const PROBE_TIMEOUT_MS = 5000;

const probeCommand = (command: string, args: string[]): Promise<SeatProbe> =>
  new Promise((resolve) => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, PROBE_TIMEOUT_MS);

    const child = execFile(command, args, { timeout: PROBE_TIMEOUT_MS }, (error, stdout, stderr) => {
      clearTimeout(timeout);

      if (timedOut) {
        resolve({ installed: true, signedIn: false, detail: 'timeout' });
        return;
      }

      if (error?.code === 'ENOENT') {
        resolve({ installed: false, signedIn: false });
        return;
      }

      if (error) {
        const output = stderr.trim() || stdout.trim();
        const detail = output.split('\n')[0] || error.message;
        resolve({ installed: true, signedIn: false, detail });
        return;
      }

      const output = stdout.trim();

      try {
        // Parse the JSON response from claude auth status --json
        if (command === 'claude') {
          const parsed = JSON.parse(output);
          const signedIn = parsed.loggedIn === true;
          const detail = signedIn ? parsed.email : undefined;
          resolve({ installed: true, signedIn, detail });
          return;
        }
      } catch {
        // Fall through to text parsing
      }

      // For text-based responses, use the output as detail
      const signedIn =
        output.length > 0 &&
        !output.toLowerCase().includes('not logged in') &&
        !output.toLowerCase().includes('not signed in');
      const detail = output.split('\n')[0] || undefined;
      resolve({ installed: true, signedIn, detail });
    });
  });

export const runtimesRoutes = (): Record<string, JsonHandler> => ({
  'POST /runtimes/probe': async () => {
    const results = await Promise.all([
      probeCommand('claude', ['auth', 'status', '--json']),
      probeCommand('codex', ['login', 'status']),
      probeCommand('cursor-agent', ['status']),
      probeCommand('agy', ['models']),
    ]);

    return {
      seat: {
        claude: results[0],
        codex: results[1],
        cursor: results[2],
        agy: results[3],
      },
    } as RuntimesProbeResponse;
  },
});
