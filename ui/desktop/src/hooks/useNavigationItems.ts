import {
  AppWindow,
  Clock,
  FileText,
  History,
  Kanban,
  MessageSquarePlus,
  Puzzle,
  Settings,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';

// The rail's tab a row lives under (task 149): Chats holds the list, Settings is a route.
export type SidebarTab = 'chats' | 'library' | 'automate' | 'settings';

export interface NavItem {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  tab: 'library' | 'automate';
  getTag?: () => string;
  tagAlign?: 'left' | 'right';
}

export const NEW_CHAT_PATH = '/';
export const SESSION_HISTORY_PATH = '/sessions';

/** The rows under the Library and Automate tabs; New chat and Session History are the
 *  Chats tab's own controls, Settings the fourth tab. */
export const NAV_ITEMS: NavItem[] = [
  { id: 'recipes', path: '/recipes', label: 'Recipes', icon: FileText, tab: 'library' },
  { id: 'skills', path: '/skills', label: 'Skills', icon: Zap, tab: 'library' },
  { id: 'apps', path: '/apps', label: 'Apps', icon: AppWindow, tab: 'library' },
  { id: 'extensions', path: '/extensions', label: 'Extensions', icon: Puzzle, tab: 'library' },
  { id: 'board', path: '/board', label: 'Board', icon: Kanban, tab: 'automate' },
  { id: 'scheduler', path: '/schedules', label: 'Scheduler', icon: Clock, tab: 'automate' },
];

export const HOME_NAV_ITEM: NavItem = {
  id: 'home',
  path: NEW_CHAT_PATH,
  label: 'New Chat',
  icon: MessageSquarePlus,
  tab: 'library',
};
export const SESSIONS_NAV_ITEM: NavItem = {
  id: 'sessions',
  path: SESSION_HISTORY_PATH,
  label: 'Session History',
  icon: History,
  tab: 'library',
};

/** Settings is rendered separately, pinned to the bottom of the sidebar. */
export const SETTINGS_NAV_ITEM: Omit<NavItem, 'tab'> = {
  id: 'settings',
  path: '/settings',
  label: 'Settings',
  icon: Settings,
};

// Translation descriptors for nav labels. Kept here next to NAV_ITEMS so the two
// stay in sync.
const navItemMessages = defineMessages({
  home: {
    id: 'navigation.itemHome',
    defaultMessage: 'New Chat',
  },
  recipes: {
    id: 'navigation.itemRecipes',
    defaultMessage: 'Recipes',
  },
  skills: {
    id: 'navigation.itemSkills',
    defaultMessage: 'Skills',
  },
  apps: {
    id: 'navigation.itemApps',
    defaultMessage: 'Apps',
  },
  scheduler: {
    id: 'navigation.itemScheduler',
    defaultMessage: 'Scheduler',
  },
  extensions: {
    id: 'navigation.itemExtensions',
    defaultMessage: 'Extensions',
  },
  board: {
    id: 'navigation.itemBoard',
    defaultMessage: 'Board',
  },
  sessions: {
    id: 'navigation.itemSessions',
    defaultMessage: 'Session History',
  },
  settings: {
    id: 'navigation.itemSettings',
    defaultMessage: 'Settings',
  },
});

const NAV_ITEM_MESSAGES: Record<string, MessageDescriptor> = navItemMessages;

/** Format a NavItem's label using the provided intl instance, falling back to `item.label`. */
export function getNavItemLabel(item: NavItem, intl: IntlShape): string {
  const descriptor = NAV_ITEM_MESSAGES[item.id];
  return descriptor ? intl.formatMessage(descriptor) : item.label;
}
