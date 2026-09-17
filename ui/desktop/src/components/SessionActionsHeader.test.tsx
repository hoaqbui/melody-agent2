// Task 69: upstream's session actions lifted into useSessionActions — the header hides on
// the workspace route, the rail's ⋯ (RailMenu) runs the same handlers, and R · F · A · D
// fire them while the menu is open.
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../types/session';

const navigateMock = vi.hoisted(() => vi.fn());
const acp = vi.hoisted(() => ({
  acpArchiveSession: vi.fn().mockResolvedValue(undefined),
  acpDeleteSession: vi.fn().mockResolvedValue(undefined),
  acpExportSession: vi.fn().mockResolvedValue('{"id":"s1"}'),
  acpForkSession: vi.fn().mockResolvedValue('s1-fork'),
  acpRenameSession: vi.fn().mockResolvedValue(undefined),
}));
const store = vi.hoisted(() => ({
  snapshot: null as { session: Session } | null,
  setSessionMetadata: vi.fn(),
  deleteSnapshot: vi.fn(),
}));

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}));
vi.mock('../acp/sessions', () => acp);
vi.mock('../acp/diagnostics', () => ({ getDiagnosticsReport: vi.fn() }));
vi.mock('../acp/chatSessionStore', () => ({
  acpChatSessionStore: { getSnapshot: () => store.snapshot },
  acpChatSessionActions: {
    setSessionMetadata: store.setSessionMetadata,
    deleteSnapshot: store.deleteSnapshot,
  },
}));
vi.mock('../acp/permissionRequests', () => ({ cancelAcpPermissionRequestsForSession: vi.fn() }));
vi.mock('../acp/elicitationRequests', () => ({
  cancelAcpElicitationRequestsForSession: vi.fn(),
}));
vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { IntlTestWrapper } from '../i18n/test-utils';
import { useSessionActions, type SessionActions } from '../hooks/useSessionActions';
import { DropdownMenu, DropdownMenuTrigger } from './ui/dropdown-menu';
import { RailMenu } from '../workspace/RailMenu';
import { initialLayout, PANE_IDS, type PaneId } from '../workspace/pane-store';
import type { PaneChrome } from '../workspace/WorkColumn';
import SessionActionsHeader from './SessionActionsHeader';

const session = {
  id: 's1',
  name: 'Chat one',
  user_set_name: true,
  working_dir: '/tmp/repo',
  created_at: '2026-09-16T00:00:00Z',
  updated_at: '2026-09-16T00:00:00Z',
  extension_data: {},
  message_count: 1,
} as unknown as Session;

function renderActions() {
  return renderHook(() => useSessionActions(session), { wrapper: IntlTestWrapper });
}

describe('SessionActionsHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.snapshot = { session };
  });

  it('renders nothing on the workspace route and its trigger elsewhere', () => {
    const { container, rerender } = render(<SessionActionsHeader session={session} hidden />, {
      wrapper: IntlTestWrapper,
    });
    expect(container).toBeEmptyDOMElement();
    rerender(<SessionActionsHeader session={session} />);
    expect(screen.getByRole('button', { name: 'Session actions' })).toHaveTextContent('Chat one');
  });
});

describe('useSessionActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.snapshot = { session };
  });

  it('renames through ACP, the store and the SESSION_RENAMED event', async () => {
    const renamed = vi.fn();
    window.addEventListener('session-renamed', renamed);
    const { result } = renderActions();
    act(() => result.current.setRenameOpen(true));
    act(() => result.current.setRenameValue('  Chat two '));
    await act(() => result.current.rename());
    expect(acp.acpRenameSession).toHaveBeenCalledWith('s1', 'Chat two');
    expect(store.setSessionMetadata).toHaveBeenCalledWith('s1', {
      ...session,
      name: 'Chat two',
      user_set_name: true,
    });
    expect(renamed).toHaveBeenCalledTimes(1);
    expect(result.current.renameOpen).toBe(false);
    window.removeEventListener('session-renamed', renamed);
  });

  it("forks with upstream's acpForkSession and opens the fork", async () => {
    const { result } = renderActions();
    await act(() => result.current.fork());
    expect(acp.acpForkSession).toHaveBeenCalledWith('s1');
    expect(navigateMock).toHaveBeenCalledWith(
      '/pair?resumeSessionId=s1-fork',
      expect.objectContaining({ state: expect.objectContaining({ resumeSessionId: 's1-fork' }) })
    );
  });

  it('archives and leaves the list the way a delete does, without deleting', async () => {
    const deleted = vi.fn();
    window.addEventListener('session-deleted', deleted);
    const { result } = renderActions();
    await act(() => result.current.archive());
    expect(acp.acpArchiveSession).toHaveBeenCalledWith('s1');
    expect(acp.acpDeleteSession).not.toHaveBeenCalled();
    expect(deleted).toHaveBeenCalledTimes(1);
    expect(store.deleteSnapshot).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/', expect.anything());
    window.removeEventListener('session-deleted', deleted);
  });

  it('deletes only after the confirm, then drops the snapshot', async () => {
    const { result } = renderActions();
    vi.useFakeTimers();
    act(() => result.current.openDelete());
    act(() => vi.runAllTimers());
    vi.useRealTimers();
    expect(result.current.deleteOpen).toBe(true);
    expect(acp.acpDeleteSession).not.toHaveBeenCalled();
    await act(() => result.current.confirmDelete());
    expect(acp.acpDeleteSession).toHaveBeenCalledWith('s1');
    expect(store.deleteSnapshot).toHaveBeenCalledWith('s1');
    expect(result.current.deleteOpen).toBe(false);
  });
});

// The menu with every session handler stubbed, so a keypress is observed on the stub.
function stubActions(): SessionActions {
  return {
    session,
    openRename: vi.fn(),
    fork: vi.fn().mockResolvedValue(undefined),
    viewJson: vi.fn().mockResolvedValue(undefined),
    viewModelInteractions: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
    openDelete: vi.fn(),
    forking: false,
    archiving: false,
    deleting: false,
    renameOpen: false,
    setRenameOpen: vi.fn(),
    renameValue: '',
    setRenameValue: vi.fn(),
    renaming: false,
    rename: vi.fn().mockResolvedValue(undefined),
    jsonOpen: false,
    setJsonOpen: vi.fn(),
    jsonKind: 'session',
    jsonValue: null,
    jsonText: '',
    jsonLoading: false,
    modelInteractionsLoading: false,
    copyJson: vi.fn().mockResolvedValue(undefined),
    fullText: null,
    setFullText: vi.fn(),
    copyFullText: vi.fn().mockResolvedValue(undefined),
    deleteOpen: false,
    confirmDelete: vi.fn().mockResolvedValue(undefined),
    cancelDelete: vi.fn(),
  };
}

function renderMenu(actions: SessionActions | undefined, onClose = vi.fn()) {
  const Icon = () => <svg />;
  const chrome = {} as Record<PaneId, PaneChrome>;
  for (const id of PANE_IDS) chrome[id] = { title: id, Icon };
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>⋯</DropdownMenuTrigger>
      <RailMenu
        layout={initialLayout()}
        panes={['files', 'editor', 'git', 'markdown']}
        chrome={chrome}
        onOpenPane={vi.fn()}
        actions={actions}
        cwd="/tmp/repo"
        webShim={false}
        transcriptView="full"
        onTranscriptView={vi.fn()}
        keepAwake={false}
        onKeepAwake={vi.fn()}
        advanced={false}
        onToggleAdvanced={vi.fn()}
        onOpenPhone={vi.fn()}
        onOpenResponseStyles={vi.fn()}
        onBackgroundTasks={vi.fn()}
        side="left"
        align="center"
        onClose={onClose}
      />
    </DropdownMenu>,
    { wrapper: IntlTestWrapper }
  );
  return screen.getByTestId('workspace-pane-more-menu');
}

describe('RailMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Radix menus measure and scroll; jsdom has neither.
    Element.prototype.scrollIntoView = vi.fn();
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  });

  it('lays the groups out in order with their shortcuts', async () => {
    const menu = renderMenu(stubActions());
    await waitFor(() => expect(menu).toBeVisible());
    const items = Array.from(menu.querySelectorAll('[data-testid^="workspace-"]')).map((item) =>
      item.getAttribute('data-testid')
    );
    expect(items).toEqual([
      'workspace-pane-item-files',
      'workspace-pane-item-editor',
      'workspace-pane-item-git',
      'workspace-pane-item-markdown',
      'workspace-background-tasks',
      'workspace-open-in',
      'workspace-rename',
      'workspace-fork',
      'workspace-transcript-view',
      'workspace-output-style',
      'workspace-keep-awake',
      'workspace-advanced-controls',
      'workspace-open-phone',
      'workspace-rail-save-routine',
      'workspace-archive',
      'workspace-delete',
    ]);
    expect(menu.querySelectorAll('[data-slot="dropdown-menu-separator"]')).toHaveLength(4);
    const shortcuts = Array.from(menu.querySelectorAll('[data-slot="dropdown-menu-shortcut"]')).map(
      (span) => span.textContent
    );
    expect(shortcuts).toEqual(['⇧⌘F', 'R', 'F', 'A', 'D']);
    expect(screen.getByTestId('workspace-delete')).toHaveAttribute('data-variant', 'destructive');
  });

  it('hides Open in and Keep awake on the web build', async () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>⋯</DropdownMenuTrigger>
        <RailMenu
          layout={initialLayout()}
          panes={[]}
          chrome={{} as Record<PaneId, PaneChrome>}
          onOpenPane={vi.fn()}
          actions={stubActions()}
          cwd="/tmp/repo"
          webShim
          transcriptView="full"
          onTranscriptView={vi.fn()}
          keepAwake={false}
          onKeepAwake={vi.fn()}
          advanced={false}
          onToggleAdvanced={vi.fn()}
          onOpenPhone={vi.fn()}
          onOpenResponseStyles={vi.fn()}
          onBackgroundTasks={vi.fn()}
          side="left"
          align="center"
          onClose={vi.fn()}
        />
      </DropdownMenu>,
      { wrapper: IntlTestWrapper }
    );
    await waitFor(() => expect(screen.getByTestId('workspace-pane-more-menu')).toBeVisible());
    expect(screen.queryByTestId('workspace-open-in')).toBeNull();
    expect(screen.queryByTestId('workspace-keep-awake')).toBeNull();
    expect(screen.getByTestId('workspace-fork')).toBeInTheDocument();
  });

  it('fires R · F · A · D while open and closes the menu', async () => {
    const actions = stubActions();
    const onClose = vi.fn();
    const menu = renderMenu(actions, onClose);
    await waitFor(() => expect(menu).toBeVisible());
    fireEvent.keyDown(menu, { key: 'r' });
    expect(actions.openRename).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(menu, { key: 'F' });
    expect(actions.fork).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(menu, { key: 'a' });
    expect(actions.archive).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(menu, { key: 'd' });
    expect(actions.openDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(4);
    fireEvent.keyDown(menu, { key: 'r', metaKey: true });
    expect(actions.openRename).toHaveBeenCalledTimes(1);
  });

  it('waits, disabled, until a session is open', async () => {
    const menu = renderMenu(undefined);
    await waitFor(() => expect(menu).toBeVisible());
    for (const id of [
      'workspace-rename',
      'workspace-fork',
      'workspace-archive',
      'workspace-delete',
    ]) {
      expect(screen.getByTestId(id)).toHaveAttribute('data-disabled');
    }
    expect(screen.getByTestId('workspace-pane-item-files')).not.toHaveAttribute('data-disabled');
    fireEvent.keyDown(menu, { key: 'r' });
  });
});
