// What the Review pane shows and how the Reviewer's seat is picked (task 70). Pure, no
// React, no ACP: the pane and the start helper hand their reads here.

import type { ProviderDetails } from '../../../types/providers';
import { needsInstall, parseReviewTitle, type RoleRuntime } from '../../session-controls';

// The subset of DESIGN.md §Shared component states the pane reports, plus `ready` for a
// parsed review with nothing unresolved.
export const REVIEW_PANE_STATES = ['empty', 'loading', 'partial', 'error', 'ready'] as const;

export type ReviewPaneState = (typeof REVIEW_PANE_STATES)[number];

// One review session the pane can show: a session in the cwd whose title carries the tag.
export interface ReviewRow {
  id: string;
  branch: string;
  base: string;
  createdAt: string;
  provider?: string;
  model?: string;
}

// The client's roll, as `summon.rs` roll_runtime does it: a weighted pick among the
// installed seats; `weight: 0` is fail-over only, taken when nothing weighted is left.
export function rollRuntime(
  runtimes: readonly RoleRuntime[],
  providers: readonly ProviderDetails[],
  random: () => number = Math.random
): RoleRuntime | null {
  const installed = runtimes.filter((seat) => !needsInstall(seat.provider, providers));
  const weighted = installed.filter((seat) => seat.weight > 0);
  if (weighted.length === 0) return installed[0] ?? null;
  const total = weighted.reduce((sum, seat) => sum + seat.weight, 0);
  let roll = Math.floor(random() * total);
  for (const seat of weighted) {
    if (roll < seat.weight) return seat;
    roll -= seat.weight;
  }
  return weighted[weighted.length - 1];
}

export function reviewRowOf(
  session: {
    id: string;
    name: string;
    workingDir: string;
    createdAt: string;
    providerId?: string;
    modelId?: string;
  },
  cwd: string
): ReviewRow | null {
  if (session.workingDir !== cwd) return null;
  const tag = parseReviewTitle(session.name);
  if (!tag) return null;
  return {
    id: session.id,
    branch: tag.branch,
    base: tag.base,
    createdAt: session.createdAt,
    provider: session.providerId,
    model: session.modelId,
  };
}

// The cwd's review sessions, newest first.
export function reviewRows(
  sessions: readonly Parameters<typeof reviewRowOf>[0][],
  cwd: string
): ReviewRow[] {
  return sessions
    .flatMap((session) => reviewRowOf(session, cwd) ?? [])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface ReviewRead {
  // The reply is on its way, or the export is; `text` is what has landed so far.
  streaming: boolean;
  // Null until the reviewer has written anything.
  text: string | null;
  parsed: boolean;
  error: string | null;
}

export function paneState(read: ReviewRead | undefined, hasRows: boolean): ReviewPaneState {
  if (!hasRows) return 'empty';
  if (!read) return 'loading';
  if (read.error !== null) return 'error';
  if (read.streaming) return 'loading';
  return read.text !== null && read.parsed ? 'ready' : 'partial';
}
