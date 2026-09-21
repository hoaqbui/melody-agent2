export interface TurnSnapshots {
  start: string;
  end: string;
}

export function parseDiffFileSet(diff: string): Set<string> {
  const files = new Set<string>();
  for (const line of diff.split('\n')) {
    if (line.length === 0) continue;
    const [, path] = line.split('\t');
    if (path) files.add(path);
  }
  return files;
}

export function intersects(
  fileSetA: Set<string>,
  laterFileSets: readonly Set<string>[]
): string | undefined {
  for (const fileSetB of laterFileSets) {
    for (const file of fileSetA) {
      if (fileSetB.has(file)) {
        return file;
      }
    }
  }
  return undefined;
}

// The turns after `turnId` in the transcript's order that have both snapshots: the ones
// whose file sets an undo must not cross.
export function laterTurns(
  messageIds: readonly string[],
  turnId: string,
  snapshots: Record<string, TurnSnapshots>
): string[] {
  const index = messageIds.indexOf(turnId);
  if (index < 0) return [];
  return messageIds
    .slice(index + 1)
    .filter((id) => id !== turnId && snapshots[id]?.start && snapshots[id]?.end);
}
