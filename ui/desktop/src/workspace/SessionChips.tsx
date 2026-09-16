// Runtime and Mode as chips in the chat card's bottom row (PRD steps 2-3, 9; task 60): each
// a popover with the rows the header used to hold — Install and "no orchestrator role in
// this project" kept. Sits left of the model chip, which keeps naming the model; the
// Runtime chip names the provider (DESIGN.md Named Runtime Rule).

import type { ComponentType } from 'react';
import { Cpu, Workflow } from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
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
});

export const MODE_MESSAGES = { direct: i18n.direct, orchestrate: i18n.orchestrate } as const;

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

interface ChipProps {
  Icon: ComponentType<{ className?: string }>;
  name: string;
  label: string;
  value: string;
  status?: string;
  busy: boolean;
  testId: string;
}

// The same shape as the model chip beside it: an icon, a short label, a menu that opens up.
// In a narrow bar (the chat input's own measure) the icon stands alone; the label is its name.
function Chip({ Icon, name, label, value, status, busy, testId }: ChipProps) {
  return (
    <DropdownMenuTrigger
      className="flex min-w-4 items-center gap-1 text-xs text-text-primary/70 transition-colors hover:cursor-pointer hover:text-text-primary disabled:cursor-default disabled:opacity-50"
      aria-label={`${name}: ${label}`}
      title={status}
      disabled={busy}
      data-testid={testId}
      data-value={value}
    >
      <Icon className="size-4 shrink-0" />
      <span className="max-w-[120px] truncate group-data-[narrow]:hidden">{label}</span>
    </DropdownMenuTrigger>
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
