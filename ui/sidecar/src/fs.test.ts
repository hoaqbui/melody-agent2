import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fsRoutes } from './fs.js';
import { HttpError } from './http.js';

const sh = (cwd: string, args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(stdout);
    });
  });

const initRepo = async (dir: string): Promise<void> => {
  await sh(dir, ['init', '-q', '-b', 'main']);
  await sh(dir, ['config', 'user.name', 'sidecar test']);
  await sh(dir, ['config', 'user.email', 'sidecar@test.invalid']);
  await sh(dir, ['config', 'commit.gpgsign', 'false']);
};

const failure = async (promise: Promise<unknown>): Promise<HttpError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpError) return error;
    throw error;
  }
  throw new Error('expected the route to fail');
};

describe('fsRoutes', () => {
  let scratch: string;
  let repo: string;
  let outside: string;
  let routes: ReturnType<typeof fsRoutes>;

  beforeAll(async () => {
    scratch = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sidecar-fs-')));
    repo = path.join(scratch, 'repo');
    outside = path.join(scratch, 'outside');
    await mkdir(path.join(repo, 'sub'), { recursive: true });
    await mkdir(outside);
    await initRepo(repo);
    await writeFile(path.join(repo, 'a.txt'), 'one\ntwo\nthree\n');
    await writeFile(path.join(repo, 'sub', 'b.txt'), 'b\n');
    await initRepo(outside);
    routes = fsRoutes(repo);
  });

  afterAll(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  describe('path guard', () => {
    it('lists files in the repo root', async () => {
      const listed = (await routes['POST /fs/list']({ path: '.' })) as {
        path: string;
        entries: { name: string; type: string }[];
      };
      expect(listed.path).toBe(repo);
      expect(listed.entries.map((e) => e.name)).toContain('a.txt');
    });

    it('reads a file inside the repo', async () => {
      const read = (await routes['POST /fs/read']({ path: 'a.txt' })) as {
        path: string;
        content: string;
      };
      expect(read.path).toBe(path.join(repo, 'a.txt'));
      expect(read.content).toBe('one\ntwo\nthree\n');
    });

    it('reads a file in a subdirectory', async () => {
      const read = (await routes['POST /fs/read']({ path: 'sub/b.txt' })) as {
        path: string;
        content: string;
      };
      expect(read.path).toBe(path.join(repo, 'sub', 'b.txt'));
      expect(read.content).toBe('b\n');
    });

    it('writes and lists a file in a new subdirectory', async () => {
      await routes['POST /fs/write']({ path: 'new-dir/new.txt', content: 'new\n' });
      const written = (await readFile(path.join(repo, 'new-dir', 'new.txt'), 'utf8')) as string;
      expect(written).toBe('new\n');

      const listed = (await routes['POST /fs/list']({ path: 'new-dir' })) as {
        entries: { name: string }[];
      };
      expect(listed.entries.map((e) => e.name)).toContain('new.txt');
      await rm(path.join(repo, 'new-dir'), { recursive: true });
    });

    it('refuses to list a path outside the toplevel with 400', async () => {
      const error = await failure(routes['POST /fs/list']({ path: outside }));
      expect(error.status).toBe(400);
      expect(error.message).toContain('outside the repository');
    });

    it('refuses to read a path outside the toplevel with 400', async () => {
      const error = await failure(routes['POST /fs/read']({ path: '../outside/file.txt' }));
      expect(error.status).toBe(400);
      expect(error.message).toContain('outside the repository');
    });

    it('refuses to write a path outside the toplevel with 400', async () => {
      const error = await failure(
        routes['POST /fs/write']({ path: '../outside/file.txt', content: 'x\n' })
      );
      expect(error.status).toBe(400);
      expect(error.message).toContain('outside the repository');
    });

    it('refuses a symlinked path that leaves the toplevel with 400', async () => {
      await symlink(outside, path.join(repo, 'link'));
      const error = await failure(routes['POST /fs/list']({ path: 'link' }));
      expect(error.status).toBe(400);
      expect(error.message).toContain('outside the repository');
      await rm(path.join(repo, 'link'));
    });

    it('refuses a non-string path with 400', async () => {
      expect((await failure(routes['POST /fs/list']({ path: 7 }))).status).toBe(400);
    });
  });
});
