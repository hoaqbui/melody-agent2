// Advanced's Session controls (task 58): a chip in the chat card's chips slot whose
// popover lists every control the session has — each ACP config option the server
// publishes, rendered from the list itself so a new option needs no client change — then
// the working directory, the orchestrator role, the enabled extensions and Save as routine….

import { SlidersHorizontal } from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu';
import { Switch } from '../components/ui/switch';
import { configChoices, type SessionConfigOption } from '../acp/sessionConfig';
import { Chip } from './SessionChips';

const i18n = defineMessages({
  title: { id: 'workspaceShell.sessionControls', defaultMessage: 'Session controls' },
  workingDir: { id: 'workspaceShell.workingDir', defaultMessage: 'Working directory' },
  openInFiles: { id: 'workspaceShell.openInFiles', defaultMessage: 'Open in Files' },
  role: { id: 'workspaceShell.role', defaultMessage: 'Role' },
  extensions: {
    id: 'workspaceShell.extensionsEnabled',
    defaultMessage: '{count, plural, one {# extension} other {# extensions}} enabled',
  },
  saveRoutine: { id: 'workspaceShell.saveRoutine', defaultMessage: 'Save as routine…' },
  noSession: { id: 'workspaceShell.routineNoSession', defaultMessage: 'Open a session first' },
  planGate: {
    id: 'workspaceShell.planGate',
    defaultMessage: 'Wait for plan acceptance',
  },
});

export interface SessionControlsProps {
  options: readonly SessionConfigOption[];
  cwd: string;
  // The orchestrator role's name while the session is Orchestrate.
  role?: string;
  extensionsEnabled: number;
  busy: boolean;
  onSetOption(configId: string, value: string): void;
  onOpenFiles(): void;
  onOpenExtensions(): void;
  // Undefined before a session: there is nothing to save yet (task 59).
  onSaveRoutine?: () => void;
  planGate: boolean;
  onPlanGateChange(value: boolean): void;
}

const heading = 'text-xs text-text-secondary';

export function SessionControls({
  options,
  cwd,
  role,
  extensionsEnabled,
  busy,
  onSetOption,
  onOpenFiles,
  onOpenExtensions,
  onSaveRoutine,
  planGate,
  onPlanGateChange,
}: SessionControlsProps) {
  const intl = useIntl();
  return (
    <DropdownMenu>
      <Chip
        Icon={SlidersHorizontal}
        name={intl.formatMessage(i18n.title)}
        label={intl.formatMessage(i18n.title)}
        value={String(options.length)}
        busy={busy}
        testId="workspace-session-controls"
        iconOnly
      />
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-64"
        data-testid="workspace-session-controls-menu"
      >
        {options.map((option) => (
          <div key={option.id} data-testid={`workspace-config-${option.id}`}>
            <DropdownMenuLabel className={heading} title={option.description ?? undefined}>
              {option.name}
            </DropdownMenuLabel>
            {option.type === 'select' ? (
              <DropdownMenuRadioGroup
                value={option.currentValue}
                onValueChange={(value) => onSetOption(option.id, value)}
              >
                {configChoices(option).map((choice) => (
                  <DropdownMenuRadioItem
                    key={choice.value}
                    value={choice.value}
                    data-testid={`workspace-config-${option.id}-${choice.value}`}
                  >
                    {choice.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            ) : (
              <DropdownMenuItem disabled>{String(option.currentValue)}</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
          </div>
        ))}

        <DropdownMenuLabel className={heading}>
          {intl.formatMessage(i18n.workingDir)}
        </DropdownMenuLabel>
        <DropdownMenuItem disabled className="truncate" title={cwd} data-testid="workspace-cwd">
          {cwd}
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="workspace-open-files" onClick={onOpenFiles}>
          {intl.formatMessage(i18n.openInFiles)}
        </DropdownMenuItem>

        {role && (
          <>
            <DropdownMenuLabel className={heading}>
              {intl.formatMessage(i18n.role)}
            </DropdownMenuLabel>
            <DropdownMenuItem disabled data-testid="workspace-role">
              {role}
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-2 py-1" data-testid="workspace-config-plan-gate">
          <DropdownMenuLabel className={heading}>
            {intl.formatMessage(i18n.planGate)}
          </DropdownMenuLabel>
          <Switch
            checked={planGate}
            onCheckedChange={onPlanGateChange}
            data-testid="workspace-plan-gate-switch"
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="workspace-extensions" onClick={onOpenExtensions}>
          {intl.formatMessage(i18n.extensions, { count: extensionsEnabled })}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!onSaveRoutine}
          title={onSaveRoutine ? undefined : intl.formatMessage(i18n.noSession)}
          data-testid="workspace-save-routine"
          onClick={onSaveRoutine}
        >
          {intl.formatMessage(i18n.saveRoutine)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
