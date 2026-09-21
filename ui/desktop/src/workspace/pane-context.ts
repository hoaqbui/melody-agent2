// What the shell hands every pane body: the session it sits beside, the cross-pane actions
// (a file picked in Files opens in the Editor; a worker's row opens its artifact; a review's
// finding opens the Editor at its line) and the way to say something arrived (task 69).
// Panes keep their own contents.

import { createContext, useContext } from 'react';
import type { GitStatusResponse } from '../native/sidecar';
import type { Message } from '../types/message';
import type { InsertChatInput } from './chat-insert';
import type { LayoutMode, PaneId } from './pane-store';

export interface PaneContextValue {
  cwd: string;
  mode: LayoutMode;
  // The open session's id; empty while no session is open.
  sessionId: string;
  // The open session's transcript; empty while no session is open.
  messages: readonly Message[];
  // The path the Editor shows; null until a file is picked.
  file: string | null;
  // The line the Editor scrolls to (task 70's `file:line` links); null when the file was
  // picked without one.
  line: number | null;
  openFile(path: string, line?: number): void;
  // The pane has something new to look at; a no-op while it is on screen, a dot on the
  // rail until it is opened otherwise.
  markUnseen(id: PaneId): void;
  // The child session whose artifact the Artifact pane shows; null until one is picked.
  artifact: string | null;
  openArtifact(childSessionId: string): void;
  // The review session the Review pane shows (task 70); null until a review is started.
  review: string | null;
  openReview(sessionId: string): void;
  // Hand text or image to the chat input for the user to read before sending (task 76).
  insertIntoChat(input: InsertChatInput): void;
  // The last git status from the workspace-wide poll; null until the first poll completes.
  // All panes read one value instead of polling their own (task 74).
  gitStatus: GitStatusResponse | null;
  // Open a pane by its ID (e.g., 'diff', 'git', 'files').
  openPane(id: PaneId): void;
  // Focus the Git pane's commit textarea (used by Accept all in the Changes bar).
  focusCommit(): void;
}

export const PaneContext = createContext<PaneContextValue | null>(null);

export function usePaneContext(): PaneContextValue {
  const value = useContext(PaneContext);
  if (!value) throw new Error('usePaneContext: no WorkspaceShell above this pane');
  return value;
}

export function usePaneContextSafe(): PaneContextValue | null {
  return useContext(PaneContext);
}
