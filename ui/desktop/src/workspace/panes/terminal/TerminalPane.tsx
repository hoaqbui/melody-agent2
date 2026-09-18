// The Terminal pane (PRD step 6, step 13): the session's shell over the sidecar pty, a key
// bar at phone width, and the shell's state as one line under it (DESIGN.md §States).

import { useEffect, useRef, useSyncExternalStore, type PointerEvent, useState } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { useTheme } from '../../../contexts/ThemeContext';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../utils';
import { usePaneContext } from '../../pane-context';
import { PHONE_MAX_WIDTH_PX } from '../../pane-store';
import { BAR_KEYS, keySequence, type BarKey } from './terminal-keys';
import { terminalSession } from './terminal-session';
import { getTabs, getActiveTabId, openTab, closeTab, renameTab, setActiveTab, ptyId } from './terminal-tabs';

const i18n = defineMessages({
  starting: { id: 'terminalPane.starting', defaultMessage: 'Starting shell…' },
  exited: { id: 'terminalPane.exited', defaultMessage: '[exited {code}]' },
  restart: { id: 'terminalPane.restart', defaultMessage: 'Restart' },
  reconnect: { id: 'terminalPane.reconnect', defaultMessage: 'Reconnect' },
  keyBar: { id: 'terminalPane.keyBar', defaultMessage: 'Terminal keys' },
  esc: { id: 'terminalPane.esc', defaultMessage: 'Esc' },
  tab: { id: 'terminalPane.tab', defaultMessage: 'Tab' },
  ctrl: { id: 'terminalPane.ctrl', defaultMessage: 'Ctrl' },
  up: { id: 'terminalPane.up', defaultMessage: 'Up' },
  down: { id: 'terminalPane.down', defaultMessage: 'Down' },
  left: { id: 'terminalPane.left', defaultMessage: 'Left' },
  right: { id: 'terminalPane.right', defaultMessage: 'Right' },
  paste: { id: 'terminalPane.paste', defaultMessage: 'Paste' },
});

const KEY_GLYPHS: Record<BarKey, string> = {
  esc: 'Esc',
  tab: 'Tab',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
};

// DESIGN.md Floating Button Rule: a workspace control at rest floats on --shadow-sm.
const floating = 'shadow-[var(--shadow-sm)]';

const phoneQuery = `(max-width: ${PHONE_MAX_WIDTH_PX}px)`;

function usePhoneWidth(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(phoneQuery);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(phoneQuery).matches,
    () => false
  );
}

interface TerminalPaneProps {
  // The pty id on the sidecar; the chat session's id, so a reload or the phone reattaches.
  ptyId: string;
  cwd: string;
}

export function TerminalPane({ ptyId: baseId, cwd }: TerminalPaneProps) {
  const intl = useIntl();
  const { resolvedTheme } = useTheme();
  const { insertIntoChat, openFile } = usePaneContext();
  const phone = usePhoneWidth();
  const hostRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<ReturnType<typeof terminalSession> | null>(null);
  const [activeId, setActiveId] = useState(getActiveTabId(baseId));
  const [, setTabState] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [hasSelection, setHasSelection] = useState(false);

  const currentPtyId = ptyId(baseId, parseInt(activeId));
  const session = terminalSession(currentPtyId, cwd);
  sessionRef.current = session;

  const { status, ctrl } = useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState
  );

  useEffect(() => {
    const host = hostRef.current!;
    session.mount(host);
    session.connect();
    session.setLinkHandlers({
      openFile: (path, line) => openFile(path, line),
      openUrl: (url) => window.electron?.openExternal(url),
    });
    const unsubscribe = session.onSelectionChange(() => {
      setHasSelection(session.hasSelection());
    });
    const observer = new ResizeObserver(() => session.fit());
    observer.observe(host);
    return () => {
      observer.disconnect();
      session.unmount();
      unsubscribe();
    };
  }, [session, openFile]);

  useEffect(() => {
    session.syncTheme(resolvedTheme);
  }, [session, resolvedTheme]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen && session.search && searchText) {
      session.search.findNext(searchText, {
        decorations: {
          matchBackground: 'rgba(255, 200, 0, 0.3)',
          matchOverviewRuler: '',
          activeMatchColorOverviewRuler: '',
        },
      });
    }
  }, [searchOpen, searchText, session.search]);

  const keepTerminalFocus = (event: PointerEvent) => event.preventDefault();

  const pressKey = (key: BarKey) => {
    session.input(keySequence(key));
    session.focus();
  };

  const pasteClipboard = async () => {
    const text = await navigator.clipboard.readText();
    if (text) session.paste(text);
    session.focus();
  };

  const handleTabClick = (id: string) => {
    setActiveTab(baseId, id);
    setActiveId(id);
    setTimeout(() => session.focus(), 0);
  };

  const handleNewTab = () => {
    const newId = openTab(baseId, 'zsh');
    setActiveId(newId);
    setTabState((s) => s + 1);
  };

  const handleCloseTab = (id: string) => {
    const pId = ptyId(baseId, parseInt(id));
    const s = terminalSession(pId, cwd);
    s.dispose();
    closeTab(baseId, id);
    setActiveId(getActiveTabId(baseId));
    setTabState((s) => s + 1);
  };

  const handleRenameTab = (id: string) => {
    const tab = getTabs(baseId).find((t) => t.id === id);
    if (!tab) return;
    // eslint-disable-next-line no-undef
    const newName = prompt('Rename tab:', tab.name);
    if (newName !== null && newName !== '') {
      renameTab(baseId, id, newName);
      setTabState((s) => s + 1);
    }
  };

  const handleSendToChat = () => {
    const text = session.getSelection();
    if (text) {
      insertIntoChat({ kind: 'text', text, source: { path: 'terminal' } });
    }
  };

  const tabs = getTabs(baseId);

  return (
    <div className="flex h-full flex-col bg-background-primary" data-testid="terminal-pane">
      <div className="flex items-center border-b border-border-primary px-2 py-1" role="tablist" data-testid="terminal-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            aria-pressed={tab.id === activeId}
            data-testid={`terminal-tab-${tab.id}`}
            className={cn(
              'group flex items-center gap-1 px-3 py-1 text-sm cursor-pointer rounded',
              tab.id === activeId
                ? 'bg-background-secondary text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            )}
            onClick={() => handleTabClick(tab.id)}
            onDoubleClick={() => handleRenameTab(tab.id)}
          >
            <span>{tab.name}</span>
            <button
              className="ml-1 opacity-0 group-hover:opacity-100 text-xs hover:text-danger"
              onClick={(e) => {
                e.stopPropagation();
                handleCloseTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <Button
          variant="outline"
          size="xs"
          className={cn(floating, 'ml-auto')}
          data-testid="terminal-tab-new"
          onClick={handleNewTab}
        >
          +
        </Button>
      </div>

      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden px-2 pt-2" />

      {searchOpen && (
        <div className="flex items-center gap-2 border-t border-border-primary px-3 py-2">
          <input
            ref={searchInputRef}
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.shiftKey && session.search) {
                  session.search.findPrevious(searchText, {
                    decorations: {
                      matchBackground: 'rgba(255, 200, 0, 0.3)',
                      matchOverviewRuler: '',
                      activeMatchColorOverviewRuler: '',
                    },
                  });
                } else if (session.search) {
                  session.search.findNext(searchText, {
                    decorations: {
                      matchBackground: 'rgba(255, 200, 0, 0.3)',
                      matchOverviewRuler: '',
                      activeMatchColorOverviewRuler: '',
                    },
                  });
                }
              } else if (e.key === 'Escape') {
                setSearchOpen(false);
                session.focus();
              }
            }}
            placeholder="Find…"
            data-testid="terminal-search"
            className="flex-1 min-w-0 rounded border border-border-primary bg-background-primary px-2 py-1 text-sm"
          />
          <span className="text-xs text-text-secondary whitespace-nowrap" data-testid="terminal-search-count">
            —
          </span>
          <Button variant="outline" size="xs" onClick={() => { setSearchOpen(false); session.focus(); }}>
            ✕
          </Button>
        </div>
      )}

      {hasSelection && (
        <div className="flex items-center gap-2 border-t border-border-primary px-3 py-1 text-xs">
          <Button
            variant="outline"
            size="xs"
            className={floating}
            data-testid="terminal-send"
            onClick={handleSendToChat}
            onPointerDown={keepTerminalFocus}
          >
            Send to chat
          </Button>
        </div>
      )}

      {status.kind !== 'running' && (
        <div
          className="flex items-center gap-2 border-t border-border-primary px-3 py-1 text-xs text-text-secondary"
          role="status"
          data-testid="terminal-status"
        >
          {status.kind === 'starting' && intl.formatMessage(i18n.starting)}
          {status.kind === 'exited' && (
            <>
              <span>{intl.formatMessage(i18n.exited, { code: status.code })} —</span>
              <Button
                variant="outline"
                size="xs"
                className={floating}
                onClick={() => session.connect()}
              >
                {intl.formatMessage(i18n.restart)}
              </Button>
            </>
          )}
          {status.kind === 'lost' && (
            <>
              <span className="min-w-0 truncate">{status.reason} —</span>
              <Button
                variant="outline"
                size="xs"
                className={floating}
                onClick={() => session.connect()}
              >
                {intl.formatMessage(i18n.reconnect)}
              </Button>
            </>
          )}
        </div>
      )}
      {phone && (
        <div
          className="flex flex-wrap items-center gap-1 border-t border-border-primary px-2 py-1"
          role="toolbar"
          aria-label={intl.formatMessage(i18n.keyBar)}
          data-testid="terminal-key-bar"
        >
          {BAR_KEYS.slice(0, 2).map((key) => (
            <Button
              key={key}
              variant="outline"
              size="xs"
              className={floating}
              aria-label={intl.formatMessage(i18n[key])}
              onPointerDown={keepTerminalFocus}
              onClick={() => pressKey(key)}
            >
              {KEY_GLYPHS[key]}
            </Button>
          ))}
          <Button
            variant={ctrl ? 'secondary' : 'outline'}
            size="xs"
            className={cn(floating, ctrl && 'ring-[1px] ring-ring')}
            aria-pressed={ctrl}
            onPointerDown={keepTerminalFocus}
            onClick={() => session.setCtrl(!ctrl)}
          >
            {intl.formatMessage(i18n.ctrl)}
          </Button>
          {BAR_KEYS.slice(2).map((key) => (
            <Button
              key={key}
              variant="outline"
              size="xs"
              className={floating}
              aria-label={intl.formatMessage(i18n[key])}
              onPointerDown={keepTerminalFocus}
              onClick={() => pressKey(key)}
            >
              {KEY_GLYPHS[key]}
            </Button>
          ))}
          <Button
            variant="outline"
            size="xs"
            className={cn(floating, 'ml-auto')}
            onPointerDown={keepTerminalFocus}
            onClick={() => void pasteClipboard()}
          >
            {intl.formatMessage(i18n.paste)}
          </Button>
        </div>
      )}
    </div>
  );
}
