// The Runs inbox (task 53): every scheduled run across schedules, newest first, from the
// poll it shares with the finish notifications (`acp/runsPoll.ts`, task 68). Open lands in
// pair with Changes since session start; Dismiss archives the session; Accept stages the
// paths the run's diff touches and commits them through the sidecar, only in the checkout
// this window's sidecar serves. A run that had its own worktree (task 54) commits there and
// Accept then merges its branch into the main checkout; Dismiss removes the worktree first.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScheduledJobDto, ScheduleRunDto } from '@aaif/goose-acp-client';
import { Inbox } from 'lucide-react';
import { defineMessages, useIntl } from '../../../i18n';
import { refreshScheduleRuns, useScheduleRuns } from '../../../acp/runsPoll';
import { acpArchiveSession } from '../../../acp/sessions';
import { useConfig } from '../../ConfigContext';
import { useNavigation } from '../../../hooks/useNavigation';
import {
  sidecarFetch,
  type GitCommitRequest,
  type GitCommitResponse,
  type GitDiffRequest,
  type GitDiffResponse,
  type GitMergeRequest,
  type GitMergeResponse,
  type GitPathsRequest,
  type GitRevParseRequest,
  type GitRevParseResponse,
  type GitStatusRequest,
  type GitStatusResponse,
  type GitWorktreeRemoveRequest,
  type SidecarConfig,
} from '../../../native/sidecar';
import { Button } from '../../ui/button';
import { toastSuccess } from '../../../toasts';
import { RunRow } from './RunRow';
import {
  acceptBlocker,
  acceptCheckout,
  acceptMessage,
  acceptPaths,
  inboxState,
  isUnread,
  loadSeen,
  markSeen,
  pruneSeen,
  runActionError,
  runOutcome,
  runWorktreePlace,
  saveSeen,
  untracked,
  visibleRuns,
  type RunActionError,
  type SeenMap,
  type SeenStorage,
} from './runs-state';

const i18n = defineMessages({
  title: { id: 'runsInbox.title', defaultMessage: 'Runs' },
  description: {
    id: 'runsInbox.description',
    defaultMessage:
      'What your schedules did while you were away. Open a run to review its changes.',
  },
  loading: { id: 'runsInbox.loading', defaultMessage: 'Loading…' },
  retry: { id: 'runsInbox.retry', defaultMessage: 'Retry' },
  empty: { id: 'runsInbox.empty', defaultMessage: 'No runs yet' },
  noChanges: {
    id: 'runsInbox.noChanges',
    defaultMessage: 'No changes since the run started — nothing to accept',
  },
  accepted: { id: 'runsInbox.accepted', defaultMessage: 'Accepted' },
  merged: {
    id: 'runsInbox.merged',
    defaultMessage: 'Merged {branch} into {checkout} at {sha}',
  },
});

function localStorageOrNull(): SeenStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface RunsInboxProps {
  schedules: readonly ScheduledJobDto[];
}

export function RunsInbox({ schedules }: RunsInboxProps) {
  const intl = useIntl();
  const setView = useNavigation();
  const { config } = useConfig();
  const { runs: listed, error } = useScheduleRuns();
  const runs = useMemo(() => (listed ? visibleRuns(listed) : null), [listed]);
  // undefined until /config answers; null when the sidecar is not reachable.
  const [sidecarCwd, setSidecarCwd] = useState<string | null | undefined>();
  const [acting, setActing] = useState<Set<string>>(new Set());
  const [actionErrors, setActionErrors] = useState<Record<string, RunActionError>>({});
  const storage = useRef(localStorageOrNull());
  const [seen, setSeen] = useState<SeenMap>(() => loadSeen(storage.current));

  // The shared poll runs for the app's life; opening the inbox should not wait for its tick.
  useEffect(() => {
    void refreshScheduleRuns();
  }, []);

  useEffect(() => {
    if (!runs) return;
    setSeen((current) => {
      const pruned = pruneSeen(current, runs);
      if (pruned !== current) saveSeen(storage.current, pruned);
      return pruned;
    });
  }, [runs]);

  useEffect(() => {
    let cancelled = false;
    sidecarFetch<SidecarConfig>('/config')
      .then((response) => {
        if (!cancelled) setSidecarCwd(response.GOOSE_WORKING_DIR);
      })
      .catch(() => {
        if (!cancelled) setSidecarCwd(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remember = (next: SeenMap) => {
    setSeen(next);
    saveSeen(storage.current, next);
  };

  const withActing = async (sessionId: string, action: () => Promise<void>) => {
    setActing((current) => new Set(current).add(sessionId));
    setActionErrors(({ [sessionId]: _dropped, ...rest }) => rest);
    try {
      await action();
    } catch (cause) {
      setActionErrors((current) => ({ ...current, [sessionId]: runActionError(cause, 'Failed') }));
    } finally {
      setActing((current) => {
        const next = new Set(current);
        next.delete(sessionId);
        return next;
      });
    }
  };

  const open = (run: ScheduleRunDto) => {
    remember(markSeen(seen, run, runOutcome(run, schedules)));
    setView('pair', {
      disableAnimation: true,
      resumeSessionId: run.sessionId,
      openPane: 'diff',
      diffBase: 'session',
    });
  };

  // A worktree's branch may be merged or not; the worktree goes either way, so `force`.
  const dismiss = (run: ScheduleRunDto) =>
    withActing(run.sessionId, async () => {
      const place = runWorktreePlace(run);
      if (place) {
        const remove: GitWorktreeRemoveRequest = { cwd: place.main, slug: place.slug, force: true };
        await sidecarFetch('/git/worktree/remove', remove);
      }
      await acpArchiveSession(run.sessionId);
      await refreshScheduleRuns();
    });

  // The base is HEAD as the reflog had it when the run started, so a commit the run made
  // itself is inside the diff; before the reflog begins git answers with its oldest entry.
  // A worktree run commits in the worktree (its reflog starts at creation, before the run)
  // and an empty diff is not an error there: the branch may already carry the run's commits.
  const accept = (run: ScheduleRunDto) =>
    withActing(run.sessionId, async () => {
      const place = runWorktreePlace(run);
      const cwd = run.workingDir;
      const revParse: GitRevParseRequest = { cwd, rev: `HEAD@{${run.startedAt}}` };
      const { sha } = await sidecarFetch<GitRevParseResponse>('/git/rev-parse', revParse);
      const diff: GitDiffRequest = { cwd, base: sha, context: 0 };
      const status: GitStatusRequest = { cwd };
      const [diffResponse, statusResponse] = await Promise.all([
        sidecarFetch<GitDiffResponse>('/git/diff', diff),
        sidecarFetch<GitStatusResponse>('/git/status', status),
      ]);
      const paths = acceptPaths(diffResponse.diff, untracked(statusResponse.entries));
      if (paths.length === 0 && !place) throw new Error(intl.formatMessage(i18n.noChanges));
      let output = '';
      if (paths.length > 0) {
        const stage: GitPathsRequest = { cwd, paths };
        await sidecarFetch('/git/stage', stage);
        const commit: GitCommitRequest = { cwd, message: acceptMessage(run.scheduleId) };
        output = (await sidecarFetch<GitCommitResponse>('/git/commit', commit)).output;
      }
      if (place) {
        const merge: GitMergeRequest = { cwd: place.main, slug: place.slug };
        const merged = await sidecarFetch<GitMergeResponse>('/git/merge', merge);
        output = intl.formatMessage(i18n.merged, {
          branch: place.branch,
          checkout: place.main,
          sha: merged.sha.slice(0, 7),
        });
      }
      remember(markSeen(seen, run, runOutcome(run, schedules)));
      toastSuccess({ title: intl.formatMessage(i18n.accepted), msg: output.trim() });
    });

  const state = inboxState({
    error,
    loaded: runs !== null,
    acting: acting.size > 0,
    sidecarCwd,
    runs: runs ?? [],
  });
  const mode = typeof config.GOOSE_MODE === 'string' ? config.GOOSE_MODE : null;

  return (
    <section
      className="mb-6"
      data-testid="runs-inbox"
      data-state={state}
      aria-busy={state === 'loading'}
      aria-labelledby="runs-inbox-title"
    >
      <div className="mb-2">
        <h2 id="runs-inbox-title" className="text-xl font-light">
          {intl.formatMessage(i18n.title)}
        </h2>
        <p className="text-sm text-text-secondary">{intl.formatMessage(i18n.description)}</p>
      </div>

      {state === 'error' && (
        <div className="rounded-panel bg-background-danger p-4" role="alert">
          <p className="whitespace-pre-wrap font-mono text-xs text-text-danger">{error}</p>
          <Button
            className="mt-2"
            variant="outline"
            size="xs"
            onClick={() => void refreshScheduleRuns()}
          >
            {intl.formatMessage(i18n.retry)}
          </Button>
        </div>
      )}
      {state === 'loading' && (
        <p className="text-sm text-text-secondary">{intl.formatMessage(i18n.loading)}</p>
      )}
      {state === 'empty' && (
        <div className="flex flex-col pt-2 pb-4">
          <Inbox className="mb-3.5 size-5 text-text-secondary" />
          <p className="text-base font-light text-text-secondary">
            {intl.formatMessage(i18n.empty)}
          </p>
        </div>
      )}

      {runs && runs.length > 0 && (
        <ul className="space-y-2">
          {runs.map((run) => {
            const outcome = runOutcome(run, schedules);
            return (
              <RunRow
                key={run.sessionId}
                scheduleId={run.scheduleId}
                sessionId={run.sessionId}
                startedAt={run.startedAt}
                outcome={outcome}
                error={run.outcome?.error}
                snippet={run.snippet}
                workingDir={run.workingDir}
                branch={run.worktree?.branch}
                mode={mode}
                unread={isUnread(seen, run, outcome)}
                acceptBlocker={acceptBlocker({
                  outcome,
                  checkout: acceptCheckout(run),
                  sidecarCwd: sidecarCwd ?? null,
                })}
                busy={acting.has(run.sessionId)}
                actionError={actionErrors[run.sessionId]?.message}
                conflicts={actionErrors[run.sessionId]?.conflicts}
                onOpen={() => open(run)}
                onAccept={() => accept(run)}
                onDismiss={() => dismiss(run)}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
