// What the shell hands every pane body: the session it sits beside and the one cross-pane
// action (a file picked in Files opens in the Editor). Panes keep their own contents.

import { createContext, useContext } from 'react';
import type { Message } from '../types/message';
import type { LayoutMode } from './pane-store';

export interface PaneContextValue {
  cwd: string;
  mode: LayoutMode;
  // The open session's transcript; empty while no session is open.
  messages: readonly Message[];
  // The path the Editor shows; null until a file is picked.
  file: string | null;
  openFile(path: string): void;
}

export const PaneContext = createContext<PaneContextValue | null>(null);

export function usePaneContext(): PaneContextValue {
  const value = useContext(PaneContext);
  if (!value) throw new Error('usePaneContext: no WorkspaceShell above this pane');
  return value;
}
