import { createContext } from 'react';
import type { GitStatusResponse } from '../native/sidecar';
import type { Message } from '../types/message';
import type { PaneId } from './pane-store';

// What the Changes bar needs from the shell (task 84). The bar sits in the chat input,
// which renders outside the pane tree, so it cannot read PaneContext.
export interface ChangesBarTargetValue {
  cwd: string;
  sessionId: string;
  gitStatus: GitStatusResponse | null;
  openPane(id: PaneId): void;
  focusCommit(): void;
  messages: readonly Message[];
}

export const ChangesBarTarget = createContext<ChangesBarTargetValue | null>(null);
