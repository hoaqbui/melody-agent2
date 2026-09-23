// What finished while the user was elsewhere (task 68): a routine run's outcome landing on
// the shared poll, a delegated child ending, an agent turn ending. Each becomes one finish;
// finishes within two seconds of each other become one notification ("3 workers
// finished"), shown only when no window is focused and `enableNotifications` is on —
// upstream's rule for its turn notification, which lives here now. A finish for an
// unfocused window also marks its session unread in the Sessions column, whether or not a
// notification goes out (the phone without permission has only the dot). A click focuses
// the window and lands on the thing: the session on `/pair`, or `/schedules` for a run.

import { useSyncExternalStore } from 'react';
import type { IntlShape } from 'react-intl';
import type { DelegationUpdate, ScheduleRunDto } from '@aaif/goose-acp-client';
import { defineMessages } from './i18n';
import { subscribeDelegationUpdates } from './acp/delegations';
import {
  getAwaitingApprovalDetail,
  getAwaitingApprovalSessions,
  subscribeAwaitingApprovalSessions,
} from './acp/permissionRequests';
import { getScheduleRuns, subscribeScheduleRuns } from './acp/runsPoll';
import { worktreeBranch, worktreeSlugOf } from './workspace/worktree';

const i18n = defineMessages({
  turnTitle: {
    id: 'chat.notification.taskComplete.title',
    defaultMessage: 'Melody finished the task.',
  },
  turnBody: {
    id: 'chat.notification.taskComplete.body',
    defaultMessage: 'Click here to bring Melody back into focus.',
  },
  turnWorktreeBody: {
    id: 'notifications.turn.worktreeBody',
    defaultMessage: 'Finished on {branch}. Click here to bring Melody back into focus.',
  },
  workerDone: { id: 'notifications.worker.done', defaultMessage: 'Worker finished' },
  workerFailed: { id: 'notifications.worker.failed', defaultMessage: 'Worker failed' },
  runDone: { id: 'notifications.run.done', defaultMessage: 'Routine run finished' },
  runFailed: { id: 'notifications.run.failed', defaultMessage: 'Routine run failed' },
  runKilled: { id: 'notifications.run.killed', defaultMessage: 'Routine run was stopped' },
  workersFinished: {
    id: 'notifications.burst.workers',
    defaultMessage: '{count, plural, one {# worker finished} other {# workers finished}}',
  },
  runsFinished: {
    id: 'notifications.burst.runs',
    defaultMessage: '{count, plural, one {# routine run finished} other {# routine runs finished}}',
  },
  tasksFinished: {
    id: 'notifications.burst.tasks',
    defaultMessage: '{count, plural, one {# task finished} other {# tasks finished}}',
  },
  approvalTitle: { id: 'notifications.approval.title', defaultMessage: 'Needs your approval' },
  approvalBody: {
    id: 'notifications.approval.body',
    defaultMessage: '{tool} wants to run {command}',
  },
  approvalBodyNoCommand: {
    id: 'notifications.approval.bodyNoCommand',
    defaultMessage: '{tool} needs your approval',
  },
  sessionsNeedYou: {
    id: 'notifications.burst.approvals',
    defaultMessage: '{count, plural, one {# session needs you} other {# sessions need you}}',
  },
});

export const COALESCE_MS = 2_000;
export const UNREAD_STORAGE_KEY = 'goose.unreadSessions';

export type FinishKind = 'turn' | 'worker' | 'run' | 'approval';

export interface Finish {
  kind: FinishKind;
  // The session the Sessions column marks unread and the click opens; a worker's is its
  // parent, where the delegation is visible.
  sessionId: string;
  title: string;
  body: string;
  route: string;
}

export const sessionRoute = (sessionId: string): string =>
  `/pair?resumeSessionId=${encodeURIComponent(sessionId)}`;

// --- unread sessions -------------------------------------------------------------------

let unread: ReadonlySet<string> = loadUnread();
const unreadListeners = new Set<() => void>();

function loadUnread(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(UNREAD_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function publishUnread(next: ReadonlySet<string>): void {
  unread = next;
  try {
    window.localStorage.setItem(UNREAD_STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Storage is a convenience: without it the dot lasts the window's life.
  }
  for (const listener of unreadListeners) listener();
}

export function getUnreadSessions(): ReadonlySet<string> {
  return unread;
}

export function markSessionRead(sessionId: string): void {
  if (!unread.has(sessionId)) return;
  const next = new Set(unread);
  next.delete(sessionId);
  publishUnread(next);
}

function markSessionsUnread(sessionIds: Iterable<string>): void {
  const next = new Set(unread);
  for (const id of sessionIds) next.add(id);
  if (next.size !== unread.size) publishUnread(next);
}

function subscribeUnread(listener: () => void): () => void {
  unreadListeners.add(listener);
  return () => {
    unreadListeners.delete(listener);
  };
}

export function useUnreadSessions(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeUnread, getUnreadSessions, getUnreadSessions);
}

// --- the queue --------------------------------------------------------------------------

let intl: IntlShape | null = null;
let pending: Finish[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function recordFinish(finish: Finish): void {
  pending.push(finish);
  if (timer === null) timer = setTimeout(() => void flush(), COALESCE_MS);
}

function burstTitle(finishes: readonly Finish[]): string {
  const kinds = new Set(finishes.map((finish) => finish.kind));
  const message =
    kinds.size === 1 && kinds.has('worker')
      ? i18n.workersFinished
      : kinds.size === 1 && kinds.has('run')
        ? i18n.runsFinished
        : kinds.size === 1 && kinds.has('approval')
          ? i18n.sessionsNeedYou
          : i18n.tasksFinished;
  return format(message, { count: finishes.length });
}

// A burst's body names what finished — a child's instructions, a run's snippet; a turn's body
// is upstream's "click here", so its title stands in. It opens the first finish's thing;
// workers of one parent all share it anyway.
export function coalesce(finishes: readonly Finish[]): Pick<Finish, 'title' | 'body' | 'route'> {
  const [first] = finishes;
  if (finishes.length === 1) return { title: first.title, body: first.body, route: first.route };
  return {
    title: burstTitle(finishes),
    body: finishes
      .map((finish) => (finish.kind === 'turn' ? finish.title : finish.body))
      .join(', '),
    route: first.route,
  };
}

async function flush(): Promise<void> {
  timer = null;
  const finishes = pending;
  pending = [];
  if (finishes.length === 0) return;
  try {
    const [notificationsEnabled, anyWindowFocused] = await Promise.all([
      window.electron.getSetting('enableNotifications'),
      window.electron.isAnyWindowFocused(),
    ]);
    if (anyWindowFocused) return;
    markSessionsUnread(finishes.map((finish) => finish.sessionId));
    if (notificationsEnabled === true) {
      window.electron.showNotification(coalesce(finishes));
    }
  } catch (notifyError) {
    console.warn('Failed to show task completion notification:', notifyError);
  }
}

// --- sources ----------------------------------------------------------------------------

// The turn notification upstream's `useChatSession` showed: same title and body for a
// session in the main checkout; a worktree session's body names its branch.
export function notifyTurnFinished(input: { sessionId: string; workingDir?: string }): void {
  const slug = input.workingDir ? worktreeSlugOf(input.workingDir) : null;
  const body =
    slug === null
      ? format(i18n.turnBody)
      : format(i18n.turnWorktreeBody, { branch: worktreeBranch(slug) });
  recordFinish({
    kind: 'turn',
    sessionId: input.sessionId,
    title: format(i18n.turnTitle),
    body,
    route: sessionRoute(input.sessionId),
  });
}

const reportedDelegations = new Set<string>();

function onDelegationUpdate(update: DelegationUpdate): void {
  if (update.status !== 'done' && update.status !== 'failed') return;
  const key = `${update.subagentSessionId}:${update.status}`;
  if (reportedDelegations.has(key)) return;
  reportedDelegations.add(key);
  recordFinish({
    kind: 'worker',
    sessionId: update.parentSessionId,
    title: format(update.status === 'done' ? i18n.workerDone : i18n.workerFailed),
    body: update.error ?? update.title,
    route: sessionRoute(update.parentSessionId),
  });
}

// Which runs had an outcome at the last look; null until the first list, which seeds the
// map and reports nothing — those runs finished before the window was watching.
let knownRunOutcomes: Map<string, boolean> | null = null;

function onScheduleRuns(): void {
  const { runs } = getScheduleRuns();
  if (!runs) return;
  const next = new Map(runs.map((run) => [run.sessionId, Boolean(run.outcome)]));
  if (knownRunOutcomes !== null) {
    for (const run of runs) {
      if (run.outcome && !knownRunOutcomes.get(run.sessionId)) recordFinish(runFinish(run));
    }
  }
  knownRunOutcomes = next;
}

// A session gaining a pending tool approval (task 167), seeded without firing so opening a
// window with approvals already waiting stays quiet — like the runs baseline above.
let knownAwaitingApprovals: ReadonlySet<string> | null = null;

function onAwaitingApprovalChange(): void {
  const next = getAwaitingApprovalSessions();
  if (knownAwaitingApprovals !== null) {
    for (const sessionId of next) {
      if (!knownAwaitingApprovals.has(sessionId)) recordFinish(approvalFinish(sessionId));
    }
  }
  knownAwaitingApprovals = next;
}

function approvalFinish(sessionId: string): Finish {
  const detail = getAwaitingApprovalDetail(sessionId);
  const body = detail?.command
    ? format(i18n.approvalBody, { tool: detail.toolTitle, command: detail.command })
    : format(i18n.approvalBodyNoCommand, { tool: detail?.toolTitle ?? '' });
  return {
    kind: 'approval',
    sessionId,
    title: format(i18n.approvalTitle),
    body,
    route: sessionRoute(sessionId),
  };
}

function runFinish(run: ScheduleRunDto): Finish {
  const status = run.outcome?.status;
  const title = format(
    status === 'failed' ? i18n.runFailed : status === 'killed' ? i18n.runKilled : i18n.runDone
  );
  return {
    kind: 'run',
    sessionId: run.sessionId,
    title,
    body: run.outcome?.error ?? run.snippet ?? run.scheduleId,
    route: '/schedules',
  };
}

function format(
  message: { id: string; defaultMessage: string },
  values?: Record<string, string | number>
): string {
  return intl ? intl.formatMessage(message, values) : message.defaultMessage;
}

// --- wiring -----------------------------------------------------------------------------

export function startNotifications(input: {
  intl: IntlShape;
  navigate: (route: string) => void;
}): () => void {
  intl = input.intl;
  const onClick = (_event: unknown, ...args: unknown[]) => {
    const route = args[0];
    if (typeof route === 'string') input.navigate(route);
  };
  window.electron.on('notification-click', onClick);
  const unsubscribeDelegations = subscribeDelegationUpdates(onDelegationUpdate);
  const unsubscribeRuns = subscribeScheduleRuns(onScheduleRuns);
  const unsubscribeApprovals = subscribeAwaitingApprovalSessions(onAwaitingApprovalChange);
  onScheduleRuns();
  onAwaitingApprovalChange();
  return () => {
    window.electron.off('notification-click', onClick);
    unsubscribeDelegations();
    unsubscribeRuns();
    unsubscribeApprovals();
    intl = null;
  };
}
