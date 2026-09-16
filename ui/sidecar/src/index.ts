import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';

import { type AcpProxyTarget, proxyAcp } from './acpProxy.js';
import { parseArgs } from './args.js';
import { isPrivateAddress, resolveBindAddress } from './bind.js';
import { attachFsWatch, fsRoutes } from './fs.js';
import { gitRoutes } from './git.js';
import { corsHeaders, type JsonHandler, jsonDispatcher, sendJson, sendText } from './http.js';
import { attachPty, ensureSpawnHelperExecutable, killAllPty } from './pty.js';
import { serveStatic } from './static.js';

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
  const bind = await resolveBindAddress(args.bind);
  if (!isPrivateAddress(bind)) {
    console.error(
      `refusing to bind ${bind}: the sidecar listens on loopback or the tailnet only, never on a public address`
    );
    process.exit(2);
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

  const server = createServer((request, response) => {
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
  });

  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
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
            client.close(
              1011,
              (error instanceof Error ? error.message : String(error)).slice(0, 120)
            );
          }
        });
        return;
      case '/fs/watch':
        accept((client) => attachFsWatch(client, cwd, url.searchParams.get('path')));
        return;
      default:
        refuse(404, 'Not Found');
    }
  });

  server.listen(args.port, bind, () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : args.port;
    const host = bind.includes(':') ? `[${bind}]` : bind;
    console.log(`SIDECAR_LISTENING=http://${host}:${port}`);
  });

  const shutdown = () => {
    killAllPty();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

void main();
