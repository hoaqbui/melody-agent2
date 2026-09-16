import type { TLSSocket } from 'node:tls';
import WebSocket from 'ws';

export interface AcpProxyTarget {
  gooseUrl: string;
  certFingerprint?: string;
  token: string;
}

const normalizeFingerprint = (fingerprint: string): string =>
  fingerprint.replace(/^sha256\//i, '').toUpperCase();

const buildUpstreamUrl = (target: AcpProxyTarget): string => {
  const url = new URL('/acp', target.gooseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', target.token);
  return url.toString();
};

// goose serve's certificate is self-signed, so Node's chain check fails before
// checkServerIdentity is ever consulted; the pin is verified on the upgraded
// socket instead, and the connection is dropped on a mismatch.
const pinMatches = (socket: TLSSocket, expected: string): boolean => {
  const actual = socket.getPeerCertificate().fingerprint256;
  return typeof actual === 'string' && normalizeFingerprint(actual) === expected;
};

export const proxyAcp = (client: WebSocket, target: AcpProxyTarget): void => {
  const pinned = target.certFingerprint ? normalizeFingerprint(target.certFingerprint) : null;
  const upstream = new WebSocket(buildUpstreamUrl(target), {
    rejectUnauthorized: pinned === null,
  });
  const pending: Array<{ data: WebSocket.RawData; binary: boolean }> = [];

  upstream.on('upgrade', (response) => {
    if (pinned && !pinMatches(response.socket as TLSSocket, pinned)) {
      upstream.terminate();
      client.close(1011, 'goose serve certificate mismatch');
    }
  });
  upstream.on('open', () => {
    for (const { data, binary } of pending) {
      upstream.send(data, { binary });
    }
    pending.length = 0;
  });
  upstream.on('message', (data, binary) => {
    client.send(data, { binary });
  });
  upstream.on('close', (code, reason) => {
    client.close(code === 1005 || code === 1006 ? 1000 : code, reason.toString());
  });
  upstream.on('error', (error) => {
    client.close(1011, error.message.slice(0, 120));
  });

  client.on('message', (data, binary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary });
    } else {
      pending.push({ data, binary });
    }
  });
  client.on('close', () => {
    upstream.close();
  });
};
