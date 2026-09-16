// The Git pane (PRD step 7): the branch, the staged and unstaged lists with Stage and
// Unstage per row, a commit box that is disabled — and says why — while a tool call is
// still running, and under it the PR section (task 66): Push and open PR… until the branch
// has one, then its number, state and checks, refreshed on Refresh and every minute while
// the pane is on screen. Reaches git and gh only through src/native/sidecar, in the
// session's cwd (task 49); the "in progress" signal is the chat's own tool-call rows,
// never a poll.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CircleCheck, CircleDashed, CircleX } from 'lucide-react';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../../components/ui/button';
import {
  sidecarFetch,
  SidecarError,
  type GitCommitRequest,
  type GitCommitResponse,
  type GitCwdRequest,
  type GitPathsRequest,
  type GitPrCheck,
  type GitPrCreateResponse,
  type GitPrStatusRequest,
  type GitPrStatusResponse,
  type GitPushRequest,
  type GitStatusEntry,
  type GitStatusResponse,
} from '../../../native/sidecar';
import { cn } from '../../../utils';
import { usePaneContext } from '../../pane-context';
import {
  actionablePath,
  commitBlocker,
  createGitDraftStore,
  ghRecovery,
  hasToolCallInProgress,
  paneState,
  prBlocker,
  splitStatus,
  type CommitBlocker,
  type GhRecovery,
  type GitDraftStore,
  type PrBlocker,
} from './git-state';
import { PrSheet } from './PrSheet';

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
  pr: { id: 'gitPane.pr', defaultMessage: 'PR' },
  prOpen: { id: 'gitPane.prOpen', defaultMessage: 'Push and open PR…' },
  prPushing: { id: 'gitPane.prPushing', defaultMessage: 'Pushing…' },
  prChecking: { id: 'gitPane.prChecking', defaultMessage: 'Checking for a PR…' },
  prBlockedRunning: {
    id: 'gitPane.prBlockedRunning',
    defaultMessage: 'Push and open PR waits for the running tool call to finish',
  },
  prBlockedNoBranch: {
    id: 'gitPane.prBlockedNoBranch',
    defaultMessage: 'Check out a branch to open a PR',
  },
  prCreated: { id: 'gitPane.prCreated', defaultMessage: 'Opened #{number}' },
  prStateOpen: { id: 'gitPane.prStateOpen', defaultMessage: 'Open' },
  prStateDraft: { id: 'gitPane.prStateDraft', defaultMessage: 'Draft' },
  prStateMerged: { id: 'gitPane.prStateMerged', defaultMessage: 'Merged' },
  prStateClosed: { id: 'gitPane.prStateClosed', defaultMessage: 'Closed' },
  prChecks: { id: 'gitPane.prChecks', defaultMessage: 'Checks' },
  prNoChecks: { id: 'gitPane.prNoChecks', defaultMessage: 'No checks yet' },
  prCheckPending: { id: 'gitPane.prCheckPending', defaultMessage: 'pending' },
  prCheckPass: { id: 'gitPane.prCheckPass', defaultMessage: 'passed' },
  prCheckFail: { id: 'gitPane.prCheckFail', defaultMessage: 'failed' },
  prCheckSkipped: { id: 'gitPane.prCheckSkipped', defaultMessage: 'skipped' },
  prCheckOpen: { id: 'gitPane.prCheckOpen', defaultMessage: 'Open' },
  prInstall: { id: 'gitPane.prInstall', defaultMessage: 'Install' },
  prInstallHint: {
    id: 'gitPane.prInstallHint',
    defaultMessage: 'Install the GitHub CLI, then Refresh',
  },
  prSignIn: { id: 'gitPane.prSignIn', defaultMessage: 'Sign in' },
  prSignInHint: {
    id: 'gitPane.prSignInHint',
    defaultMessage: 'Run gh auth login in the Terminal, then Sign in checks again',
  },
});

const BLOCKER_MESSAGES: Record<CommitBlocker, keyof typeof i18n> = {
  running: 'blockedRunning',
  conflicts: 'blockedConflicts',
  nothingStaged: 'blockedNothingStaged',
  noMessage: 'blockedNoMessage',
};

const PR_BLOCKER_MESSAGES: Record<PrBlocker, keyof typeof i18n> = {
  running: 'prBlockedRunning',
  noBranch: 'prBlockedNoBranch',
};

const PR_STATE_MESSAGES: Record<string, keyof typeof i18n> = {
  OPEN: 'prStateOpen',
  MERGED: 'prStateMerged',
  CLOSED: 'prStateClosed',
};

const CHECK_MESSAGES: Record<GitPrCheck['state'], keyof typeof i18n> = {
  pending: 'prCheckPending',
  pass: 'prCheckPass',
  fail: 'prCheckFail',
  skipped: 'prCheckSkipped',
};

// DESIGN.md §Iconography (task 66): CircleCheck · CircleX · CircleDashed, on the semantic
// colour roles; skipped is the dashed circle in hint colour.
const CHECK_ICONS: Record<GitPrCheck['state'], { Icon: typeof CircleCheck; className: string }> = {
  pass: { Icon: CircleCheck, className: 'text-text-success' },
  fail: { Icon: CircleX, className: 'text-text-danger' },
  pending: { Icon: CircleDashed, className: 'text-text-warning' },
  skipped: { Icon: CircleDashed, className: 'text-text-tertiary' },
};

const PR_POLL_MS = 60_000;
const GH_INSTALL_URL = 'https://cli.github.com';

const openExternal = (url: string) => {
  void window.electron.openExternal(url);
};

interface PrFailure {
  message: string;
  recovery: GhRecovery | null;
}

function CheckRow({ check }: { check: GitPrCheck }) {
  const intl = useIntl();
  const { Icon, className } = CHECK_ICONS[check.state];
  return (
    <li
      className="flex items-center gap-2 px-2 py-0.5"
      data-testid="git-pr-check"
      data-check-state={check.state}
    >
      <Icon className={cn('size-3.5 shrink-0', className)} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-xs" title={check.name}>
        {check.name}
      </span>
      <span className="text-xs text-text-secondary">
        {intl.formatMessage(i18n[CHECK_MESSAGES[check.state]])}
      </span>
      {check.link && (
        <a
          className="text-xs underline text-text-secondary hover:text-text-primary"
          href={check.link}
          onClick={(event) => {
            event.preventDefault();
            openExternal(check.link);
          }}
        >
          {intl.formatMessage(i18n.prCheckOpen)}
        </a>
      )}
    </li>
  );
}

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
  const [prStatus, setPrStatus] = useState<GitPrStatusResponse | null>(null);
  const [prFailure, setPrFailure] = useState<PrFailure | null>(null);
  const [prTick, setPrTick] = useState(0);
  const [pushing, setPushing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [created, setCreated] = useState<GitPrCreateResponse | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // The last lists stay on screen while the next status loads (DESIGN.md §States, Loading).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const request: GitCwdRequest = { cwd };
    sidecarFetch<GitStatusResponse>('/git/status', request)
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
  }, [attempt, cwd]);

  const refresh = useCallback(() => setAttempt((count) => count + 1), []);

  // The PR status is gh's, not git's — two network calls — so only Refresh, the minute
  // poll and a created PR refetch it, never a Stage or a Commit (those bump `attempt`), and
  // a status that is not a repository never asks gh. The last answer stays on screen while
  // the next loads; a 503 keeps its Install / Sign in line until the next Refresh.
  const repository = status !== null;
  useEffect(() => {
    if (!repository) return;
    let cancelled = false;
    const request: GitPrStatusRequest = { cwd };
    sidecarFetch<GitPrStatusResponse>('/git/pr/status', request)
      .then((response) => {
        if (cancelled) return;
        setPrStatus(response);
        setPrFailure(null);
        if (response.pr) setCreated(null);
      })
      .catch((cause: Error) => {
        if (cancelled) return;
        const recovery = cause instanceof SidecarError ? ghRecovery(cause) : null;
        setPrFailure({ message: cause.message, recovery });
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, prTick, repository]);

  // Every minute while the pane is on screen: the dock keeps a hidden tab mounted, so the
  // tick checks the pane is laid out, not just mounted. A gh that is missing or logged out
  // is not polled; Refresh (or Sign in) asks again.
  const unavailable = prFailure?.recovery !== undefined && prFailure?.recovery !== null;
  useEffect(() => {
    if (!repository || unavailable) return;
    const timer = window.setInterval(() => {
      if (document.hidden || root.current?.offsetParent === null) return;
      setPrTick((count) => count + 1);
    }, PR_POLL_MS);
    return () => window.clearInterval(timer);
  }, [repository, unavailable]);

  const recheckPr = useCallback(() => setPrTick((count) => count + 1), []);
  const refreshAll = useCallback(() => {
    refresh();
    recheckPr();
  }, [refresh, recheckPr]);

  // A finished tool call may have written files: refetch on the running→idle edge only, so
  // streaming text never reaches git.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) refresh();
    wasRunning.current = running;
  }, [running, refresh]);

  const act = useCallback(
    (path: '/git/stage' | '/git/unstage', entry: GitStatusEntry) => {
      const request: GitPathsRequest = { cwd, paths: [actionablePath(entry)] };
      setActionError(null);
      sidecarFetch(path, request)
        .then(refresh)
        .catch((cause: Error) => setActionError(cause.message));
    },
    [cwd, refresh]
  );

  const lists = splitStatus(status?.entries ?? []);
  const blocker = commitBlocker({ running, lists, message });
  const state = paneState({ error: statusError, loaded: status !== null, running, lists });

  const commit = () => {
    if (blocker || committing) return;
    const request: GitCommitRequest = { cwd, message: message.trim() };
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

  const prBlock = prBlocker({ running, branch: status?.branch ?? null });

  // The push comes first so gh finds the branch on the remote; the sheet, not this click,
  // is what posts. A branch already in sync skips the push.
  const openPr = () => {
    if (!status || prBlock || pushing) return;
    setActionError(null);
    const needsPush = status.upstream === null || status.ahead > 0;
    const push = needsPush
      ? sidecarFetch('/git/push', {
          cwd,
          setUpstream: status.upstream === null,
        } satisfies GitPushRequest).then(refresh)
      : Promise.resolve();
    setPushing(true);
    push
      .then(() => setSheetOpen(true))
      .catch((cause: Error) => setActionError(cause.message))
      .finally(() => setPushing(false));
  };

  const onCreated = (pr: GitPrCreateResponse) => {
    setCreated(pr);
    recheckPr();
  };

  const pr = prStatus?.pr ?? null;
  const prState = pr ? (pr.isDraft ? 'prStateDraft' : (PR_STATE_MESSAGES[pr.state] ?? null)) : null;
  const prSectionState = prFailure
    ? prFailure.recovery
      ? 'unavailable'
      : 'error'
    : prStatus === null
      ? 'loading'
      : pr
        ? 'ready'
        : 'empty';

  return (
    <div
      ref={root}
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
        <Button variant="ghost" size="xs" onClick={refreshAll}>
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

          <section
            className="flex flex-col gap-1 p-2 border-t border-border-primary"
            data-testid="git-pr"
            data-pr-state={prSectionState}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-secondary">{intl.formatMessage(i18n.pr)}</span>
              {pr ? (
                <>
                  <a
                    className="font-mono text-xs underline hover:text-text-primary"
                    href={pr.url}
                    title={pr.url}
                    data-testid="git-pr-link"
                    onClick={(event) => {
                      event.preventDefault();
                      openExternal(pr.url);
                    }}
                  >
                    #{pr.number}
                  </a>
                  <span className="text-xs text-text-secondary" data-testid="git-pr-state">
                    {prState ? intl.formatMessage(i18n[prState]) : pr.state}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-xs text-text-tertiary"
                    data-testid="git-pr-url"
                  >
                    {pr.url}
                  </span>
                </>
              ) : created ? (
                <a
                  className="font-mono text-xs underline hover:text-text-primary"
                  href={created.url}
                  title={created.url}
                  data-testid="git-pr-link"
                  onClick={(event) => {
                    event.preventDefault();
                    openExternal(created.url);
                  }}
                >
                  {intl.formatMessage(i18n.prCreated, { number: created.number })} · {created.url}
                </a>
              ) : prSectionState === 'loading' ? (
                <span className="text-xs text-text-secondary">
                  {intl.formatMessage(i18n.prChecking)}
                </span>
              ) : prSectionState === 'empty' ? (
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={prBlock !== null || pushing}
                    data-testid="git-pr-open"
                    onClick={openPr}
                  >
                    {intl.formatMessage(pushing ? i18n.prPushing : i18n.prOpen)}
                  </Button>
                  {prBlock && (
                    <span
                      className="min-w-0 truncate text-xs text-text-secondary"
                      data-testid="git-pr-blocker"
                      data-blocker={prBlock}
                    >
                      {intl.formatMessage(i18n[PR_BLOCKER_MESSAGES[prBlock]])}
                    </span>
                  )}
                </>
              ) : null}
            </div>

            {prFailure && (
              <div className="flex flex-col gap-1" role="alert" data-testid="git-pr-error">
                <p className="whitespace-pre-wrap font-mono text-xs text-text-danger">
                  {prFailure.message}
                </p>
                {prFailure.recovery === 'install' && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      data-testid="git-pr-install"
                      onClick={() => openExternal(GH_INSTALL_URL)}
                    >
                      {intl.formatMessage(i18n.prInstall)}
                    </Button>
                    <span className="text-xs text-text-secondary">
                      {intl.formatMessage(i18n.prInstallHint)}
                    </span>
                  </div>
                )}
                {prFailure.recovery === 'signIn' && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      data-testid="git-pr-sign-in"
                      onClick={recheckPr}
                    >
                      {intl.formatMessage(i18n.prSignIn)}
                    </Button>
                    <span className="text-xs text-text-secondary">
                      {intl.formatMessage(i18n.prSignInHint)}
                    </span>
                  </div>
                )}
                {prFailure.recovery === null && (
                  <Button className="self-start" size="xs" variant="outline" onClick={recheckPr}>
                    {intl.formatMessage(i18n.retry)}
                  </Button>
                )}
              </div>
            )}

            {pr && prStatus && (
              <div>
                <h3 className="text-xs text-text-secondary">
                  {intl.formatMessage(i18n.prChecks)} · {prStatus.checks.length}
                </h3>
                {prStatus.checks.length === 0 ? (
                  <p className="px-2 text-xs text-text-secondary" data-testid="git-pr-no-checks">
                    {intl.formatMessage(i18n.prNoChecks)}
                  </p>
                ) : (
                  <ul data-testid="git-pr-checks">
                    {prStatus.checks.map((check) => (
                      <CheckRow key={`${check.name} ${check.link}`} check={check} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {status.branch && (
            <PrSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              cwd={cwd}
              branch={status.branch}
              onCreated={onCreated}
            />
          )}
        </>
      )}
    </div>
  );
}
