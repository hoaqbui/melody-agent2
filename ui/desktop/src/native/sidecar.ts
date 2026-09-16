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

// cwd defaults to the sidecar's spawn cwd; anything outside that repository or
// a sibling worktree of it is refused with 400.
export interface GitCwdRequest {
  cwd?: string;
}

export type GitStatusRequest = GitCwdRequest;

export interface GitStatusEntry {
  path: string;
  index: string;
  worktree: string;
}

export interface GitStatusResponse {
  branch: string | null;
  entries: GitStatusEntry[];
}

export interface GitDiffRequest extends GitCwdRequest {
  staged?: boolean;
  base?: string;
  path?: string;
  context?: number;
}

export interface GitDiffResponse {
  diff: string;
}

export interface GitRevParseRequest extends GitCwdRequest {
  rev: string;
}

export interface GitRevParseResponse {
  sha: string;
}

export interface GitPathsRequest extends GitCwdRequest {
  paths: string[];
}

export interface GitCommitRequest extends GitCwdRequest {
  message: string;
}

export interface GitCommitResponse {
  output: string;
}

export interface GitWorktreeAddRequest extends GitCwdRequest {
  slug: string;
}

export interface GitWorktreeAddResponse {
  path: string;
  branch: string;
}

export type GitWorktreeListRequest = GitCwdRequest;

export interface GitWorktreeEntry {
  path: string;
  head: string;
  branch: string | null;
  locked: boolean;
}

export interface GitWorktreeListResponse {
  worktrees: GitWorktreeEntry[];
}

export interface GitWorktreeRemoveRequest extends GitCwdRequest {
  slug: string;
  force?: boolean;
}

export interface GitMergeRequest extends GitCwdRequest {
  slug: string;
}

export interface GitMergeResponse {
  sha: string;
}

// The 409 body of /git/merge; sidecarFetch surfaces only `error` today.
export interface GitMergeConflictResponse {
  error: string;
  conflicts: string[];
}

export interface GitApplyRequest extends GitCwdRequest {
  patch: string;
  reverse?: boolean;
  cached?: boolean;
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
