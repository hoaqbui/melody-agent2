import { useEffect, useState } from 'react';
import { usePaneContext } from './pane-context';
import { parseNumstat, aggregateStats, type ChangesBarContext } from './changes-bar';
import { sidecarFetch } from '../native/sidecar';
import { Button } from '../components/ui/button';
import { defineMessages, useIntl } from '../i18n';

const i18n = defineMessages({
  review: { id: 'changesBar.review', defaultMessage: 'Review' },
  acceptAll: { id: 'changesBar.acceptAll', defaultMessage: 'Accept all' },
  discard: { id: 'changesBar.discard', defaultMessage: 'Discard' },
  undo: { id: 'changesBar.undo', defaultMessage: 'Undo' },
  discarded: { id: 'changesBar.discarded', defaultMessage: 'Discarded' },
  retry: { id: 'changesBar.retry', defaultMessage: 'Retry' },
  files: { id: 'changesBar.files', defaultMessage: '{count, plural, one {file} other {files}}' },
  binary: { id: 'changesBar.binary', defaultMessage: '{count, plural, one {binary file} other {binary files}}' },
});

export function ChangesBar() {
  const paneContext = usePaneContext();
  const intl = useIntl();
  const [context, setContext] = useState<ChangesBarContext>({
    state: 'empty',
    stats: null,
    error: null,
    lastDiscard: null,
  });

  useEffect(() => {
    if (!paneContext.gitStatus || paneContext.gitStatus.entries.length === 0) {
      setContext((prev) => ({
        ...prev,
        state: 'empty',
        stats: null,
        error: null,
        lastDiscard: null,
      }));
      return;
    }

    let isMounted = true;

    const fetchStats = async () => {
      if (isMounted) {
        setContext((prev) => ({ ...prev, state: 'loading', error: null }));
      }

      try {
        const response = await sidecarFetch<{ diff: string }>('/git/diff', {
          cwd: paneContext.cwd,
          numstat: true,
        });
        const diff = response.diff;
        const entries = parseNumstat(diff);
        const stats = aggregateStats(entries);

        if (isMounted) {
          setContext((prev) => ({
            ...prev,
            state: 'ready',
            stats,
            error: null,
          }));
        }
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          setContext((prev) => ({
            ...prev,
            state: 'error',
            error: message,
            stats: null,
          }));
        }
      }
    };

    fetchStats();

    return () => {
      isMounted = false;
    };
  }, [paneContext.gitStatus, paneContext.cwd]);

  const handleReview = () => {
    paneContext.openPane('diff');
  };

  const handleAcceptAll = async () => {
    if (!context.stats) return;

    try {
      const paths = context.stats.entries.map((e) => e.path);
      await sidecarFetch('/git/stage', { cwd: paneContext.cwd, paths });

      paneContext.openPane('git');
      paneContext.focusCommit();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to stage files';
      setContext((prev) => ({
        ...prev,
        state: 'error',
        error: message,
      }));
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
        {context.state === 'loading' && !context.stats && <span className="text-sm text-text-secondary">…</span>}

        {context.stats && (
          <>
            <span className="text-sm text-text-primary" data-testid="changes-bar-stats">
              {context.stats.fileCount} {intl.formatMessage(i18n.files, { count: context.stats.fileCount })} · +
              {context.stats.totalAdded} −{context.stats.totalDeleted}
            </span>

            <Button size="xs" variant="secondary" onClick={handleReview}>
              {intl.formatMessage(i18n.review)}
            </Button>

            <Button
              size="xs"
              variant="secondary"
              onClick={handleAcceptAll}
              data-testid="changes-bar-accept"
            >
              {intl.formatMessage(i18n.acceptAll)}
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

        {context.state === 'discarded' && (
          <>
            <span className="text-sm text-text-secondary">{intl.formatMessage(i18n.discarded)} · </span>
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
  const paneContext = usePaneContext();

  if (!paneContext.gitStatus || paneContext.gitStatus.entries.length === 0) {
    return null;
  }

  return <ChangesBar />;
}
