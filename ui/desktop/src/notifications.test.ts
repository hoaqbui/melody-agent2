import type { DelegationUpdate, ScheduleRunDto } from '@aaif/goose-acp-client';
import { createIntl } from 'react-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNS_POLL_MS } from './acp/runsPoll';

const { listRuns } = vi.hoisted(() => ({
  listRuns: vi.fn<(limit: number) => Promise<ScheduleRunDto[]>>(),
}));
vi.mock('./acp/schedules', () => ({ acpListScheduleRuns: listRuns }));

const intl = createIntl({ locale: 'en', messages: {} });
const navigate = vi.fn();
const showNotification = vi.fn();
const isAnyWindowFocused = vi.fn<() => Promise<boolean>>();
const on = vi.fn();
const off = vi.fn();

function update(overrides: Partial<DelegationUpdate> = {}): DelegationUpdate {
  return {
    subagentSessionId: 'child-1',
    parentSessionId: 'parent-1',
    provider: 'claude-acp',
    model: 'claude-sonnet-5',
    title: 'say hello',
    status: 'done',
    ...overrides,
  };
}

function run(overrides: Partial<ScheduleRunDto> = {}): ScheduleRunDto {
  return {
    sessionId: 'run-1',
    scheduleId: 'nightly',
    startedAt: '2026-09-16T10:00:00Z',
    workingDir: '/repo',
    ...overrides,
  };
}

// Module state (the queue, the run baseline, the unread set) is per test.
async function load() {
  vi.resetModules();
  const notifications = await import('./notifications');
  const delegations = await import('./acp/delegations');
  const stop = notifications.startNotifications({ intl, navigate });
  await vi.advanceTimersByTimeAsync(0);
  return { ...notifications, ...delegations, stop };
}

beforeEach(async () => {
  vi.useFakeTimers();
  window.localStorage.clear();
  listRuns.mockResolvedValue([]);
  isAnyWindowFocused.mockResolvedValue(false);
  await window.electron.setSetting('enableNotifications', true);
  Object.assign(window.electron, { showNotification, isAnyWindowFocused, on, off });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('finish notifications', () => {
  it('coalesces three delegated children finishing within 2 s into one notification', async () => {
    const { applyDelegationUpdate, stop } = await load();
    applyDelegationUpdate(update({ subagentSessionId: 'child-1', title: 'say hello' }));
    await vi.advanceTimersByTimeAsync(500);
    applyDelegationUpdate(update({ subagentSessionId: 'child-2', title: 'fix lint' }));
    await vi.advanceTimersByTimeAsync(500);
    applyDelegationUpdate(update({ subagentSessionId: 'child-3', title: 'write tests' }));
    await vi.advanceTimersByTimeAsync(2000);

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith({
      title: '3 workers finished',
      body: 'say hello, fix lint, write tests',
      route: '/pair?resumeSessionId=parent-1',
    });
    stop();
  });

  it('ignores running updates and a re-delivered done for the same child', async () => {
    const { applyDelegationUpdate, stop } = await load();
    applyDelegationUpdate(update({ status: 'running' }));
    applyDelegationUpdate(update());
    applyDelegationUpdate(update());
    await vi.advanceTimersByTimeAsync(2000);

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith({
      title: 'Worker finished',
      body: 'say hello',
      route: '/pair?resumeSessionId=parent-1',
    });
    stop();
  });

  it('shows nothing and marks nothing while a window is focused', async () => {
    isAnyWindowFocused.mockResolvedValue(true);
    const { applyDelegationUpdate, getUnreadSessions, stop } = await load();
    applyDelegationUpdate(update());
    await vi.advanceTimersByTimeAsync(2000);

    expect(showNotification).not.toHaveBeenCalled();
    expect(getUnreadSessions().size).toBe(0);
    stop();
  });

  it('keeps the unread dot when notifications are off', async () => {
    await window.electron.setSetting('enableNotifications', false);
    const { applyDelegationUpdate, getUnreadSessions, UNREAD_STORAGE_KEY, stop } = await load();
    applyDelegationUpdate(update());
    await vi.advanceTimersByTimeAsync(2000);

    expect(showNotification).not.toHaveBeenCalled();
    expect(getUnreadSessions().has('parent-1')).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(UNREAD_STORAGE_KEY) ?? '[]')).toEqual([
      'parent-1',
    ]);
    stop();
  });

  it("keeps upstream's turn notification for a main-checkout session", async () => {
    const { notifyTurnFinished, stop } = await load();
    notifyTurnFinished({ sessionId: 's-1', workingDir: '/repo' });
    await vi.advanceTimersByTimeAsync(2000);

    expect(showNotification).toHaveBeenCalledWith({
      title: 'Goose finished the task.',
      body: 'Click here to bring Goose back into focus.',
      route: '/pair?resumeSessionId=s-1',
    });
    stop();
  });

  it("names the branch in a worktree session's turn notification", async () => {
    const { notifyTurnFinished, stop } = await load();
    notifyTurnFinished({ sessionId: 's-2', workingDir: '/repo/.worktrees/wt-20260916-ab12' });
    await vi.advanceTimersByTimeAsync(2000);

    expect(showNotification).toHaveBeenCalledWith({
      title: 'Goose finished the task.',
      body: 'Finished on wt/wt-20260916-ab12. Click here to bring Goose back into focus.',
      route: '/pair?resumeSessionId=s-2',
    });
    stop();
  });

  it('notifies once a routine run gains an outcome on the shared poll, never for the baseline', async () => {
    listRuns.mockResolvedValue([
      run({ sessionId: 'old', outcome: { status: 'done' } }),
      run({ sessionId: 'live' }),
    ]);
    const { stop } = await load();
    await vi.advanceTimersByTimeAsync(2000);
    expect(showNotification).not.toHaveBeenCalled();

    listRuns.mockResolvedValue([
      run({ sessionId: 'old', outcome: { status: 'done' } }),
      run({ sessionId: 'live', outcome: { status: 'failed', error: 'boom' } }),
      run({ sessionId: 'quick', outcome: { status: 'done' }, snippet: 'Tidy the inbox' }),
    ]);
    await vi.advanceTimersByTimeAsync(RUNS_POLL_MS);
    await vi.advanceTimersByTimeAsync(2000);

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith({
      title: '2 routine runs finished',
      body: 'boom, Tidy the inbox',
      route: '/schedules',
    });
    stop();
  });

  it('opens the route a clicked notification carries', async () => {
    const { stop } = await load();
    const handler = on.mock.calls.find(([channel]) => channel === 'notification-click')?.[1];
    expect(handler).toBeTypeOf('function');
    handler({}, '/schedules');

    expect(navigate).toHaveBeenCalledWith('/schedules');
    stop();
    expect(off).toHaveBeenCalledWith('notification-click', handler);
  });

  it('notifies when a session gains a pending approval while no window is focused', async () => {
    const { stop } = await load();
    const { requestAcpPermission, cancelAcpPermissionRequestsForSession } =
      await import('./acp/permissionRequests');

    void requestAcpPermission({
      sessionId: 'sess-1',
      options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }],
      toolCall: {
        toolCallId: 'tool-1',
        title: 'Run command',
        rawInput: { command: 'pnpm install' },
      },
    });
    await vi.advanceTimersByTimeAsync(2000);

    expect(showNotification).toHaveBeenCalledWith({
      title: 'Needs your approval',
      body: 'Run command wants to run pnpm install',
      route: '/pair?resumeSessionId=sess-1',
    });

    cancelAcpPermissionRequestsForSession('sess-1');
    stop();
  });

  it('collapses several sessions awaiting approval into one notification', async () => {
    const { stop } = await load();
    const { requestAcpPermission, cancelAcpPermissionRequestsForSession } =
      await import('./acp/permissionRequests');

    void requestAcpPermission({
      sessionId: 'sess-1',
      options: [],
      toolCall: { toolCallId: 'tool-1', title: 'Read file' },
    });
    await vi.advanceTimersByTimeAsync(200);
    void requestAcpPermission({
      sessionId: 'sess-2',
      options: [],
      toolCall: { toolCallId: 'tool-2', title: 'Read file' },
    });
    await vi.advanceTimersByTimeAsync(2000);

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: '2 sessions need you' })
    );

    cancelAcpPermissionRequestsForSession('sess-1');
    cancelAcpPermissionRequestsForSession('sess-2');
    stop();
  });

  it('stays quiet for approvals already pending when the window starts watching', async () => {
    vi.resetModules();
    const permissionRequests = await import('./acp/permissionRequests');
    void permissionRequests.requestAcpPermission({
      sessionId: 'sess-1',
      options: [],
      toolCall: { toolCallId: 'tool-1', title: 'Read file' },
    });

    const notifications = await import('./notifications');
    const stop = notifications.startNotifications({ intl, navigate });
    await vi.advanceTimersByTimeAsync(2000);

    expect(showNotification).not.toHaveBeenCalled();

    permissionRequests.cancelAcpPermissionRequestsForSession('sess-1');
    stop();
  });

  it('reads a session back and forgets it in storage', async () => {
    window.localStorage.setItem('goose.unreadSessions', JSON.stringify(['a', 'b']));
    const { getUnreadSessions, markSessionRead, stop } = await load();
    expect([...getUnreadSessions()]).toEqual(['a', 'b']);

    markSessionRead('a');
    expect([...getUnreadSessions()]).toEqual(['b']);
    expect(window.localStorage.getItem('goose.unreadSessions')).toBe('["b"]');
    stop();
  });
});
