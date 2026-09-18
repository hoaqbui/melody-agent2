// Pure tab management for the Terminal pane: id minting, names, ordering.
// Tab state persists while the pane remounts (Nothing Lost Rule) via a
// per-session store outside React.

export interface TerminalTab {
  id: string;
  name: string;
}

export interface TabStoreState {
  tabs: TerminalTab[];
  activeId: string;
}

const tabStores = new Map<string, TabStoreState>();

function getStore(sessionId: string): TabStoreState {
  let store = tabStores.get(sessionId);
  if (!store) {
    store = { tabs: [{ id: '0', name: '' }], activeId: '0' };
    tabStores.set(sessionId, store);
  }
  return store;
}

export function deleteSessionTabs(sessionId: string): void {
  tabStores.delete(sessionId);
}

export function ptyId(sessionId: string, tabIndex: number): string {
  return sessionId ? `${sessionId}:${tabIndex}` : String(tabIndex);
}

export function openTab(sessionId: string, shell: string): string {
  const store = getStore(sessionId);
  const nextIndex = store.tabs.length;
  const tabId = String(nextIndex);
  store.tabs.push({ id: tabId, name: `${shell} ${nextIndex}` });
  store.activeId = tabId;
  return tabId;
}

export function closeTab(sessionId: string, tabId: string): void {
  const store = getStore(sessionId);
  const index = store.tabs.findIndex((t) => t.id === tabId);
  if (index === -1 || store.tabs.length === 1) return;

  store.tabs.splice(index, 1);
  if (store.activeId === tabId) {
    store.activeId = store.tabs[Math.min(index, store.tabs.length - 1)]!.id;
  }
}

export function renameTab(sessionId: string, tabId: string, name: string): void {
  const store = getStore(sessionId);
  const tab = store.tabs.find((t) => t.id === tabId);
  if (tab) {
    tab.name = name;
  }
}

export function setActiveTab(sessionId: string, tabId: string): void {
  const store = getStore(sessionId);
  if (store.tabs.find((t) => t.id === tabId)) {
    store.activeId = tabId;
  }
}

export function getTabs(sessionId: string): TerminalTab[] {
  return getStore(sessionId).tabs;
}

export function getActiveTabId(sessionId: string): string {
  return getStore(sessionId).activeId;
}
