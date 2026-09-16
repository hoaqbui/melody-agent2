import { createServer, request as httpRequest, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { corsHeaders, jsonDispatcher, sendText } from './http.js';

const ALLOWED = 'http://localhost:5173';
const UNLISTED = 'http://evil.example';

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

  beforeAll(async () => {
    const routes = { 'POST /fs/list': async () => ({ entries: [] }) };
    const dispatch = jsonDispatcher(routes, [ALLOWED]);
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
      origin: ALLOWED,
      'content-type': 'application/json',
    });
    expect(reply.status).toBe(200);
    expect(reply.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(reply.headers['access-control-allow-headers']).toBe('content-type');
  });

  it('answers a listed origin preflight with 204', async () => {
    const reply = await send(port, 'OPTIONS', '/fs/list', {
      origin: ALLOWED,
      'access-control-request-method': 'POST',
    });
    expect(reply.status).toBe(204);
    expect(reply.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(reply.headers['access-control-allow-headers']).toBe('content-type');
  });

  it('gives an unlisted origin no CORS header and no preflight', async () => {
    const post = await send(port, 'POST', '/fs/list', {
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

  it('leaves a preflight for an unknown route to the caller', async () => {
    const reply = await send(port, 'OPTIONS', '/nope', {
      origin: ALLOWED,
      'access-control-request-method': 'POST',
    });
    expect(reply.status).toBe(404);
  });
});
