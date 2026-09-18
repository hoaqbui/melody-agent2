// Easy's one control (task 58): a three-stop slider Easy · Medium · Hard in the chat
// card's chips slot, each stop a (provider, model, mode) triple from `LEVER`. A session
// that matches no stop parks the knob on a fourth, read-only label, Custom.

import type { KeyboardEvent, MouseEvent } from 'react';
import { Gauge } from 'lucide-react';
import { defineMessages, useIntl } from '../i18n';
import { cn } from '../utils';
import type { ProviderDetails } from '../types/providers';
import { INSTALL_MESSAGE, MODE_MESSAGES, NO_ORCHESTRATOR_MESSAGE, SIGN_IN_MESSAGE } from './SessionChips';
import { needsInstall, runtimeLabel, LEVER, STOPS, type Stop } from './session-controls';
import { seatOfProvider, type SeatStates } from './onboarding/seat-state';

const i18n = defineMessages({
  lever: { id: 'workspaceShell.lever', defaultMessage: 'Lever' },
  easy: { id: 'workspaceShell.stopEasy', defaultMessage: 'Easy' },
  medium: { id: 'workspaceShell.stopMedium', defaultMessage: 'Medium' },
  hard: { id: 'workspaceShell.stopHard', defaultMessage: 'Hard' },
  custom: { id: 'workspaceShell.stopCustom', defaultMessage: 'Custom' },
});

export const STOP_MESSAGES = { easy: i18n.easy, medium: i18n.medium, hard: i18n.hard } as const;

export interface LeverProps {
  stop: Stop | 'custom';
  providers: readonly ProviderDetails[];
  // undefined while the cwd is still being searched for the orchestrator role.
  canOrchestrate: boolean | undefined;
  busy: boolean;
  // The open session's model, named in the tooltip; the stop's match otherwise.
  model?: string;
  onPick(stop: Stop): void;
  // Runtime seat states; when available, takes precedence over needsInstall (task 91).
  seats?: SeatStates;
}

const STOP_WIDTH_PX = 36;

export function Lever({ stop, providers, canOrchestrate, busy, model, onPick, seats }: LeverProps) {
  const intl = useIntl();
  const index = stop === 'custom' ? STOPS.length : STOPS.indexOf(stop);
  const install = (candidate: Stop) => needsInstall(LEVER[candidate].provider, providers);
  const seatSuffix = (candidate: Stop): string => {
    const providerId = LEVER[candidate].provider;
    const seat = seats && seatOfProvider(providerId);
    if (seat) {
      const status = seats[seat];
      if (status.state === 'signin') {
        return ` — ${intl.formatMessage(SIGN_IN_MESSAGE)}`;
      }
      if (status.state === 'install') {
        return ` — ${intl.formatMessage(INSTALL_MESSAGE)}`;
      }
    }
    return install(candidate) ? ` — ${intl.formatMessage(INSTALL_MESSAGE)}` : '';
  };
  // Hard without the project's orchestrator role is out of reach, as Orchestrate is.
  const blocked = (candidate: Stop) => {
    const providerId = LEVER[candidate].provider;
    const seat = seats && seatOfProvider(providerId);
    return (seat && seats[seat].state !== 'ready') ||
           install(candidate) ||
           (LEVER[candidate].mode === 'orchestrate' && !canOrchestrate);
  };
  const stopLabel = (candidate: Stop) =>
    intl.formatMessage(STOP_MESSAGES[candidate]) + seatSuffix(candidate);
  const label = stop === 'custom' ? intl.formatMessage(i18n.custom) : stopLabel(stop);
  // The triple in one line: "Claude · sonnet · Direct".
  const summaryOf = (candidate: Stop) =>
    [
      runtimeLabel(LEVER[candidate].provider, providers),
      candidate === stop && model ? model : LEVER[candidate].modelMatch.source,
      intl.formatMessage(MODE_MESSAGES[LEVER[candidate].mode]),
    ].join(' · ');
  const summary = stop === 'custom' ? label : summaryOf(stop);
  const stopTitle = (candidate: Stop) =>
    install(candidate)
      ? stopLabel(candidate)
      : blocked(candidate)
        ? intl.formatMessage(NO_ORCHESTRATOR_MESSAGE)
        : summaryOf(candidate);

  const pick = (candidate: Stop) => {
    if (busy || candidate === stop || blocked(candidate)) return;
    onPick(candidate);
  };
  const click = (event: MouseEvent<HTMLElement>) => {
    const candidate = (event.target as HTMLElement).closest<HTMLElement>('[data-stop]')?.dataset
      .stop as Stop | undefined;
    if (candidate) pick(candidate);
  };
  const key = (event: KeyboardEvent<HTMLElement>) => {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0;
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? STOPS.length - 1
          : step
            ? Math.min(STOPS.length - 1, Math.max(0, index + step))
            : -1;
    if (target < 0) return;
    event.preventDefault();
    pick(STOPS[target]);
  };

  return (
    <div
      className="relative shrink-0 pb-3 group-data-[narrow]:pb-0"
      data-testid="workspace-lever"
      data-stop={stop}
    >
      <div
        role="slider"
        tabIndex={busy ? -1 : 0}
        aria-label={intl.formatMessage(i18n.lever)}
        aria-valuemin={0}
        aria-valuemax={STOPS.length - 1}
        aria-valuenow={Math.min(index, STOPS.length - 1)}
        aria-valuetext={label}
        aria-disabled={busy || undefined}
        title={summary}
        className={cn(
          'relative flex h-5 items-center rounded-chip bg-background-secondary shadow-[var(--shadow-sm)] outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
          busy ? 'opacity-50' : 'cursor-pointer hover:shadow-[var(--shadow-md)]'
        )}
        onClick={click}
        onKeyDown={key}
      >
        {STOPS.map((candidate) => (
          <span
            key={candidate}
            className={cn(
              // A dot marks each stop; the knob covers the current one.
              'h-full rounded-chip bg-[radial-gradient(circle,var(--color-text-tertiary)_1.5px,transparent_2px)] bg-center bg-no-repeat',
              blocked(candidate) && 'opacity-40',
              candidate !== stop && !blocked(candidate) && 'hover:bg-background-tertiary'
            )}
            style={{ width: STOP_WIDTH_PX }}
            title={stopTitle(candidate)}
            data-stop={candidate}
            data-blocked={blocked(candidate) || undefined}
            data-testid={`workspace-lever-stop-${candidate}`}
            aria-hidden="true"
          />
        ))}
        {stop === 'custom' && (
          <span
            className="h-full"
            style={{ width: STOP_WIDTH_PX }}
            data-testid="workspace-lever-stop-custom"
            aria-hidden="true"
          />
        )}
        {/* The knob slides between stops (Into Rule: it goes to the stop, never jumps). */}
        <span
          className={cn(
            'pointer-events-none absolute top-0.5 flex size-4 items-center justify-center rounded-chip bg-background-inverse text-text-inverse shadow-[var(--shadow-md)] transition-[left] duration-150 ease-[var(--ease-g2)]',
            stop === 'custom' && 'opacity-60'
          )}
          style={{ left: index * STOP_WIDTH_PX + (STOP_WIDTH_PX - 16) / 2 }}
          data-testid="workspace-lever-knob"
        >
          <Gauge className="size-3" />
        </span>
      </div>
      {/* Under the knob, and moving with it. */}
      <span
        className="absolute bottom-0 -translate-x-1/2 whitespace-nowrap text-[10px] leading-none text-text-secondary transition-[left] duration-150 ease-[var(--ease-g2)] group-data-[narrow]:hidden"
        style={{ left: index * STOP_WIDTH_PX + STOP_WIDTH_PX / 2 }}
        data-testid="workspace-lever-label"
      >
        {label}
      </span>
    </div>
  );
}
