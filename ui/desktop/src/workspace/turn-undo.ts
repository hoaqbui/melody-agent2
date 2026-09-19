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
