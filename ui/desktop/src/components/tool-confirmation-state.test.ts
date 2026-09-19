import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_CONFIRMATION_STATES, toolConfirmationState } from './tool-confirmation-state';

describe('toolConfirmationState', () => {
  it('is partial while the card is up and nothing has been decided', () => {
    expect(
      toolConfirmationState({ decision: null, isClicked: false, approvalError: null })
    ).toBe('partial');
  });

  it('is ready once an allow or deny decision landed', () => {
    expect(
      toolConfirmationState({ decision: 'allow_once', isClicked: true, approvalError: null })
    ).toBe('ready');
    expect(
      toolConfirmationState({ decision: 'deny_once', isClicked: true, approvalError: null })
    ).toBe('ready');
  });

  it('is cancelled when the decision is a cancel', () => {
    expect(
      toolConfirmationState({ decision: 'cancel', isClicked: true, approvalError: null })
    ).toBe('cancelled');
  });

  it('is error when the approval request went stale, decision or not', () => {
    expect(
      toolConfirmationState({ decision: null, isClicked: false, approvalError: 'stale' })
    ).toBe('error');
    expect(
      toolConfirmationState({ decision: 'allow_once', isClicked: true, approvalError: 'stale' })
    ).toBe('error');
  });

  // `ready` is the card's own, for a decision with nothing left unresolved.
  it('declares only states from DESIGN.md §Shared component states, plus ready', () => {
    const design = readFileSync(resolve(process.cwd(), '../../DESIGN.md'), 'utf8');
    const table = design.split('## Shared component states')[1].split('\n## ')[0];
    const named = [...table.matchAll(/^\| (\w+) \|/gm)].map((match) => match[1].toLowerCase());
    expect(named).toContain('empty');
    for (const state of TOOL_CONFIRMATION_STATES) {
      if (state !== 'ready') expect(named).toContain(state);
    }
  });
});
