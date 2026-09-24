// One worker as a row: status · title · role · runtime · model, the error when it failed, and
// the click that opens its transcript. RunRow's shape (task 53) with a worker's fields —
// props only, the tree in AgentsPane feeds it; a nested list of the worker's own workers
// rides as children.

import { CircleDashed, ThumbsDown, ThumbsUp, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { MessageDescriptor } from 'react-intl';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { appendLedger, type LedgerEvent } from '../../../native/ledger';
import { cn } from '../../../utils';
import { fixCandidates, latestVerdict, type Verdict } from './agents-verdict';
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
  verdictGood: { id: 'agentsPane.verdictGood', defaultMessage: 'Good' },
  verdictFixed: { id: 'agentsPane.verdictFixed', defaultMessage: 'Fixed it' },
  verdictWrong: { id: 'agentsPane.verdictWrong', defaultMessage: 'Wrong' },
  verdictWhyPlaceholder: {
    id: 'agentsPane.verdictWhyPlaceholder',
    defaultMessage: 'Why? (optional)',
  },
  verdictWhySave: { id: 'agentsPane.verdictWhySave', defaultMessage: 'Save' },
  fixesLabel: { id: 'agentsPane.fixesLabel', defaultMessage: 'Fixes…' },
  fixesLinked: { id: 'agentsPane.fixesLinked', defaultMessage: 'Fixes {label}' },
  fixesEmpty: { id: 'agentsPane.fixesEmpty', defaultMessage: 'No earlier jobs yet' },
  fixesOverlap: {
    id: 'agentsPane.fixesOverlap',
    defaultMessage: '{count, plural, one {# shared file} other {# shared files}}',
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

// The one-tap verdict on a done row (task 268): good · fixed it · wrong, "why" only after
// wrong, and "Fixes…" to name an earlier job in this repository as fixed. Every tap appends
// straight to the ledger (`native/ledger.ts`) — no callback up to AgentsPane, no effect; a
// re-render never writes twice because only the click does. `ledgerEvents` is read, never
// written here, to show the row's own latest verdict (266's fold has the last word) and this
// repository's earlier jobs; file overlap is a hint only (`agents-verdict.ts`), never a link.
function VerdictRow({
  workerSessionId,
  parentSessionId,
  cwd,
  ledgerEvents,
}: {
  workerSessionId: string;
  parentSessionId: string;
  cwd: string;
  ledgerEvents: readonly LedgerEvent[];
}) {
  const intl = useIntl();
  // The tap wins once made; until then, the ledger's own latest line (266's fold has the last
  // word) — read fresh every render, not snapshotted once, since `ledgerEvents` arrives after
  // the pane's own read resolves and a row can already be done when it does (AgentsPane.tsx).
  const [tapped, setTapped] = useState<Verdict | null>(null);
  const verdict = tapped ?? latestVerdict(ledgerEvents, workerSessionId);
  const [why, setWhy] = useState('');
  const [linkedLabel, setLinkedLabel] = useState<string | null>(null);
  const candidates = fixCandidates(ledgerEvents, workerSessionId);

  const pick = (next: Verdict, note?: string) => {
    setTapped(next);
    const event: LedgerEvent = {
      kind: 'verdict',
      at: new Date().toISOString(),
      sessionId: parentSessionId,
      workerSessionId,
      verdict: next,
      why: note || undefined,
    };
    void appendLedger(cwd, event).catch((error) => {
      console.warn('verdict append failed', error);
    });
  };

  const pickFix = (candidate: { workerSessionId: string; label: string }) => {
    setLinkedLabel(candidate.label);
    const event: LedgerEvent = {
      kind: 'link',
      at: new Date().toISOString(),
      sessionId: parentSessionId,
      workerSessionId: candidate.workerSessionId,
      by: 'user',
      fromWorkerSessionId: workerSessionId,
    };
    void appendLedger(cwd, event).catch((error) => {
      console.warn('link append failed', error);
    });
  };

  const verdictButton = (value: Verdict, label: string, Icon: typeof ThumbsUp, tone: string) => (
    <Button
      type="button"
      variant="outline"
      size="xs"
      className={cn(verdict === value && tone)}
      aria-pressed={verdict === value}
      onClick={() => pick(value, value === 'wrong' ? why : undefined)}
      data-testid={`agents-row-verdict-${value}`}
    >
      <Icon />
      {label}
    </Button>
  );

  return (
    <div
      className="flex flex-wrap items-center gap-1 px-3 pb-2 text-xs"
      data-testid="agents-row-verdict"
    >
      {verdictButton('good', intl.formatMessage(i18n.verdictGood), ThumbsUp, 'text-text-success')}
      {verdictButton('fixed', intl.formatMessage(i18n.verdictFixed), Wrench, 'text-text-warning')}
      {verdictButton('wrong', intl.formatMessage(i18n.verdictWrong), ThumbsDown, 'text-text-danger')}
      {verdict === 'wrong' && (
        <span className="flex items-center gap-1">
          <input
            type="text"
            value={why}
            onChange={(event) => setWhy(event.target.value)}
            placeholder={intl.formatMessage(i18n.verdictWhyPlaceholder)}
            className="h-6 rounded-control border bg-transparent px-2 text-xs"
            data-testid="agents-row-verdict-why"
          />
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => pick('wrong', why)}
            data-testid="agents-row-verdict-why-save"
          >
            {intl.formatMessage(i18n.verdictWhySave)}
          </Button>
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="xs" data-testid="agents-row-fixes">
            {linkedLabel
              ? intl.formatMessage(i18n.fixesLinked, { label: linkedLabel })
              : intl.formatMessage(i18n.fixesLabel)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {candidates.length === 0 ? (
            <span className="block px-2 py-1.5 text-xs text-text-tertiary">
              {intl.formatMessage(i18n.fixesEmpty)}
            </span>
          ) : (
            candidates.map((candidate) => (
              <DropdownMenuItem
                key={candidate.workerSessionId}
                onClick={() => pickFix(candidate)}
                data-testid="agents-row-fixes-item"
                data-worker-session-id={candidate.workerSessionId}
              >
                <span className="min-w-0 flex-1 truncate">{candidate.label}</span>
                {candidate.paths.length > 0 && (
                  <span className="text-text-tertiary">
                    {intl.formatMessage(i18n.fixesOverlap, { count: candidate.paths.length })}
                  </span>
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
  // The one-tap verdict (task 268): the delegating session's own id (the ledger's `sessionId`),
  // this project's cwd (which ledger file to append to), and its events (to read the row's own
  // latest verdict and this repository's earlier jobs). Optional only so a row can be built
  // without them in isolation (e.g. a future caller with nothing delegated yet); AgentsPane
  // always supplies all three, and the verdict UI only ever shows on a done row that has them.
  parentSessionId?: string;
  cwd?: string;
  ledgerEvents?: readonly LedgerEvent[];
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
      {status === 'done' &&
        props.parentSessionId !== undefined &&
        props.cwd !== undefined &&
        props.ledgerEvents !== undefined && (
          <VerdictRow
            workerSessionId={props.sessionId}
            parentSessionId={props.parentSessionId}
            cwd={props.cwd}
            ledgerEvents={props.ledgerEvents}
          />
        )}
      {props.children}
    </li>
  );
}
