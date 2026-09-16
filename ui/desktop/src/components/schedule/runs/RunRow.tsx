// One finished (or running) agent run as a row: schedule · started · outcome · snippet ·
// unread, the checkout it ran in, and Open · Accept · Dismiss. Props only — the Runs inbox
// (task 53) and the Agents pane (task 28) feed it from different sources.

import {
  Archive,
  ArrowUpRight,
  Check,
  CircleCheck,
  CircleHelp,
  CircleX,
  Loader2,
  Square,
} from 'lucide-react';
import { type MessageDescriptor } from 'react-intl';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../ui/button';
import { cn } from '../../../utils';
import { formatToLocalDateWithTimezone } from '../../../utils/date';
import type { AcceptBlocker, RunOutcome } from './runs-state';

const i18n = defineMessages({
  started: { id: 'runsInbox.started', defaultMessage: 'Started {date}' },
  unread: { id: 'runsInbox.unread', defaultMessage: 'Unread' },
  done: { id: 'runsInbox.outcomeDone', defaultMessage: 'Done' },
  failed: { id: 'runsInbox.outcomeFailed', defaultMessage: 'Failed' },
  killed: { id: 'runsInbox.outcomeKilled', defaultMessage: 'Killed' },
  running: { id: 'runsInbox.outcomeRunning', defaultMessage: 'Running' },
  unknown: { id: 'runsInbox.outcomeUnknown', defaultMessage: 'No outcome recorded' },
  noSnippet: { id: 'runsInbox.noSnippet', defaultMessage: 'No reply recorded' },
  mode: { id: 'runsInbox.mode', defaultMessage: 'Goose mode: {mode}' },
  modeHint: {
    id: 'runsInbox.modeHint',
    defaultMessage: 'An unattended run takes the global goose mode, not its own',
  },
  open: { id: 'runsInbox.open', defaultMessage: 'Open' },
  accept: { id: 'runsInbox.accept', defaultMessage: 'Accept' },
  dismiss: { id: 'runsInbox.dismiss', defaultMessage: 'Dismiss' },
  blockedRunning: {
    id: 'runsInbox.blockedRunning',
    defaultMessage: 'Accept and Dismiss wait for the run to finish',
  },
  blockedOtherCwd: {
    id: 'runsInbox.blockedOtherCwd',
    defaultMessage: "Accept works only for runs in this window's checkout",
  },
  blockedNoSidecar: {
    id: 'runsInbox.blockedNoSidecar',
    defaultMessage: 'Accept needs the sidecar, which is not reachable',
  },
});

const OUTCOME_MESSAGES: Record<RunOutcome, MessageDescriptor> = {
  done: i18n.done,
  failed: i18n.failed,
  killed: i18n.killed,
  running: i18n.running,
  unknown: i18n.unknown,
};

const BLOCKER_MESSAGES: Record<AcceptBlocker, MessageDescriptor> = {
  running: i18n.blockedRunning,
  otherCwd: i18n.blockedOtherCwd,
  noSidecar: i18n.blockedNoSidecar,
};

// DESIGN.md §Tokens: success for a done run, danger for a failed one that stays, warning for
// a killed one; a running row keeps its spinner.
function OutcomeIcon({ outcome }: { outcome: RunOutcome }) {
  const size = 'size-4 shrink-0';
  switch (outcome) {
    case 'done':
      return <CircleCheck className={cn(size, 'text-text-success')} aria-hidden />;
    case 'failed':
      return <CircleX className={cn(size, 'text-text-danger')} aria-hidden />;
    case 'killed':
      return <Square className={cn(size, 'text-text-warning')} aria-hidden />;
    case 'running':
      return <Loader2 className={cn(size, 'animate-spin text-text-secondary')} aria-hidden />;
    default:
      return <CircleHelp className={cn(size, 'text-text-secondary')} aria-hidden />;
  }
}

export interface RunRowProps {
  scheduleId: string;
  sessionId: string;
  startedAt: string;
  outcome: RunOutcome;
  error?: string | null;
  snippet?: string | null;
  workingDir: string;
  // The global goose mode, which is what an unattended run actually ran under.
  mode?: string | null;
  unread: boolean;
  acceptBlocker: AcceptBlocker | null;
  busy: boolean;
  actionError?: string | null;
  onOpen: () => void;
  onAccept: () => void;
  onDismiss: () => void;
}

export function RunRow(props: RunRowProps) {
  const intl = useIntl();
  const { outcome, acceptBlocker, busy } = props;
  const reviewable = outcome !== 'running';
  const blockedReason = acceptBlocker ? intl.formatMessage(BLOCKER_MESSAGES[acceptBlocker]) : null;

  return (
    <li
      className="flex flex-col gap-1 rounded-panel bg-background-primary px-4 py-2 hover:bg-background-secondary"
      data-testid="runs-inbox-row"
      data-session-id={props.sessionId}
      data-outcome={outcome}
      data-unread={props.unread}
      aria-busy={busy}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {props.unread && (
              <span className="inline-flex items-center gap-1 text-xs text-text-info">
                <span className="inline-block size-2 rounded-chip bg-text-info" aria-hidden />
                {intl.formatMessage(i18n.unread)}
              </span>
            )}
            <h3
              className={cn('truncate text-base', props.unread && 'font-medium')}
              title={props.scheduleId}
            >
              {props.scheduleId}
            </h3>
            <span
              className="inline-flex items-center gap-1 text-xs text-text-secondary"
              data-testid="runs-inbox-outcome"
            >
              <OutcomeIcon outcome={outcome} />
              {intl.formatMessage(OUTCOME_MESSAGES[outcome])}
            </span>
          </div>
          <p className="line-clamp-1 text-sm text-text-secondary" title={props.snippet ?? ''}>
            {props.snippet || intl.formatMessage(i18n.noSnippet)}
          </p>
          {props.error && (
            <p className="whitespace-pre-wrap font-mono text-xs text-text-danger">{props.error}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-text-secondary">
            <span>
              {intl.formatMessage(i18n.started, {
                date: formatToLocalDateWithTimezone(props.startedAt),
              })}
            </span>
            {props.mode && (
              <span title={intl.formatMessage(i18n.modeHint)}>
                {intl.formatMessage(i18n.mode, { mode: props.mode })}
              </span>
            )}
            <span className="truncate font-mono" title={props.workingDir}>
              {props.workingDir}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={busy}
            onClick={props.onOpen}
            data-testid="runs-inbox-open"
          >
            <ArrowUpRight className="mr-1 size-4" />
            {intl.formatMessage(i18n.open)}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={busy || acceptBlocker !== null}
            title={blockedReason ?? undefined}
            onClick={props.onAccept}
            data-testid="runs-inbox-accept"
          >
            <Check className="mr-1 size-4" />
            {intl.formatMessage(i18n.accept)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            disabled={busy || !reviewable}
            title={reviewable ? undefined : intl.formatMessage(i18n.blockedRunning)}
            onClick={props.onDismiss}
            data-testid="runs-inbox-dismiss"
          >
            <Archive className="mr-1 size-4" />
            {intl.formatMessage(i18n.dismiss)}
          </Button>
        </div>
      </div>
      {blockedReason && acceptBlocker !== 'running' && (
        <p className="text-xs text-text-secondary">{blockedReason}</p>
      )}
      {props.actionError && (
        <p
          className="whitespace-pre-wrap font-mono text-xs text-text-danger"
          role="alert"
          data-testid="runs-inbox-error"
        >
          {props.actionError}
        </p>
      )}
    </li>
  );
}
