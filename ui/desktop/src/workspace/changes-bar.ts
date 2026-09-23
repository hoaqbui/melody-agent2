// The Changes summary bar: file count, line counts, and actions, above the chat input.
// Reads git status from PaneContext (task 74) and numstat from /git/diff to show:
// `3 files · +40 −12 · Review · Commit… · Discard`
// Discard keeps Undo until the next tree change (task 50's lastApply pattern). Staged work
// with nothing left unstaged is its own state — `staged`, not `dirty` — so the bar never
// falls back to the numstat diff (which is empty for it) and reads "0 files · +0 −0"
// (`14-after-commit.png`, task 166).

import type { GitStatusEntry } from '../native/sidecar';
import { splitStatus } from './panes/git/git-state';

export interface NumstatEntry {
  path: string;
  added: number | null;
  deleted: number | null;
}

// Parse git diff --numstat output into structured entries.
// Format: `added<tab>deleted<tab>path` per line (or `-` for binary files).
export function parseNumstat(output: string): NumstatEntry[] {
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [added, deleted, ...pathParts] = line.split('\t');
      const path = pathParts.join('\t');
      return {
        path,
        added: added === '-' ? null : Number(added),
        deleted: deleted === '-' ? null : Number(deleted),
      };
    });
}

export interface ChangesBarStats {
  fileCount: number;
  totalAdded: number;
  totalDeleted: number;
  entries: NumstatEntry[];
}

// Aggregate stats from numstat entries.
export function aggregateStats(entries: NumstatEntry[]): ChangesBarStats {
  let totalAdded = 0;
  let totalDeleted = 0;
  for (const entry of entries) {
    if (entry.added !== null) totalAdded += entry.added;
    if (entry.deleted !== null) totalDeleted += entry.deleted;
  }
  return {
    fileCount: entries.length,
    totalAdded,
    totalDeleted,
    entries,
  };
}

export type ChangesBarState =
  | 'empty'
  | 'loading'
  | 'dirty'
  | 'staged'
  | 'composing'
  | 'committing'
  | 'committed'
  | 'discarding'
  | 'discarded'
  | 'error';

export interface CommittedInfo {
  sha: string;
  subject: string;
}

export interface ChangesBarContext {
  state: ChangesBarState;
  stats: ChangesBarStats | null;
  error: string | null;
  // The stash message from /git/discard, kept until tree changes.
  lastDiscard: string | null;
  // Set on a successful commit from this bar; cleared with the state after COMMITTED_DISPLAY_MS.
  committed: CommittedInfo | null;
}

export function createChangesBarContext(): ChangesBarContext {
  return {
    state: 'empty',
    stats: null,
    error: null,
    lastDiscard: null,
    committed: null,
  };
}

// Which phase the bar reads from git status alone, before any numstat diff answers:
// nothing changed, something is staged with no unstaged or conflicted work left (its own
// state — see the file header), or there is still a diff to show.
export function barPhase(entries: readonly GitStatusEntry[]): 'empty' | 'dirty' | 'staged' {
  if (entries.length === 0) return 'empty';
  const lists = splitStatus(entries);
  if (lists.staged.length > 0 && lists.unstaged.length === 0 && lists.conflicted.length === 0) {
    return 'staged';
  }
  return 'dirty';
}

const SHA_DISPLAY_LENGTH = 7;
export function shortSha(sha: string): string {
  return sha.slice(0, SHA_DISPLAY_LENGTH);
}

// How long the committed state stays up before the bar clears itself (docs/mockups/
// 2026-09-22-states-sheet.html §1): it never waits for the shared 30 s status poll.
export const COMMITTED_DISPLAY_MS = 6_000;
