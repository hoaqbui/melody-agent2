// The Git pane (PRD step 7): the branch, the staged and unstaged lists with Stage and
// Unstage per row, and a commit box that is disabled — and says why — while a tool call is
// still running. Reaches git only through src/native/sidecar, in the sidecar's cwd; the
// "in progress" signal is the chat's own tool-call rows, never a poll.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../../components/ui/button';
import {
  sidecarFetch,
  type GitCommitRequest,
  type GitCommitResponse,
  type GitPathsRequest,
  type GitStatusEntry,
  type GitStatusResponse,
} from '../../../native/sidecar';
import { usePaneContext } from '../../pane-context';
import {
  actionablePath,
  commitBlocker,
  createGitDraftStore,
  hasToolCallInProgress,
  paneState,
  splitStatus,
  type CommitBlocker,
  type GitDraftStore,
} from './git-state';

const i18n = defineMessages({
  branch: { id: 'gitPane.branch', defaultMessage: 'Branch' },
  staged: { id: 'gitPane.staged', defaultMessage: 'Staged' },
  unstaged: { id: 'gitPane.unstaged', defaultMessage: 'Unstaged' },
  conflicts: { id: 'gitPane.conflicts', defaultMessage: 'Conflicts' },
  stage: { id: 'gitPane.stage', defaultMessage: 'Stage' },
  unstage: { id: 'gitPane.unstage', defaultMessage: 'Unstage' },
  refresh: { id: 'gitPane.refresh', defaultMessage: 'Refresh' },
  retry: { id: 'gitPane.retry', defaultMessage: 'Retry' },
  loading: { id: 'gitPane.loading', defaultMessage: 'Loading…' },
  notARepository: { id: 'gitPane.notARepository', defaultMessage: 'Not a git repository' },
  nothingToCommit: { id: 'gitPane.nothingToCommit', defaultMessage: 'Nothing to commit' },
  commitMessage: { id: 'gitPane.commitMessage', defaultMessage: 'Commit message' },
  commit: { id: 'gitPane.commit', defaultMessage: 'Commit' },
  committing: { id: 'gitPane.committing', defaultMessage: 'Committing…' },
  blockedRunning: {
    id: 'gitPane.blockedRunning',
    defaultMessage: 'Commit waits for the running tool call to finish',
  },
  blockedConflicts: {
    id: 'gitPane.blockedConflicts',
    defaultMessage: 'Resolve the conflicts to commit',
  },
  blockedNothingStaged: {
    id: 'gitPane.blockedNothingStaged',
    defaultMessage: 'Stage a file to commit',
  },
  blockedNoMessage: {
    id: 'gitPane.blockedNoMessage',
    defaultMessage: 'Write a message to commit',
  },
});

const BLOCKER_MESSAGES: Record<CommitBlocker, keyof typeof i18n> = {
  running: 'blockedRunning',
  conflicts: 'blockedConflicts',
  nothingStaged: 'blockedNothingStaged',
  noMessage: 'blockedNoMessage',
};

// One draft per cwd, kept across promote and close (DESIGN.md Nothing Lost Rule).
const drafts = new Map<string, GitDraftStore>();

function draftFor(cwd: string): GitDraftStore {
  let store = drafts.get(cwd);
  if (!store) {
    store = createGitDraftStore();
    drafts.set(cwd, store);
  }
  return store;
}

function EntryList({
  title,
  entries,
  action,
  onAction,
  testId,
}: {
  title: string;
  entries: readonly GitStatusEntry[];
  action: { label: string; testId: string } | null;
  onAction: (entry: GitStatusEntry) => void;
  testId: string;
}) {
  return (
    <section className="border-b border-border-primary" data-testid={testId}>
      <h3 className="px-2 py-1 text-xs text-text-secondary">
        {title} · {entries.length}
      </h3>
      <ul>
        {entries.map((entry) => (
          <li
            key={entry.path}
            className="flex items-center gap-2 px-2 py-0.5 hover:bg-background-secondary"
            data-testid="git-file"
            data-path={entry.path}
          >
            <span className="w-5 shrink-0 font-mono text-xs text-text-secondary">
              {entry.index}
              {entry.worktree}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={entry.path}>
              {entry.path}
            </span>
            {action && (
              <Button
                variant="ghost"
                size="xs"
                data-testid={action.testId}
                onClick={() => onAction(entry)}
              >
                {action.label}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GitPane() {
  const intl = useIntl();
  const { cwd, messages } = usePaneContext();
  const draft = draftFor(cwd);
  const message = useSyncExternalStore(draft.subscribe, draft.getState, draft.getState);
  const running = hasToolCallInProgress(messages);

  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // The last lists stay on screen while the next status loads (DESIGN.md §States, Loading).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    sidecarFetch<GitStatusResponse>('/git/status')
      .then((response) => {
        if (cancelled) return;
        setStatus(response);
        setStatusError(null);
      })
      .catch((cause: Error) => {
        if (!cancelled) setStatusError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refresh = useCallback(() => setAttempt((count) => count + 1), []);

  // A finished tool call may have written files: refetch on the running→idle edge only, so
  // streaming text never reaches git.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) refresh();
    wasRunning.current = running;
  }, [running, refresh]);

  const act = useCallback(
    (path: '/git/stage' | '/git/unstage', entry: GitStatusEntry) => {
      const request: GitPathsRequest = { paths: [actionablePath(entry)] };
      setActionError(null);
      sidecarFetch(path, request)
        .then(refresh)
        .catch((cause: Error) => setActionError(cause.message));
    },
    [refresh]
  );

  const lists = splitStatus(status?.entries ?? []);
  const blocker = commitBlocker({ running, lists, message });
  const state = paneState({ error: statusError, loaded: status !== null, running, lists });

  const commit = () => {
    if (blocker || committing) return;
    const request: GitCommitRequest = { message: message.trim() };
    setCommitting(true);
    setActionError(null);
    setOutput(null);
    sidecarFetch<GitCommitResponse>('/git/commit', request)
      .then((response) => {
        setOutput(response.output.trim());
        draft.set('');
        refresh();
      })
      .catch((cause: Error) => setActionError(cause.message))
      .finally(() => setCommitting(false));
  };

  const clean = status !== null && status.entries.length === 0;

  return (
    <div
      className="flex flex-col h-full min-h-0 text-sm"
      data-testid="git-pane"
      data-state={state}
      aria-busy={loading}
    >
      <div className="flex items-center gap-2 px-2 py-1 border-b border-border-primary">
        <span className="text-text-secondary">{intl.formatMessage(i18n.branch)}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs" data-testid="git-branch">
          {status?.branch ?? ''}
        </span>
        <Button variant="ghost" size="xs" onClick={refresh}>
          {intl.formatMessage(i18n.refresh)}
        </Button>
      </div>

      {state === 'empty' && (
        <p className="p-3 text-text-secondary">
          {intl.formatMessage(i18n.notARepository)}
          <span className="block truncate font-mono text-xs" title={cwd}>
            {cwd}
          </span>
        </p>
      )}
      {state === 'error' && (
        <div className="p-3 text-text-secondary" role="alert">
          <p className="whitespace-pre-wrap font-mono text-xs">{statusError}</p>
          <Button className="mt-2" variant="outline" size="xs" onClick={refresh}>
            {intl.formatMessage(i18n.retry)}
          </Button>
        </div>
      )}
      {state === 'loading' && (
        <p className="p-3 text-text-secondary">{intl.formatMessage(i18n.loading)}</p>
      )}

      {status && state !== 'empty' && (
        <>
          <div className="flex-1 min-h-0 overflow-auto">
            {lists.conflicted.length > 0 && (
              <EntryList
                title={intl.formatMessage(i18n.conflicts)}
                entries={lists.conflicted}
                action={null}
                onAction={() => undefined}
                testId="git-conflicts"
              />
            )}
            <EntryList
              title={intl.formatMessage(i18n.staged)}
              entries={lists.staged}
              action={{ label: intl.formatMessage(i18n.unstage), testId: 'git-unstage' }}
              onAction={(entry) => act('/git/unstage', entry)}
              testId="git-staged"
            />
            <EntryList
              title={intl.formatMessage(i18n.unstaged)}
              entries={lists.unstaged}
              action={{ label: intl.formatMessage(i18n.stage), testId: 'git-stage' }}
              onAction={(entry) => act('/git/stage', entry)}
              testId="git-unstaged"
            />
            {clean && (
              <p className="p-3 text-text-secondary" data-testid="git-clean">
                {intl.formatMessage(i18n.nothingToCommit)}
              </p>
            )}
          </div>

          {actionError && (
            <p
              className="px-2 py-1 whitespace-pre-wrap font-mono text-xs text-text-danger border-t border-border-primary"
              role="alert"
            >
              {actionError}
            </p>
          )}
          {output && (
            <pre
              className="px-2 py-1 whitespace-pre-wrap font-mono text-xs text-text-secondary border-t border-border-primary"
              data-testid="git-output"
            >
              {output}
            </pre>
          )}

          <form
            className="flex flex-col gap-1 p-2 border-t border-border-primary"
            onSubmit={(event) => {
              event.preventDefault();
              commit();
            }}
          >
            <textarea
              className="w-full rounded-md border border-border-primary bg-background-primary px-2 py-1 text-sm text-text-primary"
              rows={3}
              aria-label={intl.formatMessage(i18n.commitMessage)}
              placeholder={intl.formatMessage(i18n.commitMessage)}
              data-testid="git-message"
              value={message}
              onChange={(event) => draft.set(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.metaKey) {
                  event.preventDefault();
                  commit();
                }
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="xs"
                disabled={blocker !== null || committing}
                data-testid="git-commit"
              >
                {intl.formatMessage(committing ? i18n.committing : i18n.commit)}
              </Button>
              {blocker && (
                <span
                  className="min-w-0 truncate text-xs text-text-secondary"
                  data-testid="git-commit-blocker"
                  data-blocker={blocker}
                >
                  {intl.formatMessage(i18n[BLOCKER_MESSAGES[blocker]])}
                </span>
              )}
            </div>
          </form>
        </>
      )}
    </div>
  );
}
