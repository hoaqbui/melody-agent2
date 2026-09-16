// The Changes pane (PRD step 5, view-only at V0): the files the working tree differs from a
// base by, and one file's changes in CodeMirror's merge view, unified or side by side. The
// pane reaches git only through src/native/sidecar and diffs the sidecar's cwd.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { MergeView, unifiedMergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { defineMessages, useIntl } from '../../../i18n';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAcpChatSessionSnapshot } from '../../../acp/chatSessionStore';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../utils';
import {
  sidecarFetch,
  type GitDiffRequest,
  type GitDiffResponse,
  type GitRevParseRequest,
  type GitRevParseResponse,
} from '../../../native/sidecar';
import { createDiffStore, type DiffBase, type DiffPaneState, type DiffView } from './diff-store';
import { FULL_CONTEXT, parseUnifiedDiff, type DiffFile } from './unified-diff';

const i18n = defineMessages({
  vsHead: { id: 'diffPane.vsHead', defaultMessage: 'vs HEAD' },
  sinceSessionStart: { id: 'diffPane.sinceSessionStart', defaultMessage: 'since session start' },
  base: { id: 'diffPane.base', defaultMessage: 'Base' },
  unified: { id: 'diffPane.unified', defaultMessage: 'Unified' },
  sideBySide: { id: 'diffPane.sideBySide', defaultMessage: 'Side by side' },
  refresh: { id: 'diffPane.refresh', defaultMessage: 'Refresh' },
  retry: { id: 'diffPane.retry', defaultMessage: 'Retry' },
  loading: { id: 'diffPane.loading', defaultMessage: 'Loading…' },
  noChanges: { id: 'diffPane.noChanges', defaultMessage: 'No changes {base}' },
  selectFile: { id: 'diffPane.selectFile', defaultMessage: 'Select a file to see its changes' },
  binary: { id: 'diffPane.binary', defaultMessage: 'Binary file' },
});

const KIND_LETTERS = { added: 'A', deleted: 'D', modified: 'M', renamed: 'R' } as const;

const diffStore = createDiffStore();

function useSessionStart(): string | null {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const sessionId = (location.pathname === '/pair' && searchParams.get('resumeSessionId')) || '';
  const createdAt = useAcpChatSessionSnapshot(sessionId)?.session?.created_at;
  const [sha, setSha] = useState<string | null>(null);

  // What HEAD was when the session was created, from the reflog: survives a restart and
  // a rebase, and needs no record kept at session start. Before the reflog begins, git
  // answers with its oldest entry; with no reflog at all the base is simply not offered.
  useEffect(() => {
    setSha(null);
    if (!createdAt) return;
    let cancelled = false;
    const request: GitRevParseRequest = { rev: `HEAD@{${createdAt}}` };
    sidecarFetch<GitRevParseResponse>('/git/rev-parse', request)
      .then((response) => {
        if (!cancelled) setSha(response.sha);
      })
      .catch(() => {
        if (!cancelled) setSha(null);
      });
    return () => {
      cancelled = true;
    };
  }, [createdAt]);

  return sha;
}

function editorTheme(dark: boolean) {
  return EditorView.theme(
    {
      '&': { backgroundColor: 'transparent', color: 'var(--color-text-primary)' },
      '.cm-content, .cm-gutters, .cm-deletedChunk': {
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--color-text-secondary)',
        borderRight: '1px solid var(--color-border-primary)',
      },
      '.cm-mergeViewEditor + .cm-mergeViewEditor': {
        borderLeft: '1px solid var(--color-border-primary)',
      },
    },
    { dark }
  );
}

function ChangeView({ file, view, dark }: { file: DiffFile; view: DiffView; dark: boolean }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const readOnly = [
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      lineNumbers(),
      editorTheme(dark),
    ];
    const collapseUnchanged = { margin: 3 };
    if (view === 'split') {
      const merge = new MergeView({
        a: { doc: file.old, extensions: readOnly },
        b: { doc: file.new, extensions: readOnly },
        parent,
        collapseUnchanged,
      });
      return () => merge.destroy();
    }
    const editor = new EditorView({
      parent,
      state: EditorState.create({
        doc: file.new,
        extensions: [
          ...readOnly,
          unifiedMergeView({ original: file.old, mergeControls: false, collapseUnchanged }),
        ],
      }),
    });
    return () => editor.destroy();
  }, [file, view, dark]);

  return <div ref={host} data-testid="diff-view" data-view={view} data-path={file.path} />;
}

export function DiffPane() {
  const intl = useIntl();
  const { resolvedTheme } = useTheme();
  const selection = useSyncExternalStore(
    diffStore.subscribe,
    diffStore.getState,
    diffStore.getState
  );
  const sessionStart = useSessionStart();
  const base: DiffBase = selection.base === 'session' && sessionStart ? 'session' : 'head';
  const baseRev = base === 'session' ? sessionStart : 'HEAD';
  const baseLabel = intl.formatMessage(base === 'session' ? i18n.sinceSessionStart : i18n.vsHead);

  const [files, setFiles] = useState<DiffFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // One full-context fetch gives the list and every file's two sides; a path-filtered
  // fetch per click would lose rename pairing for the filtered-out side. The last list
  // stays on screen while the next loads (DESIGN.md §States, Loading).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request: GitDiffRequest = { base: baseRev ?? 'HEAD', context: FULL_CONTEXT };
    sidecarFetch<GitDiffResponse>('/git/diff', request)
      .then((response) => {
        if (!cancelled) setFiles(parseUnifiedDiff(response.diff));
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseRev, attempt]);

  const file = files?.find((entry) => entry.path === selection.path) ?? null;
  const state: DiffPaneState = error
    ? 'error'
    : files === null
      ? 'loading'
      : files.length === 0
        ? 'empty'
        : file?.binary
          ? 'partial'
          : 'ready';
  const refresh = () => setAttempt((count) => count + 1);

  return (
    <div
      className="flex flex-col h-full min-h-0 text-sm"
      data-testid="diff-pane"
      data-state={state}
    >
      <div className="flex flex-wrap items-center gap-1 px-2 py-1 border-b border-border-primary">
        <select
          className="rounded-md border border-border-primary bg-background-primary px-1 py-0.5 text-xs text-text-primary"
          aria-label={intl.formatMessage(i18n.base)}
          data-testid="diff-base"
          value={base}
          onChange={(event) => diffStore.setBase(event.target.value as DiffBase)}
        >
          <option value="head">{intl.formatMessage(i18n.vsHead)}</option>
          {sessionStart && (
            <option value="session">{intl.formatMessage(i18n.sinceSessionStart)}</option>
          )}
        </select>
        {(['unified', 'split'] as const).map((view) => (
          <Button
            key={view}
            variant={selection.view === view ? 'secondary' : 'ghost'}
            size="xs"
            aria-pressed={selection.view === view}
            data-testid={`diff-view-${view}`}
            onClick={() => diffStore.setView(view)}
          >
            {intl.formatMessage(view === 'unified' ? i18n.unified : i18n.sideBySide)}
          </Button>
        ))}
        <Button className="ml-auto" variant="ghost" size="xs" onClick={refresh}>
          {intl.formatMessage(i18n.refresh)}
        </Button>
      </div>

      {state === 'error' && (
        <div className="p-3 text-text-secondary" role="alert">
          <p className="whitespace-pre-wrap font-mono text-xs">{error}</p>
          <Button className="mt-2" variant="outline" size="xs" onClick={refresh}>
            {intl.formatMessage(i18n.retry)}
          </Button>
        </div>
      )}
      {state === 'loading' && (
        <p className="p-3 text-text-secondary">{intl.formatMessage(i18n.loading)}</p>
      )}
      {state === 'empty' && (
        <p className="p-3 text-text-secondary">
          {intl.formatMessage(i18n.noChanges, { base: baseLabel })}
        </p>
      )}

      {files && files.length > 0 && (
        <>
          <ul
            className="shrink-0 max-h-48 overflow-auto border-b border-border-primary"
            data-testid="diff-files"
            aria-busy={loading}
          >
            {files.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 px-2 py-0.5 text-left font-mono text-xs hover:bg-background-secondary',
                    entry.path === selection.path && 'bg-background-secondary'
                  )}
                  aria-pressed={entry.path === selection.path}
                  data-testid="diff-file"
                  data-path={entry.path}
                  onClick={() => diffStore.select(entry.path)}
                >
                  <span className="w-3 shrink-0 text-text-secondary">
                    {KIND_LETTERS[entry.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={entry.path}>
                    {entry.path}
                  </span>
                  {!entry.binary && (
                    <span className="shrink-0 whitespace-nowrap">
                      <span className="text-text-success">+{entry.added}</span>{' '}
                      <span className="text-text-danger">−{entry.removed}</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex-1 min-h-0 overflow-auto">
            {!file && (
              <p className="p-3 text-text-secondary">{intl.formatMessage(i18n.selectFile)}</p>
            )}
            {file?.binary && (
              <p className="px-3 py-1 text-xs text-text-secondary border-b border-border-primary">
                {intl.formatMessage(i18n.binary)}
              </p>
            )}
            {file && !file.binary && (
              <ChangeView file={file} view={selection.view} dark={resolvedTheme === 'dark'} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
