// The Changes pane (PRD step 5): the files the working tree or the index differs from a
// base by, one file's changes in CodeMirror's merge view, unified or side by side, and per
// chunk Reject and Stage in the unified view (task 50) — each a patch synthesized from the
// chunk and applied by git, never CodeMirror's own accept/reject, which only edit the
// in-memory doc. The pane reaches git only through src/native/sidecar and diffs the
// session's cwd (task 49); when that cwd is a worktree, a row under the header names its
// branch and offers Merge into the main checkout's branch and Remove worktree.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { syntaxHighlighting } from '@codemirror/language';
import {
  type Chunk,
  getChunks,
  getOriginalDoc,
  MergeView,
  unifiedMergeView,
} from '@codemirror/merge';
import { EditorState, type Text } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { defineMessages, useIntl } from '../../../i18n';
import { useTheme } from '../../../contexts/ThemeContext';
import { usePaneContext } from '../../pane-context';
import { monokaiHighlight } from '../../../theme/monokai-highlight';
import {
  acpChatSessionActions,
  acpChatSessionStore,
  useAcpChatSessionSnapshot,
} from '../../../acp/chatSessionStore';
import { acpUpdateWorkingDir } from '../../../acp/sessions';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../utils';
import {
  sidecarFetch,
  SidecarError,
  type GitApplyRequest,
  type GitCwdRequest,
  type GitDiffRequest,
  type GitDiffResponse,
  type GitMergeRequest,
  type GitMergeResponse,
  type GitPathsRequest,
  type GitPrCreateResponse,
  type GitRevParseRequest,
  type GitRevParseResponse,
  type GitStatusResponse,
  type GitWorktreeListResponse,
  type GitWorktreeRemoveRequest,
} from '../../../native/sidecar';
import { worktreePlace, type WorktreePlace } from '../../worktree';
import { hasToolCallInProgress } from '../git/git-state';
import { PrSheet } from '../git/PrSheet';
import {
  createDiffStore,
  undoRequest,
  type DiffBase,
  type DiffPaneState,
  type DiffScope,
  type DiffView,
} from './diff-store';
import { chunkPatch } from './chunk-patch';
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
  scope: { id: 'diffPane.scope', defaultMessage: 'Scope' },
  unstaged: { id: 'diffPane.unstaged', defaultMessage: 'Unstaged' },
  staged: { id: 'diffPane.staged', defaultMessage: 'Staged' },
  reject: { id: 'diffPane.reject', defaultMessage: 'Reject' },
  stage: { id: 'diffPane.stage', defaultMessage: 'Stage' },
  undo: { id: 'diffPane.undo', defaultMessage: 'Undo' },
  blockedRunning: {
    id: 'diffPane.blockedRunning',
    defaultMessage: 'Reject and Stage wait for the running tool call to finish',
  },
  applying: { id: 'diffPane.applying', defaultMessage: 'Applying…' },
  worktree: { id: 'diffPane.worktree', defaultMessage: 'Worktree' },
  merge: { id: 'diffPane.merge', defaultMessage: 'Merge into {branch}' },
  merging: { id: 'diffPane.merging', defaultMessage: 'Merging…' },
  merged: { id: 'diffPane.merged', defaultMessage: 'Merged into {branch} · {sha}' },
  mergeConflicts: {
    id: 'diffPane.mergeConflicts',
    defaultMessage: 'Resolve these in the Editor or the Terminal, then merge again',
  },
  removeWorktree: { id: 'diffPane.removeWorktree', defaultMessage: 'Remove worktree' },
  removingWorktree: { id: 'diffPane.removingWorktree', defaultMessage: 'Removing…' },
  worktreeRemoved: {
    id: 'diffPane.worktreeRemoved',
    defaultMessage: 'Worktree removed; this chat continues in {path}',
  },
  worktreeBlockedRunning: {
    id: 'diffPane.worktreeBlockedRunning',
    defaultMessage: 'Merge and Remove wait for the running tool call to finish',
  },
  openPr: { id: 'diffPane.openPr', defaultMessage: 'Open PR…' },
  prOpened: { id: 'diffPane.prOpened', defaultMessage: 'Opened PR #{number} · {url}' },
});

const KIND_LETTERS = { added: 'A', deleted: 'D', modified: 'M', renamed: 'R' } as const;

const diffStore = createDiffStore();

function useSessionId(): string {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  return (location.pathname === '/pair' && searchParams.get('resumeSessionId')) || '';
}

function useSessionStart(sessionId: string, cwd: string): string | null {
  const createdAt = useAcpChatSessionSnapshot(sessionId)?.session?.created_at;
  const [sha, setSha] = useState<string | null>(null);

  // What HEAD was when the session was created, from the reflog: survives a restart and
  // a rebase, and needs no record kept at session start. Before the reflog begins, git
  // answers with its oldest entry; with no reflog at all the base is simply not offered.
  useEffect(() => {
    setSha(null);
    if (!createdAt) return;
    let cancelled = false;
    const request: GitRevParseRequest = { cwd, rev: `HEAD@{${createdAt}}` };
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
  }, [createdAt, cwd]);

  return sha;
}

// Whether the cwd is one of the repository's `.worktrees/<slug>` checkouts, and which is the
// main one Merge and Remove run in; null outside a repository, which the diff reports.
function useWorktreePlace(cwd: string, attempt: number): WorktreePlace | null {
  const [place, setPlace] = useState<WorktreePlace | null>(null);

  useEffect(() => {
    let cancelled = false;
    const request: GitCwdRequest = { cwd };
    sidecarFetch<GitWorktreeListResponse>('/git/worktree/list', request)
      .then((response) => {
        if (!cancelled) setPlace(worktreePlace(cwd, response.worktrees));
      })
      .catch(() => {
        if (!cancelled) setPlace(null);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, attempt]);

  return place;
}

function editorTheme(dark: boolean) {
  const theme = EditorView.theme(
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
      '.cm-deletedChunk .cm-chunkButtons': { display: 'flex', gap: '4px' },
      '.cm-deletedChunk .cm-chunkButtons button[name]': {
        border: '1px solid var(--color-border-primary)',
        background: 'var(--color-background-primary)',
        color: 'var(--color-text-primary)',
        borderRadius: 'var(--radius-control)',
        padding: '0 6px',
        fontSize: '11px',
        lineHeight: '18px',
      },
      '.cm-deletedChunk .cm-chunkButtons button[name]:hover': {
        background: 'var(--color-background-secondary)',
      },
      '.cm-deletedChunk .cm-chunkButtons button[name]:disabled': {
        opacity: '0.5',
        cursor: 'default',
      },
    },
    { dark }
  );
  // Dark variants carry Monokai's syntax palette, as the Editor does; light shows the
  // diff untinted as before.
  return dark ? [theme, syntaxHighlighting(monokaiHighlight)] : theme;
}

export type ChunkAction = 'reject' | 'stage';

export interface ChunkControls {
  labels: Record<ChunkAction, string>;
  // The reason the buttons are disabled, or null when they act.
  blocked: string | null;
  onAction(action: ChunkAction, chunk: Chunk, old: Text, next: Text): void;
}

const setBlocked = (button: HTMLButtonElement, blocked: string | null) => {
  button.disabled = blocked !== null;
  if (blocked) button.title = blocked;
  else button.removeAttribute('title');
};

function ChangeView({
  file,
  view,
  dark,
  controls,
}: {
  file: DiffFile;
  view: DiffView;
  dark: boolean;
  controls: ChunkControls | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  // CodeMirror builds each chunk's buttons once (the widget is memoized per chunk), so the
  // gate and the handler reach them through refs rather than a remount, which would drop the
  // scroll position on every tool-call edge.
  const controlsRef = useRef(controls);
  const buttons = useRef(new Set<HTMLButtonElement>());
  const blocked = controls?.blocked ?? null;
  const hasControls = controls !== null;

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    for (const button of buttons.current) setBlocked(button, blocked);
  }, [blocked]);

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
    // CodeMirror's `action` is never called: acceptChunk/rejectChunk ignore readOnly and
    // would edit the in-memory doc that nothing writes back (research 45 §The surprise).
    const mergeControls = hasControls
      ? (type: 'reject' | 'accept') => {
          const action: ChunkAction = type === 'accept' ? 'stage' : 'reject';
          const button = document.createElement('button');
          button.type = 'button';
          button.name = action;
          button.textContent = controlsRef.current?.labels[action] ?? action;
          button.dataset.testid = `diff-chunk-${action}`;
          setBlocked(button, controlsRef.current?.blocked ?? null);
          button.addEventListener('click', (event) => {
            event.preventDefault();
            const current = controlsRef.current;
            if (!current || current.blocked) return;
            const at = editor.posAtDOM(button);
            const chunk = getChunks(editor.state)?.chunks.find(
              (candidate) => candidate.fromB <= at && candidate.endB >= at
            );
            if (chunk)
              current.onAction(action, chunk, getOriginalDoc(editor.state), editor.state.doc);
          });
          buttons.current.add(button);
          return button;
        }
      : false;
    const editor = new EditorView({
      parent,
      state: EditorState.create({
        doc: file.new,
        extensions: [
          ...readOnly,
          unifiedMergeView({ original: file.old, mergeControls, collapseUnchanged }),
        ],
      }),
    });
    const created = buttons.current;
    return () => {
      editor.destroy();
      created.clear();
    };
  }, [file, view, dark, hasControls]);

  return <div ref={host} data-testid="diff-view" data-view={view} data-path={file.path} />;
}

// Whether the worktree's branch has been pushed (task 66): Open PR… is offered only then,
// since gh opens a PR from the remote's copy. A failed status never reaches the pane's
// error state; the button simply stays away.
function useHasUpstream(cwd: string, attempt: number, enabled: boolean): boolean {
  const [hasUpstream, setHasUpstream] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHasUpstream(false);
      return;
    }
    let cancelled = false;
    const request: GitCwdRequest = { cwd };
    sidecarFetch<GitStatusResponse>('/git/status', request)
      .then((response) => {
        if (!cancelled) setHasUpstream(response.upstream !== null);
      })
      .catch(() => {
        if (!cancelled) setHasUpstream(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, attempt, enabled]);

  return hasUpstream;
}

interface MergeFailure {
  message: string;
  conflicts: string[];
}

export function DiffPane() {
  const intl = useIntl();
  const { cwd, messages } = usePaneContext();
  const { resolvedTheme } = useTheme();
  const selection = useSyncExternalStore(
    diffStore.subscribe,
    diffStore.getState,
    diffStore.getState
  );
  const sessionId = useSessionId();
  const sessionStart = useSessionStart(sessionId, cwd);
  const base: DiffBase = selection.base === 'session' && sessionStart ? 'session' : 'head';
  const baseRev = base === 'session' ? sessionStart : 'HEAD';
  const baseLabel = intl.formatMessage(base === 'session' ? i18n.sinceSessionStart : i18n.vsHead);
  const scope = selection.scope;
  const running = hasToolCallInProgress(messages);

  const [files, setFiles] = useState<DiffFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [applying, setApplying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const place = useWorktreePlace(cwd, attempt);
  const hasUpstream = useHasUpstream(cwd, attempt, place !== null);
  const [merging, setMerging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [prSheetOpen, setPrSheetOpen] = useState(false);
  // The last worktree action's outcome: a merge sha, a removal, or a 409's conflict list.
  const [notice, setNotice] = useState<string | null>(null);
  const [mergeFailure, setMergeFailure] = useState<MergeFailure | null>(null);

  // One full-context fetch gives the list and every file's two sides; a path-filtered
  // fetch per click would lose rename pairing for the filtered-out side. The last list
  // stays on screen while the next loads (DESIGN.md §States, Loading).
  // Unstaged vs HEAD is the working tree against the index (`git diff`, no rev) so a staged
  // hunk leaves the list; since session start it is the working tree against that commit.
  // Staged is `--cached` against the base either way.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request: GitDiffRequest = { cwd, context: FULL_CONTEXT };
    if (scope === 'staged') request.staged = true;
    if (scope === 'staged' || base === 'session') request.base = baseRev ?? 'HEAD';
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
  }, [cwd, base, baseRev, scope, attempt]);

  const file = files?.find((entry) => entry.path === selection.path) ?? null;
  const state: DiffPaneState =
    error || mergeFailure
      ? 'error'
      : files === null
        ? 'loading'
        : files.length === 0
          ? 'empty'
          : file?.binary
            ? 'partial'
            : 'ready';
  const refresh = useCallback(() => setAttempt((count) => count + 1), []);

  // A finished tool call may have written files: refetch on the running→idle edge only, as
  // the Git pane does.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) refresh();
    wasRunning.current = running;
  }, [running, refresh]);

  const blocked = running
    ? intl.formatMessage(i18n.blockedRunning)
    : applying
      ? intl.formatMessage(i18n.applying)
      : null;

  // git's atomicity is the race guard: a patch that no longer matches the tree is refused
  // whole, and its stderr is the Error row (DESIGN.md §States); the list and selection stay.
  const send = useCallback(
    (path: '/git/apply' | '/git/stage', request: GitApplyRequest | GitPathsRequest) => {
      setApplying(true);
      setActionError(null);
      return sidecarFetch(path, request)
        .then(() => {
          refresh();
          return true;
        })
        .catch((cause: Error) => {
          setActionError(cause.message);
          return false;
        })
        .finally(() => setApplying(false));
    },
    [refresh]
  );

  const controls: ChunkControls | null =
    scope === 'staged' || selection.view !== 'unified'
      ? null
      : {
          labels: {
            reject: intl.formatMessage(i18n.reject),
            stage: intl.formatMessage(i18n.stage),
          },
          blocked,
          onAction: (action, chunk, old, next) => {
            if (!file) return;
            const patch = chunkPatch({ path: file.path, kind: file.kind, old, new: next, chunk });
            const request: GitApplyRequest = { patch, cwd };
            if (action === 'reject') request.reverse = true;
            else request.cached = true;
            void send('/git/apply', request).then((ok) => {
              if (ok) diffStore.setLastApply(request);
            });
          },
        };

  const undo = () => {
    const applied = selection.lastApply;
    if (!applied || blocked) return;
    void send('/git/apply', undoRequest(applied)).then((ok) => {
      if (ok) diffStore.setLastApply(null);
    });
  };

  // A rename or a binary carries headers the synthesized patch cannot (unified-diff.ts
  // drops them), so those entries stage whole, through the same route the Git pane uses.
  const fileLevel = file !== null && (file.binary || file.kind === 'renamed');
  const stageFile = () => {
    if (!file || blocked) return;
    const paths = file.oldPath ? [file.oldPath, file.path] : [file.path];
    void send('/git/stage', { paths, cwd });
  };

  // Both run in the main checkout: from the worktree, git's toplevel is the worktree itself
  // and `merge wt/<slug>` would merge the branch into itself. A 409 lists the paths and
  // leaves Merge enabled; the user resolves in the Editor or the Terminal, never the pane.
  const merge = () => {
    if (!place || merging || removing || running) return;
    const request: GitMergeRequest = { cwd: place.main.path, slug: place.slug };
    setMerging(true);
    setNotice(null);
    setMergeFailure(null);
    sidecarFetch<GitMergeResponse>('/git/merge', request)
      .then((response) => {
        setNotice(
          intl.formatMessage(i18n.merged, {
            branch: place.main.branch,
            sha: response.sha.slice(0, 7),
          })
        );
        refresh();
      })
      .catch((cause: Error) => {
        const conflicts =
          cause instanceof SidecarError && Array.isArray(cause.details.conflicts)
            ? (cause.details.conflicts as string[])
            : [];
        setMergeFailure({ message: cause.message, conflicts });
      })
      .finally(() => setMerging(false));
  };

  // A removed cwd would strand the session (a deleted dir breaks session/load), so the
  // session moves back to the main checkout, as a DirSwitcher pick does in BaseChat. A
  // dirty or locked tree is git's refusal, shown as is: `force` is never sent.
  const removeWorktree = () => {
    if (!place || merging || removing || running) return;
    const request: GitWorktreeRemoveRequest = { cwd: place.main.path, slug: place.slug };
    const main = place.main.path;
    setRemoving(true);
    setNotice(null);
    setMergeFailure(null);
    sidecarFetch('/git/worktree/remove', request)
      .then(async () => {
        await acpUpdateWorkingDir(sessionId, main);
        const current = acpChatSessionStore.getSnapshot(sessionId)?.session;
        if (current) {
          acpChatSessionActions.setSessionMetadata(sessionId, { ...current, working_dir: main });
        }
        setNotice(intl.formatMessage(i18n.worktreeRemoved, { path: main }));
      })
      .catch((cause: Error) => setMergeFailure({ message: cause.message, conflicts: [] }))
      .finally(() => setRemoving(false));
  };
  const actionBlocked = merging || removing || running;
  const actionTitle = running ? intl.formatMessage(i18n.worktreeBlockedRunning) : undefined;

  const prOpened = (pr: GitPrCreateResponse) => {
    setMergeFailure(null);
    setNotice(intl.formatMessage(i18n.prOpened, { number: pr.number, url: pr.url }));
  };

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
        <select
          className="rounded-md border border-border-primary bg-background-primary px-1 py-0.5 text-xs text-text-primary"
          aria-label={intl.formatMessage(i18n.scope)}
          data-testid="diff-scope"
          value={scope}
          onChange={(event) => diffStore.setScope(event.target.value as DiffScope)}
        >
          <option value="unstaged">{intl.formatMessage(i18n.unstaged)}</option>
          <option value="staged">{intl.formatMessage(i18n.staged)}</option>
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
        {blocked && (
          <span
            className="min-w-0 truncate text-xs text-text-secondary"
            data-testid="diff-blocked"
            role="status"
          >
            {blocked}
          </span>
        )}
        {selection.lastApply && (
          <Button
            className="ml-auto"
            variant="outline"
            size="xs"
            disabled={blocked !== null}
            title={blocked ?? undefined}
            data-testid="diff-undo"
            onClick={undo}
          >
            {intl.formatMessage(i18n.undo)}
          </Button>
        )}
        <Button
          className={cn(!selection.lastApply && 'ml-auto')}
          variant="ghost"
          size="xs"
          onClick={refresh}
        >
          {intl.formatMessage(i18n.refresh)}
        </Button>
      </div>

      {/* The worktree row (task 49): the branch as machine text, then the two actions that
          run in the main checkout. */}
      {place && (
        <div
          className="flex flex-wrap items-center gap-1 px-2 py-1 border-b border-border-primary"
          data-testid="diff-worktree"
          data-slug={place.slug}
        >
          <span className="text-xs text-text-secondary">{intl.formatMessage(i18n.worktree)}</span>
          <span className="min-w-0 truncate font-mono text-xs" data-testid="diff-branch">
            {place.branch}
          </span>
          <Button
            className="ml-auto"
            variant="outline"
            size="xs"
            disabled={actionBlocked}
            title={actionTitle}
            data-testid="diff-merge"
            onClick={merge}
          >
            {merging
              ? intl.formatMessage(i18n.merging)
              : intl.formatMessage(i18n.merge, { branch: place.main.branch ?? 'HEAD' })}
          </Button>
          {hasUpstream && (
            <Button
              variant="outline"
              size="xs"
              disabled={actionBlocked}
              title={actionTitle}
              data-testid="diff-open-pr"
              onClick={() => setPrSheetOpen(true)}
            >
              {intl.formatMessage(i18n.openPr)}
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            disabled={actionBlocked}
            title={actionTitle}
            data-testid="diff-remove-worktree"
            onClick={removeWorktree}
          >
            {intl.formatMessage(removing ? i18n.removingWorktree : i18n.removeWorktree)}
          </Button>
        </div>
      )}
      {place && hasUpstream && (
        <PrSheet
          open={prSheetOpen}
          onOpenChange={setPrSheetOpen}
          cwd={cwd}
          branch={place.branch}
          base={place.main.branch ?? undefined}
          onCreated={prOpened}
        />
      )}
      {notice && (
        <p
          className="px-2 py-1 border-b border-border-primary font-mono text-xs text-text-secondary"
          data-testid="diff-notice"
        >
          {notice}
        </p>
      )}
      {mergeFailure && (
        <div
          className="p-3 border-b border-border-primary text-text-secondary"
          role="alert"
          data-testid="diff-merge-error"
        >
          <p className="whitespace-pre-wrap font-mono text-xs">{mergeFailure.message}</p>
          {mergeFailure.conflicts.length > 0 && (
            <>
              <ul className="mt-1 font-mono text-xs text-text-danger" data-testid="diff-conflicts">
                {mergeFailure.conflicts.map((path) => (
                  <li key={path}>{path}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">{intl.formatMessage(i18n.mergeConflicts)}</p>
            </>
          )}
        </div>
      )}

      {error && (
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
            {actionError && (
              <p
                className="px-2 py-1 whitespace-pre-wrap font-mono text-xs text-text-danger border-b border-border-primary"
                data-testid="diff-action-error"
                role="alert"
              >
                {actionError}
              </p>
            )}
            {!file && (
              <p className="p-3 text-text-secondary">{intl.formatMessage(i18n.selectFile)}</p>
            )}
            {file && fileLevel && (
              <div className="flex items-center gap-2 px-3 py-1 text-xs text-text-secondary border-b border-border-primary">
                {file.binary && <span>{intl.formatMessage(i18n.binary)}</span>}
                {file.kind === 'renamed' && (
                  <span className="min-w-0 truncate font-mono" title={file.oldPath ?? undefined}>
                    {file.oldPath} → {file.path}
                  </span>
                )}
                {scope !== 'staged' && (
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={blocked !== null}
                    title={blocked ?? undefined}
                    data-testid="diff-file-stage"
                    onClick={stageFile}
                  >
                    {intl.formatMessage(i18n.stage)}
                  </Button>
                )}
              </div>
            )}
            {file && !file.binary && (
              <ChangeView
                file={file}
                view={selection.view}
                dark={resolvedTheme === 'dark'}
                controls={fileLevel ? null : controls}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
