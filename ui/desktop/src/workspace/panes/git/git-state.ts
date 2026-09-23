// What the Git pane derives without React (PRD step 7): which entries are staged, unstaged
// or in conflict, whether the chat's tool-call rows say an agent turn is still writing files,
// why Commit or Push and open PR is disabled, which recovery a gh 503 names (task 66), and
// the pane's DESIGN.md state. The commit draft lives here too so a promote or close keeps it
// (DESIGN.md Nothing Lost Rule).

import type { GitStatusEntry } from '../../../native/sidecar';
import { ChatState } from '../../../types/chatState';
import { getToolRequests, getToolResponses, type Message } from '../../../types/message';

// DESIGN.md §Shared component states, plus `ready` for a surface with nothing unresolved.
export const GIT_PANE_STATES = [
  'empty',
  'loading',
  'partial',
  'running',
  'error',
  'cancelled',
  'unavailable',
  'ready',
] as const;

export type GitPaneState = (typeof GIT_PANE_STATES)[number];

export interface GitLists {
  staged: GitStatusEntry[];
  unstaged: GitStatusEntry[];
  conflicted: GitStatusEntry[];
}

export type CommitBlocker = 'running' | 'conflicts' | 'nothingStaged' | 'noMessage';

const CONFLICT_CODES = new Set(['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD']);

// A tool call is in progress while its request row has no response row: the adapter adds the
// response only on `completed` or `failed` (src/acp/adapter/tools.ts), and the row keeps its
// spinner even after the reply ends (DESIGN.md §States, Running).
export function hasToolCallInProgress(messages: readonly Message[]): boolean {
  const answered = new Set<string>();
  for (const message of messages) {
    for (const response of getToolResponses(message)) answered.add(response.id);
  }
  return messages.some((message) =>
    getToolRequests(message).some((request) => !answered.has(request.id))
  );
}

// Chat is running if there are unanswered requests AND the chat is not idle. Once the chat
// becomes idle (the user or system stops the turn), orphaned requests no longer block Commit.
export function isChatRunning(messages: readonly Message[], chatState?: ChatState | null): boolean {
  if (chatState === ChatState.Idle) return false;
  return hasToolCallInProgress(messages);
}

export function isConflicted(entry: GitStatusEntry): boolean {
  return CONFLICT_CODES.has(entry.index + entry.worktree);
}

export function splitStatus(entries: readonly GitStatusEntry[]): GitLists {
  const lists: GitLists = { staged: [], unstaged: [], conflicted: [] };
  for (const entry of entries) {
    if (isConflicted(entry)) {
      lists.conflicted.push(entry);
      continue;
    }
    if (entry.index === '?') {
      lists.unstaged.push(entry);
      continue;
    }
    if (entry.index !== ' ') lists.staged.push(entry);
    if (entry.worktree !== ' ') lists.unstaged.push(entry);
  }
  return lists;
}

// Porcelain v1 writes a rename as `old -> new`; the path git acts on is the new one.
export function actionablePath(entry: GitStatusEntry): string {
  const arrow = entry.path.lastIndexOf(' -> ');
  return arrow === -1 ? entry.path : entry.path.slice(arrow + 4);
}

export function isNotARepository(error: string): boolean {
  return /not a git repository/i.test(error);
}

export function commitBlocker(input: {
  running: boolean;
  lists: GitLists;
  message: string;
}): CommitBlocker | null {
  if (input.running) return 'running';
  if (input.lists.conflicted.length > 0) return 'conflicts';
  if (input.lists.staged.length === 0) return 'nothingStaged';
  if (input.message.trim() === '') return 'noMessage';
  return null;
}

export type PrBlocker = 'running' | 'noBranch';

// Push and open PR is a Running-row control like Commit (DESIGN.md §States amended row); a
// detached HEAD (`HEAD (no branch)` in porcelain) has nothing gh could open a PR from.
export function prBlocker(input: { running: boolean; branch: string | null }): PrBlocker | null {
  if (input.running) return 'running';
  if (input.branch === null || /^HEAD( |$)/.test(input.branch)) return 'noBranch';
  return null;
}

export type GhRecovery = 'install' | 'signIn';

// The sidecar's 503 carries `reason` in its body; a 503 without one reads as logged out,
// the recovery the user can act on without leaving the window.
export function ghRecovery(input: {
  status: number;
  details: Record<string, unknown>;
}): GhRecovery | null {
  if (input.status !== 503) return null;
  return input.details.reason === 'missing' ? 'install' : 'signIn';
}

export function paneState(input: {
  error: string | null;
  loaded: boolean;
  running: boolean;
  lists: GitLists;
}): GitPaneState {
  if (input.error) return isNotARepository(input.error) ? 'empty' : 'error';
  if (!input.loaded) return 'loading';
  if (input.running) return 'running';
  if (input.lists.conflicted.length > 0) return 'partial';
  return 'ready';
}

export interface GitDraftStore {
  getState(): string;
  subscribe(listener: () => void): () => void;
  set(message: string): void;
}

export function createGitDraftStore(initial = ''): GitDraftStore {
  let message = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => message,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      if (next === message) return;
      message = next;
      listeners.forEach((listener) => listener());
    },
  };
}
