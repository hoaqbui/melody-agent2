// Worktree-per-task (task 49): a new chat's own checkout is `<toplevel>/.worktrees/<slug>` on
// the branch `wt/<slug>`, both the sidecar's (ui/sidecar/src/git.ts). The renderer only
// names the slug, tells a session cwd from the repository's worktree list, and reads the
// slug back out of a cwd.

import {
  sidecarFetch,
  type GitWorktreeAddRequest,
  type GitWorktreeAddResponse,
  type GitWorktreeEntry,
} from '../native/sidecar';

export const WORKTREES_DIR = '.worktrees';

export const worktreeBranch = (slug: string): string => `wt/${slug}`;

// `wt-<yyyymmdd>-<4 hex>`: the cwd is fixed at session/new, before any prompt, so the name
// is the day and chance, never the task. Lowercase hex keeps it inside the sidecar's slug
// pattern.
export function newWorktreeSlug(
  now = new Date(),
  random: (bytes: Uint8Array) => Uint8Array = (bytes) => globalThis.crypto.getRandomValues(bytes)
): string {
  const day = now.toISOString().slice(0, 10).replaceAll('-', '');
  const hex = Array.from(random(new Uint8Array(2)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return `wt-${day}-${hex}`;
}

// The slug of the worktree a path sits in — its own root or any directory below it — or
// null for a path outside `.worktrees/`.
export function worktreeSlugOf(path: string): string | null {
  const parts = path.split(/[\\/]/);
  const at = parts.lastIndexOf(WORKTREES_DIR);
  return at >= 0 && at + 1 < parts.length && parts[at + 1] !== '' ? parts[at + 1] : null;
}

export interface WorktreePlace {
  slug: string;
  branch: string;
  // The main checkout, where Merge and Remove run: git lists it first.
  main: GitWorktreeEntry;
}

// Where a session cwd sits among the repository's worktrees: the path itself when git
// lists it, else the `.worktrees/<slug>` segment against the `wt/<slug>` branch (the sidecar
// realpaths its paths; a cwd need not be). Null for the main checkout, a worktree git does
// not list, or one whose branch is not the sidecar's `wt/<slug>` — Merge and Remove name
// that branch, so nothing else is offered them.
export function worktreePlace(
  cwd: string,
  worktrees: readonly GitWorktreeEntry[]
): WorktreePlace | null {
  const [main, ...others] = worktrees;
  if (!main) return null;
  const slug = worktreeSlugOf(cwd);
  const entry = others.find(
    (candidate) =>
      candidate.path === cwd || (slug !== null && candidate.branch === worktreeBranch(slug))
  );
  const branch = entry?.branch;
  if (!branch?.startsWith('wt/')) return null;
  return { slug: branch.slice('wt/'.length), branch, main };
}

export async function addWorktree(cwd: string, slug: string): Promise<GitWorktreeAddResponse> {
  const request: GitWorktreeAddRequest = { cwd, slug };
  return sidecarFetch<GitWorktreeAddResponse>('/git/worktree/add', request);
}
