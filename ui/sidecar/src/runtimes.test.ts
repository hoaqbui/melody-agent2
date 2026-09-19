import { describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: vi.fn((cmd, args, opts, cb) => {
    // Default mock behavior for the route test
    if (cmd === 'claude') {
      cb(null, '{"loggedIn": true, "email": "test@example.com"}', '');
    } else if (cmd === 'codex') {
      cb(null, 'Logged in using ChatGPT', '');
    } else if (cmd === 'cursor-agent') {
      cb(null, 'Logged in as user@example.com', '');
    } else if (cmd === 'agy') {
      cb(null, 'Model 1\nModel 2\n', '');
    }
    return { kill: () => {} };
  }),
}));

// Import after mocking
import { runtimesRoutes } from './runtimes.js';
import { execFile } from 'node:child_process';

const mockExecFile = execFile as ReturnType<typeof vi.fn>;

describe('runtimesRoutes', () => {
  it('probes all four runtimes', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
      if (cmd === 'claude') {
        cb(null, '{"loggedIn": true, "email": "test@example.com"}', '');
      } else if (cmd === 'codex') {
        cb(null, 'Logged in using ChatGPT', '');
      } else if (cmd === 'cursor-agent') {
        cb(null, 'Logged in as user@example.com', '');
      } else if (cmd === 'agy') {
        cb(null, 'Model 1\nModel 2\n', '');
      }
      return { kill: () => {} };
    });

    const routes = runtimesRoutes();
    const probe = routes['POST /runtimes/probe'];
    expect(probe).toBeDefined();

    const result = (await probe({})) as any;

    expect(result.seat).toBeDefined();
    expect(result.seat.claude).toBeDefined();
    expect(result.seat.codex).toBeDefined();
    expect(result.seat.cursor).toBeDefined();
    expect(result.seat.agy).toBeDefined();
  });

  it('detects installed and signed in seats', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
      if (cmd === 'claude') {
        cb(null, '{"loggedIn": true, "email": "user@anthropic.com"}', '');
      } else if (cmd === 'codex') {
        cb(null, 'Logged in using OpenAI', '');
      } else if (cmd === 'cursor-agent') {
        cb(null, 'Logged in as cursor@example.com', '');
      } else if (cmd === 'agy') {
        cb(null, 'gpt-4\ngemini-pro\n', '');
      }
      return { kill: () => {} };
    });

    const routes = runtimesRoutes();
    const probe = routes['POST /runtimes/probe'];

    const result = (await probe({})) as any;

    expect(result.seat.claude.installed).toBe(true);
    expect(result.seat.claude.signedIn).toBe(true);
    expect(result.seat.codex.installed).toBe(true);
    expect(result.seat.codex.signedIn).toBe(true);
    expect(result.seat.cursor.installed).toBe(true);
    expect(result.seat.cursor.signedIn).toBe(true);
    expect(result.seat.agy.installed).toBe(true);
    expect(result.seat.agy.signedIn).toBe(true);
  });

  it('reads exit 127 as not installed, as a shell would', async () => {
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (e: unknown, o: string, r: string) => void
      ) => {
        const err = Object.assign(new Error('not found'), { code: 127 });
        cb(cmd === 'cursor-agent' ? err : null, cmd === 'cursor-agent' ? '' : 'ok', '');
        return { kill: () => {} };
      }
    );
    const result = (await runtimesRoutes()['POST /runtimes/probe']({})) as {
      seat: Record<string, { installed: boolean }>;
    };
    expect(result.seat.cursor.installed).toBe(false);
    expect(result.seat.claude.installed).toBe(true);
  });

  it('detects missing binaries', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
      const err = new Error('not found');
      (err as any).code = 'ENOENT';
      cb(err, '', '');
      return { kill: () => {} };
    });

    const routes = runtimesRoutes();
    const probe = routes['POST /runtimes/probe'];

    const result = (await probe({})) as any;

    expect(result.seat.claude.installed).toBe(false);
    expect(result.seat.claude.signedIn).toBe(false);
    expect(result.seat.codex.installed).toBe(false);
    expect(result.seat.cursor.installed).toBe(false);
    expect(result.seat.agy.installed).toBe(false);
  });

  it('detects signed out seats', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
      if (cmd === 'claude') {
        cb(null, '{"loggedIn": false}', '');
      } else if (cmd === 'codex') {
        cb(new Error('not logged in'), '', 'Error: not logged in');
      } else if (cmd === 'cursor-agent') {
        cb(new Error('not signed in'), '', 'Not signed in');
      } else if (cmd === 'agy') {
        cb(new Error('no auth'), '', 'Authentication required');
      }
      return { kill: () => {} };
    });

    const routes = runtimesRoutes();
    const probe = routes['POST /runtimes/probe'];

    const result = (await probe({})) as any;

    expect(result.seat.claude.installed).toBe(true);
    expect(result.seat.claude.signedIn).toBe(false);
    expect(result.seat.codex.installed).toBe(true);
    expect(result.seat.codex.signedIn).toBe(false);
    expect(result.seat.cursor.installed).toBe(true);
    expect(result.seat.cursor.signedIn).toBe(false);
    expect(result.seat.agy.installed).toBe(true);
    expect(result.seat.agy.signedIn).toBe(false);
  });

  it('includes detail from output', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], opts: any, cb: any) => {
      if (cmd === 'claude') {
        cb(null, '{"loggedIn": true, "email": "test@example.com"}', '');
      } else if (cmd === 'codex') {
        cb(null, 'Logged in as user@openai.com\nVersion: 1.2.3', '');
      } else if (cmd === 'cursor-agent') {
        cb(new Error('error'), '', 'Authentication failed\nPlease run: cursor-agent login');
      } else if (cmd === 'agy') {
        cb(null, 'Model list follows:\nmodel1\nmodel2', '');
      }
      return { kill: () => {} };
    });

    const routes = runtimesRoutes();
    const probe = routes['POST /runtimes/probe'];

    const result = (await probe({})) as any;

    expect(result.seat.claude.detail).toBe('test@example.com');
    expect(result.seat.codex.detail).toBe('Logged in as user@openai.com');
    expect(result.seat.cursor.detail).toBe('Authentication failed');
    expect(result.seat.agy.detail).toBe('Model list follows:');
  });
});
