import type { DelegationUpdate } from '@aaif/goose-acp-client';
import { describe, expect, it } from 'vitest';
import {
  applyDelegationUpdate,
  getSessionDelegations,
  rememberSessionChildren,
  type DelegatedChild,
} from './delegations';

function update(overrides: Partial<DelegationUpdate> = {}): DelegationUpdate {
  return {
    subagentSessionId: 'child-1',
    parentSessionId: 'parent-1',
    source: 'reviewer',
    provider: 'claude-acp',
    model: 'claude-sonnet-5',
    title: 'say hello',
    status: 'running',
    ...overrides,
  };
}

function child(overrides: Partial<DelegatedChild> = {}): DelegatedChild {
  return {
    id: 'child-1',
    name: 'Delegated task',
    createdAt: '2026-09-16T10:00:00Z',
    updatedAt: '2026-09-16T10:01:00Z',
    providerId: 'claude-acp',
    modelId: 'claude-sonnet-5',
    ...overrides,
  };
}

describe('delegations store', () => {
  it('starts a row at running and moves it to done in place', () => {
    const parent = 'parent-live';
    applyDelegationUpdate(update({ parentSessionId: parent }));
    applyDelegationUpdate(update({ parentSessionId: parent, subagentSessionId: 'child-2' }));
    applyDelegationUpdate(update({ parentSessionId: parent, status: 'done' }));

    const rows = getSessionDelegations(parent);
    expect(rows.map((row) => [row.subagentSessionId, row.status])).toEqual([
      ['child-1', 'done'],
      ['child-2', 'running'],
    ]);
    expect(rows[0]).toMatchObject({
      parentSessionId: parent,
      source: 'reviewer',
      provider: 'claude-acp',
      model: 'claude-sonnet-5',
      title: 'say hello',
    });
    expect(rows[0].error).toBeUndefined();
  });

  it('keeps the error text on a failed delegation', () => {
    const parent = 'parent-failed';
    applyDelegationUpdate(update({ parentSessionId: parent }));
    applyDelegationUpdate(
      update({ parentSessionId: parent, status: 'failed', error: 'child stopped' })
    );

    expect(getSessionDelegations(parent)[0]).toMatchObject({
      status: 'failed',
      error: 'child stopped',
    });
  });

  it('seeds rows from the children read without inventing a status', () => {
    const parent = 'parent-seeded';
    rememberSessionChildren(parent, [
      child({ id: 'child-b', createdAt: '2026-09-16T11:00:00Z' }),
      child({ id: 'child-a', createdAt: '2026-09-16T10:00:00Z', modelId: undefined }),
    ]);

    const rows = getSessionDelegations(parent);
    expect(rows.map((row) => row.subagentSessionId)).toEqual(['child-a', 'child-b']);
    expect(rows[0]).toEqual({
      subagentSessionId: 'child-a',
      parentSessionId: parent,
      provider: 'claude-acp',
      model: undefined,
      title: 'Delegated task',
      updatedAt: '2026-09-16T10:01:00Z',
    });
    expect(rows.every((row) => row.status === undefined)).toBe(true);
  });

  it('keeps a live status when the seed lands after the event', () => {
    const parent = 'parent-race';
    applyDelegationUpdate(update({ parentSessionId: parent, status: 'done' }));
    applyDelegationUpdate(update({ parentSessionId: parent, subagentSessionId: 'child-live' }));
    rememberSessionChildren(parent, [child()]);

    const rows = getSessionDelegations(parent);
    expect(rows.map((row) => [row.subagentSessionId, row.status])).toEqual([
      ['child-1', 'done'],
      ['child-live', 'running'],
    ]);
    expect(rows[0]).toMatchObject({ title: 'say hello', updatedAt: '2026-09-16T10:01:00Z' });
  });

  it('returns a stable empty list for a session with no delegations', () => {
    expect(getSessionDelegations('nobody')).toBe(getSessionDelegations('nobody'));
    expect(getSessionDelegations('nobody')).toEqual([]);
  });
});
