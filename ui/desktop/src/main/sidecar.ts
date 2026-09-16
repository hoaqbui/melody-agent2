import { utilityProcess } from 'electron';
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
  loginShellPath: string | null;
  logger: Logger;
}

export interface SidecarResult {
  url: string;
  cleanup: () => void;
}

const LISTENING_PREFIX = 'SIDECAR_LISTENING=';

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

// The RunAsNode fuse is off in packaged builds, so the sidecar runs as an
// Electron utility process rather than a `node` child; node-pty is N-API and
// loads there unchanged.
export const startSidecar = (options: StartSidecarOptions): Promise<SidecarResult> =>
  new Promise((resolve, reject) => {
    const args = [
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
    ];
    const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
    const child = utilityProcess.fork(options.entry, args, {
      stdio: 'pipe',
      serviceName: 'sidecar',
      env: {
        ...process.env,
        [pathKey]: [process.env[pathKey], options.loginShellPath]
          .filter(Boolean)
          .join(path.delimiter),
        GOOSE_SERVER__SECRET_KEY: options.serverSecret,
      },
    });

    let listening = false;
    child.stdout?.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.startsWith(LISTENING_PREFIX) && !listening) {
          listening = true;
          resolve({ url: line.slice(LISTENING_PREFIX.length).trim(), cleanup: () => child.kill() });
        }
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
