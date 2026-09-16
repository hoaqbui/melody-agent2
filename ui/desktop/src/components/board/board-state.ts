// What the Board derives without React (task 67): one card per unit of work — a session, a
// routine run, a delegated child — its status and column, which cwds the review poll asks
// git about, the filter row's choices, and the board's DESIGN.md state. Status is derived
// here and nowhere set: a card moves when its run finishes, its cwd changes, or the inbox
// marks its run read.

import type { ScheduledJobDto, ScheduleRunDto } from '@aaif/goose-acp-client';
import type { SessionListItem } from '../../acp/sessions';
import type { Delegation } from '../../acp/delegations';
import { isUnread, runOutcome, type SeenMap } from '../schedule/runs/runs-state';
import { getProjectLabel, normalizeProjectPath } from '../../utils/projectSessions';
import { worktreeBranch, worktreeSlugOf } from '../../workspace/worktree';

// DESIGN.md §Shared component states, plus `ready` for a surface with nothing unresolved.
export const BOARD_STATES = [
  'empty',
  'loading',
  'partial',
  'running',
  'error',
  'cancelled',
  'unavailable',
  'ready',
] as const;

export type BoardState = (typeof BOARD_STATES)[number];

export const BOARD_COLUMNS = ['running', 'review', 'done'] as const;

export type BoardColumn = (typeof BOARD_COLUMNS)[number];

// `failed` sits in the Done column with the danger dot: it is over, and it stays.
export type CardStatus = 'running' | 'review' | 'done' | 'failed';

export type CardKind = 'session' | 'run' | 'child';

// What this window knows of a session's stream (BaseChat's SESSION_STATUS_UPDATE); a
// session never opened here has no entry and reads as not running.
export type StreamState = 'idle' | 'loading' | 'streaming' | 'error';

// What the review poll knows of a cwd: `dirty` is a non-empty porcelain; `unreachable` is a
// cwd the sidecar refuses (outside its repository) or no sidecar at all.
export type CwdReview = 'clean' | 'dirty' | 'unreachable';

export interface BoardCard {
  id: string;
  kind: CardKind;
  title: string;
  status: CardStatus;
  // The run's outcome when the card is a run's, so the inbox can be marked read on Open.
  run?: ScheduleRunDto;
  providerId?: string;
  cwd: string;
  project: string;
  branch: string | null;
  startedAt: string;
  endedAt: string | null;
  // A session card whose cwd the review poll could not check (§States Partial).
  reviewUnknown: boolean;
}

export interface BoardInput {
  sessions: readonly SessionListItem[];
  runs: readonly ScheduleRunDto[];
  schedules: readonly ScheduledJobDto[];
  seen: SeenMap;
  streams: ReadonlyMap<string, StreamState>;
  reviews: ReadonlyMap<string, CwdReview>;
}

export function columnOf(status: CardStatus): BoardColumn {
  if (status === 'running') return 'running';
  if (status === 'review') return 'review';
  return 'done';
}

// Archived sessions are dismissed work; the wire keeps them, the board does not.
export function visibleSessions(sessions: readonly SessionListItem[]): SessionListItem[] {
  return sessions.filter((session) => !session.archivedAt);
}

export function sessionBranch(cwd: string): string | null {
  const slug = worktreeSlugOf(cwd);
  return slug === null ? null : worktreeBranch(slug);
}

function sessionStatus(stream: StreamState | undefined, review: CwdReview | undefined): CardStatus {
  if (stream === 'streaming' || stream === 'loading') return 'running';
  if (stream === 'error') return 'failed';
  if (review === 'dirty') return 'review';
  return 'done';
}

function runStatus(input: BoardInput, run: ScheduleRunDto): CardStatus {
  const outcome = runOutcome(run, input.schedules);
  if (outcome === 'running') return 'running';
  if (isUnread(input.seen, run, outcome)) return 'review';
  return outcome === 'failed' || outcome === 'killed' ? 'failed' : 'done';
}

// A routine run is listed twice on the wire — as a run and as its `scheduled` session — and
// is one card: the run's outcome and worktree, the session's title and runtime.
export function boardCards(input: BoardInput): BoardCard[] {
  const sessionsById = new Map(input.sessions.map((session) => [session.id, session]));
  const cards: BoardCard[] = [];
  for (const run of input.runs) {
    const session = sessionsById.get(run.sessionId);
    sessionsById.delete(run.sessionId);
    const cwd = normalizeProjectPath(run.workingDir);
    const status = runStatus(input, run);
    cards.push({
      id: run.sessionId,
      kind: 'run',
      title: session?.name || run.scheduleId,
      status,
      run,
      providerId: session?.providerId,
      cwd,
      project: getProjectLabel(cwd),
      branch: run.worktree?.branch ?? null,
      startedAt: run.startedAt,
      endedAt: status === 'running' ? null : (session?.updatedAt ?? null),
      reviewUnknown: false,
    });
  }
  for (const session of sessionsById.values()) {
    const cwd = normalizeProjectPath(session.workingDir);
    const review = input.reviews.get(cwd);
    const status = sessionStatus(input.streams.get(session.id), review);
    cards.push({
      id: session.id,
      kind: 'session',
      title: session.name,
      status,
      providerId: session.providerId,
      cwd,
      project: getProjectLabel(cwd),
      branch: sessionBranch(cwd),
      startedAt: session.createdAt,
      endedAt: status === 'running' ? null : (session.lastMessageAt ?? session.updatedAt),
      reviewUnknown: status !== 'running' && review !== 'clean' && review !== 'dirty',
    });
  }
  return disambiguateProjects(cards).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// Two checkouts with the same folder name read as `parent/folder`, as the sidebar's groups do
// (`projectSessions.ts`), so two `repo` sections are never one.
function disambiguateProjects(cards: BoardCard[]): BoardCard[] {
  const cwdsByLabel = new Map<string, Set<string>>();
  for (const card of cards) {
    const cwds = cwdsByLabel.get(card.project) ?? new Set<string>();
    cwds.add(card.cwd);
    cwdsByLabel.set(card.project, cwds);
  }
  return cards.map((card) => {
    if ((cwdsByLabel.get(card.project)?.size ?? 0) < 2) return card;
    const parts = card.cwd.split(/[\\/]+/).filter(Boolean);
    return parts.length >= 2 ? { ...card, project: parts.slice(-2).join('/') } : card;
  });
}

// A delegated child's row under its parent's card: `running` only from a live event; a row
// seeded from the session record is over.
export function childCard(parent: BoardCard, delegation: Delegation): BoardCard {
  const status: CardStatus =
    delegation.status === 'running'
      ? 'running'
      : delegation.status === 'failed'
        ? 'failed'
        : 'done';
  return {
    id: delegation.subagentSessionId,
    kind: 'child',
    title: delegation.title,
    status,
    providerId: delegation.provider,
    cwd: parent.cwd,
    project: parent.project,
    branch: null,
    startedAt: parent.startedAt,
    endedAt: status === 'running' ? null : (delegation.updatedAt ?? null),
    reviewUnknown: false,
  };
}

// The review poll asks git once per checkout, however many sessions sit in it; a running
// session's cwd is asked too, since it will need the answer when it stops.
export function distinctCwds(sessions: readonly SessionListItem[]): string[] {
  const cwds = new Set<string>();
  for (const session of sessions) {
    const cwd = normalizeProjectPath(session.workingDir);
    if (cwd) cwds.add(cwd);
  }
  return [...cwds].sort();
}

export interface BoardFilter {
  project: string | null;
  runtime: string | null;
  status: CardStatus | null;
}

export const NO_FILTER: BoardFilter = { project: null, runtime: null, status: null };

export function filterCards(cards: readonly BoardCard[], filter: BoardFilter): BoardCard[] {
  return cards.filter(
    (card) =>
      (filter.project === null || card.cwd === filter.project) &&
      (filter.runtime === null || card.providerId === filter.runtime) &&
      (filter.status === null || card.status === filter.status)
  );
}

export interface FilterChoices {
  projects: { cwd: string; label: string }[];
  runtimes: string[];
}

export function filterChoices(cards: readonly BoardCard[]): FilterChoices {
  const projects = new Map<string, string>();
  const runtimes = new Set<string>();
  for (const card of cards) {
    projects.set(card.cwd, card.project);
    if (card.providerId) runtimes.add(card.providerId);
  }
  return {
    projects: [...projects]
      .map(([cwd, label]) => ({ cwd, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    runtimes: [...runtimes].sort(),
  };
}

export interface ProjectSection {
  cwd: string;
  label: string;
  cards: BoardCard[];
}

// A column's cards grouped by project like the sidebar's list, newest project first.
export function groupByProject(cards: readonly BoardCard[]): ProjectSection[] {
  const sections = new Map<string, ProjectSection>();
  for (const card of cards) {
    const section = sections.get(card.cwd);
    if (section) section.cards.push(card);
    else sections.set(card.cwd, { cwd: card.cwd, label: card.project, cards: [card] });
  }
  return [...sections.values()];
}

export function boardState(input: {
  error: string | null;
  loaded: boolean;
  cards: readonly BoardCard[];
}): BoardState {
  if (input.error) return 'error';
  if (!input.loaded) return 'loading';
  if (input.cards.length === 0) return 'empty';
  if (input.cards.some((card) => card.reviewUnknown)) return 'partial';
  return 'ready';
}
