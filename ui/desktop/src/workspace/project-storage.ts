// Per-project layout memory: one localStorage key holds every project's entry, keyed by the
// window's working dir, as task 19's shim holds the settings. The dock and the column
// widths each have a key; a project that never saved reads as null.

export function loadProjectEntry(key: string, project: string): unknown {
  try {
    const all = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    return all[project] ?? null;
  } catch {
    return null;
  }
}

export function saveProjectEntry(key: string, project: string, value: unknown): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    all[project] = value;
    window.localStorage.setItem(key, JSON.stringify(all));
  } catch {
    // Storage disabled or full: the layout lives for this window only.
  }
}
