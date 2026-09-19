// What the tool confirmation card shows (task 89). Pure, no React: the card and its test
// read this.

import type { Permission } from '../types/permissions';

// DESIGN.md §Shared component states' rows, plus `ready` for a decision that landed.
export const TOOL_CONFIRMATION_STATES = [
  'empty',
  'loading',
  'partial',
  'running',
  'error',
  'cancelled',
  'unavailable',
  'ready',
] as const;

export type ToolConfirmationState = (typeof TOOL_CONFIRMATION_STATES)[number];

export function toolConfirmationState(input: {
  decision: Permission | null;
  isClicked: boolean;
  approvalError: string | null;
}): ToolConfirmationState {
  if (input.approvalError) return 'error';
  if (input.isClicked && input.decision) {
    return input.decision === 'cancel' ? 'cancelled' : 'ready';
  }
  return 'partial';
}
