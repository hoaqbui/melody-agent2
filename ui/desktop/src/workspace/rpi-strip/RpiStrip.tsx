// The RPI strip above the chat (PRD step 11; task 29): Research · Plan · Implement · Review as
// chips, each lit when a worker with that role starts, from the same rows the Agents pane
// reads (task 65's delegations store). A phase with an artifact opens the Artifact pane on
// that child (task 30); a re-run reads ×2 beside the name. Nothing renders until a phase is
// lit — a Direct session starts as a chat.

import type { MessageDescriptor } from 'react-intl';
import { defineMessages, useIntl } from '../../i18n';
import { cn } from '../../utils';
import { useSessionDelegations } from '../../acp/delegations';
import { phaseViews, stripState, type Phase, type PhaseStatus } from './rpi-strip-state';

const i18n = defineMessages({
  label: { id: 'rpiStrip.label', defaultMessage: 'RPI phases' },
  research: { id: 'rpiStrip.research', defaultMessage: 'Research' },
  plan: { id: 'rpiStrip.plan', defaultMessage: 'Plan' },
  implement: { id: 'rpiStrip.implement', defaultMessage: 'Implement' },
  review: { id: 'rpiStrip.review', defaultMessage: 'Review' },
  dim: { id: 'rpiStrip.statusDim', defaultMessage: 'Not started' },
  active: { id: 'rpiStrip.statusActive', defaultMessage: 'Running' },
  done: { id: 'rpiStrip.statusDone', defaultMessage: 'Done' },
  failed: { id: 'rpiStrip.statusFailed', defaultMessage: 'Failed' },
  runs: { id: 'rpiStrip.runs', defaultMessage: '×{count}' },
  opensWhenDone: { id: 'rpiStrip.opensWhenDone', defaultMessage: 'Opens once the worker is done' },
  openArtifact: { id: 'rpiStrip.openArtifact', defaultMessage: 'Open the artifact' },
});

const PHASE_MESSAGES: Record<Phase, MessageDescriptor> = {
  research: i18n.research,
  plan: i18n.plan,
  implement: i18n.implement,
  review: i18n.review,
};

const STATUS_MESSAGES: Record<PhaseStatus, MessageDescriptor> = {
  dim: i18n.dim,
  active: i18n.active,
  done: i18n.done,
  failed: i18n.failed,
};

// DESIGN.md §Tokens: info while it runs, success done, danger failed (stays); a dim phase has
// no colour. The dot is never alone — the status word rides in the chip's title (§Accessibility).
const STATUS_DOT: Record<PhaseStatus, string> = {
  dim: 'bg-border-primary',
  active: 'bg-text-info animate-pulse',
  done: 'bg-text-success',
  failed: 'bg-text-danger',
};

// The chat card's chips (SessionChips.tsx chipClass), lit or dimmed by phase.
const chipClass =
  'flex items-center gap-1.5 rounded-chip px-2 py-0.5 text-xs transition-colors aria-disabled:cursor-default';

export interface RpiStripProps {
  sessionId: string;
  openArtifact(childSessionId: string): void;
}

export function RpiStrip({ sessionId, openArtifact }: RpiStripProps) {
  const intl = useIntl();
  const rows = useSessionDelegations(sessionId);
  const views = phaseViews(rows);
  const state = stripState(views);
  if (state === 'empty') return null;

  return (
    <div
      role="group"
      aria-label={intl.formatMessage(i18n.label)}
      // Below the titlebar's 32 px drag strip, as the Work column keeps its own top.
      className="flex shrink-0 flex-wrap items-center gap-1 px-3 pt-6 pb-1"
      data-testid="rpi-strip"
      data-state={state}
    >
      {views.map(({ phase, status, runs, artifact }) => {
        const name = intl.formatMessage(PHASE_MESSAGES[phase]);
        const word = intl.formatMessage(STATUS_MESSAGES[status]);
        const openable = artifact !== null;
        return (
          <button
            key={phase}
            type="button"
            className={cn(
              chipClass,
              status === 'dim' ? 'text-text-tertiary' : 'text-text-primary/70',
              openable &&
                'hover:cursor-pointer hover:bg-background-secondary hover:text-text-primary'
            )}
            aria-label={`${name}: ${word}`}
            aria-disabled={!openable}
            title={
              status === 'dim'
                ? word
                : openable
                  ? `${word} — ${intl.formatMessage(i18n.openArtifact)}`
                  : `${word} — ${intl.formatMessage(i18n.opensWhenDone)}`
            }
            onClick={() => artifact && openArtifact(artifact)}
            data-testid={`rpi-phase-${phase}`}
            data-status={status}
            data-runs={runs}
            data-artifact={artifact ?? undefined}
          >
            <span
              className={cn('inline-block size-2 shrink-0 rounded-chip', STATUS_DOT[status])}
              aria-hidden
            />
            {name}
            {runs > 1 && (
              <span className="text-text-secondary" data-testid={`rpi-phase-${phase}-runs`}>
                {intl.formatMessage(i18n.runs, { count: runs })}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
