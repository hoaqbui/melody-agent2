// Easy's one control (task 58): a three-stop slider Easy · Medium · Hard in the chat
// card's chips slot, each stop a (provider, model, mode) triple from `LEVER`. A session
// that matches no stop parks the knob on a fourth, read-only label, Custom.

import type { KeyboardEvent, MouseEvent } from 'react';
import { useState } from 'react';
import { defineMessages, useIntl } from '../i18n';
import { cn } from '../utils';
import type { ProviderDetails } from '../types/providers';
import {
  INSTALL_MESSAGE,
  MODE_MESSAGES,
  NO_ORCHESTRATOR_MESSAGE,
  SIGN_IN_MESSAGE,
} from './SessionChips';
import { needsInstall, runtimeLabel, LEVER, STOPS, type Stop } from './session-controls';
import { seatOfProvider, type SeatStates } from './onboarding/seat-state';

const i18n = defineMessages({
  lever: { id: 'workspaceShell.lever', defaultMessage: 'Lever' },
  easy: { id: 'workspaceShell.stopEasy', defaultMessage: 'Easy' },
  medium: { id: 'workspaceShell.stopMedium', defaultMessage: 'Medium' },
  hard: { id: 'workspaceShell.stopHard', defaultMessage: 'Hard' },
  custom: { id: 'workspaceShell.stopCustom', defaultMessage: 'Custom' },
  easyDescription: {
    id: 'workspaceShell.stopEasyDescription',
    defaultMessage: 'Easy — Sonnet, direct',
  },
  mediumDescription: {
    id: 'workspaceShell.stopMediumDescription',
    defaultMessage: 'Medium — Opus, direct',
  },
  hardTitle: { id: 'workspaceShell.stopHardTitle', defaultMessage: 'Hard — Claude leads a team' },
  hardDescription: {
    id: 'workspaceShell.stopHardDescription',
    defaultMessage:
      'Claude Opus orchestrates; agy researches, Codex plans and reviews, Sonnet implements. You see each worker in Agents.',
  },
  hardTeam: { id: 'workspaceShell.stopHardTeam', defaultMessage: 'team' },
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
// The knob is twice the 16 px track (user, 2026-09-22: "make the teal dot … bigger? like 2x",
// "keep the rail half the size").
const KNOB_PX = 32;

export function Lever({ stop, providers, canOrchestrate, busy, model, onPick, seats }: LeverProps) {
  const intl = useIntl();
  const [showCard, setShowCard] = useState(false);
  const [touchTimer, setTouchTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

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
    return (
      (seat && seats[seat].state === 'install') ||
      install(candidate) ||
      (LEVER[candidate].mode === 'orchestrate' && !canOrchestrate)
    );
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

  const stopDescription = (candidate: Stop): string => {
    switch (candidate) {
      case 'easy':
        return intl.formatMessage(i18n.easyDescription);
      case 'medium':
        return intl.formatMessage(i18n.mediumDescription);
      case 'hard':
        return intl.formatMessage(i18n.hardTitle);
    }
  };

  const stopCardDescription = (candidate: Stop): string => {
    switch (candidate) {
      case 'hard':
        return intl.formatMessage(i18n.hardDescription);
      default:
        return '';
    }
  };

  const cardOtherStops = (candidate: Stop): string =>
    STOPS.filter((other) => other !== candidate)
      .map(stopDescription)
      .join(' · ');

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

  const handleMouseEnter = () => setShowCard(true);
  const handleMouseLeave = () => {
    setShowCard(false);
    if (touchTimer) {
      clearTimeout(touchTimer);
      setTouchTimer(null);
    }
  };
  const handleFocus = () => setShowCard(true);
  const handleBlur = () => {
    setShowCard(false);
    if (touchTimer) {
      clearTimeout(touchTimer);
      setTouchTimer(null);
    }
  };
  const handleTouchStart = () => {
    const timer = setTimeout(() => setShowCard(true), 500);
    setTouchTimer(timer);
  };
  const handleTouchEnd = () => {
    if (touchTimer) {
      clearTimeout(touchTimer);
      setTouchTimer(null);
    }
  };

  return (
    <div
      className="relative shrink-0 pb-3 group-data-[narrow]:pb-0 flex items-center gap-2"
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
          'relative flex h-4 items-center rounded-chip bg-background-secondary shadow-[var(--shadow-sm)] outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
          busy ? 'opacity-50' : 'cursor-pointer hover:shadow-[var(--shadow-md)]'
        )}
        onClick={click}
        onKeyDown={key}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {showCard && stop !== 'custom' && (
          <div
            className="absolute bottom-full left-0 mb-2.5 w-72 rounded-lg bg-text-primary text-background-primary shadow-lg z-10 p-3"
            data-testid="workspace-lever-card"
          >
            <div className="font-semibold text-sm mb-1">{stopDescription(stop)}</div>
            {stopCardDescription(stop) && (
              <div className="text-sm mb-1">{stopCardDescription(stop)}</div>
            )}
            <div className="text-xs text-background-secondary/80">{cardOtherStops(stop)}</div>
          </div>
        )}
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
            'pointer-events-none absolute top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-chip bg-background-inverse text-text-inverse shadow-[var(--shadow-md)] transition-[left] duration-150 ease-[var(--ease-g2)]',
            stop === 'custom' && 'opacity-60'
          )}
          style={{ left: index * STOP_WIDTH_PX + (STOP_WIDTH_PX - KNOB_PX) / 2 }}
          data-testid="workspace-lever-knob"
        >
          {/* A plain handle (user, 2026-09-20): the three dots are the stops, the tooltip
              names the one under the knob; no glyph on the knob. */}
          <span aria-hidden className="size-3 rounded-chip bg-text-inverse/90" />
        </span>
      </div>
      <span
        className="text-sm font-semibold text-text-primary whitespace-nowrap"
        data-testid="workspace-lever-label"
      >
        {stop === 'hard' ? (
          <>
            {intl.formatMessage(STOP_MESSAGES.hard)}{' '}
            <span className="font-normal text-text-secondary">
              · {intl.formatMessage(i18n.hardTeam)}
            </span>
          </>
        ) : stop === 'custom' ? (
          intl.formatMessage(i18n.custom)
        ) : (
          intl.formatMessage(STOP_MESSAGES[stop])
        )}
      </span>
    </div>
  );
}
