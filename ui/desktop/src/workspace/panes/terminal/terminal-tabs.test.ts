import { describe, it, expect, beforeEach } from 'vitest';
import {
  ptyId,
  openTab,
  closeTab,
  renameTab,
  setActiveTab,
  getTabs,
  getActiveTabId,
  deleteSessionTabs,
} from './terminal-tabs';

describe('terminal-tabs', () => {
  const sessionId = 'session-1';

  beforeEach(() => {
    deleteSessionTabs(sessionId);
  });

  it('creates ptyId from sessionId and tabIndex', () => {
    expect(ptyId(sessionId, 0)).toBe('session-1:0');
    expect(ptyId(sessionId, 1)).toBe('session-1:1');
    expect(ptyId('', 0)).toBe('0');
  });

  it('starts with one tab', () => {
    const tabs = getTabs(sessionId);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]!.id).toBe('0');
  });

  it('opens a new tab', () => {
    const tabId = openTab(sessionId, 'zsh');
    expect(tabId).toBe('1');
    const tabs = getTabs(sessionId);
    expect(tabs).toHaveLength(2);
    expect(tabs[1]!.name).toBe('zsh 1');
    expect(getActiveTabId(sessionId)).toBe('1');
  });

  it('closes a tab', () => {
    openTab(sessionId, 'zsh');
    closeTab(sessionId, '1');
    const tabs = getTabs(sessionId);
    expect(tabs).toHaveLength(1);
    expect(tabs[0]!.id).toBe('0');
  });

  it('maintains active tab on close', () => {
    openTab(sessionId, 'zsh');
    setActiveTab(sessionId, '0');
    closeTab(sessionId, '1');
    expect(getActiveTabId(sessionId)).toBe('0');
  });

  it('switches active tab to next when closing active', () => {
    openTab(sessionId, 'zsh');
    closeTab(sessionId, '0');
    expect(getActiveTabId(sessionId)).toBe('1');
  });

  it('renames a tab', () => {
    renameTab(sessionId, '0', 'custom');
    const tabs = getTabs(sessionId);
    expect(tabs[0]!.name).toBe('custom');
  });

  it('does not close last tab', () => {
    closeTab(sessionId, '0');
    const tabs = getTabs(sessionId);
    expect(tabs).toHaveLength(1);
  });
});
