import type { IncomingMessage, ServerResponse } from 'node:http';

export type JsonHandler = (body: Record<string, unknown>) => Promise<unknown>;

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

export const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

export const sendText = (response: ServerResponse, status: number, body: string): void => {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
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
