// Runtime and Mode as chips in the chat card's bottom row (PRD steps 2-3, 9; task 60): each
// a popover with the rows the header used to hold — Install and "no orchestrator role in
// this project" kept. Sits left of the model chip, which keeps naming the model; the
// Runtime chip names the provider (DESIGN.md Named Runtime Rule). The Worktree chip
// (task 49) is a toggle, not a menu, and the shell shows it in both faces; so is the
// Routine chip (task 59), a link back from a routine's run to its schedule.

import { useEffect, useState, type ComponentType } from 'react';
import { Cpu, GitBranch, Repeat, Workflow } from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import { cn } from '../utils';
import { acpListScheduleRuns } from '../acp/schedules';
import type { Session } from '../types/session';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import type { ProviderDetails } from '../types/providers';
import { needsInstall, type Mode, type Runtime } from './session-controls';
import { WORKTREES_DIR, worktreeBranch } from './worktree';

const i18n = defineMessages({
  runtime: { id: 'workspaceShell.runtime', defaultMessage: 'Runtime' },
  mode: { id: 'workspaceShell.mode', defaultMessage: 'Mode' },
  more: { id: 'workspaceShell.more', defaultMessage: 'More…' },
  install: { id: 'workspaceShell.install', defaultMessage: 'Install' },
  direct: { id: 'workspaceShell.direct', defaultMessage: 'Direct' },
  orchestrate: { id: 'workspaceShell.orchestrate', defaultMessage: 'Orchestrate' },
  noOrchestrator: {
    id: 'workspaceShell.noOrchestrator',
    defaultMessage: 'no orchestrator role in this project',
  },
  worktree: { id: 'workspaceShell.worktree', defaultMessage: 'Worktree' },
  worktreeNext: {
    id: 'workspaceShell.worktreeNext',
    defaultMessage:
      'The next chat starts in its own checkout, {path} under the repository root, on the branch {branch}.',
  },
  worktreeOff: {
    id: 'workspaceShell.worktreeOff',
    defaultMessage: 'The next chat starts in the checkout; a worktree is picked before the chat.',
  },
  worktreeHere: { id: 'workspaceShell.worktreeHere', defaultMessage: 'This chat runs in {path}.' },
  worktreeFixed: {
    id: 'workspaceShell.worktreeFixed',
    defaultMessage: 'This chat runs in the checkout; a worktree is picked before the chat.',
  },
  worktreeCargo: {
    id: 'workspaceShell.worktreeCargo',
    defaultMessage: 'A Rust worktree rebuilds target/ unless CARGO_TARGET_DIR is shared.',
  },
  routine: { id: 'workspaceShell.routine', defaultMessage: 'Routine: {title}' },
  routineOpen: {
    id: 'workspaceShell.routineOpen',
    defaultMessage: 'Open the routine on Schedules',
  },
  routineFinding: { id: 'workspaceShell.routineFinding', defaultMessage: 'Finding the routine…' },
});

export const MODE_MESSAGES = { direct: i18n.direct, orchestrate: i18n.orchestrate } as const;
export const INSTALL_MESSAGE = i18n.install;
export const NO_ORCHESTRATOR_MESSAGE = i18n.noOrchestrator;

export interface RuntimeOption extends Runtime {
  more: boolean;
}

export interface SessionChipsProps {
  runtimes: readonly RuntimeOption[];
  currentRuntime: string;
  providers: readonly ProviderDetails[];
  currentMode: Mode;
  // undefined while the cwd is still being searched for the orchestrator role.
  canOrchestrate: boolean | undefined;
  busy: boolean;
  // The open session's "<Runtime> · <Mode>", both chips' tooltip; none before a session.
  status?: string;
  onPickRuntime(providerId: string): void;
  onPickMode(mode: Mode): void;
}

export interface ChipProps {
  Icon: ComponentType<{ className?: string }>;
  name: string;
  label: string;
  value: string;
  status?: string;
  busy: boolean;
  testId: string;
  // The icon alone at every width; the label is the tooltip.
  iconOnly?: boolean;
}

const chipClass =
  'flex min-w-4 items-center gap-1 text-xs text-text-primary/70 transition-colors hover:cursor-pointer hover:text-text-primary disabled:cursor-default disabled:opacity-50';

// The same shape as the model chip beside it: an icon, a short label, a menu that opens up.
// In a narrow bar (the chat input's own measure) the icon stands alone; the label is its name.
export function Chip({ Icon, name, label, value, status, busy, testId, iconOnly }: ChipProps) {
  return (
    <DropdownMenuTrigger
      className={chipClass}
      aria-label={iconOnly ? name : `${name}: ${label}`}
      title={iconOnly ? name : status}
      disabled={busy}
      data-testid={testId}
      data-value={value}
    >
      <Icon className="size-4 shrink-0" />
      {!iconOnly && (
        <span className="max-w-[120px] truncate group-data-[narrow]:hidden">{label}</span>
      )}
    </DropdownMenuTrigger>
  );
}

export interface WorktreeChipProps {
  // Before a session, the slug the next chat starts in; once one is open, the slug its cwd
  // sits in. Null is the checkout.
  slug: string | null;
  // The open session's cwd; the toggle is fixed from then on (the cwd is set at session/new).
  cwd?: string;
  busy: boolean;
  onToggle(): void;
}

// "Use worktree" (task 49), in Easy and Advanced alike: pressed = the next chat gets its own
// checkout; in a session it reads the branch, mono, and no longer toggles. The tooltip names
// the path and the one cost a Rust tree carries.
export function WorktreeChip({ slug, cwd, busy, onToggle }: WorktreeChipProps) {
  const intl = useIntl();
  const on = slug !== null;
  const name = intl.formatMessage(i18n.worktree);
  const hint =
    cwd !== undefined
      ? on
        ? intl.formatMessage(i18n.worktreeHere, { path: cwd })
        : intl.formatMessage(i18n.worktreeFixed)
      : on
        ? intl.formatMessage(i18n.worktreeNext, {
            path: `${WORKTREES_DIR}/${slug}`,
            branch: worktreeBranch(slug),
          })
        : intl.formatMessage(i18n.worktreeOff);
  return (
    <button
      type="button"
      className={cn(chipClass, 'aria-pressed:text-text-primary')}
      aria-label={name}
      aria-pressed={on}
      title={`${hint} ${intl.formatMessage(i18n.worktreeCargo)}`}
      disabled={busy || cwd !== undefined}
      data-testid="workspace-worktree"
      data-slug={slug ?? undefined}
      onClick={onToggle}
    >
      <GitBranch className="size-4 shrink-0" />
      <span className={cn('max-w-[160px] truncate group-data-[narrow]:hidden', on && 'font-mono')}>
        {on ? worktreeBranch(slug) : name}
      </span>
    </button>
  );
}

export interface RoutineChipProps {
  session: Session | undefined;
  onOpen(scheduleId: string): void;
}

// How many runs back the chip looks for its own session's schedule.
const RUNS_LOOKBACK = 200;

// "Routine: <title>" on a scheduled run's session: the recipe names the routine, the runs
// list names the schedule it links to (a session carries no schedule id on the wire).
export function RoutineChip({ session, onOpen }: RoutineChipProps) {
  const intl = useIntl();
  const sessionId = session?.session_type === 'scheduled' ? session.id : null;
  const [scheduleId, setScheduleId] = useState<string | null>(null);

  useEffect(() => {
    setScheduleId(null);
    if (!sessionId) return;
    let cancelled = false;
    acpListScheduleRuns(RUNS_LOOKBACK)
      .then((runs) => {
        if (cancelled) return;
        setScheduleId(runs.find((run) => run.sessionId === sessionId)?.scheduleId ?? null);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!session || !sessionId) return null;
  const title = session.recipe?.title || session.name;
  return (
    <button
      type="button"
      className={chipClass}
      title={intl.formatMessage(scheduleId ? i18n.routineOpen : i18n.routineFinding)}
      disabled={scheduleId === null}
      data-testid="workspace-routine"
      data-schedule-id={scheduleId ?? undefined}
      onClick={() => scheduleId && onOpen(scheduleId)}
    >
      <Repeat className="size-4 shrink-0" />
      <span className="max-w-[160px] truncate group-data-[narrow]:hidden">
        {intl.formatMessage(i18n.routine, { title })}
      </span>
    </button>
  );
}

export function SessionChips({
  runtimes,
  currentRuntime,
  providers,
  currentMode,
  canOrchestrate,
  busy,
  status,
  onPickRuntime,
  onPickMode,
}: SessionChipsProps) {
  const intl = useIntl();
  const modeLabel = (mode: Mode) => intl.formatMessage(MODE_MESSAGES[mode]);
  const runtimeLabel =
    runtimes.find((runtime) => runtime.id === currentRuntime)?.label ?? currentRuntime;
  const runtimeRow = (runtime: RuntimeOption) => {
    const install = needsInstall(runtime.id, providers);
    return (
      <DropdownMenuRadioItem
        key={runtime.id}
        value={runtime.id}
        disabled={install}
        data-testid={`workspace-runtime-option-${runtime.id}`}
      >
        {runtime.label}
        {install && ` — ${intl.formatMessage(i18n.install)}`}
      </DropdownMenuRadioItem>
    );
  };
  const more = runtimes.filter((runtime) => runtime.more);

  return (
    <div className="flex shrink-0 items-center gap-2" data-testid="workspace-session-chips">
      <DropdownMenu>
        <Chip
          Icon={Cpu}
          name={intl.formatMessage(i18n.runtime)}
          label={runtimeLabel}
          value={currentRuntime}
          status={status}
          busy={busy}
          testId="workspace-runtime"
        />
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-text-secondary">
            {intl.formatMessage(i18n.runtime)}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={currentRuntime} onValueChange={onPickRuntime}>
            {runtimes.filter((runtime) => !runtime.more).map(runtimeRow)}
            {more.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-text-secondary">
                  {intl.formatMessage(i18n.more)}
                </DropdownMenuLabel>
                {more.map(runtimeRow)}
              </>
            )}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Chip
          Icon={Workflow}
          name={intl.formatMessage(i18n.mode)}
          label={modeLabel(currentMode)}
          value={currentMode}
          status={status}
          busy={busy}
          testId="workspace-mode"
        />
        <DropdownMenuContent side="top" align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-text-secondary">
            {intl.formatMessage(i18n.mode)}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={currentMode}
            onValueChange={(mode) => onPickMode(mode as Mode)}
          >
            {(['direct', 'orchestrate'] as const).map((mode) => (
              <DropdownMenuRadioItem
                key={mode}
                value={mode}
                disabled={mode === 'orchestrate' && !canOrchestrate}
                title={
                  mode === 'orchestrate' && canOrchestrate === false
                    ? intl.formatMessage(i18n.noOrchestrator)
                    : undefined
                }
                data-testid={`workspace-mode-${mode}`}
              >
                {modeLabel(mode)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {canOrchestrate === false && (
            <p
              className="px-2 pb-1 pt-0.5 text-xs text-text-secondary"
              data-testid="workspace-mode-note"
            >
              {intl.formatMessage(i18n.noOrchestrator)}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
