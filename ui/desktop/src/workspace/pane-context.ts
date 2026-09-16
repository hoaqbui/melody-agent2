// What the shell hands every pane body: the session it sits beside, the cross-pane actions
// (a file picked in Files opens in the Editor; a worker's row opens its artifact) and the way
// to say something arrived (task 69). Panes keep their own contents.

import { createContext, useContext } from 'react';
import type { Message } from '../types/message';
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
  openFile(path: string): void;
  // The pane has something new to look at; a no-op while it is on screen, a dot on the
  // rail until it is opened otherwise.
  markUnseen(id: PaneId): void;
  // The child session whose artifact the Artifact pane shows; null until one is picked.
  artifact: string | null;
  openArtifact(childSessionId: string): void;
}

export const PaneContext = createContext<PaneContextValue | null>(null);

export function usePaneContext(): PaneContextValue {
  const value = useContext(PaneContext);
  if (!value) throw new Error('usePaneContext: no WorkspaceShell above this pane');
  return value;
}
