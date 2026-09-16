import type { IncomingMessage, ServerResponse } from 'node:http';

export type JsonHandler = (body: Record<string, unknown>) => Promise<unknown>;

export type CorsHeaders = Record<string, string>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

const MAX_BODY_BYTES = 16 * 1024 * 1024;

export const readJsonBody = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, 'request body too large');
    }
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'request body is not JSON');
  }
};

// Exact origins only, never `*`: an origin off the list gets no CORS header and
// the browser blocks it, so the allowlist gates the sidecar beside Tailscale.
export const corsHeaders = (
  request: IncomingMessage,
  allowedOrigins: readonly string[]
): CorsHeaders => {
  const origin = request.headers.origin;
  return origin !== undefined && allowedOrigins.includes(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type' }
    : {};
};

export const sendJson = (
  response: ServerResponse,
  status: number,
  body: unknown,
  cors: CorsHeaders = {}
): void => {
  response.writeHead(status, { ...cors, 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

export const sendText = (
  response: ServerResponse,
  status: number,
  body: string,
  cors: CorsHeaders = {}
): void => {
  response.writeHead(status, { ...cors, 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
};

const handleJson = async (
  handler: JsonHandler,
  request: IncomingMessage,
  response: ServerResponse,
  cors: CorsHeaders
): Promise<void> => {
  try {
    sendJson(response, 200, await handler(await readJsonBody(request)), cors);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    sendJson(
      response,
      status,
      { error: error instanceof Error ? error.message : String(error) },
      cors
    );
  }
};

// Returns whether the request was one of the JSON routes, or a preflight for
// one from a listed origin; anything else is left to the caller.
export const jsonDispatcher =
  (routes: Record<string, JsonHandler>, allowedOrigins: readonly string[]) =>
  (request: IncomingMessage, response: ServerResponse): boolean => {
    const cors = corsHeaders(request, allowedOrigins);
    const pathname = new URL(request.url ?? '/', 'http://sidecar').pathname;
    if (request.method === 'OPTIONS') {
      const preflightFor = `${request.headers['access-control-request-method']} ${pathname}`;
      if (!('access-control-allow-origin' in cors) || !routes[preflightFor]) {
        return false;
      }
      response.writeHead(204, cors);
      response.end();
      return true;
    }
    const handler = routes[`${request.method} ${pathname}`];
    if (!handler) {
      return false;
    }
    void handleJson(handler, request, response, cors);
    return true;
  };

export const requireString = (body: Record<string, unknown>, key: string): string => {
  const value = body[key];
  if (typeof value !== 'string') {
    throw new HttpError(400, `${key} must be a string`);
  }
  return value;
};

export const requireStringArray = (body: Record<string, unknown>, key: string): string[] => {
  const value = body[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new HttpError(400, `${key} must be an array of strings`);
  }
  return value;
};
