// What the RPI strip derives without React (PRD step 11): which phase each delegated child
// belongs to, how many times a phase ran, what each phase reads and which child its click
// opens. The rows come from src/acp/delegations.ts (task 65), oldest first, as the Agents
// pane reads them (task 28); nothing here infers a status the wire did not carry.

import type { Delegation } from '../../acp/delegations';
import { canOpenTranscript } from '../panes/agents/agents-state';

// PRODUCT.md §8, in walk order.
export const PHASES = ['research', 'plan', 'implement', 'review'] as const;

export type Phase = (typeof PHASES)[number];

// PRD §States "RPI strip": dim never ran; active pulses; done and failed are lit, failed in
// danger and still clickable.
export type PhaseStatus = 'dim' | 'active' | 'done' | 'failed';

export interface PhaseView {
  phase: Phase;
  status: PhaseStatus;
  // How many times the phase ran; a second run reads ×2 beside the name, never a second strip.
  runs: number;
  // The child whose artifact the click opens; null while the phase has none yet.
  artifact: string | null;
}

// DESIGN.md §Shared component states, plus `ready` for a strip with nothing unresolved. The
// PRD's partial line — lit but not clickable, no artifact — is the loading state here: only a
// running child has no handoff yet, so no phase is lit and idle without one.
export const RPI_STRIP_STATES = ['empty', 'loading', 'error', 'ready'] as const;

export type RpiStripState = (typeof RPI_STRIP_STATES)[number];

// PRODUCT.md §6: the four worker roles map one to one; the Advisor and its four specialists
// (`advisor-*`) gate a phase rather than run one, so they light the phase most recently
// started — Research when none has (the first gate is the Brief's). Any other role is ad hoc
// and lights nothing.
export function phaseOfRole(source: string | undefined, lastPhase: Phase | null): Phase | null {
  switch (source) {
    case 'researcher':
      return 'research';
    case 'planner':
      return 'plan';
    case 'implementer':
      return 'implement';
    case 'reviewer':
      return 'review';
  }
  return isAdvisor(source) ? (lastPhase ?? 'research') : null;
}

function isAdvisor(source: string | undefined): boolean {
  return source === 'advisor' || (source?.startsWith('advisor-') ?? false);
}

// The same precedence as the Agents pane's paneState: a failure shows over a run in flight,
// which shows over a finished one. A row seeded on reload with no status ran and returned.
function runStatus(rows: readonly Delegation[]): PhaseStatus {
  if (rows.some((row) => row.status === 'failed')) return 'failed';
  if (rows.some((row) => row.status === 'running')) return 'active';
  return 'done';
}

// The phase's artifact is the worker's handoff (Brief, Plan, Result, Review), so a worker's
// row wins over an advisor's; a running child has none yet.
function runArtifact(rows: readonly Delegation[]): string | null {
  const openable = rows.filter(canOpenTranscript);
  const worker = openable.filter((row) => !isAdvisor(row.source));
  return (worker.at(-1) ?? openable.at(-1))?.subagentSessionId ?? null;
}

// Rows are grouped into runs per phase: consecutive children of one phase are one run
// (two researchers in parallel), and a child of a phase that already ran, arriving after a
// different phase started, opens a new run — Review FAIL → Implement reads Implement ×2.
// Advisors join the run of the phase they gate and never open one.
export function phaseViews(rows: readonly Delegation[]): PhaseView[] {
  const runs = new Map<Phase, Delegation[][]>(PHASES.map((phase) => [phase, []]));
  let lastPhase: Phase | null = null;
  for (const row of rows) {
    const phase = phaseOfRole(row.source, lastPhase);
    if (phase === null) continue;
    const phaseRuns = runs.get(phase)!;
    const advisor = isAdvisor(row.source);
    const reran = !advisor && phaseRuns.length > 0 && lastPhase !== null && lastPhase !== phase;
    if (phaseRuns.length === 0 || reran) phaseRuns.push([row]);
    else phaseRuns.at(-1)!.push(row);
    if (!advisor) lastPhase = phase;
  }
  return PHASES.map((phase) => {
    const phaseRuns = runs.get(phase)!;
    const latest = phaseRuns.at(-1);
    return {
      phase,
      status: latest ? runStatus(latest) : 'dim',
      runs: phaseRuns.length,
      artifact: latest ? runArtifact(latest) : null,
    };
  });
}

// The strip is hidden while nothing is lit (a Direct session starts as a chat, PRD step 11).
export function stripState(views: readonly PhaseView[]): RpiStripState {
  const lit = views.filter((view) => view.status !== 'dim');
  if (lit.length === 0) return 'empty';
  if (lit.some((view) => view.status === 'failed')) return 'error';
  if (lit.some((view) => view.status === 'active')) return 'loading';
  return 'ready';
}
