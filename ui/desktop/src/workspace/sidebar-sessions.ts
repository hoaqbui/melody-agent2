// The Chats tab's list (task 148): sessions by repository rather than by checkout — a
// worktree's sessions fold under its repo with the slug on the row, scratch and temp
// directories fold into one "Elsewhere" — then a repo chip, a search, a sort and the day
// headings. Pure; `projectSessions.ts` stays for upstream's pages.

import type { SessionListItem } from '../acp/sessions';
import { worktreeSlugOf } from './worktree';

export const ELSEWHERE = 'elsewhere';
export const ALL = 'all';

export type SortMode = 'recent' | 'name' | 'project';

export interface Repository {
  // The repo's path, or `elsewhere`.
  key: string;
  label: string;
  slug: string | null;
}

export interface RepoChip {
  key: string;
  label: string;
  count: number;
}

export interface DayGroup {
  label: string;
  sessions: SessionListItem[];
}

const WORKTREES_DIR = '.worktrees';

function normalize(path: string): string {
  return path.trim().replace(/[\\/]+$/, '');
}

function leaf(path: string): string {
  const parts = normalize(path).split(/[\\/]+/);
  return parts[parts.length - 1] || path;
}

function isTemp(path: string, tempRoots: readonly string[]): boolean {
  const normalized = normalize(path);
  return tempRoots.some(
    (root) => root && (normalized === root || normalized.startsWith(root + '/'))
  );
}

export function tempRoots(env: { TMPDIR?: string } = {}): string[] {
  return [
    env.TMPDIR ? normalize(env.TMPDIR) : '',
    '/var/folders',
    '/private/var/folders',
    '/tmp',
    '/private/tmp',
  ].filter(Boolean);
}

// The repository a session's cwd belongs to: a `.worktrees/<slug>` path folds to the repo
// above it and names the slug; a temp path is `elsewhere`; anything else is itself.
export function repositoryOf(
  workingDir: string,
  roots: readonly string[] = tempRoots()
): Repository {
  const path = normalize(workingDir);
  if (!path || isTemp(path, roots)) {
    return { key: ELSEWHERE, label: 'Elsewhere', slug: null };
  }
  const slug = worktreeSlugOf(path);
  if (slug) {
    const parts = path.split(/[\\/]+/);
    const repo = parts.slice(0, parts.lastIndexOf(WORKTREES_DIR)).join('/');
    return { key: repo, label: leaf(repo), slug };
  }
  return { key: path, label: leaf(path), slug: null };
}

export function activityOf(session: Pick<SessionListItem, 'updatedAt' | 'lastMessageAt'>): number {
  return new Date(session.lastMessageAt ?? session.updatedAt).getTime();
}

// All first with the total, one chip per repo by recency, Elsewhere last. Two repos with
// the same leaf name carry their parent too.
export function repoChips(
  sessions: readonly SessionListItem[],
  roots?: readonly string[]
): RepoChip[] {
  const byKey = new Map<string, { label: string; count: number; latest: number }>();
  for (const session of sessions) {
    const repo = repositoryOf(session.workingDir, roots);
    const entry = byKey.get(repo.key) ?? { label: repo.label, count: 0, latest: 0 };
    entry.count += 1;
    entry.latest = Math.max(entry.latest, activityOf(session));
    byKey.set(repo.key, entry);
  }
  const labels = new Map<string, number>();
  for (const { label } of byKey.values()) labels.set(label, (labels.get(label) ?? 0) + 1);
  const repos = [...byKey.entries()]
    .filter(([key]) => key !== ELSEWHERE)
    .sort((a, b) => b[1].latest - a[1].latest)
    .map(([key, entry]) => ({
      key,
      label:
        (labels.get(entry.label) ?? 0) > 1
          ? key
              .split(/[\\/]+/)
              .slice(-2)
              .join('/')
          : entry.label,
      count: entry.count,
    }));
  const elsewhere = byKey.get(ELSEWHERE);
  return [
    { key: ALL, label: 'All', count: sessions.length },
    ...repos,
    ...(elsewhere ? [{ key: ELSEWHERE, label: 'Elsewhere', count: elsewhere.count }] : []),
  ];
}

export interface Filter {
  repo: string;
  query: string;
}

export function filterSessions(
  sessions: readonly SessionListItem[],
  filter: Filter,
  roots?: readonly string[]
): SessionListItem[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return sessions.filter((session) => {
    const repo = repositoryOf(session.workingDir, roots);
    if (filter.repo !== ALL && repo.key !== filter.repo) return false;
    if (!query) return true;
    const haystack = [session.name, repo.label, repo.slug ?? ''].join(' ').toLocaleLowerCase();
    return haystack.includes(query);
  });
}

export function sortSessions(
  sessions: readonly SessionListItem[],
  mode: SortMode,
  roots?: readonly string[]
): SessionListItem[] {
  const byRecency = (a: SessionListItem, b: SessionListItem) => activityOf(b) - activityOf(a);
  const sorted = [...sessions];
  switch (mode) {
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name) || byRecency(a, b));
    case 'project':
      return sorted.sort(
        (a, b) =>
          repositoryOf(a.workingDir, roots).label.localeCompare(
            repositoryOf(b.workingDir, roots).label
          ) || byRecency(a, b)
      );
    default:
      return sorted.sort(byRecency);
  }
}

const DAY_MS = 86_400_000;

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

// Today · Yesterday · a weekday inside the last week · a date after that.
export function dayOf(at: number, now: number, locale = 'en'): string {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  const date = new Date(at);
  if (days < 7) return date.toLocaleDateString(locale, { weekday: 'long' });
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

// Sessions already in recency order, cut into day groups in that order.
export function groupByDay(
  sessions: readonly SessionListItem[],
  now: number,
  locale?: string
): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const session of sessions) {
    const label = dayOf(activityOf(session), now, locale);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.sessions.push(session);
    else groups.push({ label, sessions: [session] });
  }
  return groups;
}
