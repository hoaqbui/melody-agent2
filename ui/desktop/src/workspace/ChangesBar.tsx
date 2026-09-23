import { useEffect, useRef, useState } from 'react';
import { useContext } from 'react';
import { ChangesBarTarget, type ChangesBarTargetValue } from './changes-bar-slot';
import {
  parseNumstat,
  aggregateStats,
  barPhase,
  createChangesBarContext,
  shortSha,
  COMMITTED_DISPLAY_MS,
  type ChangesBarContext,
} from './changes-bar';
import { buildPushRequest, splitStatus } from './panes/git/git-state';
import { draftCommitMessage } from './panes/git/commit-draft';
import { sidecarFetch } from '../native/sidecar';
import { presetDiffPath } from './panes/diff/diff-store';
import { Button } from '../components/ui/button';
import { defineMessages, useIntl } from '../i18n';

const i18n = defineMessages({
  review: { id: 'changesBar.review', defaultMessage: 'Review' },
  commit: { id: 'changesBar.commit', defaultMessage: 'Commit…' },
  commitSend: { id: 'changesBar.commitSend', defaultMessage: 'Commit' },
  commitPlaceholder: { id: 'changesBar.commitPlaceholder', defaultMessage: 'Commit message' },
  cancel: { id: 'changesBar.cancel', defaultMessage: 'Cancel' },
  committing: { id: 'changesBar.committing', defaultMessage: 'Committing…' },
  committed: { id: 'changesBar.committed', defaultMessage: 'Committed' },
  push: { id: 'changesBar.push', defaultMessage: 'Push' },
  pushing: { id: 'changesBar.pushing', defaultMessage: 'Pushing…' },
  unstage: { id: 'changesBar.unstage', defaultMessage: 'Unstage' },
  stagedNotCommitted: {
    id: 'changesBar.stagedNotCommitted',
    defaultMessage: 'staged · not committed',
  },
  discard: { id: 'changesBar.discard', defaultMessage: 'Discard' },
  undo: { id: 'changesBar.undo', defaultMessage: 'Undo' },
  discarded: { id: 'changesBar.discarded', defaultMessage: 'Discarded' },
  retry: { id: 'changesBar.retry', defaultMessage: 'Retry' },
  files: { id: 'changesBar.files', defaultMessage: '{count, plural, one {file} other {files}}' },
  binary: {
    id: 'changesBar.binary',
    defaultMessage: '{count, plural, one {binary file} other {binary files}}',
  },
});

export function ChangesBar({ paneContext }: { paneContext: ChangesBarTargetValue }) {
  const intl = useIntl();
  const [context, setContext] = useState<ChangesBarContext>(createChangesBarContext());
  const [message, setMessage] = useState('');
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  // What Cancel returns to, and whether Commit needs to stage first (staged-not-committed
  // has nothing left to stage) — snapshotted when Commit… opens the box.
  const preComposeRef = useRef<ChangesBarContext | null>(null);
  // While the committed banner is up, an incoming status poll (even one reporting the now
  // -clean tree) does not get to cut it short — it clears itself on its own timer.
  const suppressUntilRef = useRef(0);
  const committedTimerRef = useRef<number | null>(null);
  // Read inside the status-poll effect below so a poll mid-compose never overwrites what
  // the user is typing; kept current every render, not a dependency of that effect.
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(
    () => () => {
      if (committedTimerRef.current !== null) window.clearTimeout(committedTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (Date.now() < suppressUntilRef.current) return;
    const composing =
      contextRef.current.state === 'composing' || contextRef.current.state === 'committing';
    if (composing) return;

    const entries = paneContext.gitStatus?.entries ?? [];
    const phase = barPhase(entries);

    if (phase === 'empty') {
      setContext(createChangesBarContext());
      return;
    }

    if (phase === 'staged') {
      const lists = splitStatus(entries);
      setContext((prev) => ({
        ...prev,
        state: 'staged',
        stats: { fileCount: lists.staged.length, totalAdded: 0, totalDeleted: 0, entries: [] },
        error: null,
      }));
      return;
    }

    let cancelled = false;

    const fetchStats = async () => {
      setContext((prev) => ({ ...prev, state: prev.stats ? 'dirty' : 'loading', error: null }));

      try {
        const response = await sidecarFetch<{ diff: string }>('/git/diff', {
          cwd: paneContext.cwd,
          numstat: true,
        });
        const stats = aggregateStats(parseNumstat(response.diff));

        if (!cancelled) {
          setContext((prev) => ({ ...prev, state: 'dirty', stats, error: null }));
        }
      } catch (error) {
        if (!cancelled) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          setContext((prev) => ({ ...prev, state: 'error', error: msg, stats: null }));
        }
      }
    };

    fetchStats();

    return () => {
      cancelled = true;
    };
  }, [paneContext.gitStatus, paneContext.cwd]);

  const handleReview = () => {
    if (context.stats && context.stats.entries.length > 0) {
      presetDiffPath(context.stats.entries[0].path);
    }
    paneContext.openPane('diff');
  };

  const openCompose = () => {
    preComposeRef.current = context;
    setMessage((prev) => (prev.trim() ? prev : draftCommitMessage(paneContext.messages)));
    setContext((prev) => ({ ...prev, state: 'composing' }));
  };

  const cancelCompose = () => {
    if (preComposeRef.current) setContext(preComposeRef.current);
    preComposeRef.current = null;
  };

  const handleCommit = async () => {
    const trimmed = message.trim();
    if (!trimmed || context.state === 'committing') return;

    const wasStaged = preComposeRef.current?.state === 'staged';
    const paths = wasStaged ? [] : (context.stats?.entries.map((entry) => entry.path) ?? []);
    preComposeRef.current = null;

    setContext((prev) => ({ ...prev, state: 'committing', error: null }));

    try {
      if (paths.length > 0) {
        await sidecarFetch('/git/stage', { cwd: paneContext.cwd, paths });
      }
      await sidecarFetch('/git/commit', { cwd: paneContext.cwd, message: trimmed });
      const { sha } = await sidecarFetch<{ sha: string }>('/git/rev-parse', {
        cwd: paneContext.cwd,
        rev: 'HEAD',
      });

      setMessage('');
      suppressUntilRef.current = Date.now() + COMMITTED_DISPLAY_MS;
      setContext((prev) => ({
        ...prev,
        state: 'committed',
        stats: null,
        error: null,
        committed: { sha: shortSha(sha), subject: trimmed.split('\n')[0].trim() },
      }));

      if (committedTimerRef.current !== null) window.clearTimeout(committedTimerRef.current);
      committedTimerRef.current = window.setTimeout(() => {
        committedTimerRef.current = null;
        setContext(createChangesBarContext());
      }, COMMITTED_DISPLAY_MS);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to commit';
      setContext((prev) => ({ ...prev, state: 'error', error: msg }));
    }
  };

  const handleUnstage = async () => {
    if (!context.stats) return;
    try {
      const entries = paneContext.gitStatus?.entries ?? [];
      const paths = splitStatus(entries).staged.map((entry) => entry.path);
      await sidecarFetch('/git/unstage', { cwd: paneContext.cwd, paths });

      const response = await sidecarFetch<{ diff: string }>('/git/diff', {
        cwd: paneContext.cwd,
        numstat: true,
      });
      const stats = aggregateStats(parseNumstat(response.diff));
      setContext((prev) => ({ ...prev, state: 'dirty', stats, error: null }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to unstage files';
      setContext((prev) => ({ ...prev, state: 'error', error: msg }));
    }
  };

  const handleDiscard = async () => {
    try {
      if (context.state === 'discarding') return;
      setContext((prev) => ({ ...prev, state: 'discarding', error: null }));

      const response = await sidecarFetch<{ stash: string }>('/git/discard', {
        cwd: paneContext.cwd,
      });
      const stash = response.stash;

      setContext((prev) => ({
        ...prev,
        state: 'discarded',
        stats: null,
        error: null,
        lastDiscard: stash,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to discard changes';
      setContext((prev) => ({
        ...prev,
        state: 'error',
        error: message,
      }));
    }
  };

  const handleUndo = async () => {
    if (!context.lastDiscard) return;

    try {
      setContext((prev) => ({ ...prev, state: 'loading', error: null }));

      await sidecarFetch('/git/discard-undo', {
        cwd: paneContext.cwd,
        stash: context.lastDiscard,
      });

      setContext((prev) => ({
        ...prev,
        state: 'loading',
        lastDiscard: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to undo discard';
      setContext((prev) => ({
        ...prev,
        state: 'error',
        error: message,
      }));
    }
  };

  const handlePush = async () => {
    const status = paneContext.gitStatus;
    if (!status || pushing) return;
    setPushError(null);
    setPushing(true);
    try {
      await sidecarFetch('/git/push', buildPushRequest(paneContext.cwd, status));
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Failed to push');
    } finally {
      setPushing(false);
    }
  };

  const handleRetry = () => {
    setContext((prev) => ({
      ...prev,
      state: 'empty',
      error: null,
    }));
  };

  if (context.state === 'empty') {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 border-b border-border-primary bg-background-primary px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {context.state === 'loading' && !context.stats && (
          <span className="text-sm text-text-secondary">…</span>
        )}

        {(context.state === 'dirty' || context.state === 'discarding') && context.stats && (
          <>
            <span className="text-sm text-text-primary" data-testid="changes-bar-stats">
              {context.stats.fileCount}{' '}
              {intl.formatMessage(i18n.files, { count: context.stats.fileCount })} · +
              {context.stats.totalAdded} −{context.stats.totalDeleted}
            </span>

            <Button
              data-testid="changes-bar-review"
              size="xs"
              variant="secondary"
              onClick={handleReview}
            >
              {intl.formatMessage(i18n.review)}
            </Button>

            <Button size="xs" onClick={openCompose} data-testid="changes-bar-commit">
              {intl.formatMessage(i18n.commit)}
            </Button>

            <Button
              size="xs"
              variant="secondary"
              onClick={handleDiscard}
              disabled={context.state === 'discarding'}
              data-testid="changes-bar-discard"
            >
              {intl.formatMessage(i18n.discard)}
            </Button>
          </>
        )}

        {context.state === 'staged' && context.stats && (
          <>
            <span className="text-sm text-text-primary" data-testid="changes-bar-stats">
              {context.stats.fileCount}{' '}
              {intl.formatMessage(i18n.files, { count: context.stats.fileCount })}{' '}
              {intl.formatMessage(i18n.stagedNotCommitted)}
            </span>

            <Button size="xs" onClick={openCompose} data-testid="changes-bar-commit">
              {intl.formatMessage(i18n.commit)}
            </Button>

            <Button
              size="xs"
              variant="secondary"
              onClick={handleUnstage}
              data-testid="changes-bar-unstage"
            >
              {intl.formatMessage(i18n.unstage)}
            </Button>
          </>
        )}

        {context.state === 'composing' && (
          <form
            className="flex flex-1 flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              handleCommit();
            }}
          >
            <input
              className="min-w-0 flex-1 rounded-md border border-border-primary bg-background-primary px-2 py-1 text-sm text-text-primary"
              autoFocus
              value={message}
              placeholder={intl.formatMessage(i18n.commitPlaceholder)}
              aria-label={intl.formatMessage(i18n.commitPlaceholder)}
              data-testid="changes-bar-commit-input"
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelCompose();
                }
              }}
            />
            <Button
              type="submit"
              size="xs"
              disabled={message.trim() === ''}
              data-testid="changes-bar-commit-send"
            >
              {intl.formatMessage(i18n.commitSend)}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={cancelCompose}
              data-testid="changes-bar-commit-cancel"
            >
              {intl.formatMessage(i18n.cancel)}
            </Button>
          </form>
        )}

        {context.state === 'committing' && (
          <span className="text-sm text-text-secondary">{intl.formatMessage(i18n.committing)}</span>
        )}

        {context.state === 'committed' && context.committed && (
          <>
            <span className="text-sm text-text-primary" data-testid="changes-bar-committed">
              {intl.formatMessage(i18n.committed)}{' '}
              <span className="font-mono text-xs text-text-secondary">{context.committed.sha}</span>{' '}
              · {context.committed.subject}
            </span>

            <Button
              size="xs"
              variant="outline"
              onClick={handlePush}
              disabled={pushing}
              data-testid="changes-bar-push"
            >
              {intl.formatMessage(pushing ? i18n.pushing : i18n.push)}
            </Button>
          </>
        )}

        {context.state === 'discarded' && (
          <>
            <span className="text-sm text-text-secondary">
              {intl.formatMessage(i18n.discarded)} ·{' '}
            </span>
            <Button
              size="xs"
              variant="secondary"
              onClick={handleUndo}
              data-testid="changes-bar-undo"
            >
              {intl.formatMessage(i18n.undo)}
            </Button>
          </>
        )}

        {context.state === 'error' && (
          <>
            <span className="text-sm text-color-text-danger">{context.error}</span>
            <Button size="xs" variant="secondary" onClick={handleRetry}>
              {intl.formatMessage(i18n.retry)}
            </Button>
          </>
        )}
      </div>

      {pushError && (
        <div className="text-xs text-color-text-danger" role="alert">
          {pushError}
        </div>
      )}

      {context.stats && context.stats.entries.some((e) => e.added === null) && (
        <div className="text-xs text-text-tertiary">
          {intl.formatMessage(i18n.binary, {
            count: context.stats.entries.filter((e) => e.added === null).length,
          })}
        </div>
      )}
    </div>
  );
}

export function ChangesBarSlot() {
  const target = useContext(ChangesBarTarget);
  // Mounted whenever the shell has a target at all — not gated on entries.length, so the
  // committed and discarded states can outlive a status poll that already reports a clean
  // tree (task 166: the bar clears itself on its own timer, never the poll's).
  if (!target) return null;
  return <ChangesBar paneContext={target} />;
}
