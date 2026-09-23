import { useSyncExternalStore } from 'react';
import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk';
import type { Permission } from '../types/permissions';
import { acpChatSessionActions, acpPermissionUserInputRequestId } from './chatSessionStore';
import type { AcpPermissionRequest } from './permissionRequestTypes';

interface PendingPermissionRequest {
  request: RequestPermissionRequest;
  generation: string;
  resolve: (response: RequestPermissionResponse) => void;
}

const pendingRequests = new Map<string, PendingPermissionRequest>();

// Which sessions have an outstanding permission request, across every window (task 167):
// the sidebar's "Needs you" row and the background notification both read this instead of
// a window-scoped chat state, so a session that isn't mounted here still shows as waiting.
const awaitingListeners = new Set<() => void>();
let awaitingSessionIds: ReadonlySet<string> = new Set();

function recomputeAwaiting(): void {
  const next = new Set<string>();
  for (const pending of pendingRequests.values()) next.add(pending.request.sessionId);
  awaitingSessionIds = next;
  for (const listener of awaitingListeners) listener();
}

export function getAwaitingApprovalSessions(): ReadonlySet<string> {
  return awaitingSessionIds;
}

export function subscribeAwaitingApprovalSessions(listener: () => void): () => void {
  awaitingListeners.add(listener);
  return () => {
    awaitingListeners.delete(listener);
  };
}

export function useAwaitingApprovalSessions(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribeAwaitingApprovalSessions,
    getAwaitingApprovalSessions,
    getAwaitingApprovalSessions
  );
}

export interface AwaitingApprovalDetail {
  toolTitle: string;
  command?: string;
}

// The oldest still-pending request for the session: what the notification names.
export function getAwaitingApprovalDetail(sessionId: string): AwaitingApprovalDetail | undefined {
  for (const pending of pendingRequests.values()) {
    if (pending.request.sessionId === sessionId) {
      return {
        toolTitle: pending.request.toolCall.title ?? pending.request.toolCall.toolCallId,
        command: commandFromRawInput(pending.request.toolCall.rawInput),
      };
    }
  }
  return undefined;
}

function commandFromRawInput(rawInput: unknown): string | undefined {
  if (!rawInput || typeof rawInput !== 'object') return undefined;
  const command = (rawInput as Record<string, unknown>).command;
  return typeof command === 'string' ? command : undefined;
}

export async function requestAcpPermission(
  request: RequestPermissionRequest
): Promise<RequestPermissionResponse> {
  const key = permissionRequestKey(request.sessionId, request.toolCall.toolCallId);
  const previous = pendingRequests.get(key);
  if (previous) {
    previous.resolve(cancelledPermissionResponse());
  }

  return new Promise<RequestPermissionResponse>((resolve) => {
    const permissionRequest: AcpPermissionRequest = {
      generation: globalThis.crypto.randomUUID(),
      request,
    };
    pendingRequests.set(key, { ...permissionRequest, resolve });
    recomputeAwaiting();
    acpChatSessionActions.applyPermissionRequest(permissionRequest);
  });
}

export function resolveAcpPermissionRequest(
  sessionId: string,
  toolCallId: string,
  generation: string | undefined,
  action: Permission
): boolean {
  const key = permissionRequestKey(sessionId, toolCallId);
  const pending = pendingRequests.get(key);
  if (!pending || !generation || pending.generation !== generation) {
    return false;
  }

  pendingRequests.delete(key);
  recomputeAwaiting();
  acpChatSessionActions.resolveUserInputRequest(
    sessionId,
    acpPermissionUserInputRequestId(toolCallId)
  );
  pending.resolve(permissionResponseForAction(pending.request, action));
  return true;
}

export function cancelAcpPermissionRequestsForSession(sessionId: string): void {
  let changed = false;
  for (const [key, pending] of pendingRequests) {
    if (pending.request.sessionId === sessionId) {
      pendingRequests.delete(key);
      changed = true;
      acpChatSessionActions.cancelPermissionRequest(
        sessionId,
        pending.request.toolCall.toolCallId,
        pending.generation
      );
      pending.resolve(cancelledPermissionResponse());
    }
  }
  if (changed) recomputeAwaiting();
}

function permissionResponseForAction(
  request: RequestPermissionRequest,
  action: Permission
): RequestPermissionResponse {
  if (action === 'cancel') {
    return cancelledPermissionResponse();
  }

  const optionId = permissionOptionIdForAction(request, action);
  if (!optionId) {
    return cancelledPermissionResponse();
  }

  return {
    outcome: {
      outcome: 'selected',
      optionId,
    },
  };
}

function permissionOptionIdForAction(
  request: RequestPermissionRequest,
  action: Permission
): string | undefined {
  const kind = permissionOptionKindForAction(action);
  if (!kind) {
    return undefined;
  }

  return request.options.find((candidate) => candidate.kind === kind)?.optionId;
}

function permissionOptionKindForAction(action: Permission) {
  switch (action) {
    case 'allow_once':
      return 'allow_once';
    case 'always_allow':
      return 'allow_always';
    case 'deny_once':
      return 'reject_once';
    case 'always_deny':
      return 'reject_always';
    case 'cancel':
      return undefined;
  }
}

function cancelledPermissionResponse(): RequestPermissionResponse {
  return {
    outcome: {
      outcome: 'cancelled',
    },
  };
}

function permissionRequestKey(sessionId: string, toolCallId: string): string {
  return `${sessionId}\u0000${toolCallId}`;
}
