import { fuzzyMatch } from '../../utils/fuzzy';
import { PANE_IDS, type PaneId } from '../pane-store';
import { STOPS, type Stop } from '../session-controls';
import type { View } from '../../utils/navigationUtils';
import type { SessionListItem } from '../../acp/sessions';

export interface Command {
  id: string;
  group: 'panes' | 'session' | 'sessions' | 'routines' | 'lever' | 'go-to';
  label: string;
  hint?: string;
  run: () => void | Promise<void>;
}

export interface ScheduleDisplay {
  id: string;
  name: string;
  description?: string;
}

export interface PaletteContext {
  panes: Record<PaneId, { title: string }>;
  sessions: SessionListItem[];
  schedules: ScheduleDisplay[];
  currentSession: { id: string; name: string } | undefined;
  openPane: (id: PaneId) => void;
  openSession: (id: string) => void;
  runSchedule: (id: string) => Promise<void>;
  switchStop: (stop: Stop) => void;
  navigate: (view: View) => void;
  // Task 69's rail ⋯ menu, as callbacks; present whenever currentSession is.
  sessionActions: {
    openRename: () => void;
    fork: () => Promise<void>;
    transcriptView: (mode: 'full' | 'compact') => void;
    viewJson: () => Promise<void>;
    viewModelInteractions: () => Promise<void>;
    archive: () => Promise<void>;
    openDelete: () => void;
  };
}

export function buildCommands(ctx: PaletteContext): Command[] {
  const commands: Command[] = [];

  for (const id of PANE_IDS) {
    commands.push({
      id: `pane-${id}`,
      group: 'panes',
      label: ctx.panes[id]?.title || id,
      run: () => ctx.openPane(id),
    });
  }

  if (ctx.currentSession) {
    commands.push({
      id: 'session-rename',
      group: 'session',
      label: 'Rename',
      run: () => ctx.sessionActions.openRename(),
    });

    commands.push({
      id: 'session-fork',
      group: 'session',
      label: 'Fork',
      run: () => ctx.sessionActions.fork(),
    });

    commands.push({
      id: 'session-transcript-full',
      group: 'session',
      label: 'Transcript view: Full',
      run: () => ctx.sessionActions.transcriptView('full'),
    });

    commands.push({
      id: 'session-transcript-compact',
      group: 'session',
      label: 'Transcript view: Compact',
      run: () => ctx.sessionActions.transcriptView('compact'),
    });

    commands.push({
      id: 'session-view-json',
      group: 'session',
      label: 'View session JSON',
      run: () => ctx.sessionActions.viewJson(),
    });

    commands.push({
      id: 'session-view-interactions',
      group: 'session',
      label: 'View recent model interactions',
      run: () => ctx.sessionActions.viewModelInteractions(),
    });

    commands.push({
      id: 'session-archive',
      group: 'session',
      label: 'Archive',
      run: () => ctx.sessionActions.archive(),
    });

    commands.push({
      id: 'session-delete',
      group: 'session',
      label: 'Delete',
      run: () => ctx.sessionActions.openDelete(),
    });
  }

  for (const session of ctx.sessions) {
    if (!ctx.currentSession || session.id !== ctx.currentSession.id) {
      commands.push({
        id: `open-session-${session.id}`,
        group: 'sessions',
        label: session.name,
        hint: session.workingDir,
        run: () => ctx.openSession(session.id),
      });
    }
  }

  for (const schedule of ctx.schedules) {
    commands.push({
      id: `routine-${schedule.id}-run`,
      group: 'routines',
      label: `Run: ${schedule.name}`,
      hint: schedule.description,
      run: () => ctx.runSchedule(schedule.id),
    });
  }

  for (const stop of STOPS) {
    commands.push({
      id: `lever-${stop}`,
      group: 'lever',
      label: stop.charAt(0).toUpperCase() + stop.slice(1),
      run: () => ctx.switchStop(stop),
    });
  }

  commands.push({
    id: 'go-board',
    group: 'go-to',
    label: 'Board',
    run: () => ctx.navigate('board'),
  });

  commands.push({
    id: 'go-settings',
    group: 'go-to',
    label: 'Settings',
    run: () => ctx.navigate('settings'),
  });

  commands.push({
    id: 'go-schedules',
    group: 'go-to',
    label: 'Schedules',
    run: () => ctx.navigate('schedules'),
  });

  return commands;
}

export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) {
    return commands;
  }

  return commands.filter((command) => {
    return fuzzyMatch(command.label, query) || (command.hint && fuzzyMatch(command.hint, query));
  });
}

// The surface's states (plan-mode research §14): empty is a query with no match, partial a
// Sessions or Routines call that failed while the local groups stay; error never covers the whole.
export const PALETTE_STATES = ['empty', 'loading', 'partial', 'ready'] as const;
export type PaletteState = (typeof PALETTE_STATES)[number];
