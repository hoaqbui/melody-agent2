import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionConfigOption } from '../acp/sessionConfig';
import { IntlTestWrapper } from '../i18n/test-utils';
import { SessionControls, type SessionControlsProps } from './SessionControls';

vi.mock('../components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuRadioGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuRadioItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

const modeOption: SessionConfigOption = {
  id: 'mode',
  name: 'Mode',
  type: 'select',
  currentValue: 'auto',
  options: [
    { value: 'auto', name: 'auto' },
    { value: 'approve', name: 'approve' },
  ],
};

const baseProps: SessionControlsProps = {
  options: [modeOption],
  cwd: '/tmp/project',
  currentRuntime: 'claude-acp',
  extensionsEnabled: 0,
  busy: false,
  onSetOption: vi.fn(),
  onOpenFiles: vi.fn(),
  onOpenExtensions: vi.fn(),
  planGate: true,
  onPlanGateChange: vi.fn(),
};

const renderControls = (props: Partial<SessionControlsProps> = {}) =>
  render(<SessionControls {...baseProps} {...props} />, { wrapper: IntlTestWrapper });

describe('SessionControls mode note', () => {
  it.each([
    ['claude-acp', 'Claude asks for risky actions'],
    ['codex-acp', 'Codex asks outside the workspace'],
    ['cursor-acp', 'Cursor plans without editing'],
    ['agy', 'agy cannot ask — Approve unavailable'],
  ])('names what %s does with Approve', (currentRuntime, note) => {
    renderControls({ currentRuntime });
    expect(screen.getByTestId('workspace-config-mode-note')).toHaveTextContent(note);
  });

  it('shows a refusal message under the note, the note kept', () => {
    renderControls({ modeError: 'agy runs --dangerously-skip-permissions; it cannot ask' });
    expect(screen.getByTestId('workspace-config-mode-error')).toHaveTextContent(
      'agy runs --dangerously-skip-permissions; it cannot ask'
    );
    expect(screen.getByTestId('workspace-config-mode-note')).toBeInTheDocument();
  });

  it('renders no error row when nothing failed', () => {
    renderControls();
    expect(screen.queryByTestId('workspace-config-mode-error')).not.toBeInTheDocument();
  });
});
