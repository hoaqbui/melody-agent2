// Now (task 129): what this session runs on, and one row per reply — the model that answered
// it — newest first, workers nested under the turn that delegated them. Numbers and ids; the
// why lives on hover.

import { useEffect, useState } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { useConfig } from '../../../components/ConfigContext';
import { useAcpChatSessionSnapshot } from '../../../acp/chatSessionStore';
import { useSessionDelegations } from '../../../acp/delegations';
import { selectedConfigValue, useSessionConfigOptions } from '../../../acp/sessionConfig';
import { readLedger, type LedgerEvent } from '../../../native/ledger';
import { ChatState } from '../../../types/chatState';
import type { ProviderDetails } from '../../../types/providers';
import { cn } from '../../../utils';
import { usePaneContext } from '../../pane-context';
import { runtimeLabel } from '../../session-controls';
import { Why } from './Why';
import {
  fmtK,
  sessionSettings,
  shortModel,
  turnRows,
  type Outcome,
  type Setting,
  type TurnRow,
} from './telemetry-now';

const i18n = defineMessages({
  session: { id: 'telemetryNow.session', defaultMessage: 'Session' },
  turns: { id: 'telemetryNow.turns', defaultMessage: 'Turns' },
  newestFirst: { id: 'telemetryNow.newestFirst', defaultMessage: '{count} · newest first' },
  empty: {
    id: 'telemetryNow.empty',
    defaultMessage: 'No turns yet — send a message and the model that answers shows here.',
  },
  noSession: { id: 'telemetryNow.noSession', defaultMessage: 'No session open.' },
  when: { id: 'telemetryNow.when', defaultMessage: 'When' },
  who: { id: 'telemetryNow.who', defaultMessage: 'Who' },
  model: { id: 'telemetryNow.model', defaultMessage: 'Runtime · model' },
  in: { id: 'telemetryNow.in', defaultMessage: 'In' },
  out: { id: 'telemetryNow.out', defaultMessage: 'Out' },
  cache: { id: 'telemetryNow.cache', defaultMessage: 'Cache' },
  time: { id: 'telemetryNow.time', defaultMessage: 'Time' },
  cost: { id: 'telemetryNow.cost', defaultMessage: 'Cost' },
  outcome: { id: 'telemetryNow.outcome', defaultMessage: 'Outcome' },
  sessionWord: { id: 'telemetryNow.sessionWord', defaultMessage: 'Session' },
  outcomeRunning: { id: 'telemetryNow.outcomeRunning', defaultMessage: 'running' },
  outcomeLanded: { id: 'telemetryNow.outcomeLanded', defaultMessage: 'landed' },
  outcomeCorrected: { id: 'telemetryNow.outcomeCorrected', defaultMessage: 'corrected' },
  outcomeBlocked: { id: 'telemetryNow.outcomeBlocked', defaultMessage: 'blocked' },
  outcomeUndone: { id: 'telemetryNow.outcomeUndone', defaultMessage: 'undone' },
  outcomeFailed: { id: 'telemetryNow.outcomeFailed', defaultMessage: 'failed' },
});

// Why each setting matters and where it reads from — the tooltip's two lines.
const SETTING_WHY: Record<string, { why: string; from: string }> = {
  runtime: {
    why: 'Who the session talks to. The Runtime chip sets it; the selector is a view over this option.',
    from: 'session.provider_name · the provider config option',
  },
  model: {
    why: 'The model the session asks for. What answered each turn is in the list below.',
    from: 'model_config.model_name',
  },
  effort: {
    why: 'Forwarded to the CLI once per session; nothing else about sampling is.',
    from: 'thinking_effort config option',
  },
  gate: {
    why: "Melody's own permission gate. Delegated workers always run Auto regardless.",
    from: 'session.goose_mode · summon.rs',
  },
  context: {
    why: 'The window the next turn will carry. The ring on the composer reads the same number.',
    from: 'usage_update.used · contextLimit',
  },
};

const COLUMN_WHY: Record<string, { why: string; from: string }> = {
  when: { why: 'Wall clock the reply landed.', from: 'message.created' },
  who: { why: 'The session itself, or the role a worker ran.', from: 'DelegationUpdate.source' },
  model: {
    why: 'Runtime and the model that answered; the arrow shows the resolved snapshot when it differs.',
    from: 'inference.provider · requestedModel → resolvedModel',
  },
  in: { why: 'Prompt tokens, cache reads included.', from: 'usage.inputTokens' },
  out: { why: 'Completion tokens.', from: 'usage.outputTokens' },
  cache: {
    why: 'Cache reads over prompt tokens; — when the seat reports none.',
    from: 'usage.cacheReadTokens ÷ inputTokens',
  },
  time: {
    why: 'Generation time · time to first token.',
    from: 'usage.elapsedMs · timeToFirstTokenMs',
  },
  cost: {
    why: 'Provider-reported where it exists; est. when estimated; — when neither.',
    from: 'usage.cost · costSource',
  },
  outcome: {
    why: 'How the turn ended: landed · corrected by the session · blocked · undone · failed.',
    from: 'ledger: correction · worker.blocked · undo · DelegationUpdate.status',
  },
};

const OUTCOME_WHY: Record<Outcome, string> = {
  running: 'Still writing; usage lands when the turn ends.',
  landed: 'Returned and stayed.',
  corrected:
    'Returned Done, then the session edited its files — the seat cost more than it saved here.',
  blocked:
    "Returned BLOCKED: the plan's assumption failed against the tree. A plan failure, not a seat failure.",
  undone: 'The user undid this turn; its files went back to how they were before it.',
  failed: 'The delegate call errored.',
};

const DOT: Record<Outcome, string> = {
  running: 'bg-text-info animate-pulse',
  landed: 'bg-text-success',
  corrected: 'bg-text-warning',
  blocked: 'bg-text-warning',
  undone: 'bg-text-warning',
  failed: 'bg-text-danger',
};

const clock = (seconds: number): string => new Date(seconds * 1000).toTimeString().slice(0, 8);
const seconds = (ms?: number): string => (ms === undefined ? '' : `${(ms / 1000).toFixed(1)}s`);

function SettingCell({ setting }: { setting: Setting }) {
  const why = SETTING_WHY[setting.id];
  return (
    <Why as="div" why={why.why} from={why.from} head={setting.label} className="min-w-0">
      <div className="text-[11px] text-text-tertiary">{setting.label}</div>
      <div className="truncate text-sm font-medium" data-testid={`telemetry-now-${setting.id}`}>
        {setting.value}
      </div>
      <div className="truncate font-mono text-[11px] text-text-tertiary">{setting.detail}</div>
    </Why>
  );
}

function Row({ row, providers }: { row: TurnRow; providers: readonly ProviderDetails[] }) {
  const intl = useIntl();
  const outcomeLabel = intl.formatMessage(
    {
      running: i18n.outcomeRunning,
      landed: i18n.outcomeLanded,
      corrected: i18n.outcomeCorrected,
      blocked: i18n.outcomeBlocked,
      undone: i18n.outcomeUndone,
      failed: i18n.outcomeFailed,
    }[row.outcome]
  );
  const running = row.outcome === 'running';
  const num = (value: number | undefined): string =>
    running || value === undefined ? '—' : fmtK(value);
  const cache =
    running || row.cacheReadTokens === undefined || !row.inputTokens
      ? '—'
      : `${Math.round((row.cacheReadTokens / row.inputTokens) * 100)}%`;
  const cost =
    running || row.cost === undefined
      ? '—'
      : `$${row.cost.toFixed(3)}${row.costSource === 'estimated' ? ' est.' : ''}`;
  const runtime = row.provider ? runtimeLabel(row.provider, providers) : '—';
  return (
    <tr
      data-testid="telemetry-now-row"
      data-outcome={row.outcome}
      data-worker={row.who === 'worker' ? 'true' : undefined}
      className="border-t border-border-primary/40 align-top hover:bg-background-secondary/40"
    >
      <td className="whitespace-nowrap py-1.5 pr-2 font-mono text-[11px] text-text-tertiary">
        {clock(row.at)}
      </td>
      <td className={cn('whitespace-nowrap py-1.5 pr-2', row.who === 'worker' && 'pl-3')}>
        {row.who === 'worker' ? (
          <span className="text-text-info">{row.role}</span>
        ) : (
          intl.formatMessage(i18n.sessionWord)
        )}
      </td>
      <td className="py-1.5 pr-2">
        <span className="font-medium">
          {runtime}
          {row.requestedModel ? ` · ${shortModel(row.requestedModel)}` : ''}
        </span>
        <br />
        <span className="font-mono text-[11px] text-text-tertiary">
          {row.requestedModel}
          {row.resolvedModel && row.resolvedModel !== row.requestedModel
            ? ` → ${row.resolvedModel}`
            : ''}
        </span>
      </td>
      <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{num(row.inputTokens)}</td>
      <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{num(row.outputTokens)}</td>
      <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{cache}</td>
      <td className="whitespace-nowrap py-1.5 pr-2 text-right font-mono tabular-nums">
        {running ? '…' : seconds(row.elapsedMs) || '—'}
        {!running && row.timeToFirstTokenMs !== undefined && (
          <span className="text-text-tertiary"> · {seconds(row.timeToFirstTokenMs)}</span>
        )}
      </td>
      <td className="whitespace-nowrap py-1.5 pr-2 text-right font-mono tabular-nums">{cost}</td>
      <td className="whitespace-nowrap py-1.5">
        <Why why={OUTCOME_WHY[row.outcome]} from={COLUMN_WHY.outcome.from} head={outcomeLabel}>
          <span
            className={cn(
              'mr-1.5 inline-block size-[7px] rounded-full align-middle',
              DOT[row.outcome]
            )}
          />
          {outcomeLabel}
        </Why>
      </td>
    </tr>
  );
}

export function TelemetryNow() {
  const intl = useIntl();
  const { cwd, sessionId } = usePaneContext();
  const snapshot = useAcpChatSessionSnapshot(sessionId);
  const delegations = useSessionDelegations(sessionId);
  const options = useSessionConfigOptions(sessionId);
  const { getProviders } = useConfig();
  const [providers, setProviders] = useState<ProviderDetails[]>([]);
  useEffect(() => {
    getProviders(false).then(setProviders);
  }, [getProviders]);
  // The ledger's outcomes for this session, re-read whenever the transcript changes (the
  // writer appends on the same change).
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const messageCount = snapshot?.messages.length ?? 0;
  useEffect(() => {
    if (!sessionId || !cwd) return;
    let cancelled = false;
    readLedger(cwd)
      .then((all) => {
        if (!cancelled) setEvents(all.filter((e) => e.sessionId === sessionId));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId, cwd, messageCount, delegations]);

  if (!sessionId) {
    return (
      <p className="p-4 text-sm text-text-secondary" data-testid="telemetry-now-empty">
        {intl.formatMessage(i18n.noSession)}
      </p>
    );
  }
  const session = snapshot?.session;
  const settings = sessionSettings(
    session,
    providers,
    selectedConfigValue(options, 'thinking_effort'),
    snapshot?.tokenState
  );
  const streaming =
    snapshot?.chatState === ChatState.Streaming || snapshot?.chatState === ChatState.Thinking;
  const rows = turnRows(snapshot?.messages ?? [], delegations, events, streaming);
  const columns: { id: keyof typeof COLUMN_WHY; label: string; right?: boolean }[] = [
    { id: 'when', label: intl.formatMessage(i18n.when) },
    { id: 'who', label: intl.formatMessage(i18n.who) },
    { id: 'model', label: intl.formatMessage(i18n.model) },
    { id: 'in', label: intl.formatMessage(i18n.in), right: true },
    { id: 'out', label: intl.formatMessage(i18n.out), right: true },
    { id: 'cache', label: intl.formatMessage(i18n.cache), right: true },
    { id: 'time', label: intl.formatMessage(i18n.time), right: true },
    { id: 'cost', label: intl.formatMessage(i18n.cost), right: true },
    { id: 'outcome', label: intl.formatMessage(i18n.outcome) },
  ];

  return (
    <div className="flex flex-col gap-3 p-3">
      <section
        className="rounded-panel bg-background-secondary p-3 shadow-[var(--shadow-sm)]"
        data-testid="telemetry-now-settings"
      >
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          {intl.formatMessage(i18n.session)}
          {session?.name && (
            <span className="ml-2 font-mono text-[10.5px] normal-case tracking-normal text-text-tertiary">
              {session.name}
            </span>
          )}
        </h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
          {settings.map((setting) => (
            <SettingCell key={setting.id} setting={setting} />
          ))}
        </div>
      </section>
      <section className="rounded-panel bg-background-secondary p-3 shadow-[var(--shadow-sm)]">
        <h2 className="mb-2 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          <span>{intl.formatMessage(i18n.turns)}</span>
          <span
            className="font-mono text-[10.5px] normal-case tracking-normal"
            data-testid="telemetry-now-count"
          >
            {intl.formatMessage(i18n.newestFirst, { count: rows.length })}
          </span>
        </h2>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-text-secondary" data-testid="telemetry-now-empty">
            {intl.formatMessage(i18n.empty)}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" data-testid="telemetry-now-turns">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <Why
                      key={column.id}
                      as="th"
                      why={COLUMN_WHY[column.id].why}
                      from={COLUMN_WHY[column.id].from}
                      head={column.label}
                      className={cn(
                        'pb-1.5 pr-2 text-[11px] font-medium text-text-tertiary',
                        column.right ? 'text-right' : 'text-left'
                      )}
                    >
                      {column.label}
                    </Why>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Row key={row.id} row={row} providers={providers} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
