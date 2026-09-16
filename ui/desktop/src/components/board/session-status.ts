// Which sessions this window is streaming, from BaseChat's SESSION_STATUS_UPDATE events
// (task 67). The chat stays mounted across routes, so a session streaming while the Board
// is open keeps reporting; the map is kept at module level because the event fires only on
// a state change — a listener attached when the Board mounts would miss the stream already
// in flight.

import { useSyncExternalStore } from 'react';
import { AppEvents } from '../../constants/events';
import type { StreamState } from './board-state';

interface StatusDetail {
  sessionId: string;
  streamState: StreamState;
}

let streams: ReadonlyMap<string, StreamState> = new Map();
const listeners = new Set<() => void>();

export function applySessionStatus(detail: StatusDetail): void {
  if (streams.get(detail.sessionId) === detail.streamState) return;
  const next = new Map(streams);
  next.set(detail.sessionId, detail.streamState);
  streams = next;
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener(AppEvents.SESSION_STATUS_UPDATE, (event) =>
    applySessionStatus((event as CustomEvent<StatusDetail>).detail)
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSessionStreams(): ReadonlyMap<string, StreamState> {
  return useSyncExternalStore(
    subscribe,
    () => streams,
    () => streams
  );
}
