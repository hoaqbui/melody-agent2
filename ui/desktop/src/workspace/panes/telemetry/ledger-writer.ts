// The one subscriber that writes the ledger (task 127): on every change to a session's messages
// or delegations, append what they imply and was not written yet. Fire-and-forget — a failed
// append logs once and is retried on the next change; the chat never waits on it.

import { useEffect, useRef } from 'react';
import type { Delegation } from '../../../acp/delegations';
import { appendLedger, readLedger } from '../../../native/ledger';
import type { Message } from '../../../types/message';
import { heartbeatAtLaunch } from '../../project-storage';
import { eventKey, gapEvent, pendingEvents } from './ledger-events';

// Task 267's gap: checked once per app launch, at whichever session's ledger seeds first — a
// second workspace tab seeding later must not report the same closed hours again. A fresh
// launch reloads this module, so the flag needs no explicit reset.
let gapCheckedThisLaunch = false;

export function useLedgerWriter(
  sessionId: string,
  cwd: string,
  title: string,
  messages: readonly Message[] | undefined,
  delegations: readonly Delegation[]
): void {
  // Keys already on disk for this session, seeded once per session from the ledger itself.
  const written = useRef<{ sessionId: string; keys: Set<string>; seeded: boolean } | null>(null);
  const warned = useRef(false);

  useEffect(() => {
    if (!sessionId || !cwd) return;
    let cancelled = false;
    if (written.current?.sessionId !== sessionId) {
      written.current = { sessionId, keys: new Set(), seeded: false };
    }
    const state = written.current;
    const seed = state.seeded
      ? Promise.resolve()
      : readLedger(cwd)
          .then(async (events) => {
            for (const event of events)
              if (event.sessionId === sessionId) state.keys.add(eventKey(event));
            state.seeded = true;
            if (!gapCheckedThisLaunch) {
              gapCheckedThisLaunch = true;
              // `heartbeatAtLaunch` caches this cwd's pre-launch heartbeat the first time
              // anything reads it, so it is unaffected by whether this or the heartbeat
              // effect's own write happens first.
              const gap = gapEvent(sessionId, heartbeatAtLaunch(cwd));
              if (gap) await appendLedger(cwd, gap).catch(() => {});
            }
          })
          .catch(() => {
            // no sidecar, or no ledger yet: write from what we hold and dedupe in memory
            state.seeded = true;
          });
    void seed.then(async () => {
      if (cancelled || !messages) return;
      for (const event of pendingEvents(sessionId, title, messages, delegations, state.keys)) {
        const key = eventKey(event);
        state.keys.add(key);
        try {
          await appendLedger(cwd, event);
        } catch (error) {
          state.keys.delete(key);
          if (!warned.current) {
            warned.current = true;
            console.warn('ledger append failed; will retry on the next change', error);
          }
          return;
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, cwd, title, messages, delegations]);
}
