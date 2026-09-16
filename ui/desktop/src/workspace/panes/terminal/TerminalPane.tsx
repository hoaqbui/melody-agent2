// The Terminal pane (PRD step 6, step 13): the session's shell over the sidecar pty, a key
// bar at phone width, and the shell's state as one line under it (DESIGN.md §States).

import { useEffect, useRef, useSyncExternalStore, type PointerEvent } from 'react';
import { defineMessages, useIntl } from '../../../i18n';
import { useTheme } from '../../../contexts/ThemeContext';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../utils';
import { PHONE_MAX_WIDTH_PX } from '../../pane-store';
import { BAR_KEYS, keySequence, type BarKey } from './terminal-keys';
import { terminalSession } from './terminal-session';

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

export function TerminalPane({ ptyId, cwd }: TerminalPaneProps) {
  const intl = useIntl();
  const { resolvedTheme } = useTheme();
  const phone = usePhoneWidth();
  const hostRef = useRef<HTMLDivElement>(null);
  const session = terminalSession(ptyId, cwd);
  const { status, ctrl } = useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState
  );

  useEffect(() => {
    const host = hostRef.current!;
    session.mount(host);
    session.connect();
    const observer = new ResizeObserver(() => session.fit());
    observer.observe(host);
    return () => {
      observer.disconnect();
      session.unmount();
    };
  }, [session]);

  useEffect(() => {
    session.syncTheme(resolvedTheme);
  }, [session, resolvedTheme]);

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

  return (
    <div className="flex h-full flex-col bg-background-primary" data-testid="terminal-pane">
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden px-2 pt-2" />
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
