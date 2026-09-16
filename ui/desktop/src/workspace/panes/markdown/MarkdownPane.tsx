/* global WebSocket */
// The Markdown pane (PRD step 12): the file picked in Files, rendered and read-only. Reads and
// watches the file through src/native only; the Editor keeps its own buffer, this pane
// follows disk.

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../../components/ui/button';
import {
  sidecarFetch,
  sidecarSocket,
  type FsPathRequest,
  type FsReadResponse,
  type FsWatchEvent,
} from '../../../native/sidecar';
import { MarkdownView } from '../../MarkdownView';
import { usePaneContext } from '../../pane-context';
import {
  createMarkdownStore,
  loaded,
  loadFailed,
  loadStarted,
  newDoc,
  paneState,
} from './markdown-state';

const i18n = defineMessages({
  nothingOpen: {
    id: 'markdownPane.nothingOpen',
    defaultMessage: 'Nothing open — pick a file in Files',
  },
  loading: { id: 'markdownPane.loading', defaultMessage: 'Loading…' },
  retry: { id: 'markdownPane.retry', defaultMessage: 'Retry' },
  notMarkdown: { id: 'markdownPane.notMarkdown', defaultMessage: 'Not markdown — shown as text' },
});

// Docs by absolute path, kept across promote and close (DESIGN.md Nothing Lost Rule).
const markdownStore = createMarkdownStore();

function useDocs() {
  return useSyncExternalStore(
    markdownStore.subscribe,
    markdownStore.getState,
    markdownStore.getState
  );
}

export function MarkdownPane() {
  const intl = useIntl();
  const { file } = usePaneContext();
  const docs = useDocs();
  // Until the effect below opens the file in the store, a fresh doc stands in as its
  // loading state.
  const doc = file ? (docs[file] ?? newDoc(file)) : null;
  const state = paneState(doc);

  // Disk is read on every mount as well as on every watch event: the watch dies with the
  // pane on a tab switch, and the agent may have written meanwhile.
  const refresh = useCallback((path: string) => {
    const request: FsPathRequest = { path };
    sidecarFetch<FsReadResponse>('/fs/read', request)
      .then((response) => markdownStore.apply(path, (current) => loaded(current, response.content)))
      .catch((error: Error) =>
        markdownStore.apply(path, (current) => loadFailed(current, error.message))
      );
  }, []);

  useEffect(() => {
    if (!file) return;
    markdownStore.open(file);
    refresh(file);
    let socket: WebSocket | null = null;
    let closed = false;
    sidecarSocket('/fs/watch', { path: file })
      .then((opened) => {
        if (closed) {
          opened.close();
          return;
        }
        socket = opened;
        socket.onmessage = (message: MessageEvent<string>) => {
          const event = JSON.parse(message.data) as FsWatchEvent;
          if (event.type !== 'watching') refresh(file);
        };
      })
      .catch(() => undefined);
    return () => {
      closed = true;
      socket?.close();
    };
  }, [file, refresh]);

  return (
    <div
      className="flex flex-col h-full min-h-0 text-sm"
      data-testid="markdown-pane"
      data-state={state}
    >
      {!doc && <p className="p-3 text-text-secondary">{intl.formatMessage(i18n.nothingOpen)}</p>}
      {doc && (
        <>
          <div className="flex items-center gap-1 px-2 py-1 border-b border-border-primary text-xs">
            <span
              className="min-w-0 flex-1 truncate text-text-secondary"
              title={doc.path}
              data-testid="workspace-markdown-file"
            >
              {doc.path}
            </span>
          </div>

          {doc.load.status === 'loading' && (
            <p className="p-3 text-text-secondary" aria-live="polite">
              {intl.formatMessage(i18n.loading)}
            </p>
          )}
          {doc.load.status === 'error' && (
            <div className="p-3 flex flex-col gap-2" role="alert">
              <span className="font-mono text-xs text-text-danger break-all">
                {doc.load.message}
              </span>
              <Button
                variant="outline"
                size="xs"
                className="self-start"
                onClick={() => {
                  markdownStore.apply(doc.path, loadStarted);
                  refresh(doc.path);
                }}
              >
                {intl.formatMessage(i18n.retry)}
              </Button>
            </div>
          )}
          {state === 'partial' && (
            <div
              className="px-2 py-1 border-b border-border-primary bg-background-secondary text-xs text-text-warning"
              role="status"
              data-testid="markdown-not-markdown"
            >
              {intl.formatMessage(i18n.notMarkdown)}
            </div>
          )}
          {doc.load.status === 'loaded' && (
            <div className="flex-1 min-h-0 overflow-auto" data-testid="markdown-view">
              {state === 'ready' ? (
                <MarkdownView text={doc.load.text} />
              ) : (
                <pre className="p-4 font-mono text-xs whitespace-pre-wrap break-words text-text-primary">
                  {doc.load.text}
                </pre>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
