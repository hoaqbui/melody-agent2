// The session's actions (task 69): rename, fork, view JSON, view model interactions, archive
// and delete — lifted out of upstream's SessionActionsHeader so the rail's ⋯ menu and that
// header run the same handlers on the same dialogs (SessionActionDialogs renders them).

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'react-toastify';
import { AppEvents } from '../constants/events';
import { defineMessages, useIntl } from '../i18n';
import { getDiagnosticsReport } from '../acp/diagnostics';
import {
  acpArchiveSession,
  acpDeleteSession,
  acpExportSession,
  acpForkSession,
  acpRenameSession,
} from '../acp/sessions';
import { acpChatSessionActions, acpChatSessionStore } from '../acp/chatSessionStore';
import { cancelAcpPermissionRequestsForSession } from '../acp/permissionRequests';
import { cancelAcpElicitationRequestsForSession } from '../acp/elicitationRequests';
import { getSessionDisplayName } from '../sessions';
import type { Session } from '../types/session';
import { errorMessage } from '../utils/conversionUtils';
import { useNavigation } from './useNavigation';

const i18n = defineMessages({
  renamed: { id: 'sessionActionsHeader.renamed', defaultMessage: 'Session renamed' },
  renameFailed: {
    id: 'sessionActionsHeader.renameFailed',
    defaultMessage: 'Failed to rename session: {error}',
  },
  forked: { id: 'sessionActions.forked', defaultMessage: 'Session forked' },
  forkFailed: {
    id: 'sessionActions.forkFailed',
    defaultMessage: 'Failed to fork session: {error}',
  },
  jsonFailed: {
    id: 'sessionActionsHeader.jsonFailed',
    defaultMessage: 'Failed to load session JSON: {error}',
  },
  modelInteractionsFailed: {
    id: 'sessionActionsHeader.modelInteractionsFailed',
    defaultMessage: 'Failed to load model interactions: {error}',
  },
  copiedJson: { id: 'sessionActionsHeader.copiedJson', defaultMessage: 'Session JSON copied' },
  copiedModelInteractions: {
    id: 'sessionActionsHeader.copiedModelInteractions',
    defaultMessage: 'Recent model interactions copied',
  },
  copiedText: { id: 'sessionActionsHeader.copiedText', defaultMessage: 'Text copied' },
  archived: { id: 'sessionActions.archived', defaultMessage: 'Session archived' },
  archiveFailed: {
    id: 'sessionActions.archiveFailed',
    defaultMessage: 'Failed to archive session: {error}',
  },
  deleted: { id: 'sessionActions.deleted', defaultMessage: 'Session deleted' },
  deleteFailed: {
    id: 'sessionActions.deleteFailed',
    defaultMessage: 'Failed to delete session "{name}": {error}',
  },
});

export type JsonDialogKind = 'session' | 'modelInteractions';

export interface FullTextSelection {
  path: string;
  value: string;
}

export interface SessionActions {
  session: Session | undefined;
  // Menu handlers. The dialogs open on the next tick: a modal opened from a menu item's own
  // click keeps that menu on screen, its close never finishing under the new focus scope.
  openRename(): void;
  fork(): Promise<void>;
  viewJson(): Promise<void>;
  viewModelInteractions(): Promise<void>;
  archive(): Promise<void>;
  openDelete(): void;
  forking: boolean;
  archiving: boolean;
  deleting: boolean;
  // The rename dialog.
  renameOpen: boolean;
  setRenameOpen(open: boolean): void;
  renameValue: string;
  setRenameValue(value: string): void;
  renaming: boolean;
  rename(): Promise<void>;
  // The JSON dialog, session JSON or model interactions, and the full-text dialog it opens.
  jsonOpen: boolean;
  setJsonOpen(open: boolean): void;
  jsonKind: JsonDialogKind;
  jsonValue: unknown;
  jsonText: string;
  jsonLoading: boolean;
  modelInteractionsLoading: boolean;
  copyJson(): Promise<void>;
  fullText: FullTextSelection | null;
  setFullText(selection: FullTextSelection | null): void;
  copyFullText(): Promise<void>;
  // The delete confirm.
  deleteOpen: boolean;
  confirmDelete(): Promise<void>;
  cancelDelete(): void;
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return line;
  }
}

export function useSessionActions(session: Session | undefined): SessionActions {
  const intl = useIntl();
  const setView = useNavigation();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [jsonOpen, setJsonOpenState] = useState(false);
  const [jsonKind, setJsonKind] = useState<JsonDialogKind>('session');
  const [jsonValue, setJsonValue] = useState<unknown>(null);
  const [jsonText, setJsonText] = useState('');
  const [jsonLoading, setJsonLoading] = useState(false);
  const [modelInteractionsLoading, setModelInteractionsLoading] = useState(false);
  const [forking, setForking] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [fullText, setFullText] = useState<FullTextSelection | null>(null);
  const jsonLoadRequestId = useRef(0);

  useEffect(() => {
    if (session && renameOpen) {
      setRenameValue(getSessionDisplayName(session));
    }
  }, [renameOpen, session]);

  const openRename = useCallback(() => {
    window.setTimeout(() => setRenameOpen(true), 0);
  }, []);

  const rename = useCallback(async () => {
    if (!session || renaming) return;
    const trimmedName = renameValue.trim();
    if (!trimmedName) return;
    if (trimmedName === session.name) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      await acpRenameSession(session.id, trimmedName);
      flushSync(() => setRenameOpen(false));
      document.body.style.removeProperty('pointer-events');
      const current = acpChatSessionStore.getSnapshot(session.id)?.session;
      if (current) {
        acpChatSessionActions.setSessionMetadata(session.id, {
          ...current,
          name: trimmedName,
          user_set_name: true,
        });
      }
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_RENAMED, {
          detail: { sessionId: session.id, newName: trimmedName, userInitiated: true },
        })
      );
      toast.success(intl.formatMessage(i18n.renamed));
    } catch (error) {
      toast.error(
        intl.formatMessage(i18n.renameFailed, { error: errorMessage(error, 'Unknown error') })
      );
    } finally {
      setRenaming(false);
    }
  }, [intl, renameValue, renaming, session]);

  // The fork opens, as a new session in the list (Claude Code desktop's Fork).
  const fork = useCallback(async () => {
    if (!session || forking) return;
    setForking(true);
    try {
      const forkId = await acpForkSession(session.id);
      window.dispatchEvent(new CustomEvent(AppEvents.SESSION_CREATED));
      window.dispatchEvent(
        new CustomEvent(AppEvents.ADD_ACTIVE_SESSION, { detail: { sessionId: forkId } })
      );
      setView('pair', { disableAnimation: true, resumeSessionId: forkId });
      toast.success(intl.formatMessage(i18n.forked));
    } catch (error) {
      toast.error(
        intl.formatMessage(i18n.forkFailed, { error: errorMessage(error, 'Unknown error') })
      );
    } finally {
      setForking(false);
    }
  }, [forking, intl, session, setView]);

  const viewJson = useCallback(async () => {
    if (!session) return;
    const loadRequestId = ++jsonLoadRequestId.current;
    setJsonOpenState(true);
    setJsonKind('session');
    setJsonValue(null);
    setJsonText('');
    setModelInteractionsLoading(false);
    setJsonLoading(true);
    try {
      const value = JSON.parse(await acpExportSession(session.id)) as unknown;
      if (jsonLoadRequestId.current !== loadRequestId) return;
      setJsonValue(value);
      setJsonText(JSON.stringify(value, null, 2));
    } catch (error) {
      if (jsonLoadRequestId.current !== loadRequestId) return;
      setJsonOpenState(false);
      toast.error(
        intl.formatMessage(i18n.jsonFailed, { error: errorMessage(error, 'Unknown error') })
      );
    } finally {
      if (jsonLoadRequestId.current === loadRequestId) setJsonLoading(false);
    }
  }, [intl, session]);

  const viewModelInteractions = useCallback(async () => {
    if (!session) return;
    const loadRequestId = ++jsonLoadRequestId.current;
    setJsonOpenState(true);
    setJsonKind('modelInteractions');
    setJsonValue(null);
    setJsonText('');
    setJsonLoading(false);
    setModelInteractionsLoading(true);
    try {
      const report = await getDiagnosticsReport(session.id, 'full');
      const interactions = report.logs.llm.map((log) => ({
        path: log.path,
        truncated: log.truncated,
        entries: log.content
          .split('\n')
          .filter((line) => line.trim().length > 0)
          .map(parseJsonLine),
      }));
      if (jsonLoadRequestId.current !== loadRequestId) return;
      setJsonValue(interactions);
      setJsonText(JSON.stringify(interactions, null, 2));
    } catch (error) {
      if (jsonLoadRequestId.current !== loadRequestId) return;
      setJsonOpenState(false);
      toast.error(
        intl.formatMessage(i18n.modelInteractionsFailed, {
          error: errorMessage(error, 'Unknown error'),
        })
      );
    } finally {
      if (jsonLoadRequestId.current === loadRequestId) setModelInteractionsLoading(false);
    }
  }, [intl, session]);

  const copyJson = useCallback(async () => {
    if (!jsonText) return;
    await navigator.clipboard.writeText(jsonText);
    toast.success(
      intl.formatMessage(
        jsonKind === 'modelInteractions' ? i18n.copiedModelInteractions : i18n.copiedJson
      )
    );
  }, [intl, jsonKind, jsonText]);

  const copyFullText = useCallback(async () => {
    if (!fullText) return;
    await navigator.clipboard.writeText(fullText.value);
    toast.success(intl.formatMessage(i18n.copiedText));
  }, [fullText, intl]);

  const setJsonOpen = useCallback((open: boolean) => {
    setJsonOpenState(open);
    if (!open) {
      jsonLoadRequestId.current += 1;
      setJsonLoading(false);
      setModelInteractionsLoading(false);
      setFullText(null);
    }
  }, []);

  // Archived, the session leaves every list the way a deleted one does (SESSION_DELETED is
  // what the sidebar and the active-session mounts listen for) but keeps its data; the
  // chat lands on the Hub.
  const archive = useCallback(async () => {
    if (!session || archiving) return;
    setArchiving(true);
    try {
      await acpArchiveSession(session.id);
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_DELETED, { detail: { sessionId: session.id } })
      );
      setView('chat');
      toast.success(intl.formatMessage(i18n.archived));
    } catch (error) {
      toast.error(
        intl.formatMessage(i18n.archiveFailed, { error: errorMessage(error, 'Unknown error') })
      );
    } finally {
      setArchiving(false);
    }
  }, [archiving, intl, session, setView]);

  const openDelete = useCallback(() => {
    window.setTimeout(() => setDeleteOpen(true), 0);
  }, []);

  const cancelDelete = useCallback(() => setDeleteOpen(false), []);

  // Upstream's delete (SessionListView): the session, its pending requests, its snapshot.
  const confirmDelete = useCallback(async () => {
    if (!session || deleting) return;
    setDeleteOpen(false);
    setDeleting(true);
    const { id, name } = session;
    try {
      await acpDeleteSession(id);
      window.dispatchEvent(
        new CustomEvent(AppEvents.SESSION_DELETED, { detail: { sessionId: id } })
      );
      cancelAcpPermissionRequestsForSession(id);
      cancelAcpElicitationRequestsForSession(id);
      acpChatSessionActions.deleteSnapshot(id);
      setView('chat');
      toast.success(intl.formatMessage(i18n.deleted));
    } catch (error) {
      toast.error(
        intl.formatMessage(i18n.deleteFailed, {
          name,
          error: errorMessage(error, 'Unknown error'),
        })
      );
    } finally {
      setDeleting(false);
    }
  }, [deleting, intl, session, setView]);

  return {
    session,
    openRename,
    fork,
    viewJson,
    viewModelInteractions,
    archive,
    openDelete,
    forking,
    archiving,
    deleting,
    renameOpen,
    setRenameOpen,
    renameValue,
    setRenameValue,
    renaming,
    rename,
    jsonOpen,
    setJsonOpen,
    jsonKind,
    jsonValue,
    jsonText,
    jsonLoading,
    modelInteractionsLoading,
    copyJson,
    fullText,
    setFullText,
    copyFullText,
    deleteOpen,
    confirmDelete,
    cancelDelete,
  };
}
