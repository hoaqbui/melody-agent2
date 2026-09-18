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

// `upstream` is null for a branch never pushed (or whose remote ref is gone); `ahead` counts
// the commits a push would send.
export interface GitStatusResponse {
  // The repository root the status was read in — what a repo-root-relative path resolves against.
  toplevel: string;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
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

// The 409 body of /git/merge; `conflicts` reaches the caller as SidecarError.details.
export interface GitMergeConflictResponse {
  error: string;
  conflicts: string[];
}

export interface GitApplyRequest extends GitCwdRequest {
  patch: string;
  reverse?: boolean;
  cached?: boolean;
}

export interface GitPushRequest extends GitCwdRequest {
  setUpstream?: boolean;
}

// The commits on the branch since `base` (the remote's default branch when omitted),
// newest first; `base` comes back null when git could not resolve one.
export interface GitLogRequest extends GitCwdRequest {
  base?: string;
}

export interface GitLogCommit {
  sha: string;
  subject: string;
}

export interface GitLogResponse {
  base: string | null;
  commits: GitLogCommit[];
}

export interface GitPrCreateRequest extends GitCwdRequest {
  title: string;
  body: string;
  base?: string;
  draft?: boolean;
}

export interface GitPrCreateResponse {
  url: string;
  number: number;
}

export type GitPrStatusRequest = GitCwdRequest;

export type GitPrCheckState = 'pending' | 'pass' | 'fail' | 'skipped';

export interface GitPrCheck {
  name: string;
  state: GitPrCheckState;
  link: string;
}

// `gh pr view --json` as gh returns it; `state` is OPEN, CLOSED or MERGED.
export interface GitPr {
  number: number;
  url: string;
  state: string;
  isDraft: boolean;
  mergeable: string;
}

export interface GitPrStatusResponse {
  pr: GitPr | null;
  checks: GitPrCheck[];
}

// The 503 body of the gh-backed routes: `reason` reaches the caller as SidecarError.details
// and picks Install (gh missing) or Sign in (gh logged out).
export type GhUnavailableReason = 'missing' | 'auth';

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

const KEY_HEADER = 'x-sidecar-key';

// A route's refusal: the sidecar's `error` line as the message, the rest of its JSON body
// (a 409 merge's `conflicts`) as details.
export class SidecarError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

// One URL from either shell — Electron's lease or the phone's stored origin — carries the
// per-launch key as `?key=`; it is split here once and never leaves this module.
export async function sidecarBaseUrl(): Promise<string> {
  const url = await window.electron.getSidecarUrl();
  if (!url) {
    throw new Error('sidecar is not available');
  }
  return url;
}

async function sidecarTarget(path: string): Promise<{ url: URL; key: string }> {
  const base = new URL(await sidecarBaseUrl());
  const key = base.searchParams.get('key') ?? '';
  return { url: new URL(path, base), key };
}

// The GET routes are the open ones; a key header on a cross-origin GET would only cost
// the dev renderer a preflight the sidecar answers for JSON routes alone.
export async function sidecarFetch<T>(path: string, body?: unknown): Promise<T> {
  const { url, key } = await sidecarTarget(path);
  const response = GET_ROUTES.has(path)
    ? await fetch(url)
    : await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [KEY_HEADER]: key },
        body: JSON.stringify(body ?? {}),
      });
  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  if (!response.ok) {
    const { error, ...details } = isJson
      ? ((await response.json()) as { error?: string; [key: string]: unknown })
      : { error: undefined };
    throw new SidecarError(
      error || `sidecar ${path} answered ${response.status}`,
      response.status,
      details
    );
  }
  return (isJson ? await response.json() : await response.text()) as T;
}

export async function sidecarSocket(
  path: SidecarSocketPath,
  params?: Record<string, string>
): Promise<WebSocket> {
  const { url, key } = await sidecarTarget(path);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.search = new URLSearchParams({ key, ...params }).toString();
  return new WebSocket(url);
}
