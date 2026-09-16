// One worker as a row: status · title · role · runtime · model, the error when it failed, and
// the click that opens its transcript. RunRow's shape (task 53) with a worker's fields —
// props only, the tree in AgentsPane feeds it; a nested list of the worker's own workers
// rides as children.

import { CircleDashed } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MessageDescriptor } from 'react-intl';
import { defineMessages, useIntl } from '../../../i18n';
import { cn } from '../../../utils';
import type { WorkerStatus } from './agents-state';

const i18n = defineMessages({
  waiting: { id: 'agentsPane.statusWaiting', defaultMessage: 'Waiting' },
  running: { id: 'agentsPane.statusRunning', defaultMessage: 'Running' },
  done: { id: 'agentsPane.statusDone', defaultMessage: 'Done' },
  failed: { id: 'agentsPane.statusFailed', defaultMessage: 'Failed' },
  noStatus: { id: 'agentsPane.noStatus', defaultMessage: 'No status recorded' },
  adHoc: { id: 'agentsPane.adHoc', defaultMessage: 'Ad hoc' },
  opensWhenDone: {
    id: 'agentsPane.opensWhenDone',
    defaultMessage: 'Opens once the worker is done',
  },
});

const STATUS_MESSAGES: Record<WorkerStatus, MessageDescriptor> = {
  waiting: i18n.waiting,
  running: i18n.running,
  done: i18n.done,
  failed: i18n.failed,
};

// DESIGN.md §Tokens: info while it runs, success done, danger failed (stays), warning waiting.
const STATUS_DOT: Record<WorkerStatus, string> = {
  waiting: 'bg-text-warning',
  running: 'bg-text-info',
  done: 'bg-text-success',
  failed: 'bg-text-danger',
};

// A dot, never alone: the word sits beside it (DESIGN.md §Accessibility). A row seeded on
// reload has no status on the wire, so it carries the one icon naming what is missing.
export function StatusMark({ status }: { status: WorkerStatus | null }) {
  const intl = useIntl();
  if (status === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
        <CircleDashed className="size-3 shrink-0" aria-hidden />
        {intl.formatMessage(i18n.noStatus)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
      <span className={cn('inline-block size-2 rounded-chip', STATUS_DOT[status])} aria-hidden />
      {intl.formatMessage(STATUS_MESSAGES[status])}
    </span>
  );
}

export interface AgentRowProps {
  sessionId: string;
  title: string;
  // The role file the worker runs; absent for an ad-hoc delegation.
  role: string | null;
  provider: string | null;
  model: string | null;
  status: WorkerStatus | null;
  error?: string;
  openable: boolean;
  onOpen(): void;
  children?: ReactNode;
}

export function AgentRow(props: AgentRowProps) {
  const intl = useIntl();
  const { openable, status } = props;
  const blocked = openable ? null : intl.formatMessage(i18n.opensWhenDone);

  return (
    <li
      className="flex flex-col"
      data-testid="agents-row"
      data-session-id={props.sessionId}
      data-status={status ?? 'none'}
      data-provider={props.provider ?? undefined}
      data-model={props.model ?? undefined}
    >
      <button
        type="button"
        className={cn(
          'flex w-full flex-col gap-0.5 rounded-panel px-3 py-2 text-left hover:bg-background-secondary',
          'aria-disabled:cursor-default aria-disabled:hover:bg-transparent'
        )}
        aria-disabled={!openable}
        title={blocked ?? undefined}
        onClick={openable ? props.onOpen : undefined}
        data-testid="agents-row-open"
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate" title={props.title}>
            {props.title}
          </span>
          <StatusMark status={status} />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-secondary">
          <span data-testid="agents-row-role">{props.role ?? intl.formatMessage(i18n.adHoc)}</span>
          <span className="truncate font-mono" data-testid="agents-row-runtime">
            {[props.provider, props.model].filter(Boolean).join(' · ')}
          </span>
        </span>
        {props.error && (
          <span
            className="whitespace-pre-wrap font-mono text-xs text-text-danger"
            data-testid="agents-row-error"
          >
            {props.error}
          </span>
        )}
      </button>
      {props.children}
    </li>
  );
}
