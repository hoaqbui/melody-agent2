import { describe, it, expect, vi } from 'vitest';
import { buildCommands, filterCommands, PALETTE_STATES } from './palette-state';
import type { PaletteContext, ScheduleDisplay } from './palette-state';
import type { SessionListItem } from '../../acp/sessions';

const mockPanesRecord = {
  files: { title: 'Files' },
  editor: { title: 'Editor' },
  diff: { title: 'Diff' },
  terminal: { title: 'Terminal' },
  git: { title: 'Git' },
  browser: { title: 'Browser' },
  markdown: { title: 'Markdown' },
  agents: { title: 'Agents' },
  artifact: { title: 'Artifact' },
  review: { title: 'Review' },
};

const mockSession: SessionListItem = {
  id: 'session-1',
  name: 'Test Session',
  workingDir: '/path/to/project',
  updatedAt: '2024-01-01T00:00:00Z',
  messageCount: 5,
  createdAt: '2024-01-01T00:00:00Z',
};

const mockSchedule: ScheduleDisplay = {
  id: 'schedule-1',
  name: 'Test Routine',
  description: 'A test routine',
};

describe('buildCommands', () => {
  it('includes pane commands', () => {
    const ctx: PaletteContext = {
      panes: mockPanesRecord,
      sessions: [],
      schedules: [],
      currentSession: undefined,
      openPane: vi.fn(),
      openSession: vi.fn(),
      runSchedule: vi.fn(),
      switchStop: vi.fn(),
      navigate: vi.fn(),
    };

    const commands = buildCommands(ctx);
    const paneCommands = commands.filter((c) => c.group === 'panes');

    expect(paneCommands.length).toBe(10);
    expect(paneCommands[0].label).toBe('Files');
  });

  it('includes lever stops', () => {
    const ctx: PaletteContext = {
      panes: mockPanesRecord,
      sessions: [],
      schedules: [],
      currentSession: undefined,
      openPane: vi.fn(),
      openSession: vi.fn(),
      runSchedule: vi.fn(),
      switchStop: vi.fn(),
      navigate: vi.fn(),
    };

    const commands = buildCommands(ctx);
    const leverCommands = commands.filter((c) => c.group === 'lever');

    expect(leverCommands.length).toBe(3);
    expect(leverCommands.map((c) => c.id)).toEqual(['lever-easy', 'lever-medium', 'lever-hard']);
  });

  it('includes route commands', () => {
    const ctx: PaletteContext = {
      panes: mockPanesRecord,
      sessions: [],
      schedules: [],
      currentSession: undefined,
      openPane: vi.fn(),
      openSession: vi.fn(),
      runSchedule: vi.fn(),
      switchStop: vi.fn(),
      navigate: vi.fn(),
    };

    const commands = buildCommands(ctx);
    const routeCommands = commands.filter((c) => c.group === 'go-to');

    expect(routeCommands.length).toBe(3);
    expect(routeCommands.map((c) => c.label)).toEqual(['Board', 'Settings', 'Schedules']);
  });

  it('includes session commands when session is open', () => {
    const ctx: PaletteContext = {
      panes: mockPanesRecord,
      sessions: [],
      schedules: [],
      currentSession: { id: 'session-1', name: 'Test' },
      openPane: vi.fn(),
      openSession: vi.fn(),
      runSchedule: vi.fn(),
      switchStop: vi.fn(),
      navigate: vi.fn(),
      sessionActions: {
        openRename: vi.fn(),
        fork: vi.fn(),
      },
    };

    const commands = buildCommands(ctx);
    const sessionCommands = commands.filter((c) => c.group === 'session');

    expect(sessionCommands.length).toBeGreaterThan(0);
    expect(sessionCommands.some((c) => c.id === 'session-rename')).toBe(true);
  });

  it('includes other session commands in sessions group', () => {
    const ctx: PaletteContext = {
      panes: mockPanesRecord,
      sessions: [mockSession],
      schedules: [],
      currentSession: undefined,
      openPane: vi.fn(),
      openSession: vi.fn(),
      runSchedule: vi.fn(),
      switchStop: vi.fn(),
      navigate: vi.fn(),
    };

    const commands = buildCommands(ctx);
    const sessionGroupCommands = commands.filter((c) => c.group === 'sessions');

    expect(sessionGroupCommands.length).toBe(1);
    expect(sessionGroupCommands[0].label).toBe('Test Session');
  });

  it('includes schedule commands', () => {
    const ctx: PaletteContext = {
      panes: mockPanesRecord,
      sessions: [],
      schedules: [mockSchedule],
      currentSession: undefined,
      openPane: vi.fn(),
      openSession: vi.fn(),
      runSchedule: vi.fn(),
      switchStop: vi.fn(),
      navigate: vi.fn(),
    };

    const commands = buildCommands(ctx);
    const routineCommands = commands.filter((c) => c.group === 'routines');

    expect(routineCommands.length).toBe(1);
    expect(routineCommands[0].label).toBe('Run: Test Routine');
  });
});

describe('filterCommands', () => {
  const mockCommands = [
    { id: 'pane-terminal', group: 'panes' as const, label: 'Terminal', run: vi.fn() },
    { id: 'pane-editor', group: 'panes' as const, label: 'Editor', run: vi.fn() },
    { id: 'go-board', group: 'go-to' as const, label: 'Board', run: vi.fn() },
  ];

  it('returns all commands for empty query', () => {
    expect(filterCommands(mockCommands, '')).toEqual(mockCommands);
    expect(filterCommands(mockCommands, '   ')).toEqual(mockCommands);
  });

  it('filters by label', () => {
    const result = filterCommands(mockCommands, 'term');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pane-terminal');
  });

  it('filters case-insensitive', () => {
    const result = filterCommands(mockCommands, 'EDITOR');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pane-editor');
  });

  it('filters by hint when provided', () => {
    const commandsWithHint = [
      ...mockCommands,
      {
        id: 'session-1',
        group: 'sessions' as const,
        label: 'Old Session',
        hint: '/path/to/project',
        run: vi.fn(),
      },
    ];

    const result = filterCommands(commandsWithHint, 'project');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('session-1');
  });
});

describe('PALETTE_STATES', () => {
  it('has idle state', () => {
    expect(PALETTE_STATES.idle).toBe('idle');
  });

  it('has loading state', () => {
    expect(PALETTE_STATES.loading).toBe('loading');
  });

  it('has error state', () => {
    expect(PALETTE_STATES.error).toBe('error');
  });
});
