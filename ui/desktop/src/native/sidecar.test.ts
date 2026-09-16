import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sidecarBaseUrl, sidecarFetch, sidecarSocket } from './sidecar';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const getSidecarUrl = vi.fn<() => Promise<string | null>>();
const fetchMock = vi.fn<typeof fetch>();
const webSocketMock = vi.fn();

beforeEach(() => {
  getSidecarUrl.mockResolvedValue('http://127.0.0.1:4321');
  window.electron = { getSidecarUrl } as unknown as typeof window.electron;
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('WebSocket', webSocketMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('sidecarBaseUrl', () => {
  it('returns the URL the window holds', async () => {
    await expect(sidecarBaseUrl()).resolves.toBe('http://127.0.0.1:4321');
  });

  it('throws when the sidecar did not start', async () => {
    getSidecarUrl.mockResolvedValue(null);
    await expect(sidecarBaseUrl()).rejects.toThrow('sidecar is not available');
  });
});

describe('sidecarFetch', () => {
  it('POSTs JSON to a handler route and returns its body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { path: '/repo/a.txt', content: 'hi' }));

    const result = await sidecarFetch<{ path: string; content: string }>('/fs/read', {
      path: 'a.txt',
    });

    expect(result).toEqual({ path: '/repo/a.txt', content: 'hi' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://127.0.0.1:4321/fs/read');
    expect(init).toEqual({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'a.txt' }),
    });
  });

  it('POSTs an empty object when a route takes no body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { branch: 'main', entries: [] }));

    await sidecarFetch('/git/status');

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{}' });
  });

  it('GETs /health and /config and reads text or JSON by content-type', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('ok', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { GOOSE_WORKING_DIR: '/repo', GOOSE_VERSION: '1.51.0' })
    );

    await expect(sidecarFetch<string>('/health')).resolves.toBe('ok');
    await expect(sidecarFetch('/config')).resolves.toEqual({
      GOOSE_WORKING_DIR: '/repo',
      GOOSE_VERSION: '1.51.0',
    });
    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
    expect(fetchMock.mock.calls[1][1]).toBeUndefined();
  });

  it("throws the sidecar's error message on a failed request", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: 'path must be a string' }));
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }));

    await expect(sidecarFetch('/fs/read', {})).rejects.toThrow('path must be a string');
    await expect(sidecarFetch('/nope')).rejects.toThrow('sidecar /nope answered 404');
  });
});

describe('sidecarSocket', () => {
  it('opens a ws:// socket on the sidecar with the params as the query', async () => {
    await sidecarSocket('/pty', { id: 'abc', cols: '120', rows: '40' });

    expect(webSocketMock).toHaveBeenCalledTimes(1);
    expect(String(webSocketMock.mock.calls[0][0])).toBe(
      'ws://127.0.0.1:4321/pty?id=abc&cols=120&rows=40'
    );
  });

  it('upgrades to wss:// behind https and sends no query without params', async () => {
    getSidecarUrl.mockResolvedValue('https://mac.tailnet.ts.net:4321');

    await sidecarSocket('/fs/watch');

    expect(String(webSocketMock.mock.calls[0][0])).toBe('wss://mac.tailnet.ts.net:4321/fs/watch');
  });
});
