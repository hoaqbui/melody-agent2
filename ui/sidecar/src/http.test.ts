import { createServer, type IncomingMessage, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  corsHeaders,
  jsonDispatcher,
  keyMatches,
  requestHasKey,
  sendText,
  SIDECAR_KEY_HEADER,
  upgradeHasKey,
} from './http.js';

const ALLOWED = 'http://localhost:5173';
const UNLISTED = 'http://evil.example';
const SECRET = 'a'.repeat(64);
const KEYED = { [SIDECAR_KEY_HEADER]: SECRET };
const ALLOWED_HEADERS = `content-type, ${SIDECAR_KEY_HEADER}`;

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
}

const send = (
  port: number,
  method: string,
  path: string,
  headers: Record<string, string>
): Promise<Reply> =>
  new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers }));
    });
    req.on('error', reject);
    req.end(method === 'POST' ? '{}' : undefined);
  });

describe('jsonDispatcher', () => {
  let server: Server;
  let port = 0;
  let handled = 0;

  beforeAll(async () => {
    const routes = {
      'POST /fs/list': async () => {
        handled += 1;
        return { entries: [] };
      },
    };
    const dispatch = jsonDispatcher(routes, [ALLOWED], SECRET);
    server = createServer((request, response) => {
      if (!dispatch(request, response)) {
        sendText(response, 404, 'not found', corsHeaders(request, [ALLOWED]));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });

  afterAll(() => {
    server.close();
  });

  it('answers a listed origin with its CORS headers on a JSON route', async () => {
    const reply = await send(port, 'POST', '/fs/list', {
      ...KEYED,
      origin: ALLOWED,
      'content-type': 'application/json',
    });
    expect(reply.status).toBe(200);
    expect(reply.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(reply.headers['access-control-allow-headers']).toBe(ALLOWED_HEADERS);
  });

  it('answers a listed origin preflight with 204 and no key, naming the key header', async () => {
    const reply = await send(port, 'OPTIONS', '/fs/list', {
      origin: ALLOWED,
      'access-control-request-method': 'POST',
    });
    expect(reply.status).toBe(204);
    expect(reply.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(reply.headers['access-control-allow-headers']).toBe(ALLOWED_HEADERS);
  });

  it('gives an unlisted origin no CORS header and no preflight', async () => {
    const post = await send(port, 'POST', '/fs/list', {
      ...KEYED,
      origin: UNLISTED,
      'content-type': 'application/json',
    });
    expect(post.status).toBe(200);
    expect(post.headers['access-control-allow-origin']).toBeUndefined();

    const preflight = await send(port, 'OPTIONS', '/fs/list', {
      origin: UNLISTED,
      'access-control-request-method': 'POST',
    });
    expect(preflight.status).toBe(404);
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('leaves a keyless GET off the routes to the caller, so the static build stays open', async () => {
    const reply = await send(port, 'GET', '/', {});
    expect(reply.status).toBe(404);
  });

  it('leaves a preflight for an unknown route to the caller', async () => {
    const reply = await send(port, 'OPTIONS', '/nope', {
      origin: ALLOWED,
      'access-control-request-method': 'POST',
    });
    expect(reply.status).toBe(404);
  });

  it('rejects a non-JSON content type with 415 before the handler runs', async () => {
    const before = handled;
    const plain = await send(port, 'POST', '/fs/list', {
      ...KEYED,
      origin: UNLISTED,
      'content-type': 'text/plain',
    });
    expect(plain.status).toBe(415);
    expect(plain.headers['access-control-allow-origin']).toBeUndefined();

    const untyped = await send(port, 'POST', '/fs/list', { ...KEYED, origin: UNLISTED });
    expect(untyped.status).toBe(415);
    expect(handled).toBe(before);
  });

  it('answers 401 without the key before the content type or the handler is looked at', async () => {
    const before = handled;
    const missing = await send(port, 'POST', '/fs/list', {
      origin: ALLOWED,
      'content-type': 'application/json',
    });
    expect(missing.status).toBe(401);
    expect(missing.headers['access-control-allow-origin']).toBe(ALLOWED);

    const untyped = await send(port, 'POST', '/fs/list', { origin: ALLOWED });
    expect(untyped.status).toBe(401);
    expect(handled).toBe(before);
  });

  it('answers 401 to a wrong key of the same length and of another length', async () => {
    const before = handled;
    const sameLength = await send(port, 'POST', '/fs/list', {
      [SIDECAR_KEY_HEADER]: 'b'.repeat(64),
      'content-type': 'application/json',
    });
    expect(sameLength.status).toBe(401);

    const shorter = await send(port, 'POST', '/fs/list', {
      [SIDECAR_KEY_HEADER]: SECRET.slice(1),
      'content-type': 'application/json',
    });
    expect(shorter.status).toBe(401);
    expect(handled).toBe(before);
  });

  it('accepts application/json with a charset parameter', async () => {
    const before = handled;
    const reply = await send(port, 'POST', '/fs/list', {
      ...KEYED,
      origin: ALLOWED,
      'content-type': 'Application/JSON; charset=utf-8',
    });
    expect(reply.status).toBe(200);
    expect(handled).toBe(before + 1);
  });
});

describe('keyMatches', () => {
  it('accepts only the exact key', () => {
    expect(keyMatches(SECRET, SECRET)).toBe(true);
    expect(keyMatches(SECRET, 'b'.repeat(64))).toBe(false);
    expect(keyMatches(SECRET, `${SECRET}a`)).toBe(false);
    expect(keyMatches(SECRET, '')).toBe(false);
    expect(keyMatches(SECRET, null)).toBe(false);
  });
});

describe('requestHasKey and upgradeHasKey', () => {
  const request = (url: string, headers: Record<string, string> = {}): IncomingMessage =>
    ({ url, headers }) as unknown as IncomingMessage;

  it('reads a fetch key from the header, never from the query', () => {
    expect(requestHasKey(request('/fs/list', KEYED), SECRET)).toBe(true);
    expect(requestHasKey(request(`/fs/list?key=${SECRET}`), SECRET)).toBe(false);
  });

  it('reads an upgrade key from ?key=, never from the header', () => {
    expect(upgradeHasKey(request(`/pty?key=${SECRET}&id=abc`), SECRET)).toBe(true);
    expect(upgradeHasKey(request('/pty?id=abc', KEYED), SECRET)).toBe(false);
    expect(upgradeHasKey(request('/pty?key='), SECRET)).toBe(false);
  });
});
