import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';

import { type AcpProxyTarget, proxyAcp } from './acpProxy.js';
import { parseArgs } from './args.js';
import { isPrivateAddress, resolveBindAddresses } from './bind.js';
import { attachFsWatch, fsRoutes } from './fs.js';
import { gitRoutes } from './git.js';
import { corsHeaders, type JsonHandler, jsonDispatcher, sendJson, sendText } from './http.js';
import { attachPty, ensureSpawnHelperExecutable, killAllPty } from './pty.js';
import { serveStatic } from './static.js';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const listen = (server: Server, port: number, host: string): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      const address = server.address();
      resolve(typeof address === 'object' && address ? address.port : port);
    });
  });

const packageVersion = (): string => {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return 'unknown';
  }
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv);
  const addresses = await resolveBindAddresses(args.bind);
  for (const address of addresses) {
    if (!isPrivateAddress(address)) {
      console.error(
        `refusing to bind ${address}: the sidecar listens on loopback or the tailnet only, never on a public address`
      );
      process.exit(2);
    }
  }

  ensureSpawnHelperExecutable();
  const cwd = path.resolve(args.cwd);
  const version = args.gooseVersion ?? packageVersion();
  const token = process.env.GOOSE_SERVER__SECRET_KEY;
  const acpTarget: AcpProxyTarget | null =
    args.gooseUrl && token
      ? { gooseUrl: args.gooseUrl, certFingerprint: args.gooseCertFingerprint, token }
      : null;
  const routes: Record<string, JsonHandler> = { ...fsRoutes(cwd), ...gitRoutes(cwd) };
  const dispatchJson = jsonDispatcher(routes, args.allowedOrigins);

  const handleRequest = (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://sidecar');
    const cors = corsHeaders(request, args.allowedOrigins);
    if (request.method === 'GET' && url.pathname === '/health') {
      sendText(response, 200, 'ok', cors);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/config') {
      sendJson(response, 200, { GOOSE_WORKING_DIR: cwd, GOOSE_VERSION: version }, cors);
      return;
    }
    if (dispatchJson(request, response)) {
      return;
    }
    if (args.staticDir && request.method === 'GET') {
      void serveStatic(args.staticDir, request, response);
      return;
    }
    sendText(response, 404, 'not found', cors);
  };

  const sockets = new WebSocketServer({ noServer: true });
  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://sidecar');
    const accept = (onOpen: (client: import('ws').WebSocket) => void) => {
      sockets.handleUpgrade(request, socket, head, onOpen);
    };
    const refuse = (status: number, reason: string) => {
      socket.write(`HTTP/1.1 ${status} ${reason}\r\nconnection: close\r\n\r\n`);
      socket.destroy();
    };
    switch (url.pathname) {
      case '/acp':
        if (!acpTarget) {
          refuse(503, 'goose serve is not configured');
          return;
        }
        accept((client) => proxyAcp(client, acpTarget));
        return;
      case '/pty':
        accept((client) => {
          try {
            attachPty(client, {
              id: url.searchParams.get('id') ?? randomUUID(),
              cwd: path.resolve(cwd, url.searchParams.get('cwd') ?? '.'),
              cols: Number(url.searchParams.get('cols') ?? 80),
              rows: Number(url.searchParams.get('rows') ?? 24),
            });
          } catch (error) {
            client.close(1011, errorMessage(error).slice(0, 120));
          }
        });
        return;
      case '/fs/watch':
        accept((client) => attachFsWatch(client, cwd, url.searchParams.get('path')));
        return;
      default:
        refuse(404, 'Not Found');
    }
  };

  // One listener per address on one port: the first bind settles a `--port 0`,
  // the rest reuse it. The lines go out in one write so the desktop reads them
  // in one chunk and picks the loopback one.
  const servers: Server[] = [];
  const listening: string[] = [];
  let port = args.port;
  for (const address of addresses) {
    const server = createServer(handleRequest);
    server.on('upgrade', handleUpgrade);
    try {
      port = await listen(server, port, address);
    } catch (error) {
      console.error(`failed to bind ${address}:${port}: ${errorMessage(error)}`);
      process.exit(2);
    }
    servers.push(server);
    const host = address.includes(':') ? `[${address}]` : address;
    listening.push(`SIDECAR_LISTENING=http://${host}:${port}`);
  }
  console.log(listening.join('\n'));

  const shutdown = () => {
    killAllPty();
    servers.forEach((server) => server.close());
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

void main();
