import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import {
  AlertTriangle,
  AudioLines,
  Clock,
  LibraryBig,
  MessageSquare,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigationContext } from './NavigationContext';
import { useConfig } from '../ConfigContext';
import { useNavigationSessions } from '../../hooks/useNavigationSessions';
import {
  NAV_ITEMS,
  NEW_CHAT_PATH,
  SESSION_HISTORY_PATH,
  SETTINGS_NAV_ITEM,
  getNavItemLabel,
  type NavItem,
  type SidebarTab,
} from '../../hooks/useNavigationItems';
import { AppEvents } from '../../constants/events';
import { InlineEditText } from '../common/InlineEditText';
import { SessionIndicators } from '../SessionIndicators';
import { acpListSessions, acpRenameSession, type SessionListItem } from '../../acp/sessions';
import { useAwaitingApprovalSessions } from '../../acp/permissionRequests';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { formatMessageTimestamp } from '../../utils/timeUtils';
import { cn } from '../../utils';
import {
  ALL,
  ELSEWHERE,
  filterSessions,
  groupByDay,
  mergeSearchResults,
  repoChips,
  repositoryOf,
  sortSessions,
  tempRoots,
  withAwaitingFirst,
  type DayGroup,
  type SortMode,
} from '../../workspace/sidebar-sessions';
import { defineMessages, useIntl } from '../../i18n';
import { markSessionRead, useUnreadSessions } from '../../notifications';

type StreamState = 'idle' | 'loading' | 'streaming' | 'error';

interface SessionStatus {
  streamState: StreamState;
  hasUnreadActivity: boolean;
}

const i18n = defineMessages({
  chats: {
    id: 'navigationPanel.chats',
    defaultMessage: 'Chats',
  },
  noChats: {
    id: 'navigationPanel.noChats',
    defaultMessage: 'No recent chats',
  },
  noMatch: { id: 'navigationPanel.noMatch', defaultMessage: 'No chats match' },
  searchEmpty: {
    id: 'navigationPanel.searchEmpty',
    defaultMessage: 'No chats match "{query}" in titles or conversations.',
  },
  searchTitlesGroup: { id: 'navigationPanel.searchTitlesGroup', defaultMessage: 'Titles' },
  searchTranscriptGroup: {
    id: 'navigationPanel.searchTranscriptGroup',
    defaultMessage: 'In the conversation',
  },
  searchPlaceholder: { id: 'navigationPanel.searchPlaceholder', defaultMessage: 'Search chats' },
  searchLabel: { id: 'navigationPanel.searchLabel', defaultMessage: 'Search chats (/)' },
  clearSearch: { id: 'navigationPanel.clearSearch', defaultMessage: 'Clear search' },
  newChat: { id: 'navigationPanel.newChat', defaultMessage: 'New chat (⌘N)' },
  showAll: { id: 'navigationPanel.showAll', defaultMessage: 'Show all' },
  tabChats: { id: 'navigationPanel.tabChats', defaultMessage: 'Chats' },
  tabLibrary: { id: 'navigationPanel.tabLibrary', defaultMessage: 'Library' },
  tabAutomate: { id: 'navigationPanel.tabAutomate', defaultMessage: 'Automate' },
  tabSettings: { id: 'navigationPanel.tabSettings', defaultMessage: 'Settings' },
  chipAll: { id: 'navigationPanel.chipAll', defaultMessage: 'All' },
  chipElsewhere: { id: 'navigationPanel.chipElsewhere', defaultMessage: 'Elsewhere' },
  sortLabel: { id: 'navigationPanel.sortLabel', defaultMessage: 'Sort chats' },
  sortRecent: { id: 'navigationPanel.sortRecent', defaultMessage: 'Recent' },
  sortName: { id: 'navigationPanel.sortName', defaultMessage: 'Name' },
  sortProject: { id: 'navigationPanel.sortProject', defaultMessage: 'Project' },
  dayToday: { id: 'navigationPanel.dayToday', defaultMessage: 'Today' },
  dayYesterday: { id: 'navigationPanel.dayYesterday', defaultMessage: 'Yesterday' },
  untitledSession: {
    id: 'navigationPanel.untitledSession',
    defaultMessage: 'Untitled session',
  },
  metaModel: {
    id: 'navigationPanel.metaModel',
    defaultMessage: 'Model',
  },
  metaDirectory: {
    id: 'navigationPanel.metaDirectory',
    defaultMessage: 'Directory',
  },
  metaStatus: {
    id: 'navigationPanel.metaStatus',
    defaultMessage: 'Status',
  },
  metaCreated: {
    id: 'navigationPanel.metaCreated',
    defaultMessage: 'Created',
  },
  metaUpdated: {
    id: 'navigationPanel.metaUpdated',
    defaultMessage: 'Updated',
  },
  statusStreaming: {
    id: 'navigationPanel.statusStreaming',
    defaultMessage: 'Streaming',
  },
  statusError: {
    id: 'navigationPanel.statusError',
    defaultMessage: 'Error',
  },
  statusUnread: {
    id: 'navigationPanel.statusUnread',
    defaultMessage: 'Unread activity',
  },
  statusIdle: {
    id: 'navigationPanel.statusIdle',
    defaultMessage: 'Idle',
  },
  statusNeedsYou: {
    id: 'navigationPanel.statusNeedsYou',
    defaultMessage: 'Needs your approval',
  },
  needsYou: {
    id: 'navigationPanel.needsYou',
    defaultMessage: 'Needs you',
  },
  returnToActiveLiveVoice: {
    id: 'liveVoice.returnToActive',
    defaultMessage: 'Return to active Live voice',
  },
});

const navItemClass = (active: boolean) =>
  cn(
    'flex flex-row items-center gap-3 outline-none no-drag w-full',
    'rounded-full px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-background-tertiary text-text-primary'
      : 'text-text-primary hover:bg-background-tertiary/60'
  );

interface NavRowProps {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}

const NavRow: React.FC<NavRowProps> = ({ item, active, onClick }) => {
  const intl = useIntl();
  const Icon = item.icon;
  return (
    <button onClick={onClick} className={navItemClass(active)}>
      <Icon className="w-5 h-5 flex-shrink-0 text-text-secondary" />
      <span className="text-left flex-1 truncate">{getNavItemLabel(item, intl)}</span>
      {item.getTag && (
        <span className="text-xs font-mono text-text-secondary">{item.getTag()}</span>
      )}
    </button>
  );
};

interface SessionRowProps {
  session: SessionListItem;
  // The row's second line (task 150): the repo, and the worktree slug when it has one.
  repoLabel: string;
  slug: string | null;
  active: boolean;
  isLiveVoiceActive: boolean;
  status: SessionStatus | undefined;
  // Finished while no window was focused (task 68); outlives the window, unlike `status`.
  finishedUnread: boolean;
  // A tool call is waiting on this session, in any window (task 167).
  awaitingApproval: boolean;
  onClick: () => void;
  onRenamed: () => void;
}

const TAB_KEY = 'sidebar-tab';
const REPO_KEY = 'sidebar-repo';
const SORT_KEY = 'sidebar-sort';
// Search groups (task 171): title matches first, then the server's transcript matches.
// Untranslated on purpose — `dayLabel` translates them, `data-testid` stays on the raw value
// like the day headings' own 'Today'/'Yesterday' already do.
const TITLES_GROUP = 'Titles';
const TRANSCRIPT_GROUP = 'In the conversation';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage disabled: the choice lives for this window.
  }
}

const formatTimestamp = (value?: string): string | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return formatMessageTimestamp(parsed / 1000);
};

const MetaRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex gap-2">
    <span className="text-text-inverse/60 flex-shrink-0">{label}</span>
    <span className="text-right ml-auto break-all">{value}</span>
  </div>
);

interface SessionTooltipContentProps {
  session: SessionListItem;
  statusLabel: string;
}

const SessionTooltipContent: React.FC<SessionTooltipContentProps> = ({ session, statusLabel }) => {
  const intl = useIntl();
  const model = session.modelId
    ? session.providerId
      ? `${session.modelId} (${session.providerId})`
      : session.modelId
    : session.providerId;
  const created = formatTimestamp(session.createdAt);
  const updated = formatTimestamp(session.lastMessageAt ?? session.updatedAt);

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="font-medium break-words">
        {session.name || intl.formatMessage(i18n.untitledSession)}
      </div>
      <div className="flex flex-col gap-0.5">
        {model && <MetaRow label={intl.formatMessage(i18n.metaModel)} value={model} />}
        {session.workingDir && (
          <MetaRow label={intl.formatMessage(i18n.metaDirectory)} value={session.workingDir} />
        )}
        <MetaRow label={intl.formatMessage(i18n.metaStatus)} value={statusLabel} />
        {created && <MetaRow label={intl.formatMessage(i18n.metaCreated)} value={created} />}
        {updated && <MetaRow label={intl.formatMessage(i18n.metaUpdated)} value={updated} />}
      </div>
    </div>
  );
};

const SessionRow: React.FC<SessionRowProps> = ({
  session,
  repoLabel,
  slug,
  active,
  isLiveVoiceActive,
  status,
  finishedUnread,
  awaitingApproval,
  onClick,
  onRenamed,
}) => {
  const intl = useIntl();
  const [isEditing, setIsEditing] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const isStreaming = status?.streamState === 'streaming';
  const hasError = status?.streamState === 'error';
  const hasUnread = (status?.hasUnreadActivity ?? false) || finishedUnread;

  const statusLabel = awaitingApproval
    ? intl.formatMessage(i18n.statusNeedsYou)
    : isStreaming
      ? intl.formatMessage(i18n.statusStreaming)
      : hasError
        ? intl.formatMessage(i18n.statusError)
        : hasUnread
          ? intl.formatMessage(i18n.statusUnread)
          : intl.formatMessage(i18n.statusIdle);

  return (
    <Tooltip open={tooltipOpen && !isEditing} onOpenChange={setTooltipOpen} delayDuration={400}>
      <TooltipTrigger asChild>
        <div
          onClick={() => !isEditing && onClick()}
          data-active={active}
          data-awaiting={awaitingApproval}
          data-testid={`sidebar-session-${session.id}`}
          className={cn(
            'session-row flex flex-col gap-0.5 px-3 py-1.5 rounded-lg cursor-pointer text-sm',
            'hover:bg-background-tertiary/60 transition-colors',
            awaitingApproval &&
              'bg-amber-50/80 dark:bg-amber-900/20 ring-1 ring-inset ring-amber-200/70 dark:ring-amber-800/40',
            active && 'bg-background-tertiary'
          )}
        >
          <div className="flex items-center gap-2">
            <InlineEditText
              value={session.name}
              onSave={async (newName) => {
                await acpRenameSession(session.id, newName);
                window.dispatchEvent(
                  new CustomEvent(AppEvents.SESSION_RENAMED, {
                    detail: { sessionId: session.id, newName, userInitiated: true },
                  })
                );
                onRenamed();
              }}
              placeholder={intl.formatMessage(i18n.untitledSession)}
              disabled={isStreaming}
              singleClickEdit={false}
              className="truncate text-text-primary flex-1 !px-0 !py-0 hover:bg-transparent"
              editClassName="!text-sm"
              onEditStart={() => setIsEditing(true)}
              onEditEnd={() => setIsEditing(false)}
            />
            {isLiveVoiceActive && (
              <AudioLines
                className="w-3.5 h-3.5 flex-shrink-0 text-blue-500"
                aria-label={intl.formatMessage(i18n.returnToActiveLiveVoice)}
              />
            )}
            {awaitingApproval ? (
              <AlertTriangle
                className="w-3.5 h-3.5 flex-shrink-0 text-amber-500"
                aria-label={intl.formatMessage(i18n.statusNeedsYou)}
              />
            ) : (
              <SessionIndicators
                isStreaming={isStreaming}
                hasUnread={hasUnread}
                hasError={hasError}
              />
            )}
            {awaitingApproval ? (
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap">
                {intl.formatMessage(i18n.needsYou)}
              </span>
            ) : (
              <span className="text-xs text-text-tertiary whitespace-nowrap">
                {formatTimestamp(session.lastMessageAt ?? session.updatedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-text-tertiary truncate">
            <span className="truncate">{repoLabel}</span>
            {slug && <span className="font-mono">· wt/{slug}</span>}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" className="max-w-xs text-left">
        <SessionTooltipContent session={session} statusLabel={statusLabel} />
      </TooltipContent>
    </Tooltip>
  );
};

export const Navigation: React.FC<{
  className?: string;
  // Live voice reaches the sidebar from App.tsx's controller; the workspace shell renders
  // the sidebar without one (fork).
  activeLiveVoiceSessionId?: string | null;
}> = ({ className, activeLiveVoiceSessionId = null }) => {
  const intl = useIntl();
  const { isNavExpanded } = useNavigationContext();
  const location = useLocation();
  const { extensionsList } = useConfig();

  const appsExtensionEnabled = !!extensionsList?.find((ext) => ext.name === 'apps')?.enabled;

  const visibleItems = useMemo<NavItem[]>(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.path === '/apps') return appsExtensionEnabled;
      return true;
    });
  }, [appsExtensionEnabled]);

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname]);

  const { recentSessions, activeSessionId, fetchSessions, handleNavClick, handleSessionClick } =
    useNavigationSessions();

  const [sessionStatuses, setSessionStatuses] = useState<Map<string, SessionStatus>>(new Map());
  const unreadSessions = useUnreadSessions();
  const awaitingApproval = useAwaitingApprovalSessions();

  useEffect(() => {
    const handleStatusUpdate = (event: Event) => {
      const { sessionId, streamState } = (event as CustomEvent).detail;
      setSessionStatuses((prev) => {
        const existing = prev.get(sessionId);
        const shouldMarkUnread = existing?.streamState === 'streaming' && streamState === 'idle';
        const next = new Map(prev);
        next.set(sessionId, {
          streamState,
          hasUnreadActivity: existing?.hasUnreadActivity || shouldMarkUnread,
        });
        return next;
      });
    };

    window.addEventListener(AppEvents.SESSION_STATUS_UPDATE, handleStatusUpdate);
    return () => window.removeEventListener(AppEvents.SESSION_STATUS_UPDATE, handleStatusUpdate);
  }, []);

  const clearUnread = useCallback((sessionId: string) => {
    markSessionRead(sessionId);
    setSessionStatuses((prev) => {
      const status = prev.get(sessionId);
      if (status?.hasUnreadActivity) {
        const next = new Map(prev);
        next.set(sessionId, { ...status, hasUnreadActivity: false });
        return next;
      }
      return prev;
    });
  }, []);

  const navFocusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNavExpanded) {
      fetchSessions();
      requestAnimationFrame(() => navFocusRef.current?.focus());
    }
  }, [isNavExpanded, fetchSessions]);

  // The rail's tab (task 149), remembered; Settings is a route and reads active from it.
  const [tab, setTab] = useState<SidebarTab>(() => {
    try {
      const saved = window.localStorage.getItem(TAB_KEY);
      return saved === 'library' || saved === 'automate' ? saved : 'chats';
    } catch {
      return 'chats';
    }
  });
  const pickTab = useCallback(
    (next: SidebarTab) => {
      if (next === 'settings') {
        handleNavClick(SETTINGS_NAV_ITEM.path);
        return;
      }
      setTab(next);
      try {
        window.localStorage.setItem(TAB_KEY, next);
      } catch {
        // Storage disabled: the tab lives for this window.
      }
    },
    [handleNavClick]
  );
  const activeTab: SidebarTab = isActive(SETTINGS_NAV_ITEM.path) ? 'settings' : tab;
  const tabRefs = useRef<Map<SidebarTab, HTMLButtonElement>>(new Map());
  const onTabKey = useCallback((event: React.KeyboardEvent, current: SidebarTab) => {
    const order: SidebarTab[] = ['chats', 'library', 'automate', 'settings'];
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = order[(order.indexOf(current) + step + order.length) % order.length];
    tabRefs.current.get(next)?.focus();
  }, []);

  // The Chats panel (task 150): search, the pressed repo chip, the sort, all remembered but
  // the search.
  const [query, setQuery] = useState('');
  const [repo, setRepo] = useState<string>(() => readStored(REPO_KEY) ?? ALL);
  const [sort, setSort] = useState<SortMode>(() => {
    const saved = readStored(SORT_KEY);
    return saved === 'name' || saved === 'project' ? saved : 'recent';
  });
  const searchRef = useRef<HTMLInputElement>(null);
  // macOS's $TMPDIR sits under /var/folders, one of the built-in roots.
  const roots = useMemo(() => tempRoots(), []);
  const chips = useMemo(() => repoChips(recentSessions, roots), [recentSessions, roots]);
  const repoKey = chips.some((chip) => chip.key === repo) ? repo : ALL;
  const listed = useMemo(
    () =>
      sortSessions(filterSessions(recentSessions, { repo: repoKey, query }, roots), sort, roots),
    [recentSessions, repoKey, query, sort, roots]
  );

  // The transcript half of search (task 171): debounced, asks the server for a keyword
  // match in message text. Titles stay local — `listed` above already has them, bounded to
  // the recent sessions this sidebar keeps.
  const searching = query.trim().length > 0;
  const debouncedQuery = useDebouncedValue(query, 250);
  const [transcriptMatches, setTranscriptMatches] = useState<SessionListItem[]>([]);
  const searchGenerationRef = useRef(0);
  useEffect(() => {
    const keyword = debouncedQuery.trim();
    if (!keyword) {
      setTranscriptMatches([]);
      return;
    }
    const generation = ++searchGenerationRef.current;
    acpListSessions(undefined, { keyword, includeAcp: false })
      .then((page) => {
        if (searchGenerationRef.current === generation) setTranscriptMatches(page.sessions);
      })
      .catch((error) => {
        console.error('Failed to search session transcripts:', error);
        if (searchGenerationRef.current === generation) setTranscriptMatches([]);
      });
  }, [debouncedQuery]);

  const searchGroups = useMemo((): DayGroup[] => {
    if (!searching) return [];
    const inRepo =
      repoKey === ALL
        ? transcriptMatches
        : transcriptMatches.filter(
            (session) => repositoryOf(session.workingDir, roots).key === repoKey
          );
    const merged = mergeSearchResults(listed, inRepo);
    const groups: DayGroup[] = [];
    if (merged.titles.length > 0) groups.push({ label: TITLES_GROUP, sessions: merged.titles });
    if (merged.transcripts.length > 0) {
      groups.push({ label: TRANSCRIPT_GROUP, sessions: merged.transcripts });
    }
    return groups;
  }, [searching, listed, transcriptMatches, repoKey, roots]);

  const days = useMemo(() => {
    if (searching) return searchGroups;
    if (sort !== 'recent') return [{ label: '', sessions: listed }];
    return groupByDay(listed, Date.now(), intl.locale).map((day) => ({
      ...day,
      sessions: withAwaitingFirst(day.sessions, awaitingApproval),
    }));
  }, [searching, searchGroups, sort, listed, intl.locale, awaitingApproval]);

  const searchEmpty = searching && searchGroups.length === 0;

  // `/` focuses the search from anywhere in the rail's window, ⌘N starts a chat.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        handleNavClick(NEW_CHAT_PATH);
        return;
      }
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        pickTab('chats');
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNavClick, pickTab]);

  if (!isNavExpanded) return null;

  const dayLabel = (label: string) =>
    label === 'Today'
      ? intl.formatMessage(i18n.dayToday)
      : label === 'Yesterday'
        ? intl.formatMessage(i18n.dayYesterday)
        : label === TITLES_GROUP
          ? intl.formatMessage(i18n.searchTitlesGroup)
          : label === TRANSCRIPT_GROUP
            ? intl.formatMessage(i18n.searchTranscriptGroup)
            : label;
  const chipLabel = (chip: { key: string; label: string }) =>
    chip.key === ALL
      ? intl.formatMessage(i18n.chipAll)
      : chip.key === ELSEWHERE
        ? intl.formatMessage(i18n.chipElsewhere)
        : chip.label;
  const rows = (items: NavItem[]) => (
    <div className="px-2 flex flex-col gap-0.5">
      {items.map((item) => (
        <NavRow
          key={item.id}
          item={item}
          active={isActive(item.path)}
          onClick={() => handleNavClick(item.path)}
        />
      ))}
    </div>
  );
  const tabs: { id: SidebarTab; label: string; Icon: typeof MessageSquare }[] = [
    { id: 'chats', label: intl.formatMessage(i18n.tabChats), Icon: MessageSquare },
    { id: 'library', label: intl.formatMessage(i18n.tabLibrary), Icon: LibraryBig },
    { id: 'automate', label: intl.formatMessage(i18n.tabAutomate), Icon: Clock },
    { id: 'settings', label: intl.formatMessage(i18n.tabSettings), Icon: Settings },
  ];

  return (
    <motion.div
      ref={navFocusRef}
      tabIndex={-1}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className={cn('bg-background-primary outline-none flex flex-col h-full', className)}
      data-testid="sidebar"
      data-tab={activeTab}
    >
      <div className="h-[48px] no-drag" />

      {activeTab === 'chats' || activeTab === 'settings' ? (
        <div role="tabpanel" id="sidebar-panel-chats" className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <label className="flex items-center gap-2 flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-border-secondary bg-background-primary text-text-tertiary focus-within:border-border-primary">
              <Search className="w-3.5 h-3.5 flex-shrink-0" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setQuery('');
                    event.currentTarget.blur();
                  }
                }}
                placeholder={intl.formatMessage(i18n.searchPlaceholder)}
                aria-label={intl.formatMessage(i18n.searchLabel)}
                data-testid="sidebar-search"
                className="w-full min-w-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={intl.formatMessage(i18n.clearSearch)}
                  className="text-text-tertiary hover:text-text-primary"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={() => handleNavClick(NEW_CHAT_PATH)}
              aria-label={intl.formatMessage(i18n.newChat)}
              title={intl.formatMessage(i18n.newChat)}
              data-testid="sidebar-new-chat"
              className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg border border-border-secondary text-text-primary hover:bg-background-tertiary/60"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {chips.length > 2 && (
            <div
              className="flex gap-1.5 px-3 pb-2 overflow-x-auto [scrollbar-width:none]"
              role="group"
            >
              {chips.map((chip) => {
                const pressed = chip.key === repoKey;
                const testKey = chip.key === ALL || chip.key === ELSEWHERE ? chip.key : chip.label;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => {
                      setRepo(chip.key);
                      writeStored(REPO_KEY, chip.key);
                    }}
                    data-testid={`sidebar-chip-${testKey}`}
                    className={cn(
                      'h-6 px-2.5 rounded-full border text-xs font-medium whitespace-nowrap transition-colors',
                      pressed
                        ? 'border-background-inverse bg-background-inverse text-text-inverse'
                        : 'border-border-secondary text-text-secondary hover:text-text-primary'
                    )}
                  >
                    {chipLabel(chip)}
                    <span className={cn('ml-1', pressed ? 'opacity-80' : 'text-text-tertiary')}>
                      {chip.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
            {recentSessions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-text-secondary">
                {intl.formatMessage(i18n.noChats)}
              </div>
            ) : (searching ? searchEmpty : listed.length === 0) ? (
              <div className="px-3 py-2 text-xs text-text-secondary" data-testid="sidebar-no-match">
                {searching
                  ? intl.formatMessage(i18n.searchEmpty, { query: query.trim() })
                  : intl.formatMessage(i18n.noMatch)}
              </div>
            ) : (
              days.map((day, index) => (
                <React.Fragment key={day.label || 'flat'}>
                  <div
                    className="flex items-center justify-between px-3 pt-2 pb-0.5"
                    data-testid={day.label ? `sidebar-day-${day.label}` : undefined}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      {dayLabel(day.label)}
                    </span>
                    {index === 0 && !searching && (
                      <select
                        value={sort}
                        onChange={(event) => {
                          const next = event.target.value as SortMode;
                          setSort(next);
                          writeStored(SORT_KEY, next);
                        }}
                        aria-label={intl.formatMessage(i18n.sortLabel)}
                        data-testid="sidebar-sort"
                        className="bg-transparent text-[11px] text-text-secondary outline-none cursor-pointer"
                      >
                        <option value="recent">{intl.formatMessage(i18n.sortRecent)}</option>
                        <option value="name">{intl.formatMessage(i18n.sortName)}</option>
                        <option value="project">{intl.formatMessage(i18n.sortProject)}</option>
                      </select>
                    )}
                  </div>
                  {day.sessions.map((session) => {
                    const where = repositoryOf(session.workingDir, roots);
                    return (
                      <SessionRow
                        key={session.id}
                        session={session}
                        repoLabel={
                          where.key === ELSEWHERE
                            ? intl.formatMessage(i18n.chipElsewhere)
                            : where.label
                        }
                        slug={where.slug}
                        active={session.id === activeSessionId}
                        isLiveVoiceActive={session.id === activeLiveVoiceSessionId}
                        status={sessionStatuses.get(session.id)}
                        finishedUnread={unreadSessions.has(session.id)}
                        awaitingApproval={awaitingApproval.has(session.id)}
                        onClick={() => {
                          clearUnread(session.id);
                          handleSessionClick(session.id);
                        }}
                        onRenamed={fetchSessions}
                      />
                    );
                  })}
                </React.Fragment>
              ))
            )}
            {recentSessions.length > 0 && (
              <button
                type="button"
                onClick={() => handleNavClick(SESSION_HISTORY_PATH)}
                data-testid="sidebar-show-all"
                className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary"
              >
                {intl.formatMessage(i18n.showAll)}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div
          role="tabpanel"
          id={`sidebar-panel-${activeTab}`}
          className="flex-1 min-h-0 overflow-y-auto"
        >
          {rows(visibleItems.filter((item) => item.tab === activeTab))}
        </div>
      )}

      <div
        role="tablist"
        aria-label={intl.formatMessage(i18n.chats)}
        className="flex border-t border-border-secondary px-1.5 py-0.5"
        data-testid="sidebar-tabs"
      >
        {tabs.map(({ id, label, Icon }) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              ref={(el) => {
                if (el) tabRefs.current.set(id, el);
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={id === 'settings' ? undefined : `sidebar-panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => pickTab(id)}
              onKeyDown={(event) => onTabKey(event, id)}
              data-testid={`sidebar-tab-${id}`}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-[10px] font-semibold transition-colors no-drag',
                selected
                  ? 'text-text-primary bg-background-tertiary'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              <Icon className="w-[18px] h-[18px]" />
              {label}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
};
