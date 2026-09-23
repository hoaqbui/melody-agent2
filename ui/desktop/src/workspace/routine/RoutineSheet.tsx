// "Save as routine…" (task 59): a sheet prefilled from the open session — title, the first
// user prompt as instructions, the provider · model · mode · extensions · working directory
// it ran with — a trigger, and whether each run gets its own worktree (task 63). Save writes
// the recipe to the library, then registers it with the scheduler (paused when Manual, so
// Run now still has a job), and closes into Schedules.

import { useEffect, useState, type FormEvent } from 'react';
import { defineMessages, useIntl } from '../../i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { formatAcpError } from '../../acp/errors';
import { saveRecipe } from '../../acp/recipe';
import { acpCreateSchedule, acpPauseSchedule } from '../../acp/schedules';
import { getSessionExtensions, type SessionExtension } from '../../acp/session-extensions';
import { configChoices, type SessionConfigOption } from '../../acp/sessionConfig';
import { describeCron } from '../../utils/cronSchedule';
import { cn } from '../../utils';
import {
  TRIGGERS,
  TRIGGER_CRON,
  isSessionBridge,
  routineRecipe,
  routineScheduleId,
  triggerCron,
  type Trigger,
} from './routine';

const i18n = defineMessages({
  title: { id: 'routineSheet.title', defaultMessage: 'Save as routine' },
  description: {
    id: 'routineSheet.description',
    defaultMessage:
      'A routine runs this prompt again, on demand or on a schedule; each run lands in the Runs inbox on Schedules.',
  },
  titleField: { id: 'routineSheet.titleField', defaultMessage: 'Title' },
  instructions: { id: 'routineSheet.instructions', defaultMessage: 'Instructions' },
  runsWith: { id: 'routineSheet.runsWith', defaultMessage: 'Runs with' },
  extensions: {
    id: 'routineSheet.extensions',
    defaultMessage:
      '{count, plural, =0 {the default extensions} one {# extension} other {# extensions}}',
  },
  extensionsLoading: {
    id: 'routineSheet.extensionsLoading',
    defaultMessage: 'Reading extensions…',
  },
  workingDir: { id: 'routineSheet.workingDir', defaultMessage: 'Working directory' },
  trigger: { id: 'routineSheet.trigger', defaultMessage: 'Trigger' },
  manual: {
    id: 'routineSheet.manual',
    defaultMessage: 'Manual — run only when I press Run now',
  },
  hourly: { id: 'routineSheet.hourly', defaultMessage: 'Hourly' },
  daily: { id: 'routineSheet.daily', defaultMessage: 'Daily' },
  weekly: { id: 'routineSheet.weekly', defaultMessage: 'Weekly' },
  custom: { id: 'routineSheet.custom', defaultMessage: 'Custom cron' },
  manualHint: {
    id: 'routineSheet.manualHint',
    defaultMessage:
      'Saved paused, on the daily cron: Run now on Schedules runs it, Resume makes it daily.',
  },
  cronField: { id: 'routineSheet.cronField', defaultMessage: 'Cron expression' },
  worktree: { id: 'routineSheet.worktree', defaultMessage: 'Run in its own worktree' },
  cronInvalid: { id: 'routineSheet.cronInvalid', defaultMessage: 'Six fields, seconds first' },
  titleRequired: { id: 'routineSheet.titleRequired', defaultMessage: 'Give the routine a title' },
  promptRequired: {
    id: 'routineSheet.promptRequired',
    defaultMessage: 'Write what the routine should do',
  },
  cancel: { id: 'routineSheet.cancel', defaultMessage: 'Cancel' },
  save: { id: 'routineSheet.save', defaultMessage: 'Save' },
  saving: { id: 'routineSheet.saving', defaultMessage: 'Saving…' },
  saveFailed: { id: 'routineSheet.saveFailed', defaultMessage: '{cause} — fix it and Save again' },
});

const TRIGGER_MESSAGES = {
  manual: i18n.manual,
  hourly: i18n.hourly,
  daily: i18n.daily,
  weekly: i18n.weekly,
  custom: i18n.custom,
} as const;

export interface RoutineSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  sessionId: string;
  // The session's display name and its first user prompt, both editable in the sheet.
  title: string;
  instructions: string;
  options: readonly SessionConfigOption[];
  cwd: string;
  onSaved(scheduleId: string): void;
}

const field = 'text-xs text-text-secondary';
const control =
  'w-full rounded-md border bg-background-primary px-3 py-1 text-sm hover:border-border-secondary focus:border-border-secondary focus-visible:outline-none';

function choiceName(options: readonly SessionConfigOption[], id: string): string | undefined {
  const option = options.find((candidate) => candidate.id === id);
  if (option?.type !== 'select') return undefined;
  return configChoices(option).find((choice) => choice.value === option.currentValue)?.name;
}

function selectedValue(options: readonly SessionConfigOption[], id: string): string | undefined {
  const option = options.find((candidate) => candidate.id === id);
  return option?.type === 'select' ? option.currentValue : undefined;
}

// A routine runs unattended, so the scheduler runs an approval mode as Auto (task 178).
function routineModeName(options: readonly SessionConfigOption[]): string | undefined {
  const value = selectedValue(options, 'mode');
  if (value !== 'approve' && value !== 'smart_approve') return choiceName(options, 'mode') ?? value;
  const option = options.find((candidate) => candidate.id === 'mode');
  if (option?.type !== 'select') return 'auto';
  return configChoices(option).find((choice) => choice.value === 'auto')?.name ?? 'auto';
}

// The scheduler wants six fields; cronstrue names the cadence, or the field it rejects.
function cronHint(cron: string, sixFields: string): { text: string; valid: boolean } {
  if (cron.split(/\s+/).length !== 6) return { text: sixFields, valid: false };
  try {
    return { text: describeCron(cron), valid: true };
  } catch (error) {
    return { text: error instanceof Error ? error.message : String(error), valid: false };
  }
}

export function RoutineSheet({
  open,
  onOpenChange,
  sessionId,
  title: initialTitle,
  instructions: initialInstructions,
  options,
  cwd,
  onSaved,
}: RoutineSheetProps) {
  const intl = useIntl();
  const [title, setTitle] = useState(initialTitle);
  const [instructions, setInstructions] = useState(initialInstructions);
  const [trigger, setTrigger] = useState<Trigger>('manual');
  const [customCron, setCustomCron] = useState(TRIGGER_CRON.daily);
  const [worktree, setWorktree] = useState(false);
  // undefined while the session's extensions are still being read.
  const [extensions, setExtensions] = useState<SessionExtension[] | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A second Save after a failed schedule overwrites the recipe the first one wrote.
  const [recipeId, setRecipeId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setInstructions(initialInstructions);
    setTrigger('manual');
    setCustomCron(TRIGGER_CRON.daily);
    setWorktree(false);
    setError(null);
    setRecipeId(null);
    setExtensions(undefined);
    let cancelled = false;
    getSessionExtensions(sessionId)
      .then((listed) => {
        if (!cancelled) setExtensions(listed.filter((extension) => !isSessionBridge(extension)));
      })
      .catch((cause) => {
        if (!cancelled) setError(formatAcpError(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [initialInstructions, initialTitle, open, sessionId]);

  const cron = triggerCron(trigger, customCron);
  const hint = trigger === 'custom' ? cronHint(cron, intl.formatMessage(i18n.cronInvalid)) : null;
  const provider = choiceName(options, 'provider') ?? selectedValue(options, 'provider');
  const model = choiceName(options, 'model') ?? selectedValue(options, 'model');
  const mode = routineModeName(options);
  const runsWith = [provider, model, mode].filter(Boolean).join(' · ');
  const problem = !title.trim()
    ? intl.formatMessage(i18n.titleRequired)
    : !instructions.trim()
      ? intl.formatMessage(i18n.promptRequired)
      : hint && !hint.valid
        ? hint.text
        : extensions === undefined
          ? intl.formatMessage(i18n.extensionsLoading)
          : null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (problem || extensions === undefined || saving) return;
    setSaving(true);
    setError(null);
    try {
      const recipe = routineRecipe({
        title,
        instructions,
        provider: selectedValue(options, 'provider'),
        model: selectedValue(options, 'model'),
        mode: selectedValue(options, 'mode'),
        cwd,
        worktree,
        extensions,
      });
      const saved = await saveRecipe(recipe, recipeId);
      setRecipeId(saved.id);
      const job = await acpCreateSchedule({ id: routineScheduleId(title), recipe, cron });
      if (trigger === 'manual') await acpPauseSchedule(job.id);
      onOpenChange(false);
      onSaved(job.id);
    } catch (cause) {
      setError(formatAcpError(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="routine-sheet">
        <form onSubmit={save} className="contents">
          <DialogHeader>
            <DialogTitle>{intl.formatMessage(i18n.title)}</DialogTitle>
            <DialogDescription>{intl.formatMessage(i18n.description)}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className={field}>{intl.formatMessage(i18n.titleField)}</span>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={saving}
                data-testid="routine-title"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={field}>{intl.formatMessage(i18n.instructions)}</span>
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                disabled={saving}
                rows={5}
                className={cn(control, 'resize-y')}
                data-testid="routine-instructions"
              />
            </label>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className={field}>{intl.formatMessage(i18n.runsWith)}</dt>
              <dd className="truncate" title={runsWith} data-testid="routine-runs-with">
                {runsWith}
                {runsWith && ' · '}
                {extensions === undefined ? (
                  <span className="text-text-secondary">
                    {intl.formatMessage(i18n.extensionsLoading)}
                  </span>
                ) : (
                  <span title={extensions.map((extension) => extension.name).join(', ')}>
                    {intl.formatMessage(i18n.extensions, { count: extensions.length })}
                  </span>
                )}
              </dd>
              <dt className={field}>{intl.formatMessage(i18n.workingDir)}</dt>
              <dd className="truncate" title={cwd} data-testid="routine-cwd">
                {cwd}
              </dd>
            </dl>

            <label className="flex flex-col gap-1">
              <span className={field}>{intl.formatMessage(i18n.trigger)}</span>
              <select
                value={trigger}
                onChange={(event) => setTrigger(event.target.value as Trigger)}
                disabled={saving}
                className={cn(control, 'h-9')}
                data-testid="routine-trigger"
              >
                {TRIGGERS.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {intl.formatMessage(TRIGGER_MESSAGES[candidate])}
                  </option>
                ))}
              </select>
            </label>
            {trigger === 'manual' && <p className={field}>{intl.formatMessage(i18n.manualHint)}</p>}
            {trigger === 'custom' && (
              <label className="flex flex-col gap-1">
                <span className={field}>{intl.formatMessage(i18n.cronField)}</span>
                <Input
                  value={customCron}
                  onChange={(event) => setCustomCron(event.target.value)}
                  disabled={saving}
                  className="font-mono"
                  aria-invalid={hint ? !hint.valid : undefined}
                  data-testid="routine-cron"
                />
                <span
                  className={cn(field, hint && !hint.valid && 'text-text-danger')}
                  data-testid="routine-cron-hint"
                >
                  {hint?.text}
                </span>
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={worktree}
                onChange={(event) => setWorktree(event.target.checked)}
                disabled={saving}
                className="accent-bgApp"
                data-testid="routine-worktree"
              />
              {intl.formatMessage(i18n.worktree)}
            </label>

            {error && (
              <p className="text-sm text-text-danger" role="alert" data-testid="routine-error">
                {intl.formatMessage(i18n.saveFailed, { cause: error })}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {intl.formatMessage(i18n.cancel)}
            </Button>
            <Button
              type="submit"
              disabled={saving || problem !== null}
              title={problem ?? undefined}
              data-testid="routine-save"
            >
              {intl.formatMessage(saving ? i18n.saving : i18n.save)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
