import { describe, expect, it } from 'vitest';

import {
  gooseHttpOrigin,
  rendererOrigins,
  rendererSidecarUrl,
  sidecarArgs,
  sidecarEntryPath,
  sidecarEnv,
  type StartSidecarOptions,
  withSidecarKey,
} from './sidecar';

const options: StartSidecarOptions = {
  entry: '/repo/ui/sidecar/dist/index.js',
  cwd: '/work',
  gooseUrl: 'https://127.0.0.1:52301',
  gooseCertFingerprint: null,
  serverSecret: 's3cret',
  version: '1.51.0',
  staticDir: null,
  allowedOrigins: [],
  loginShellPath: null,
  logger: { info: () => {}, error: () => {} },
};

describe('withSidecarKey', () => {
  it('puts the key on the root of each listener so the phone and the renderer get one URL', () => {
    const key = 'ab'.repeat(32);
    expect(withSidecarKey('http://127.0.0.1:64041', key)).toBe(
      `http://127.0.0.1:64041/?key=${key}`
    );
    expect(withSidecarKey('http://100.127.56.10:64041', key)).toBe(
      `http://100.127.56.10:64041/?key=${key}`
    );
  });
});

describe('sidecarEnv', () => {
  it("passes the sidecar key and goose serve's secret as separate variables", () => {
    const env = sidecarEnv(options, 'k3y', { PATH: '/usr/bin', HOME: '/Users/me' });
    expect(env.SIDECAR_SECRET).toBe('k3y');
    expect(env.GOOSE_SERVER__SECRET_KEY).toBe('s3cret');
    expect(env.HOME).toBe('/Users/me');
    expect(env.PATH).toBe('/usr/bin');
  });

  it('appends the login shell PATH after the process PATH', () => {
    const env = sidecarEnv({ ...options, loginShellPath: '/opt/homebrew/bin' }, 'k3y', {
      PATH: '/usr/bin',
    });
    expect(env.PATH).toBe('/usr/bin:/opt/homebrew/bin');
  });
});

describe('rendererSidecarUrl', () => {
  it('leases the loopback listener to the renderer whatever order the sidecar prints', () => {
    expect(rendererSidecarUrl(['http://100.127.56.10:64041', 'http://127.0.0.1:64041'])).toBe(
      'http://127.0.0.1:64041'
    );
    expect(rendererSidecarUrl(['http://127.0.0.1:64041', 'http://100.127.56.10:64041'])).toBe(
      'http://127.0.0.1:64041'
    );
  });

  it('falls back to the only listener of an explicit --bind', () => {
    expect(rendererSidecarUrl(['http://127.0.0.1:3285'])).toBe('http://127.0.0.1:3285');
    expect(rendererSidecarUrl(['http://100.127.56.10:3285'])).toBe('http://100.127.56.10:3285');
    expect(rendererSidecarUrl([])).toBeUndefined();
  });
});

describe('gooseHttpOrigin', () => {
  it('drops the token and path from the goose serve ACP URL', () => {
    expect(gooseHttpOrigin('wss://127.0.0.1:52301/acp?token=s3cret')).toBe(
      'https://127.0.0.1:52301'
    );
    expect(gooseHttpOrigin('ws://127.0.0.1:3284/acp?token=s3cret')).toBe('http://127.0.0.1:3284');
  });
});

describe('sidecarEntryPath', () => {
  it('reads the workspace build in development and the bundled resource when packaged', () => {
    expect(sidecarEntryPath(false, '/repo/ui/desktop', '/unused')).toBe(
      '/repo/ui/sidecar/dist/index.js'
    );
    expect(
      sidecarEntryPath(true, '/App/Contents/Resources/app.asar', '/App/Contents/Resources')
    ).toBe('/App/Contents/Resources/sidecar/index.mjs');
  });
});

describe('rendererOrigins', () => {
  it('lists the Vite dev server origin and nothing for the packaged file URL', () => {
    expect(rendererOrigins(new URL('http://localhost:5173/'))).toEqual(['http://localhost:5173']);
    expect(rendererOrigins(new URL('file:///App/Contents/Resources/app.asar/index.html'))).toEqual(
      []
    );
  });
});

describe('sidecarArgs', () => {
  it('passes each allowed origin as its own --allowed-origin flag', () => {
    expect(
      sidecarArgs({ ...options, allowedOrigins: ['http://localhost:5173', 'http://mac:5173'] })
    ).toEqual([
      '--port',
      '0',
      '--cwd',
      '/work',
      '--goose-url',
      'https://127.0.0.1:52301',
      '--goose-version',
      '1.51.0',
      '--allowed-origin',
      'http://localhost:5173',
      '--allowed-origin',
      'http://mac:5173',
    ]);
  });

  it('passes no --allowed-origin for a packaged file:// renderer', () => {
    expect(sidecarArgs(options)).not.toContain('--allowed-origin');
  });

  it("never puts goose serve's secret on the command line", () => {
    expect(sidecarArgs(options).join(' ')).not.toContain('s3cret');
  });
});
