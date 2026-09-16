// What "Save as routine…" derives without React (task 59): the recipe a session becomes,
// the schedule id its title allows, the cron a trigger stands for, and the first user
// prompt of a transcript. The transcript itself is not part of the routine.

import type { Recipe, RecipeSettings } from '../../recipe';
import type { SessionExtension } from '../../acp/session-extensions';
import { getTextAndImageContent, type Message } from '../../types/message';

export const TRIGGERS = ['manual', 'hourly', 'daily', 'weekly', 'custom'] as const;
export type Trigger = (typeof TRIGGERS)[number];

// Six fields, seconds first — the shape `utils/cronSchedule.ts` builds and the scheduler
// parses. A Manual routine is a paused job (the scheduler lists nothing without a cron), so
// it carries the daily cron for the day Resume is pressed.
export const TRIGGER_CRON: Record<Exclude<Trigger, 'custom'>, string> = {
  manual: '0 0 9 * * *',
  hourly: '0 0 * * * *',
  daily: '0 0 9 * * *',
  weekly: '0 0 9 * * 1',
};

export function triggerCron(trigger: Trigger, custom: string): string {
  return trigger === 'custom' ? custom.trim() : TRIGGER_CRON[trigger];
}

// A schedule id is what the server accepts (alphanumerics, `-`, `_`, space); the rest of
// the title folds to `-`.
export function routineScheduleId(title: string): string {
  const id = title
    .replace(/[^A-Za-z0-9_\- ]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-\s]+|[-\s]+$/g, '');
  return id || 'routine';
}

export function firstUserPrompt(messages: readonly Message[]): string {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const text = getTextAndImageContent(message).textContent.trim();
    if (text) return text;
  }
  return '';
}

export interface RoutineSource {
  title: string;
  instructions: string;
  provider?: string;
  model?: string;
  // The session's mode option value, one of the `session/set_mode` ids.
  mode?: string;
  cwd: string;
  worktree: boolean;
  extensions: readonly SessionExtension[];
}

type GooseMode = NonNullable<RecipeSettings['goose_mode']>;

const GOOSE_MODES: readonly GooseMode[] = ['auto', 'approve', 'smart_approve', 'chat'];

export function gooseMode(mode: string | undefined): GooseMode | undefined {
  return GOOSE_MODES.find((candidate) => candidate === mode);
}

export const ROUTINE_DESCRIPTION = 'Routine saved from a session.';

// The session's own door for an external runtime (`agents/session_bridge.rs`
// BRIDGE_EXTENSION_NAME): a per-process port and secret that no later run can use.
export function isSessionBridge(extension: SessionExtension): boolean {
  return extension.type === 'streamable_http' && extension.name === 'goose';
}

// The session's extensions travel whole (the server needs each one's type and command),
// minus its bridge; none at all is left out, which the server reads as its defaults
// rather than as "no extensions". The stdio path carries env key names only, never values.
// The settings are what the scheduler reads (scheduler.rs `execute_job`): the runtime,
// mode and folder the sheet showed, and whether each run gets its own worktree.
export function routineRecipe(source: RoutineSource): Recipe {
  const extensions = source.extensions
    .filter((extension) => !isSessionBridge(extension))
    .map(({ extensionKey: _key, ...extension }) => extension);
  const mode = gooseMode(source.mode);
  return {
    version: '1.0.0',
    title: source.title.trim(),
    description: ROUTINE_DESCRIPTION,
    instructions: source.instructions.trim(),
    ...(extensions.length > 0 && { extensions }),
    settings: {
      ...(source.provider && { goose_provider: source.provider }),
      ...(source.model && { goose_model: source.model }),
      ...(mode && { goose_mode: mode }),
      working_dir: source.cwd,
      worktree: source.worktree,
    },
  };
}
