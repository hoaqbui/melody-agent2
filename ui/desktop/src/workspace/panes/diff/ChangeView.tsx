import { useEffect, useRef } from 'react';
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
import type { InsertChatInput } from '../../chat-insert';
import { resolveLinkPath } from '../../file-links';
import { monokaiHighlight } from '../../../theme/monokai-highlight';
import type { DiffFile } from './unified-diff';

export type ChunkAction = 'reject' | 'stage';

const i18n = defineMessages({
  hunkAsk: { id: 'diffPane.hunkAsk', defaultMessage: 'Ask about this' },
  hunkOpen: { id: 'diffPane.hunkOpen', defaultMessage: 'Open in Editor' },
});

export interface ChunkControls {
  labels: Record<ChunkAction, string>;
  blocked: string | null;
  onAction(action: ChunkAction, chunk: Chunk, old: Text, next: Text): void;
}

interface ChangeViewProps {
  file: DiffFile;
  view: 'unified' | 'split';
  dark: boolean;
  controls: ChunkControls | null;
  cwd: string;
  gitToplevel: string;
  insertIntoChat(input: InsertChatInput): void;
  openFile(path: string, line?: number): void;
}

const setBlocked = (button: HTMLButtonElement, blocked: string | null) => {
  button.disabled = blocked !== null;
  if (blocked) button.title = blocked;
  else button.removeAttribute('title');
};

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
  return dark ? [theme, syntaxHighlighting(monokaiHighlight)] : theme;
}

export function ChangeView({
  file,
  view,
  dark,
  controls,
  cwd,
  gitToplevel,
  insertIntoChat,
  openFile,
}: ChangeViewProps) {
  const intl = useIntl();
  const host = useRef<HTMLDivElement>(null);
  const controlsRef = useRef(controls);
  const contextRef = useRef({ cwd, gitToplevel, insertIntoChat, openFile });
  const buttons = useRef(new Set<HTMLButtonElement>());
  const blocked = controls?.blocked ?? null;
  const hasControls = controls !== null;

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    contextRef.current = { cwd, gitToplevel, insertIntoChat, openFile };
  }, [cwd, gitToplevel, insertIntoChat, openFile]);

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
    const chunkAt = (marker: HTMLButtonElement) => {
      const at = editor.posAtDOM(marker);
      return getChunks(editor.state)?.chunks.find(
        (candidate) => candidate.fromB <= at && candidate.endB >= at
      );
    };
    const mergeControls = (type: 'reject' | 'accept') => {
      const group = document.createElement('span');
      group.style.display = 'contents';
      if (hasControls) {
        const action: 'reject' | 'stage' = type === 'accept' ? 'stage' : 'reject';
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
          const chunk = chunkAt(button);
          if (chunk)
            current.onAction(action, chunk, getOriginalDoc(editor.state), editor.state.doc);
        });
        buttons.current.add(button);
        group.appendChild(button);
      }
      if (type === 'accept') {
        const ask = document.createElement('button');
        ask.type = 'button';
        ask.name = 'ask';
        ask.textContent = intl.formatMessage(i18n.hunkAsk);
        ask.dataset.testid = 'diff-hunk-ask';
        ask.addEventListener('click', (event) => {
          event.preventDefault();
          const chunk = chunkAt(ask);
          if (!chunk) return;
          const doc = editor.state.doc;
          const text = doc.sliceString(chunk.fromB, chunk.toB);
          const first = doc.lineAt(chunk.fromB).number;
          const last =
            chunk.toB > chunk.fromB
              ? doc.lineAt(Math.min(chunk.toB, doc.length) - 1).number
              : first;
          contextRef.current.insertIntoChat({
            kind: 'text',
            text,
            source: { path: file.path, lines: [first, last] },
          });
        });
        group.appendChild(ask);

        const open = document.createElement('button');
        open.type = 'button';
        open.name = 'open';
        open.textContent = intl.formatMessage(i18n.hunkOpen);
        open.dataset.testid = 'diff-hunk-open';
        open.addEventListener('click', (event) => {
          event.preventDefault();
          const chunk = chunkAt(open);
          if (!chunk) return;
          const line = editor.state.doc.lineAt(chunk.fromB).number;
          const { gitToplevel: currentToplevel, openFile: currentOpenFile } = contextRef.current;
          currentOpenFile(resolveLinkPath(file.path, currentToplevel), line);
        });
        group.appendChild(open);
      }
      return group;
    };
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
  }, [file, view, dark, hasControls, intl]);

  return <div ref={host} data-testid="diff-view" data-view={view} data-path={file.path} />;
}
