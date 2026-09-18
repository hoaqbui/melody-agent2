// The Changes summary bar: file count, line counts, and actions (Review, Accept all, Discard).
// Reads git status from PaneContext (task 74) and numstat from /git/diff to show:
// `3 files · +40 −12 · Review · Accept all · Discard`
// Discard keeps Undo until the next tree change (task 50's lastApply pattern).

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

export type ChangesBarState = 'empty' | 'loading' | 'partial' | 'error' | 'ready' | 'discarding' | 'discarded';

export interface ChangesBarContext {
  state: ChangesBarState;
  stats: ChangesBarStats | null;
  error: string | null;
  // The stash message from /git/discard, kept until tree changes.
  lastDiscard: string | null;
}

export function createChangesBarContext(): ChangesBarContext {
  return {
    state: 'empty',
    stats: null,
    error: null,
    lastDiscard: null,
  };
}
