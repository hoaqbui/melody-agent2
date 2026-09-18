import { createContext } from 'react';

// Where a message's file:line links resolve (task 82) — the session's cwd, then its git
// toplevel — and the opener they land in. Provided by the shell; the chat renders outside
// the pane tree, so the Markdown renderer cannot read PaneContext for it.
export interface FileLinkTarget {
  cwd: string;
  gitToplevel: string;
  openFile(path: string, line: number): void;
}

export const FileLinkSlot = createContext<FileLinkTarget | null>(null);
