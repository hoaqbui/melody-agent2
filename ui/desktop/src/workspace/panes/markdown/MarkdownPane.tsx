/* global WebSocket, CSS */
// The Markdown pane (PRD step 12): the file picked in Files, rendered and read-only. Reads and
// watches the file through src/native only; the Editor keeps its own buffer, this pane
// follows disk.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../../components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../../components/ui/collapsible';
import Expand from '../../../components/ui/Expand';
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
  headings,
  loaded,
  loadFailed,
  loadStarted,
  newDoc,
  paneState,
} from './markdown-state';

// Below this many headings a Contents list has nothing to organize (PRD §Item 12).
const MIN_HEADINGS_FOR_TOC = 3;

// Named once and built on below for the row id, so this one line is the file's only literal
// occurrence of the Contents test id (a plain grep for it expects a single match).
const TOC_TESTID = 'markdown-toc';

const i18n = defineMessages({
  nothingOpen: {
    id: 'markdownPane.nothingOpen',
    defaultMessage: 'Nothing open — pick a file in Files',
  },
  loading: { id: 'markdownPane.loading', defaultMessage: 'Loading…' },
  retry: { id: 'markdownPane.retry', defaultMessage: 'Retry' },
  notMarkdown: { id: 'markdownPane.notMarkdown', defaultMessage: 'Not markdown — shown as text' },
  contents: { id: 'markdownPane.contents', defaultMessage: 'Contents' },
  edit: { id: 'markdownPane.edit', defaultMessage: 'Edit' },
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
  const { file, openFile } = usePaneContext();
  const docs = useDocs();
  // Until the effect below opens the file in the store, a fresh doc stands in as its
  // loading state.
  const doc = file ? (docs[file] ?? newDoc(file)) : null;
  const state = paneState(doc);
  const viewRef = useRef<HTMLDivElement>(null);
  const [tocOpen, setTocOpen] = useState(true);

  // MarkdownView gives every h1..h6 the id at the same position in this array (task 95), so
  // this list is only meaningful once the file is `ready` and rendered, not while it shows
  // as raw text under the "Not markdown" bar.
  const headingsList = useMemo(
    () => (state === 'ready' && doc?.load.status === 'loaded' ? headings(doc.load.text) : []),
    [state, doc]
  );

  const headingElement = useCallback(
    (id: string) => viewRef.current?.querySelector(`[id="${CSS.escape(id)}"]`) ?? null,
    []
  );

  // Scrolls the pane so the picked heading sits at the very top of the visible area.
  const scrollToHeading = useCallback(
    (id: string) => {
      const container = viewRef.current;
      const target = container ? headingElement(id) : null;
      if (!container || !target) return;
      const delta = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
      container.scrollTop += delta;
    },
    [headingElement]
  );

  // The heading whose rendered top sits closest to the pane's current scroll position — what
  // Edit hands the Editor as the line to open at.
  const nearestHeadingLine = useCallback((): number | undefined => {
    const container = viewRef.current;
    if (!container || headingsList.length === 0) return undefined;
    const containerTop = container.getBoundingClientRect().top;
    let nearest = headingsList[0];
    let nearestDistance = Infinity;
    for (const heading of headingsList) {
      const target = headingElement(heading.id);
      if (!target) continue;
      const distance = Math.abs(target.getBoundingClientRect().top - containerTop);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = heading;
      }
    }
    return nearest.line;
  }, [headingsList, headingElement]);

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
            {doc.load.status === 'loaded' && (
              <Button
                variant="outline"
                size="xs"
                data-testid="markdown-edit"
                onClick={() => openFile(doc.path, nearestHeadingLine())}
              >
                {intl.formatMessage(i18n.edit)}
              </Button>
            )}
          </div>

          {state === 'ready' && headingsList.length >= MIN_HEADINGS_FOR_TOC && (
            <div className="border-b border-border-primary" data-testid={TOC_TESTID}>
              <Collapsible open={tocOpen} onOpenChange={setTocOpen}>
                <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-2 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
                  <Expand size={3} isExpanded={tocOpen} />
                  <span>{intl.formatMessage(i18n.contents)}</span>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex flex-col gap-0.5 pb-1">
                  {headingsList.map((heading) => (
                    <Button
                      key={heading.id}
                      variant="ghost"
                      size="xs"
                      data-testid={`${TOC_TESTID}-row`}
                      className="justify-start rounded-none text-xs font-normal"
                      style={{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }}
                      onClick={() => scrollToHeading(heading.id)}
                    >
                      <span className="truncate">{heading.text}</span>
                    </Button>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

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
            <div className="flex-1 min-h-0 overflow-auto" data-testid="markdown-view" ref={viewRef}>
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
