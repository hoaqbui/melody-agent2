// One unit of work as a card (task 67): title · runtime chip · worktree branch when any ·
// started/ended · status dot, and the delegated children the store knows nested beneath a
// session's card. A card is a button that opens its session; a child opens its own
// transcript (PRD step 10). Props only, as RunRow is — the board feeds it.

import { Cpu } from 'lucide-react';
import { type MessageDescriptor } from 'react-intl';
import { defineMessages, useIntl } from '../../i18n';
import { useSessionDelegations } from '../../acp/delegations';
import { runtimeLabel } from '../../workspace/session-controls';
import { cn } from '../../utils';
import { formatToLocalDateWithTimezone } from '../../utils/date';
import { childCard, type BoardCard as Card, type CardStatus } from './board-state';

const i18n = defineMessages({
  untitled: { id: 'board.untitled', defaultMessage: 'Untitled session' },
  running: { id: 'board.statusRunning', defaultMessage: 'Running' },
  review: { id: 'board.statusReview', defaultMessage: 'Needs review' },
  done: { id: 'board.statusDone', defaultMessage: 'Done' },
  failed: { id: 'board.statusFailed', defaultMessage: 'Failed' },
  started: { id: 'board.started', defaultMessage: 'Started {date}' },
  ended: { id: 'board.ended', defaultMessage: 'Ended {date}' },
  routine: { id: 'board.routine', defaultMessage: 'Routine' },
  worker: { id: 'board.worker', defaultMessage: 'Worker' },
  reviewUnknown: {
    id: 'board.reviewUnknown',
    defaultMessage:
      'Uncommitted changes not checked: this folder is outside the sidecar’s repository',
  },
});

const STATUS_MESSAGES: Record<CardStatus, MessageDescriptor> = {
  running: i18n.running,
  review: i18n.review,
  done: i18n.done,
  failed: i18n.failed,
};

// DESIGN.md §Tokens: info while running, warning while waiting on the user, success once
// done, danger for a failure that stays. The dot is always beside its word (§Accessibility).
const STATUS_DOT: Record<CardStatus, string> = {
  running: 'bg-text-info',
  review: 'bg-text-warning',
  done: 'bg-text-success',
  failed: 'bg-text-danger',
};

function StatusDot({ status }: { status: CardStatus }) {
  const intl = useIntl();
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-xs text-text-secondary"
      data-testid="board-card-status"
    >
      <span
        className={cn(
          'inline-block size-2 rounded-chip',
          STATUS_DOT[status],
          status === 'running' && 'animate-pulse'
        )}
        aria-hidden
      />
      {intl.formatMessage(STATUS_MESSAGES[status])}
    </span>
  );
}

export interface BoardCardProps {
  card: Card;
  onOpen: (card: Card) => void;
}

function CardBody({ card, onOpen }: BoardCardProps) {
  const intl = useIntl();
  const kindLabel =
    card.kind === 'run'
      ? intl.formatMessage(i18n.routine)
      : card.kind === 'child'
        ? intl.formatMessage(i18n.worker)
        : null;
  return (
    <button
      type="button"
      className="flex w-full flex-col gap-1 rounded-panel bg-background-primary px-3 py-2 text-left shadow-sm transition-shadow hover:bg-background-secondary hover:shadow-md"
      data-testid="board-card"
      data-kind={card.kind}
      data-status={card.status}
      data-session-id={card.id}
      onClick={() => onOpen(card)}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={card.title}>
          {card.title || intl.formatMessage(i18n.untitled)}
        </h3>
        <StatusDot status={card.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
        {kindLabel && <span>{kindLabel}</span>}
        {card.providerId && (
          <span className="inline-flex items-center gap-1" data-testid="board-card-runtime">
            <Cpu className="size-3" aria-hidden />
            {runtimeLabel(card.providerId, [])}
          </span>
        )}
        {card.branch && (
          <span className="truncate font-mono" title={card.cwd} data-testid="board-card-branch">
            {card.branch}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-text-secondary">
        <span>
          {intl.formatMessage(i18n.started, {
            date: formatToLocalDateWithTimezone(card.startedAt),
          })}
        </span>
        {card.endedAt && (
          <span>
            {intl.formatMessage(i18n.ended, { date: formatToLocalDateWithTimezone(card.endedAt) })}
          </span>
        )}
      </div>
      {card.reviewUnknown && (
        <p className="text-xs text-text-tertiary" data-testid="board-card-review-unknown">
          {intl.formatMessage(i18n.reviewUnknown)}
        </p>
      )}
    </button>
  );
}

export function BoardCard({ card, onOpen }: BoardCardProps) {
  const delegations = useSessionDelegations(card.kind === 'session' ? card.id : '');
  return (
    <li className="flex flex-col gap-1">
      <CardBody card={card} onOpen={onOpen} />
      {delegations.length > 0 && (
        <ul className="ml-4 flex flex-col gap-1 border-l border-border-secondary pl-2">
          {delegations.map((delegation) => (
            <li key={delegation.subagentSessionId}>
              <CardBody card={childCard(card, delegation)} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
