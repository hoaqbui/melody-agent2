import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

const isFile = async (candidate: string): Promise<boolean> => {
  try {
    return (await stat(candidate)).isFile();
  } catch {
    return false;
  }
};

const send = (response: ServerResponse, file: string): void => {
  response.writeHead(200, {
    'content-type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
};

// The web build is a single-page app: unknown paths fall back to index.html.
export const serveStatic = async (
  dir: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://sidecar').pathname);
  const root = path.resolve(dir);
  const candidate = path.resolve(root, `.${pathname}`);
  if (!candidate.startsWith(root)) {
    response.writeHead(403).end();
    return;
  }
  if (await isFile(candidate)) {
    send(response, candidate);
    return;
  }
  const index = path.join(root, 'index.html');
  if (await isFile(index)) {
    send(response, index);
    return;
  }
  response.writeHead(404).end();
};
