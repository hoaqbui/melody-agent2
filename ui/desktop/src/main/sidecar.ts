import { utilityProcess } from 'electron';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import type { Logger } from '../gooseServe';

export interface StartSidecarOptions {
  entry: string;
  cwd: string;
  /** goose serve's HTTP origin on loopback, without the token. */
  gooseUrl: string;
  gooseCertFingerprint: string | null;
  serverSecret: string;
  version: string;
  staticDir: string | null;
  /** Renderer origins the sidecar answers CORS for; see rendererOrigins. */
  allowedOrigins: string[];
  loginShellPath: string | null;
  logger: Logger;
}

export interface SidecarResult {
  /** The listener the renderer uses: loopback, which its connect-src already names, with `?key=`. */
  url: string;
  /** Every listener with `?key=`, the tailnet one included — the phone's URL. */
  urls: string[];
  cleanup: () => void;
}

const LISTENING_PREFIX = 'SIDECAR_LISTENING=';

const isLoopbackUrl = (url: string): boolean => {
  const { hostname } = new URL(url);
  return hostname === '127.0.0.1' || hostname === '[::1]' || hostname === 'localhost';
};

// The sidecar prints one SIDECAR_LISTENING= line per listener, in one write, so the
// tailnet and loopback lines land in the same chunk; the renderer takes loopback.
export const rendererSidecarUrl = (urls: string[]): string | undefined =>
  urls.find(isLoopbackUrl) ?? urls[0];

export const sidecarEntryPath = (
  isPackaged: boolean,
  appPath: string,
  resourcesPath: string
): string =>
  isPackaged
    ? path.join(resourcesPath, 'sidecar', 'index.mjs')
    : path.resolve(appPath, '..', 'sidecar', 'dist', 'index.js');

export const gooseHttpOrigin = (acpUrl: string): string => {
  const url = new URL(acpUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/';
  url.search = '';
  return url.origin;
};

// Only an http(s) renderer — the Vite dev server — is cross-origin to the
// sidecar. A packaged file:// renderer has an opaque origin and Electron 43.4.0
// sends no Origin header from it, so it needs no CORS entry (probed 2026-09-15);
// listing `null` would admit every opaque origin, the wildcard the sidecar refuses.
export const rendererOrigins = (appUrl: URL): string[] =>
  appUrl.origin === 'null' ? [] : [appUrl.origin];

// The key rides in the URL rather than beside it so the Electron renderer and the
// phone's web build hand `native/sidecar.ts` the same string.
export const withSidecarKey = (url: string, key: string): string => {
  const keyed = new URL(url);
  keyed.pathname = '/';
  keyed.searchParams.set('key', key);
  return keyed.toString();
};

// Both secrets go by environment, not argv: `ps` shows every user the sidecar's
// arguments, the environment only its owner's.
export const sidecarEnv = (
  options: StartSidecarOptions,
  key: string,
  processEnv: Record<string, string | undefined>
): Record<string, string | undefined> => {
  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
  return {
    ...processEnv,
    [pathKey]: [processEnv[pathKey], options.loginShellPath].filter(Boolean).join(path.delimiter),
    GOOSE_SERVER__SECRET_KEY: options.serverSecret,
    SIDECAR_SECRET: key,
  };
};

export const sidecarArgs = (options: StartSidecarOptions): string[] => [
  '--port',
  '0',
  '--cwd',
  options.cwd,
  '--goose-url',
  options.gooseUrl,
  '--goose-version',
  options.version,
  ...(options.gooseCertFingerprint
    ? ['--goose-cert-fingerprint', options.gooseCertFingerprint]
    : []),
  ...(options.staticDir ? ['--static', options.staticDir] : []),
  ...options.allowedOrigins.flatMap((origin) => ['--allowed-origin', origin]),
];

// The RunAsNode fuse is off in packaged builds, so the sidecar runs as an
// Electron utility process rather than a `node` child; node-pty is N-API and
// loads there unchanged.
export const startSidecar = (options: StartSidecarOptions): Promise<SidecarResult> =>
  new Promise((resolve, reject) => {
    const key = randomBytes(32).toString('hex');
    const child = utilityProcess.fork(options.entry, sidecarArgs(options), {
      stdio: 'pipe',
      serviceName: 'sidecar',
      env: sidecarEnv(options, key, process.env),
    });

    let listening = false;
    child.stdout?.on('data', (chunk: Buffer) => {
      if (listening) {
        return;
      }
      const urls = chunk
        .toString()
        .split('\n')
        .filter((line) => line.startsWith(LISTENING_PREFIX))
        .map((line) => line.slice(LISTENING_PREFIX.length).trim());
      const url = rendererSidecarUrl(urls);
      if (url) {
        listening = true;
        resolve({
          url: withSidecarKey(url, key),
          urls: urls.map((listener) => withSidecarKey(listener, key)),
          cleanup: () => child.kill(),
        });
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      options.logger.error('[sidecar]', chunk.toString().trim());
    });
    child.once('exit', (code) => {
      if (!listening) {
        reject(new Error(`sidecar exited with code ${code} before listening`));
      }
    });
  });
