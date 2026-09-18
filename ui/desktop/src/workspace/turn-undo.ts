import type { GitApplyRequest } from '../native/sidecar';

export interface TurnSnapshots {
  start: string;
  end: string;
}

export interface TurnUndoState {
  canUndo: boolean;
  blockReason?: string;
  undoRequest?: GitApplyRequest;
  redoRequest?: GitApplyRequest;
}

export async function parseDiffFileSet(diff: string): Promise<Set<string>> {
  const files = new Set<string>();
  for (const line of diff.split('\n')) {
    if (line.length === 0) continue;
    const [, path] = line.split('\t');
    if (path) files.add(path);
  }
  return files;
}

export async function checkTurnIntersection(
  currentFileSet: Set<string>,
  laterTurns: readonly { snapshots: TurnSnapshots | undefined }[]
): Promise<string | undefined> {
  for (const turn of laterTurns) {
    if (!turn.snapshots) continue;
    const laterFileSet = await fetchTurnFileSet(turn.snapshots.start, turn.snapshots.end);
    for (const file of currentFileSet) {
      if (laterFileSet.has(file)) {
        return file;
      }
    }
  }
  return undefined;
}

async function fetchTurnFileSet(t0: string, t1: string): Promise<Set<string>> {
  try {
    const response = await fetch('http://localhost:61234/git/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base: t0,
        head: t1,
        nameStatus: true,
      }),
    });
    if (!response.ok) throw new Error(`${response.status}`);
    const data = (await response.json()) as { diff?: string };
    return await parseDiffFileSet(data.diff ?? '');
  } catch {
    return new Set();
  }
}

export function createUndoRequest(diff: string, cached: boolean): GitApplyRequest {
  return {
    patch: diff,
    reverse: true,
    cached: cached,
  };
}
