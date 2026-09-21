import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import type { Permission } from '../types/permissions';
import { resolveAcpPermissionRequest } from '../acp/permissionRequests';
import { useAcpChatSessionSnapshot } from '../acp/chatSessionStore';
import { runtimeLabel } from '../workspace/session-controls';
import { defineMessages, useIntl } from '../i18n';
import { toolConfirmationState } from './tool-confirmation-state';

const i18n = defineMessages({
  allowOnce: {
    id: 'toolApprovalButtons.allowOnce',
    defaultMessage: 'Allow Once',
  },
  alwaysAllow: {
    id: 'toolApprovalButtons.alwaysAllow',
    defaultMessage: 'Always Allow',
  },
  deny: {
    id: 'toolApprovalButtons.deny',
    defaultMessage: 'Deny',
  },
  allowedOnce: {
    id: 'toolApprovalButtons.allowedOnce',
    defaultMessage: 'Allowed once',
  },
  alwaysAllowed: {
    id: 'toolApprovalButtons.alwaysAllowed',
    defaultMessage: 'Always allowed',
  },
  denied: {
    id: 'toolApprovalButtons.denied',
    defaultMessage: 'Denied',
  },
  deniedOnce: {
    id: 'toolApprovalButtons.deniedOnce',
    defaultMessage: 'Denied once',
  },
  cancelled: {
    id: 'toolApprovalButtons.cancelled',
    defaultMessage: 'Cancelled',
  },
  staleApprovalRequest: {
    id: 'toolApprovalButtons.staleApprovalRequest',
    defaultMessage: 'This approval request is no longer active.',
  },
  waitingForSeat: {
    id: 'toolApprovalButtons.waitingForSeat',
    defaultMessage: 'waiting for {seat}',
  },
});

// Keyed by the tool call id: once the response lands the store swaps the local request (with
// its generation) for the persisted confirmation (without), and a key on the generation
// forgot the decision and re-armed the buttons on a call that had already run (task 89).
// The generation is kept so a genuinely new request for the same call starts fresh.
const globalApprovalState = new Map<
  string,
  {
    decision: Permission | null;
    isClicked: boolean;
    generation: string | undefined;
  }
>();

function storedApprovalState(
  id: string,
  generation: string | undefined,
  pending: boolean
): { decision: Permission | null; isClicked: boolean } | undefined {
  const stored = globalApprovalState.get(id);
  if (!stored) return undefined;
  const sameRequest = generation === undefined || stored.generation === generation;
  return sameRequest || !pending ? stored : undefined;
}

export interface ToolApprovalData {
  generation?: string;
  id: string;
  toolName: string;
  prompt?: string;
  sessionId: string;
  isClicked?: boolean;
}

export default function ToolApprovalButtons({ data }: { data: ToolApprovalData }) {
  const intl = useIntl();
  const { generation, id, toolName, prompt, sessionId, isClicked: initialIsClicked } = data;
  const storedState = storedApprovalState(id, generation, !initialIsClicked);
  const [decision, setDecision] = useState<Permission | null>(storedState?.decision ?? null);
  const [isClicked, setIsClicked] = useState(storedState?.isClicked ?? initialIsClicked ?? false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const providerName = useAcpChatSessionSnapshot(sessionId)?.session?.provider_name ?? '';
  const seat = runtimeLabel(providerName, []);
  const state = toolConfirmationState({ decision, isClicked, approvalError });

  const setResolvedDecision = (action: Permission) => {
    setDecision(action);
    setIsClicked(true);
    setApprovalError(null);
  };

  useEffect(() => {
    const currentState = storedApprovalState(id, generation, !initialIsClicked);
    if (currentState) {
      setDecision(currentState.decision);
      setIsClicked(currentState.isClicked);
    } else {
      setDecision(null);
      setIsClicked(initialIsClicked ?? false);
    }
    setApprovalError(null);
  }, [id, generation, initialIsClicked]);

  useEffect(() => {
    if (!decision) return;
    globalApprovalState.set(id, { decision, isClicked, generation });
  }, [id, generation, decision, isClicked]);

  const handleAction = async (action: Permission) => {
    try {
      if (resolveAcpPermissionRequest(sessionId, id, generation, action)) {
        setResolvedDecision(action);
      } else {
        setApprovalError(intl.formatMessage(i18n.staleApprovalRequest));
      }
    } catch (err) {
      console.error('Error confirming tool action:', err);
    }
  };

  if (isClicked && decision) {
    const statusMessages: Record<Permission, string> = {
      allow_once: intl.formatMessage(i18n.allowedOnce),
      always_allow: intl.formatMessage(i18n.alwaysAllowed),
      always_deny: intl.formatMessage(i18n.denied),
      deny_once: intl.formatMessage(i18n.deniedOnce),
      cancel: intl.formatMessage(i18n.cancelled),
    };
    return (
      <p className="text-sm text-muted-foreground mt-2">
        {toolName} · {statusMessages[decision]}
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 mt-2">
        <Button
          className="rounded-full"
          variant="secondary"
          data-testid="tool-approval-allow-once"
          onClick={() => handleAction('allow_once')}
        >
          {intl.formatMessage(i18n.allowOnce)}
        </Button>
        {!prompt && (
          <Button
            className="rounded-full"
            variant="secondary"
            data-testid="tool-approval-always-allow"
            onClick={() => handleAction('always_allow')}
          >
            {intl.formatMessage(i18n.alwaysAllow)}
          </Button>
        )}
        <Button
          className="rounded-full"
          variant="outline"
          data-testid="tool-approval-deny"
          onClick={() => handleAction('deny_once')}
        >
          {intl.formatMessage(i18n.deny)}
        </Button>
      </div>
      {state === 'partial' && seat && (
        <p className="text-xs text-text-secondary mt-1" role="status">
          {intl.formatMessage(i18n.waitingForSeat, { seat })}
        </p>
      )}
      {approvalError && (
        <p className="text-sm text-red-500 mt-2" role="alert">
          {approvalError}
        </p>
      )}
    </>
  );
}
