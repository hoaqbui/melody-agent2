/* global WebSocket */
// The Editor pane (PRD step 4): the file picked in Files in CodeMirror, ⌘S to save, a reload
// bar when the file changes on disk under unsaved edits, and for markdown a Preview beside
// the source. Reads, writes and watches the file through src/native only.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  defaultHighlightStyle,
  LanguageDescription,
  syntaxHighlighting,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { defineMessages, useIntl } from '../../../i18n';
import { useTheme } from '../../../contexts/ThemeContext';
import { monokaiHighlight } from '../../../theme/monokai-highlight';
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
import { MarkdownView } from '../../MarkdownView';
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
  selectedLines,
  setView,
  snapshot,
  type EditorViewMode,
} from './editor-store';
import { pathForChat } from '../../chat-insert';

const i18n = defineMessages({
  nothingOpen: {
    id: 'editorPane.nothingOpen',
    defaultMessage: 'Nothing open — pick a file in Files',
  },
  loading: { id: 'editorPane.loading', defaultMessage: 'Loading…' },
  save: { id: 'editorPane.save', defaultMessage: 'Save' },
  addToChat: { id: 'editorPane.addToChat', defaultMessage: 'Add to chat' },
  selectFirst: { id: 'editorPane.selectFirst', defaultMessage: 'Select text first' },
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

// CodeMirror ships a light default only; every dark variant takes Monokai's palette.
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
    syntaxHighlighting(dark ? monokaiHighlight : defaultHighlightStyle, { fallback: true }),
  ];
}

function useDocs() {
  return useSyncExternalStore(editorStore.subscribe, editorStore.getState, editorStore.getState);
}

export function EditorPane() {
  const intl = useIntl();
  const { file, line, cwd, insertIntoChat } = usePaneContext();
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
  const [hasSelection, setHasSelection] = useState(false);

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
            if (update.selectionSet || update.docChanged) {
              setHasSelection(!update.state.selection.main.empty);
            }
          }),
        ],
      });
    const view = new EditorView({ state, parent });
    viewRef.current = view;
    setHasSelection(!state.selection.main.empty);
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
      setHasSelection(false);
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

  // A review's `file:line` (task 70): once the buffer holds the file, the cursor lands on
  // that line and the view centres it; a line past the end lands on the last one. The jump
  // is made once per ask — a later reload of the same file (its revision bumps) leaves the
  // cursor where the user has it.
  const loadedRevision = doc?.load.status === 'loaded' ? doc.revision : null;
  const jumped = useRef<string | null>(null);
  useEffect(() => {
    const view = viewRef.current;
    if (line === null) {
      jumped.current = null;
      return;
    }
    const ask = `${file}:${line}`;
    if (!view || loadedRevision === null || jumped.current === ask) return;
    jumped.current = ask;
    const target = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
    view.dispatch({
      selection: { anchor: target.from },
      effects: EditorView.scrollIntoView(target.from, { y: 'center' }),
    });
  }, [file, line, loadedRevision, showSource]);

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  };

  const addToChat = () => {
    const view = viewRef.current;
    if (!view || !doc) return;
    const picked = selectedLines(view.state);
    if (!picked) return;
    insertIntoChat({
      kind: 'text',
      text: picked.text,
      source: { path: pathForChat(doc.path, cwd), lines: picked.lines },
    });
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
              data-line={line ?? undefined}
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
              variant="ghost"
              size="xs"
              disabled={!showSource || !hasSelection}
              title={showSource && hasSelection ? undefined : intl.formatMessage(i18n.selectFirst)}
              data-testid="editor-add-to-chat"
              onClick={addToChat}
            >
              {intl.formatMessage(i18n.addToChat)}
            </Button>
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
            <div className="flex-1 min-h-0 overflow-auto" data-testid="editor-preview">
              <MarkdownView text={doc.text} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
