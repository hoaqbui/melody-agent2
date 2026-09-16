// What the Artifact pane shows per delegated child: the markdown the worker handed back
// (PRODUCT.md §7 shapes) — its last assistant message — and how the read went. Pure, no
// React, no ACP: the pane reads the child's export through src/acp and hands the messages
// here.

import { getTextAndImageContent, type Message } from '../../../types/message';

// The subset of DESIGN.md §Shared component states the pane reports, plus `ready` for a
// rendered artifact with nothing unresolved.
export const ARTIFACT_PANE_STATES = ['empty', 'loading', 'partial', 'error', 'ready'] as const;

export type ArtifactPaneState = (typeof ARTIFACT_PANE_STATES)[number];

// `text` is null when the child has no assistant message stored yet (still running, or its
// transcript was never written): the row shows without a body.
export type ArtifactLoad =
  | { status: 'loading' }
  | { status: 'loaded'; text: string | null }
  | { status: 'error'; message: string };

// The handoff is the last message the worker produced, as summon returns it
// (`subagent_handler.rs` extract_response_text); a trailing tool-only message carries no
// handoff, so the walk back stops at the last assistant message with text.
export function lastAssistantText(messages: readonly Message[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant' || !message.metadata.userVisible) continue;
    const text = getTextAndImageContent(message).textContent.trim();
    if (text) return text;
  }
  return null;
}

// The JSON export of a session is the stored `Session` record; its `conversation` is the
// message list in the renderer's own `Message` shape.
export function artifactFromExport(json: string): string | null {
  const session = JSON.parse(json) as { conversation?: readonly Message[] | null };
  return lastAssistantText(session.conversation ?? []);
}

// The row's title: the artifact's first line, its heading marks dropped.
export function firstLine(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim() !== '') ?? '';
  return line.replace(/^\s*#+\s*/, '').trim();
}

export function paneState(load: ArtifactLoad | undefined, hasRows: boolean): ArtifactPaneState {
  if (!hasRows) return 'empty';
  if (!load || load.status === 'loading') return 'loading';
  if (load.status === 'error') return 'error';
  return load.text === null ? 'partial' : 'ready';
}
