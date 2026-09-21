import { createContext } from 'react';
import type { TurnSnapshots } from './turn-undo';

// Undo this turn / Redo (task 88), handed to the user bubble by the shell: the chat renders
// outside the pane tree, so the bubble cannot read PaneContext for it (the file-link slot's
// pattern). `undo` returns the state the control should read next, or throws with the reason.
export interface TurnUndoTarget {
  snapshotsFor(turnId: string): TurnSnapshots | undefined;
  // Resolves true when the tree changed; false when refused or failed (the label stays).
  undo(turnId: string, redo: boolean): Promise<boolean>;
}

export const TurnUndoSlot = createContext<TurnUndoTarget | null>(null);
