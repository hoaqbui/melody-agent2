import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SIDECAR_PORT,
  gooseHttpOrigin,
  phoneSidecarUrl,
  rendererOrigins,
  rendererSidecarUrl,
  sidecarArgs,
  sidecarEntryPath,
  sidecarEnv,
  sidecarPortSetting,
  startSidecar,
  type StartSidecarOptions,
  withSidecarKey,
} from './sidecar';

// A fake utility process per fork: an `exit` with a code, or the sidecar's listening lines.
type Script = { exit: number } | { listening: string[] };
const scripts: Script[] = [];
const forks: string[][] = [];

vi.mock('electron', () => ({
  utilityProcess: {
    fork: (_entry: string, args: string[]) => {
      forks.push(args);
      const script = scripts.shift();
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: vi.fn(),
      });
      process.nextTick(() => {
        if (!script) throw new Error('unscripted fork');
        if ('exit' in script) {
          child.stderr.emit('data', Buffer.from('failed to bind 127.0.0.1:7788: EADDRINUSE'));
          child.emit('exit', script.exit);
        } else {
          child.stdout.emit(
            'data',
            Buffer.from(script.listening.map((url) => `SIDECAR_LISTENING=${url}`).join('\n'))
          );
        }
      });
      return child;
    },
  },
}));

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
  port: DEFAULT_SIDECAR_PORT,
  logger: { info: () => {}, error: () => {} },
};

beforeEach(() => {
  scripts.length = 0;
  forks.length = 0;
});

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

describe('phoneSidecarUrl', () => {
  it('picks the tailnet listener and nothing without one', () => {
    expect(phoneSidecarUrl(['http://100.127.56.10:7788', 'http://127.0.0.1:7788'])).toBe(
      'http://100.127.56.10:7788'
    );
    expect(phoneSidecarUrl(['http://127.0.0.1:7788'])).toBeNull();
  });
});

describe('sidecarPortSetting', () => {
  it('takes a port in range and defaults everything else', () => {
    expect(sidecarPortSetting(7788)).toBe(7788);
    expect(sidecarPortSetting(0)).toBe(0);
    expect(sidecarPortSetting(65535)).toBe(65535);
    expect(sidecarPortSetting(undefined)).toBe(DEFAULT_SIDECAR_PORT);
    expect(sidecarPortSetting('7788')).toBe(DEFAULT_SIDECAR_PORT);
    expect(sidecarPortSetting(65536)).toBe(DEFAULT_SIDECAR_PORT);
    expect(sidecarPortSetting(7788.5)).toBe(DEFAULT_SIDECAR_PORT);
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
      '7788',
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

describe('startSidecar', () => {
  it('keys every listener on the fixed port', async () => {
    scripts.push({ listening: ['http://100.127.56.10:7788', 'http://127.0.0.1:7788'] });
    const result = await startSidecar(options);
    expect(forks).toEqual([sidecarArgs(options)]);
    expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:7788\/\?key=[0-9a-f]{64}$/);
    expect(phoneSidecarUrl(result.urls)).toMatch(/^http:\/\/100\.127\.56\.10:7788\/\?key=/);
  });

  it('falls back to port 0 when the bind fails, and says so', async () => {
    const info = vi.fn();
    scripts.push({ exit: 2 }, { listening: ['http://127.0.0.1:64041'] });
    const result = await startSidecar({ ...options, logger: { info, error: () => {} } });
    expect(forks.map((args) => args[1])).toEqual(['7788', '0']);
    expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:64041\//);
    expect(info).toHaveBeenCalledWith('sidecar port 7788 taken, using 64041');
  });

  it('does not retry a port-0 launch or any other exit', async () => {
    scripts.push({ exit: 2 });
    await expect(startSidecar({ ...options, port: 0 })).rejects.toThrow('exited with code 2');
    scripts.push({ exit: 1 });
    await expect(startSidecar(options)).rejects.toThrow('exited with code 1');
    expect(forks).toHaveLength(2);
  });
});
