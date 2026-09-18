import type { RuntimesProbeResponse } from '../../native/runtimes.js';

export type SeatState = 'install' | 'signin' | 'ready';

export const RUNTIMES_GATE_STATES = [
  'empty',
  'loading',
  'partial',
  'error',
  'ready',
  'unavailable',
] as const;
export type RuntimesGateState = (typeof RUNTIMES_GATE_STATES)[number];

export interface SeatStatus {
  state: SeatState;
  detail?: string;
}

export interface SeatStates {
  claude: SeatStatus;
  codex: SeatStatus;
  cursor: SeatStatus;
  agy: SeatStatus;
}

export function seatState(probe: RuntimesProbeResponse): SeatStates {
  const mapSeat = (seat: {
    installed: boolean;
    signedIn: boolean;
    detail?: string;
  }): SeatStatus => {
    if (!seat.installed) {
      return { state: 'install' };
    }
    if (!seat.signedIn) {
      return { state: 'signin', detail: seat.detail };
    }
    return { state: 'ready', detail: seat.detail };
  };

  return {
    claude: mapSeat(probe.seat.claude),
    codex: mapSeat(probe.seat.codex),
    cursor: mapSeat(probe.seat.cursor),
    agy: mapSeat(probe.seat.agy),
  };
}

export function overallGateState(states: SeatStates): RuntimesGateState {
  const allReady = Object.values(states).every((s) => s.state === 'ready');
  if (allReady) {
    return 'ready';
  }

  const someReady = Object.values(states).some((s) => s.state === 'ready');
  if (someReady) {
    return 'partial';
  }

  return 'unavailable';
}
