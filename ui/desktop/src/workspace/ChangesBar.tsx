import { useEffect, useState } from 'react';
import { usePaneContext } from './pane-context';
import { parseNumstat, aggregateStats, type ChangesBarContext } from './changes-bar';
import { sidecarFetch } from '../native/sidecar';

// The Changes summary bar rendered above the chat input: file count, line counts,
// and actions (Review, Accept all, Discard/Undo).
export function ChangesBar() {
  const paneContext = usePaneContext();
  const [context, setContext] = useState<ChangesBarContext>({
    state: 'empty',
    stats: null,
    error: null,
    lastDiscard: null,
  });

  // Fetch numstat when gitStatus changes and tree is not clean.
  useEffect(() => {
    if (!paneContext.gitStatus || paneContext.gitStatus.entries.length === 0) {
      setContext((prev) => ({
        ...prev,
        state: 'empty',
        stats: null,
        error: null,
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
  }, [paneContext.gitStatus]);

  const handleReview = () => {
    paneContext.openPane('diff');
  };

  const handleAcceptAll = async () => {
    if (!context.stats) return;

    try {
      const paths = context.stats.entries.map((e) => e.path);
      await sidecarFetch('/git/stage', { paths });

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

      const response = await sidecarFetch<{ stash: string }>('/git/discard', {});
      const stash = response.stash;

      setContext((prev) => ({
        ...prev,
        state: 'discarded',
        stats: null,
        error: null,
        lastDiscard: stash,
      }));

      // Show the discarded state for 5 seconds, then clear if tree is still clean
      setTimeout(() => {
        if (paneContext.gitStatus?.entries.length === 0) {
          setContext((prev) => ({
            ...prev,
            state: 'empty',
            lastDiscard: null,
          }));
        }
      }, 5000);
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

      await sidecarFetch('/git/discard/undo', {
        stash: context.lastDiscard,
      });

      // Undo successful; let the next git status poll update the bar
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
    // Reset state and let the gitStatus effect trigger a new fetch
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
      {/* Stats and action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        {context.state === 'loading' && !context.stats && <span className="text-sm text-text-secondary">…</span>}

        {context.stats && (
          <>
            <span className="text-sm text-text-primary" data-testid="changes-bar-stats">
              {context.stats.fileCount} file{context.stats.fileCount !== 1 ? 's' : ''} · +{context.stats.totalAdded} −
              {context.stats.totalDeleted}
            </span>

            <button
              onClick={handleReview}
              className="rounded-control bg-background-secondary px-3 py-1 text-sm hover:bg-background-tertiary"
            >
              Review
            </button>

            <button
              onClick={handleAcceptAll}
              className="rounded-control bg-background-secondary px-3 py-1 text-sm hover:bg-background-tertiary"
              data-testid="changes-bar-accept"
            >
              Accept all
            </button>

            <button
              onClick={handleDiscard}
              disabled={context.state === 'discarding'}
              className="rounded-control bg-background-secondary px-3 py-1 text-sm hover:bg-background-tertiary disabled:opacity-50"
              data-testid="changes-bar-discard"
            >
              Discard
            </button>
          </>
        )}

        {context.state === 'discarded' && (
          <>
            <span className="text-sm text-text-secondary">Discarded · </span>
            <button
              onClick={handleUndo}
              className="rounded-control bg-background-secondary px-3 py-1 text-sm hover:bg-background-tertiary"
              data-testid="changes-bar-undo"
            >
              Undo
            </button>
          </>
        )}

        {context.state === 'error' && (
          <>
            <span className="text-sm text-color-text-danger">{context.error}</span>
            <button
              onClick={handleRetry}
              className="rounded-control bg-background-secondary px-3 py-1 text-sm hover:bg-background-tertiary"
            >
              Retry
            </button>
          </>
        )}
      </div>

      {/* Binary file note */}
      {context.stats && context.stats.entries.some((e) => e.added === null) && (
        <div className="text-xs text-text-tertiary">
          {context.stats.entries.filter((e) => e.added === null).length} binary file
          {context.stats.entries.filter((e) => e.added === null).length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

// Slot to render the ChangesBar where MessageQueue is in ChatInput.
export function ChangesBarSlot() {
  const paneContext = usePaneContext();

  // Only show if tree is dirty
  if (!paneContext.gitStatus || paneContext.gitStatus.entries.length === 0) {
    return null;
  }

  return <ChangesBar />;
}
