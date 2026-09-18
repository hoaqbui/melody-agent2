// The RPI strip above the chat (PRD step 11; task 29): Research · Plan · Implement · Review as
// chips, each lit when a worker with that role starts, from the same rows the Agents pane
// reads (task 65's delegations store). A phase with an artifact opens the Artifact pane on
// that child (task 30); a re-run reads ×2 beside the name. Nothing renders until a phase is
// lit — a Direct session starts as a chat.

import type { MessageDescriptor } from 'react-intl';
import { defineMessages, useIntl } from '../../i18n';
import { cn } from '../../utils';
import { Button } from '../../components/ui/button';
import { useSessionDelegations } from '../../acp/delegations';
import { acpCancelPrompt } from '../../acp/prompt';
import { phaseViews, stripState, gateState, type Phase, type PhaseStatus } from './rpi-strip-state';
import { prompt } from '../prompt';
import { AppEvents } from '../../constants/events';

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
  gateReady: { id: 'rpiStrip.gateReady', defaultMessage: 'Plan ready — waiting for you' },
  gateAccept: { id: 'rpiStrip.gateAccept', defaultMessage: 'Accept' },
  gateRevise: { id: 'rpiStrip.gateRevise', defaultMessage: 'Revise…' },
  overrunMessage: {
    id: 'rpiStrip.overrunMessage',
    defaultMessage: 'Implement started without your Accept',
  },
  overrunStop: { id: 'rpiStrip.overrunStop', defaultMessage: 'Stop' },
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
  chatIdle: boolean;
  gateOn: boolean;
  cwd: string;
}

export function RpiStrip({
  sessionId,
  openArtifact,
  chatIdle,
  gateOn,
  cwd,
}: RpiStripProps) {
  const intl = useIntl();
  const rows = useSessionDelegations(sessionId);
  const views = phaseViews(rows);
  const state = stripState(views);
  const awaiting = gateState(views, chatIdle, gateOn);

  const implement = views.find((v) => v.phase === 'implement');
  const overrun = awaiting && implement?.status !== 'dim';

  const handleAccept = () => {
    prompt(sessionId, 'Plan accepted — implement it.', cwd).catch(console.error);
  };

  const handleRevise = () => {
    window.dispatchEvent(
      new CustomEvent(AppEvents.INSERT_INPUT_TEXT, {
        detail: 'Revise the plan: ',
      })
    );
    const input = document.querySelector('[data-testid="chat-input-field"]') as HTMLTextAreaElement;
    input?.focus();
  };

  if (state === 'empty') return null;

  return (
    <div className="flex shrink-0 flex-col px-3 pt-6 pb-1">
      <div
        role="group"
        aria-label={intl.formatMessage(i18n.label)}
        // Below the titlebar's 32 px drag strip, as the Work column keeps its own top.
        className="flex flex-wrap items-center gap-1"
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

      {awaiting && !overrun && (
        <div
          className="flex items-center gap-2 mt-2 rounded-panel px-2 py-1 bg-background-secondary text-xs"
          data-testid="rpi-gate"
          role="status"
        >
          <span className="flex-1 text-text-primary">
            {intl.formatMessage(i18n.gateReady)}
          </span>
          <Button
            variant="ghost"
            size="xs"
            data-testid="rpi-accept"
            onClick={handleAccept}
          >
            {intl.formatMessage(i18n.gateAccept)}
          </Button>
          <Button
            variant="ghost"
            size="xs"
            data-testid="rpi-revise"
            onClick={handleRevise}
          >
            {intl.formatMessage(i18n.gateRevise)}
          </Button>
        </div>
      )}

      {overrun && (
        <div
          className="flex items-center gap-2 mt-2 rounded-panel px-2 py-1 bg-background-secondary text-xs text-text-warning"
          data-testid="rpi-overrun"
          role="alert"
        >
          <span className="flex-1 text-text-warning">
            {intl.formatMessage(i18n.overrunMessage)}
          </span>
          <Button
            variant="ghost"
            size="xs"
            data-testid="rpi-stop"
            onClick={() => {
              acpCancelPrompt(sessionId).catch(console.error);
            }}
          >
            {intl.formatMessage(i18n.overrunStop)}
          </Button>
        </div>
      )}
    </div>
  );
}
