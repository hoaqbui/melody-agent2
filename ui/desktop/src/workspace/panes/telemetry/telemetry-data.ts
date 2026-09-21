// The one read the Trends card and Over time share (task 132): every session on this Mac and
// the project's ledger, loaded once per cwd and re-read on demand.

import { useCallback, useEffect, useState } from 'react';
import { acpListSessions, type SessionListItem } from '../../../acp/sessions';
import { readLedger, type LedgerEvent } from '../../../native/ledger';

export interface TelemetryData {
  sessions: SessionListItem[];
  events: LedgerEvent[];
}

export async function loadTelemetryData(cwd: string): Promise<TelemetryData> {
  const sessions: SessionListItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 40; page++) {
    const result = await acpListSessions(cursor, { includeAcp: true });
    sessions.push(...result.sessions);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  const events = await readLedger(cwd).catch(() => [] as LedgerEvent[]);
  return { sessions, events };
}

export function useTelemetryData(cwd: string): {
  data: TelemetryData | null;
  error: string | null;
  retry(): void;
} {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadTelemetryData(cwd)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [cwd, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, error, retry };
}
