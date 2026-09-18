import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2 } from 'lucide-react';
import { defineMessages, useIntl } from '../../i18n';
import { Button } from '../../components/ui/button';
import { probeRuntimes } from '../../native/runtimes.js';
import { seatState, overallGateState, SEAT_STATE_TO_DOM, type SeatStates, type RuntimesGateState } from './seat-state';
import { cn } from '../../utils';

export const RUNTIMES_GATE_TESTID = 'runtimes-gate';

const i18n = defineMessages({
  title: { id: 'runtimesGate.title', defaultMessage: 'Set up seats' },
  description: {
    id: 'runtimesGate.description',
    defaultMessage: 'Connect your AI runtimes so goose can pick the right one for each task',
  },
  claudeName: { id: 'runtimesGate.claudeName', defaultMessage: 'Claude' },
  codexName: { id: 'runtimesGate.codexName', defaultMessage: 'Codex' },
  cursorName: { id: 'runtimesGate.cursorName', defaultMessage: 'Cursor' },
  agyName: { id: 'runtimesGate.agyName', defaultMessage: 'agy' },
  install: { id: 'runtimesGate.install', defaultMessage: 'Install' },
  signIn: { id: 'runtimesGate.signIn', defaultMessage: 'Sign in' },
  recheck: { id: 'runtimesGate.recheck', defaultMessage: 'Recheck' },
  done: { id: 'runtimesGate.done', defaultMessage: 'Done' },
  couldntCheck: { id: 'runtimesGate.couldntCheck', defaultMessage: "Couldn't check" },
  ready: { id: 'runtimesGate.ready', defaultMessage: 'Ready' },
  signedOut: { id: 'runtimesGate.signedOut', defaultMessage: 'Signed out' },
  missing: { id: 'runtimesGate.missing', defaultMessage: 'Not installed' },
});

const floating = 'shadow-[var(--shadow-sm)]';

interface Seat {
  key: keyof SeatStates;
  name: keyof typeof i18n;
  installCmd: string;
  signInCmd: string;
}

const SEATS: Seat[] = [
  { key: 'claude', name: 'claudeName', installCmd: 'claude', signInCmd: 'claude login' },
  { key: 'codex', name: 'codexName', installCmd: 'codex', signInCmd: 'codex login' },
  { key: 'cursor', name: 'cursorName', installCmd: 'cursor-agent', signInCmd: 'cursor-agent login' },
  { key: 'agy', name: 'agyName', installCmd: 'agy', signInCmd: 'sign in through `agy` once in a terminal' },
];

export default function RuntimesGate() {
  const intl = useIntl();
  const navigate = useNavigate();
  const [state, setState] = useState<RuntimesGateState>('loading');
  const [seats, setSeats] = useState<SeatStates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isWebBuild = !/\bElectron\//.test(window.navigator.userAgent);
  const probe = async () => {
    try {
      setState('loading');
      setError(null);
      const response = await probeRuntimes();
      const newSeats = seatState(response);
      setSeats(newSeats);
      setState(overallGateState(newSeats));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  };

  useEffect(() => {
    void probe();
  }, []);

  const openTerminalWithInput = (cmd: string) => {
    navigate('/', { state: { openPane: 'terminal', terminalInput: cmd } });
  };

  const openExternal = (url: string) => {
    void window.electron.openExternal(url);
  };

  return (
    <div className="h-screen w-full bg-background-default flex items-center justify-center" data-testid={RUNTIMES_GATE_TESTID} data-state={state}>
      <div className="max-w-2xl w-full mx-auto px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-light mb-2">{intl.formatMessage(i18n.title)}</h1>
          <p className="text-text-secondary">{intl.formatMessage(i18n.description)}</p>
        </div>

        <div className="space-y-3 mb-8">
          {SEATS.map((seat) => {
            const seatStatus = seats?.[seat.key];
            const domState = seatStatus ? SEAT_STATE_TO_DOM[seatStatus.state] : undefined;
            return (
              <div
                key={seat.key}
                className="flex items-center justify-between p-4 rounded-lg bg-background-secondary border border-border-primary"
                data-testid={`runtimes-gate-row-${seat.key}`}
                data-seat-state={domState}
              >
                <div className="flex-1">
                  <div className="font-medium">{intl.formatMessage(i18n[seat.name])}</div>
                  {seatStatus && state !== 'loading' && (
                    <div className="text-xs text-text-secondary mt-1">
                      {seatStatus.state === 'ready' && intl.formatMessage(i18n.ready)}
                      {seatStatus.state === 'signin' && intl.formatMessage(i18n.signedOut)}
                      {seatStatus.state === 'install' && intl.formatMessage(i18n.missing)}
                      {seatStatus.detail && ` — ${seatStatus.detail}`}
                    </div>
                  )}
                  {state === 'loading' && (
                    <div className="text-xs text-text-secondary mt-1">
                      <Loader2 className="inline size-3 animate-spin" />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {state === 'loading' ? (
                    <Loader2 className="size-4 animate-spin text-text-tertiary" />
                  ) : seatStatus?.state === 'ready' ? (
                    <span className="text-xs text-text-secondary">Ready</span>
                  ) : seatStatus?.state === 'install' ? (
                    <Button
                      size="xs"
                      variant="outline"
                      data-testid={`runtimes-gate-install-${seat.key}`}
                      className={floating}
                      onClick={() => {
                        const url = seat.key === 'claude'
                          ? 'https://claude.ai/download'
                          : seat.key === 'codex'
                            ? 'https://codex.withexo.com'
                            : seat.key === 'cursor'
                              ? 'https://www.cursor.com'
                              : 'https://github.com/aaif-goose/agy';
                        openExternal(url);
                      }}
                    >
                      {intl.formatMessage(i18n.install)}
                    </Button>
                  ) : seatStatus?.state === 'signin' ? (
                    <Button
                      size="xs"
                      variant="outline"
                      data-testid={`runtimes-gate-sign-in-${seat.key}`}
                      className={floating}
                      onClick={() => openTerminalWithInput(seat.signInCmd)}
                    >
                      {intl.formatMessage(i18n.signIn)}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {state === 'error' && (
          <div className="mb-8 p-4 rounded-lg bg-background-secondary border border-border-danger">
            <div className="text-sm text-text-danger font-mono">
              {intl.formatMessage(i18n.couldntCheck)}
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={probe}
            data-testid="runtimes-gate-recheck"
            className={floating}
          >
            {intl.formatMessage(i18n.recheck)}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (isWebBuild) {
                navigate('/', { replace: true });
              } else {
                navigate('/', { replace: true });
              }
            }}
            disabled={state === 'loading' || state === 'unavailable'}
            data-testid="runtimes-gate-done"
            className={floating}
          >
            {intl.formatMessage(i18n.done)}
          </Button>
        </div>

        {isWebBuild && state === 'unavailable' && (
          <div className="mt-6 text-center text-sm text-text-secondary">
            Set up seats on your Mac: <span className="font-mono">{window.location.origin}</span>
          </div>
        )}
      </div>
    </div>
  );
}
