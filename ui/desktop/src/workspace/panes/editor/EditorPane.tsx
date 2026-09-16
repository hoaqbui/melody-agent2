/* global WebSocket */
// The Editor pane (PRD step 4): the file picked in Files in CodeMirror, ⌘S to save, a reload
// bar when the file changes on disk under unsaved edits, and for markdown a Preview beside
// the source. Reads, writes and watches the file through src/native only.

import { useCallback, useEffect, useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'github-markdown-css/github-markdown-light.css';
import markdownDarkCss from 'github-markdown-css/github-markdown-dark.css?inline';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  defaultHighlightStyle,
  HighlightStyle,
  LanguageDescription,
  syntaxHighlighting,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { defineMessages, useIntl } from '../../../i18n';
import { useTheme } from '../../../contexts/ThemeContext';
import { Button } from '../../../components/ui/button';
import {
  sidecarFetch,
  sidecarSocket,
  type FsPathRequest,
  type FsReadResponse,
  type FsWatchEvent,
  type FsWriteRequest,
  type FsWriteResponse,
} from '../../../native/sidecar';
import { usePaneContext } from '../../pane-context';
import {
  createEditorStore,
  diskChanged,
  edited,
  isDirty,
  isMarkdown,
  keepMine,
  loaded,
  loadFailed,
  loadStarted,
  newDoc,
  paneState,
  reload,
  saveDone,
  saveFailed,
  saveStarted,
  setView,
  snapshot,
  type EditorViewMode,
} from './editor-store';

const i18n = defineMessages({
  nothingOpen: {
    id: 'editorPane.nothingOpen',
    defaultMessage: 'Nothing open — pick a file in Files',
  },
  loading: { id: 'editorPane.loading', defaultMessage: 'Loading…' },
  save: { id: 'editorPane.save', defaultMessage: 'Save' },
  nothingToSave: { id: 'editorPane.nothingToSave', defaultMessage: 'Nothing to save' },
  saving: { id: 'editorPane.saving', defaultMessage: 'Saving…' },
  unsaved: { id: 'editorPane.unsaved', defaultMessage: 'Unsaved changes' },
  saveFailed: { id: 'editorPane.saveFailed', defaultMessage: "Couldn't save — {cause}" },
  changedOnDisk: { id: 'editorPane.changedOnDisk', defaultMessage: 'Changed on disk' },
  reload: { id: 'editorPane.reload', defaultMessage: 'Reload' },
  keepMine: { id: 'editorPane.keepMine', defaultMessage: 'Keep mine' },
  retry: { id: 'editorPane.retry', defaultMessage: 'Retry' },
  source: { id: 'editorPane.source', defaultMessage: 'Source' },
  preview: { id: 'editorPane.preview', defaultMessage: 'Preview' },
});

// Docs by absolute path, kept across promote and close (DESIGN.md Nothing Lost Rule).
const editorStore = createEditorStore();

const languageConf = new Compartment();
const themeConf = new Compartment();

// github-markdown-css picks its palette by prefers-color-scheme; the app themes by a class
// on <html> (contexts/ThemeContext.tsx), so the dark palette is nested under that class.
const MARKDOWN_DARK_CSS = `.dark { ${markdownDarkCss} }`;

// One Dark's token colours, as components/MarkdownContent.tsx uses for code blocks;
// CodeMirror ships a light default only.
const darkHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: '#c678dd' },
  { tag: [tags.string, tags.special(tags.string)], color: '#98c379' },
  { tag: tags.comment, color: '#7f848e', fontStyle: 'italic' },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], color: '#d19a66' },
  { tag: [tags.typeName, tags.className], color: '#e5c07b' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#61afef' },
  { tag: [tags.propertyName, tags.attributeName], color: '#e06c75' },
  { tag: tags.heading, fontWeight: 'bold' },
  { tag: tags.link, textDecoration: 'underline' },
]);

function editorTheme(dark: boolean) {
  return [
    EditorView.theme(
      {
        '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--color-text-primary)' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: '12px' },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          color: 'var(--color-text-secondary)',
          borderRight: '1px solid var(--color-border-primary)',
        },
        '.cm-activeLine, .cm-activeLineGutter': {
          backgroundColor: 'var(--color-background-secondary)',
        },
        '.cm-cursor': { borderLeftColor: 'var(--color-text-primary)' },
      },
      { dark }
    ),
    syntaxHighlighting(dark ? darkHighlight : defaultHighlightStyle, { fallback: true }),
  ];
}

function useDocs() {
  return useSyncExternalStore(editorStore.subscribe, editorStore.getState, editorStore.getState);
}

export function EditorPane() {
  const intl = useIntl();
  const { file } = usePaneContext();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const docs = useDocs();
  // Until the effect below opens the file in the store, a fresh doc stands in as its
  // loading state.
  const doc = file ? (docs[file] ?? newDoc(file)) : null;
  const state = paneState(doc);
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const appliedRevision = useRef(0);

  // Disk is read on every mount as well as on every watch event: the watch dies with the
  // pane on a tab switch, and the agent may have written meanwhile. The reducers tell a
  // first read from a later one.
  const refresh = useCallback((path: string) => {
    const request: FsPathRequest = { path };
    sidecarFetch<FsReadResponse>('/fs/read', request)
      .then((response) =>
        editorStore.apply(path, (current) =>
          current.load.status === 'loaded'
            ? diskChanged(current, response.content)
            : loaded(current, response.content)
        )
      )
      .catch((error: Error) =>
        editorStore.apply(path, (current) =>
          current.load.status === 'loaded' ? current : loadFailed(current, error.message)
        )
      );
  }, []);

  useEffect(() => {
    if (!file) return;
    editorStore.open(file);
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

  const save = useCallback(() => {
    if (!file) return;
    const current = editorStore.getState()[file];
    if (!current || current.load.status !== 'loaded' || current.saving) return;
    if (!isDirty(current) && current.saveError === null) return;
    const request: FsWriteRequest = { path: file, content: current.text };
    editorStore.apply(file, saveStarted);
    sidecarFetch<FsWriteResponse>('/fs/write', request)
      .then(() => editorStore.apply(file, (latest) => saveDone(latest, request.content)))
      .catch((error: Error) =>
        editorStore.apply(file, (latest) => saveFailed(latest, error.message))
      );
  }, [file]);

  const showSource = doc?.load.status === 'loaded' && doc.view === 'source';
  const showPreview = doc?.load.status === 'loaded' && doc.view === 'preview';

  // The view lives as long as the file is on screen in source mode; a remount restores the
  // snapshot taken at unmount, so cursor and undo history survive a tab switch.
  useEffect(() => {
    const parent = host.current;
    if (!file || !showSource || !parent) return;
    const current = editorStore.getState()[file];
    const state =
      current.editor ??
      EditorState.create({
        doc: current.text,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          languageConf.of([]),
          themeConf.of([]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              editorStore.apply(file, (latest) => edited(latest, update.state.doc.toString()));
            }
          }),
        ],
      });
    const view = new EditorView({ state, parent });
    viewRef.current = view;
    appliedRevision.current = current.revision;
    let disposed = false;
    LanguageDescription.matchFilename(languages, file)
      ?.load()
      .then((support) => {
        if (!disposed) view.dispatch({ effects: languageConf.reconfigure(support) });
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      viewRef.current = null;
      editorStore.apply(file, (latest) => snapshot(latest, view.state));
      view.destroy();
    };
  }, [file, showSource]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeConf.reconfigure(editorTheme(dark)) });
  }, [dark, showSource]);

  // A reload replaces the buffer under the live view; typed edits never come this way.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !doc || doc.revision === appliedRevision.current) return;
    appliedRevision.current = doc.revision;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc.text } });
  }, [doc]);

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  };

  const dirty = doc ? isDirty(doc) : false;
  const saveTitle = doc?.saving
    ? intl.formatMessage(i18n.saving)
    : dirty
      ? undefined
      : intl.formatMessage(i18n.nothingToSave);

  return (
    <div
      className="flex flex-col h-full min-h-0 text-sm"
      data-testid="editor-pane"
      data-state={state}
      data-dirty={dirty || undefined}
      onKeyDown={onKeyDown}
    >
      {!doc && <p className="p-3 text-text-secondary">{intl.formatMessage(i18n.nothingOpen)}</p>}
      {doc && (
        <>
          <div className="flex items-center gap-1 px-2 py-1 border-b border-border-primary text-xs">
            <span
              className="min-w-0 flex-1 truncate text-text-secondary"
              title={doc.path}
              data-testid="workspace-editor-file"
            >
              {doc.path}
            </span>
            {dirty && (
              <span className="size-1.5 shrink-0 rounded-full bg-text-info">
                <span className="sr-only">{intl.formatMessage(i18n.unsaved)}</span>
              </span>
            )}
            {isMarkdown(doc.path) &&
              (['source', 'preview'] as const).map((view: EditorViewMode) => (
                <Button
                  key={view}
                  variant={doc.view === view ? 'secondary' : 'ghost'}
                  size="xs"
                  aria-pressed={doc.view === view}
                  data-testid={`editor-view-${view}`}
                  onClick={() => editorStore.apply(doc.path, (latest) => setView(latest, view))}
                >
                  {intl.formatMessage(view === 'source' ? i18n.source : i18n.preview)}
                </Button>
              ))}
            <Button
              variant="outline"
              size="xs"
              disabled={!dirty || doc.saving}
              title={saveTitle}
              data-testid="editor-save"
              onClick={save}
            >
              {intl.formatMessage(i18n.save)}
            </Button>
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
                  editorStore.apply(doc.path, loadStarted);
                  refresh(doc.path);
                }}
              >
                {intl.formatMessage(i18n.retry)}
              </Button>
            </div>
          )}
          {doc.saveError !== null && (
            <div
              className="flex items-center gap-2 px-2 py-1 border-b border-border-primary text-xs"
              role="alert"
              data-testid="editor-save-error"
            >
              <span className="min-w-0 flex-1 text-text-danger break-all">
                {intl.formatMessage(i18n.saveFailed, { cause: doc.saveError })}
              </span>
              <Button variant="outline" size="xs" onClick={save}>
                {intl.formatMessage(i18n.retry)}
              </Button>
            </div>
          )}
          {doc.incoming !== null && (
            <div
              className="flex items-center gap-2 px-2 py-1 border-b border-border-primary bg-background-secondary text-xs"
              role="status"
              data-testid="editor-reload-bar"
            >
              <span className="min-w-0 flex-1 text-text-warning">
                {intl.formatMessage(i18n.changedOnDisk)}
              </span>
              <Button
                variant="outline"
                size="xs"
                data-testid="editor-reload"
                onClick={() => editorStore.apply(doc.path, reload)}
              >
                {intl.formatMessage(i18n.reload)}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => editorStore.apply(doc.path, keepMine)}
              >
                {intl.formatMessage(i18n.keepMine)}
              </Button>
            </div>
          )}

          {showSource && <div ref={host} className="flex-1 min-h-0" data-testid="editor-source" />}
          {showPreview && (
            <div className="flex-1 min-h-0 overflow-auto">
              <style href="github-markdown-dark" precedence="default">
                {MARKDOWN_DARK_CSS}
              </style>
              <div className="markdown-body p-4" data-testid="editor-preview">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // A same-window navigation would leave the app; a new window is routed
                    // to the browser by main's window-open handler.
                    a: ({ node: _node, ...props }) => (
                      <a {...props} target="_blank" rel="noreferrer" />
                    ),
                  }}
                >
                  {doc.text}
                </ReactMarkdown>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
