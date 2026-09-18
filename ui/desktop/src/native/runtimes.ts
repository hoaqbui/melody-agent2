import { sidecarFetch } from './sidecar.js';

export interface SeatProbe {
  installed: boolean;
  signedIn: boolean;
  detail?: string;
}

export interface RuntimesProbeResponse {
  seat: {
    claude: SeatProbe;
    codex: SeatProbe;
    cursor: SeatProbe;
    agy: SeatProbe;
  };
}

export async function probeRuntimes(): Promise<RuntimesProbeResponse> {
  return sidecarFetch<RuntimesProbeResponse>('/runtimes/probe');
}
