// The Board (task 67): every session, routine run and delegated child as a card in
// Running · Needs review · Done. Sessions come from `session/list` (paged, archived ones
// dropped), runs from `schedules/runs` with the inbox's unread mark, children from the
// delegations store. A session needs review when git's porcelain for its cwd is non-empty:
// one `/git/status` per distinct cwd, every 30 s while the route is open. Nothing here sets
// a status; a card moves when the work does.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScheduledJobDto, ScheduleRunDto } from '@aaif/goose-acp-client';
import { Kanban } from 'lucide-react';
import { defineMessages, useIntl } from '../../i18n';
import { acpListSessions, type SessionListItem } from '../../acp/sessions';
import { acpListScheduleRuns, acpListSchedules } from '../../acp/schedules';
import { sidecarFetch, type GitStatusRequest, type GitStatusResponse } from '../../native/sidecar';
import { useNavigation } from '../../hooks/useNavigation';
import { AppEvents } from '../../constants/events';
import type { WorkspaceUi } from '../../utils/settings';
import { errorMessage } from '../../utils/conversionUtils';
import { MainPanelLayout } from '../Layout/MainPanelLayout';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { runtimeLabel } from '../../workspace/session-controls';
import {
  loadSeen,
  markSeen,
  runOutcome,
  saveSeen,
  visibleRuns,
  type SeenMap,
  type SeenStorage,
} from '../schedule/runs/runs-state';
import { BoardCard } from './BoardCard';
import {
  BOARD_COLUMNS,
  boardCards,
  boardState,
  columnOf,
  distinctCwds,
  filterCards,
  filterChoices,
  groupByProject,
  NO_FILTER,
  visibleSessions,
  type BoardCard as Card,
  type BoardColumn,
  type BoardFilter,
  type CardStatus,
  type CwdReview,
} from './board-state';
import { useSessionStreams } from './session-status';

const i18n = defineMessages({
  title: { id: 'board.title', defaultMessage: 'Board' },
  description: {
    id: 'board.description',
    defaultMessage: 'What every session, routine and worker is doing, and which ones need you.',
  },
  columnRunning: { id: 'board.columnRunning', defaultMessage: 'Running' },
  columnReview: { id: 'board.columnReview', defaultMessage: 'Needs review' },
  columnDone: { id: 'board.columnDone', defaultMessage: 'Done' },
  empty: { id: 'board.empty', defaultMessage: 'Nothing running — start a chat' },
  derived: {
    id: 'board.derived',
    defaultMessage:
      'Cards move on their own: a column is read from the work — a reply streaming, changes uncommitted, a run unopened — never dragged.',
  },
  newChat: { id: 'board.newChat', defaultMessage: 'New chat' },
  retry: { id: 'board.retry', defaultMessage: 'Retry' },
  loading: { id: 'board.loading', defaultMessage: 'Loading' },
  filterProject: { id: 'board.filterProject', defaultMessage: 'Project' },
  filterRuntime: { id: 'board.filterRuntime', defaultMessage: 'Runtime' },
  filterStatus: { id: 'board.filterStatus', defaultMessage: 'Status' },
  filterAll: { id: 'board.filterAll', defaultMessage: 'All' },
  statusRunning: { id: 'board.filterRunning', defaultMessage: 'Running' },
  statusReview: { id: 'board.filterReview', defaultMessage: 'Needs review' },
  statusDone: { id: 'board.filterDone', defaultMessage: 'Done' },
  statusFailed: { id: 'board.filterFailed', defaultMessage: 'Failed' },
  noMatch: { id: 'board.noMatch', defaultMessage: 'No cards match these filters' },
});

const COLUMN_MESSAGES = {
  running: i18n.columnRunning,
  review: i18n.columnReview,
  done: i18n.columnDone,
} as const;

const STATUS_FILTERS: readonly CardStatus[] = ['running', 'review', 'done', 'failed'];
const STATUS_FILTER_MESSAGES = {
  running: i18n.statusRunning,
  review: i18n.statusReview,
  done: i18n.statusDone,
  failed: i18n.statusFailed,
} as const;

const POLL_MS = 30_000;
const RUNS_LIMIT = 50;
// Four pages of the server's fifty: the board is the recent work, not the archive.
const SESSION_PAGES = 4;

function localStorageOrNull(): SeenStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

async function listBoardSessions(): Promise<SessionListItem[]> {
  const sessions: SessionListItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < SESSION_PAGES; page++) {
    const listed = await acpListSessions(cursor);
    sessions.push(...listed.sessions);
    cursor = listed.nextCursor;
    if (!cursor) break;
  }
  return visibleSessions(sessions);
}

// A refused cwd (outside the sidecar's repository) and a missing sidecar read the same to
// the card: the check could not run, so the card stays without it.
async function reviewCwd(cwd: string): Promise<CwdReview> {
  try {
    const request: GitStatusRequest = { cwd };
    const status = await sidecarFetch<GitStatusResponse>('/git/status', request);
    return status.entries.length > 0 ? 'dirty' : 'clean';
  } catch {
    return 'unreachable';
  }
}

async function reviewCwds(cwds: readonly string[]): Promise<Map<string, CwdReview>> {
  const answers = await Promise.all(cwds.map(async (cwd) => [cwd, await reviewCwd(cwd)] as const));
  return new Map(answers);
}

const selectClass =
  'rounded-md border border-border-primary bg-background-primary px-1 py-0.5 text-xs text-text-primary';

function SkeletonColumns() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="board-skeleton">
      {BOARD_COLUMNS.map((column) => (
        <div key={column} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-16 w-full rounded-panel" />
          <Skeleton className="h-16 w-full rounded-panel" />
        </div>
      ))}
    </div>
  );
}

interface ColumnProps {
  column: BoardColumn;
  cards: Card[];
  showProjects: boolean;
  onOpen: (card: Card) => void;
}

function Column({ column, cards, showProjects, onOpen }: ColumnProps) {
  const intl = useIntl();
  return (
    <section
      className="flex min-w-0 flex-col gap-2"
      data-testid={`board-column-${column}`}
      aria-labelledby={`board-column-${column}-title`}
    >
      <h2
        id={`board-column-${column}-title`}
        className="flex items-center gap-2 text-sm font-medium text-text-secondary"
      >
        {intl.formatMessage(COLUMN_MESSAGES[column])}
        <span className="font-mono text-xs" data-testid={`board-column-${column}-count`}>
          {cards.length}
        </span>
      </h2>
      {groupByProject(cards).map((section) => (
        <div key={section.cwd} className="flex flex-col gap-1">
          {showProjects && (
            <div
              className="truncate px-1 text-[10px] uppercase tracking-wider text-text-tertiary"
              title={section.cwd}
            >
              {section.label}
            </div>
          )}
          <ul className="flex flex-col gap-2">
            {section.cards.map((card) => (
              <BoardCard key={card.id} card={card} onOpen={onOpen} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function BoardView() {
  const intl = useIntl();
  const setView = useNavigation();
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [runs, setRuns] = useState<ScheduleRunDto[]>([]);
  const [schedules, setSchedules] = useState<ScheduledJobDto[]>([]);
  const [reviews, setReviews] = useState<Map<string, CwdReview> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workspaceUi, setWorkspaceUi] = useState<WorkspaceUi | undefined>();
  const [filter, setFilter] = useState<BoardFilter>(NO_FILTER);
  const storage = useRef(localStorageOrNull());
  const [seen, setSeen] = useState<SeenMap>(() => loadSeen(storage.current));
  const streams = useSessionStreams();

  // The lists first, then git for each cwd they name — the board is not ready before both.
  const refresh = useCallback(async () => {
    try {
      const [listed, listedRuns, listedSchedules] = await Promise.all([
        listBoardSessions(),
        acpListScheduleRuns(RUNS_LIMIT).then(visibleRuns),
        acpListSchedules(),
      ]);
      const reviewed = await reviewCwds(distinctCwds(listed));
      setSessions(listed);
      setRuns(listedRuns);
      setSchedules(listedSchedules);
      setReviews(reviewed);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Failed to list work'));
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    window.electron.getSetting('workspace.ui').then(setWorkspaceUi).catch(console.error);
    const onChange = (event: Event) => setWorkspaceUi((event as CustomEvent<WorkspaceUi>).detail);
    window.addEventListener(AppEvents.WORKSPACE_UI_CHANGED, onChange);
    return () => window.removeEventListener(AppEvents.WORKSPACE_UI_CHANGED, onChange);
  }, []);

  const open = (card: Card) => {
    if (card.run) {
      const next = markSeen(seen, card.run, runOutcome(card.run, schedules));
      setSeen(next);
      saveSeen(storage.current, next);
    }
    setView('pair', { disableAnimation: true, resumeSessionId: card.id });
  };

  const loaded = sessions !== null && reviews !== null;
  const cards = loaded ? boardCards({ sessions, runs, schedules, seen, streams, reviews }) : [];
  const state = boardState({ error, loaded, cards });
  const shown = filterCards(cards, filter);
  const choices = filterChoices(cards);
  const showProjects = choices.projects.length > 1;
  const advanced = workspaceUi === 'advanced';

  return (
    <MainPanelLayout>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="bg-background-primary px-8 pb-6 pt-16">
          <div className="flex flex-col page-transition">
            <h1 className="text-4xl font-light">{intl.formatMessage(i18n.title)}</h1>
            <p className="mb-1 text-sm text-text-secondary">
              {intl.formatMessage(i18n.description)}
            </p>
          </div>
        </div>

        <div className="flex-1 min-h-0 relative px-8">
          <ScrollArea className="h-full">
            <div
              className="pb-8"
              data-testid="board"
              data-state={state}
              data-ui={workspaceUi}
              aria-busy={state === 'loading'}
            >
              {advanced && state !== 'loading' && state !== 'error' && (
                <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="board-filters">
                  <select
                    className={selectClass}
                    aria-label={intl.formatMessage(i18n.filterProject)}
                    data-testid="board-filter-project"
                    value={filter.project ?? ''}
                    onChange={(event) =>
                      setFilter({ ...filter, project: event.target.value || null })
                    }
                  >
                    <option value="">
                      {intl.formatMessage(i18n.filterProject)} ·{' '}
                      {intl.formatMessage(i18n.filterAll)}
                    </option>
                    {choices.projects.map((project) => (
                      <option key={project.cwd} value={project.cwd}>
                        {project.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClass}
                    aria-label={intl.formatMessage(i18n.filterRuntime)}
                    data-testid="board-filter-runtime"
                    value={filter.runtime ?? ''}
                    onChange={(event) =>
                      setFilter({ ...filter, runtime: event.target.value || null })
                    }
                  >
                    <option value="">
                      {intl.formatMessage(i18n.filterRuntime)} ·{' '}
                      {intl.formatMessage(i18n.filterAll)}
                    </option>
                    {choices.runtimes.map((runtime) => (
                      <option key={runtime} value={runtime}>
                        {runtimeLabel(runtime, [])}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClass}
                    aria-label={intl.formatMessage(i18n.filterStatus)}
                    data-testid="board-filter-status"
                    value={filter.status ?? ''}
                    onChange={(event) =>
                      setFilter({
                        ...filter,
                        status: (event.target.value || null) as CardStatus | null,
                      })
                    }
                  >
                    <option value="">
                      {intl.formatMessage(i18n.filterStatus)} · {intl.formatMessage(i18n.filterAll)}
                    </option>
                    {STATUS_FILTERS.map((status) => (
                      <option key={status} value={status}>
                        {intl.formatMessage(STATUS_FILTER_MESSAGES[status])}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {state === 'error' && (
                <div className="rounded-panel bg-background-danger p-4" role="alert">
                  <p className="whitespace-pre-wrap font-mono text-xs text-text-danger">{error}</p>
                  <Button className="mt-2" variant="outline" size="xs" onClick={refresh}>
                    {intl.formatMessage(i18n.retry)}
                  </Button>
                </div>
              )}
              {state === 'loading' && (
                <>
                  <span className="sr-only">{intl.formatMessage(i18n.loading)}</span>
                  <SkeletonColumns />
                </>
              )}
              {state === 'empty' && (
                <div className="flex flex-col items-start gap-3 pt-2" data-testid="board-empty">
                  <Kanban className="size-5 text-text-secondary" aria-hidden />
                  <p className="text-base font-light text-text-secondary">
                    {intl.formatMessage(i18n.empty)}
                  </p>
                  <p className="max-w-prose text-sm text-text-tertiary">
                    {intl.formatMessage(i18n.derived)}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => setView('chat')}>
                    {intl.formatMessage(i18n.newChat)}
                  </Button>
                </div>
              )}
              {(state === 'ready' || state === 'partial') && (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {BOARD_COLUMNS.map((column) => (
                      <Column
                        key={column}
                        column={column}
                        cards={shown.filter((card) => columnOf(card.status) === column)}
                        showProjects={showProjects}
                        onOpen={open}
                      />
                    ))}
                  </div>
                  {shown.length === 0 && (
                    <p className="mt-4 text-sm text-text-secondary" data-testid="board-no-match">
                      {intl.formatMessage(i18n.noMatch)}
                    </p>
                  )}
                  <p className="mt-6 text-xs text-text-tertiary">
                    {intl.formatMessage(i18n.derived)}
                  </p>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </MainPanelLayout>
  );
}
