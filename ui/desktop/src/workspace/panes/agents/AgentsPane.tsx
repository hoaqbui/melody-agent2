// The Agents pane (PRD step 10): the workers the open session delegated to, as a tree under
// it — runtime · role · task title · status — from src/acp's delegations store (task 65),
// rows appearing when the delegate call starts. A click opens the worker's transcript in
// place, read-only, loaded through src/acp like any session; Back returns to the tree.

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocation, useSearchParams } from 'react-router';
import { defineMessages, useIntl } from '../../../i18n';
import { Button } from '../../../components/ui/button';
import ProgressiveMessageList from '../../../components/ProgressiveMessageList';
import { acpChatSessionController } from '../../../acp/chatSessionController';
import {
  useAcpChatSessionSnapshot,
  type AcpChatSessionSnapshot,
} from '../../../acp/chatSessionStore';
import { useSessionDelegations, type Delegation } from '../../../acp/delegations';
import type { Message } from '../../../types/message';
import { AgentRow, StatusMark } from './AgentRow';
import { canOpenTranscript, paneState, transcriptLoad } from './agents-state';

const i18n = defineMessages({
  empty: { id: 'agentsPane.empty', defaultMessage: 'No delegated work yet' },
  emptyHint: {
    id: 'agentsPane.emptyHint',
    defaultMessage: 'Workers appear here when a session in Orchestrate delegates a task',
  },
  thisSession: { id: 'agentsPane.thisSession', defaultMessage: 'This session' },
  back: { id: 'agentsPane.back', defaultMessage: 'Back' },
  readOnly: { id: 'agentsPane.readOnly', defaultMessage: 'Read-only' },
  loading: { id: 'agentsPane.loading', defaultMessage: 'Loading transcript…' },
  retry: { id: 'agentsPane.retry', defaultMessage: 'Retry' },
});

function useSessionId(): string {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  return (location.pathname === '/pair' && searchParams.get('resumeSessionId')) || '';
}

const isUserMessage = (message: Message) => message.role === 'user';

// A worker and, once the store has them, the workers it delegated to in turn.
function WorkerNode({ row, onOpen }: { row: Delegation; onOpen(row: Delegation): void }) {
  const children = useSessionDelegations(row.subagentSessionId);
  return (
    <AgentRow
      sessionId={row.subagentSessionId}
      title={row.title}
      role={row.source ?? null}
      provider={row.provider ?? null}
      model={row.model ?? null}
      status={row.status ?? null}
      error={row.error}
      openable={canOpenTranscript(row)}
      onOpen={() => onOpen(row)}
    >
      {children.length > 0 && (
        <ul className="ml-4 border-l border-border-primary pl-1">
          {children.map((child) => (
            <WorkerNode key={child.subagentSessionId} row={child} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </AgentRow>
  );
}

// The child's stored transcript, rendered by the chat's own list with no edit or send path.
function WorkerTranscript({
  row,
  snapshot,
  onBack,
}: {
  row: Delegation;
  snapshot: AcpChatSessionSnapshot | undefined;
  onBack(): void;
}) {
  const intl = useIntl();
  const childId = row.subagentSessionId;
  const load = transcriptLoad(snapshot ?? {});
  const open = useCallback(() => {
    void acpChatSessionController.loadSession(childId);
  }, [childId]);

  useEffect(open, [open]);

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border-primary px-2 py-1">
        <Button variant="ghost" size="xs" onClick={onBack} data-testid="agents-back">
          <ArrowLeft />
          {intl.formatMessage(i18n.back)}
        </Button>
        <span className="min-w-0 flex-1 truncate" title={row.title}>
          {row.title}
        </span>
        <StatusMark status={row.status ?? null} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 border-b border-border-primary px-3 py-1 text-xs text-text-secondary">
        <span>{intl.formatMessage(i18n.readOnly)}</span>
        {row.source && <span>{row.source}</span>}
        <span className="font-mono">{[row.provider, row.model].filter(Boolean).join(' · ')}</span>
      </div>
      {load.status === 'loading' && (
        <p className="p-3 text-text-secondary" aria-live="polite">
          {intl.formatMessage(i18n.loading)}
        </p>
      )}
      {load.status === 'error' && (
        <div className="flex flex-col gap-2 p-3" role="alert">
          <span className="break-all font-mono text-xs text-text-danger">{load.message}</span>
          <Button variant="outline" size="xs" className="self-start" onClick={open}>
            {intl.formatMessage(i18n.retry)}
          </Button>
        </div>
      )}
      {load.status === 'ready' && (
        <div
          className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
          data-testid="agents-transcript"
          data-session-id={childId}
        >
          <ProgressiveMessageList
            messages={snapshot?.messages ?? []}
            sessionId={childId}
            isUserMessage={isUserMessage}
          />
        </div>
      )}
    </>
  );
}

export function AgentsPane() {
  const intl = useIntl();
  const sessionId = useSessionId();
  const session = useAcpChatSessionSnapshot(sessionId)?.session;
  const rows = useSessionDelegations(sessionId);
  const [openRow, setOpenRow] = useState<Delegation | null>(null);

  useEffect(() => {
    setOpenRow(null);
  }, [sessionId]);

  // The row keeps updating under the open transcript (a status the tree got after the click).
  const shown = openRow
    ? (rows.find((row) => row.subagentSessionId === openRow.subagentSessionId) ?? openRow)
    : null;
  const childSnapshot = useAcpChatSessionSnapshot(shown?.subagentSessionId ?? '');
  const state = paneState({
    rows,
    transcript: shown ? transcriptLoad(childSnapshot ?? {}) : null,
  });
  // TODO(task 30): an artifact link per row through `openArtifact(childSessionId)` on pane-context.

  return (
    <div
      className="flex h-full min-h-0 flex-col text-sm"
      data-testid="agents-pane"
      data-state={state}
    >
      {shown ? (
        <WorkerTranscript row={shown} snapshot={childSnapshot} onBack={() => setOpenRow(null)} />
      ) : rows.length === 0 ? (
        <div className="flex flex-col gap-1 p-3 text-text-secondary" data-testid="agents-empty">
          <span>{intl.formatMessage(i18n.empty)}</span>
          <span className="text-xs text-text-tertiary">{intl.formatMessage(i18n.emptyHint)}</span>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div
            className="flex flex-wrap items-center gap-x-2 border-b border-border-primary px-3 py-2"
            data-testid="agents-root"
          >
            <span className="min-w-0 flex-1 truncate" title={session?.name}>
              {session?.name || intl.formatMessage(i18n.thisSession)}
            </span>
            <span className="truncate font-mono text-xs text-text-secondary">
              {[session?.provider_name, session?.model_config?.model_name]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <ul className="flex flex-col py-1" data-testid="agents-tree">
            {rows.map((row) => (
              <WorkerNode key={row.subagentSessionId} row={row} onOpen={setOpenRow} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
