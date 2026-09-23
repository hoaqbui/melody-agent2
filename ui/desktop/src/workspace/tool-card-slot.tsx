import { createContext, useContext } from 'react';
import type { TurnSnapshots } from './turn-undo';

export interface ToolCardSlotContext {
  turnId: string;
  snapshots: TurnSnapshots | undefined;
  cwd: string;
  gitToplevel: string;
  openPane(pane: string): void;
  openFile(path: string, line?: number): void;
  presetDiffPath(path: string): void;
}

const ToolCardSlotCtx = createContext<ToolCardSlotContext | null>(null);

export function useToolCardSlot(): ToolCardSlotContext | null {
  return useContext(ToolCardSlotCtx);
}

export const ToolCardSlot = {
  Provider: ToolCardSlotCtx.Provider,
};
