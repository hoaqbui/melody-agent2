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
  /** The fixed port the phone bookmarks; 0 lets the OS pick. */
  port: number;
  logger: Logger;
}

export interface SidecarResult {
  /** The listener the renderer uses: loopback, which its connect-src already names, with `?key=`. */
  url: string;
  /** Every listener with `?key=`, the tailnet one included — the phone's URL. */
  urls: string[];
  cleanup: () => void;
}

export const DEFAULT_SIDECAR_PORT = 7788;

const LISTENING_PREFIX = 'SIDECAR_LISTENING=';
// ui/sidecar/src/index.ts exits 2 when a bind fails (and on its refusals, which a retry
// repeats harmlessly).
const SIDECAR_EXIT_BIND_FAILED = 2;

const isLoopbackUrl = (url: string): boolean => {
  const { hostname } = new URL(url);
  return hostname === '127.0.0.1' || hostname === '[::1]' || hostname === 'localhost';
};

// The sidecar prints one SIDECAR_LISTENING= line per listener, in one write, so the
// tailnet and loopback lines land in the same chunk; the renderer takes loopback.
export const rendererSidecarUrl = (urls: string[]): string | undefined =>
  urls.find(isLoopbackUrl) ?? urls[0];

// The listener a phone can reach; null without a tailnet.
export const phoneSidecarUrl = (urls: string[]): string | null =>
  urls.find((url) => !isLoopbackUrl(url)) ?? null;

// settings.json is a real input: anything but a port in range means the default.
export const sidecarPortSetting = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 65535
    ? value
    : DEFAULT_SIDECAR_PORT;

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
  String(options.port),
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

class SidecarExit extends Error {
  constructor(readonly code: number | undefined) {
    super(`sidecar exited with code ${code} before listening`);
  }
}

// The RunAsNode fuse is off in packaged builds, so the sidecar runs as an
// Electron utility process rather than a `node` child; node-pty is N-API and
// loads there unchanged.
const spawnSidecar = (options: StartSidecarOptions): Promise<SidecarResult> =>
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
        reject(new SidecarExit(code));
      }
    });
  });

// The fixed port is what the phone bookmarks; another launch (a second checkout, a
// second window) may hold it, and then any port beats no sidecar.
export const startSidecar = async (options: StartSidecarOptions): Promise<SidecarResult> => {
  try {
    return await spawnSidecar(options);
  } catch (error) {
    if (
      !(error instanceof SidecarExit) ||
      error.code !== SIDECAR_EXIT_BIND_FAILED ||
      !options.port
    ) {
      throw error;
    }
    const fallback = await spawnSidecar({ ...options, port: 0 });
    options.logger.info(`sidecar port ${options.port} taken, using ${new URL(fallback.url).port}`);
    return fallback;
  }
};
