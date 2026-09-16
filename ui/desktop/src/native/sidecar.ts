/* global WebSocket */
// Bodies mirror the sidecar's handlers: ui/sidecar/src/fs.ts, git.ts, pty.ts and index.ts.

export type FsEntryType = 'file' | 'dir' | 'symlink' | 'other';

export interface FsEntry {
  name: string;
  type: FsEntryType;
}

export interface FsPathRequest {
  path: string;
}

export interface FsListResponse {
  path: string;
  entries: FsEntry[];
}

export interface FsReadResponse {
  path: string;
  content: string;
}

export interface FsWriteRequest {
  path: string;
  content: string;
}

export interface FsWriteResponse {
  path: string;
}

export type FsWatchEventType = 'watching' | 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir';

export interface FsWatchEvent {
  type: FsWatchEventType;
  path: string;
}

export interface GitStatusEntry {
  path: string;
  index: string;
  worktree: string;
}

export interface GitStatusResponse {
  branch: string | null;
  entries: GitStatusEntry[];
}

export interface GitDiffRequest {
  staged?: boolean;
  base?: string;
  path?: string;
  context?: number;
}

export interface GitDiffResponse {
  diff: string;
}

export interface GitRevParseRequest {
  rev: string;
}

export interface GitRevParseResponse {
  sha: string;
}

export interface GitPathsRequest {
  paths: string[];
}

export interface GitCommitRequest {
  message: string;
}

export interface GitCommitResponse {
  output: string;
}

export interface SidecarConfig {
  GOOSE_WORKING_DIR: string;
  GOOSE_VERSION: string;
}

export type PtyClientMessage =
  { type: 'input'; data: string } | { type: 'resize'; cols: number; rows: number };

export type PtyServerMessage =
  | { type: 'attached'; id: string; pid: number }
  | { type: 'output'; data: string }
  | { type: 'exit'; code: number; signal?: number };

export type SidecarSocketPath = '/pty' | '/fs/watch';

const GET_ROUTES = new Set(['/health', '/config']);

export async function sidecarBaseUrl(): Promise<string> {
  const url = await window.electron.getSidecarUrl();
  if (!url) {
    throw new Error('sidecar is not available');
  }
  return url;
}

export async function sidecarFetch<T>(path: string, body?: unknown): Promise<T> {
  const url = new URL(path, await sidecarBaseUrl());
  const response = GET_ROUTES.has(path)
    ? await fetch(url)
    : await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  if (!response.ok) {
    const message = isJson ? ((await response.json()) as { error?: string }).error : null;
    throw new Error(message || `sidecar ${path} answered ${response.status}`);
  }
  return (isJson ? await response.json() : await response.text()) as T;
}

export async function sidecarSocket(
  path: SidecarSocketPath,
  params?: Record<string, string>
): Promise<WebSocket> {
  const url = new URL(path, await sidecarBaseUrl());
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = new URLSearchParams(params).toString();
  return new WebSocket(url);
}
