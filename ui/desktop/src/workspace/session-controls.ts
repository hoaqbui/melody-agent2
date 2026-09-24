// Runtime and Mode as data (PRD steps 2-3, 9). Pure: the shell reads the session
// snapshot and calls these; nothing here talks ACP.

import type { Message } from '../types/message';
import type { ProviderDetails } from '../types/providers';
import type { Session } from '../types/session';

export interface Runtime {
  id: string;
  label: string;
}

// PRODUCT.md §5: the four subscription runtimes, by Goose provider id. Everything else
// the server lists is reachable under "More…" — the list is the ACP provider option's.
export const RUNTIMES: readonly Runtime[] = [
  { id: 'claude-acp', label: 'Claude' },
  { id: 'codex-acp', label: 'Codex' },
  { id: 'cursor-acp', label: 'Cursor' },
  { id: 'agy', label: 'agy' },
];

export function runtimeLabel(providerId: string, providers: readonly ProviderDetails[]): string {
  return (
    RUNTIMES.find((runtime) => runtime.id === providerId)?.label ??
    providers.find((provider) => provider.name === providerId)?.metadata.display_name ??
    providerId
  );
}

// Task 89: what the current seat does with the Mode option's Approve value, under the
// Mode radios in Session controls. agy runs `--dangerously-skip-permissions` and refuses
// every mode but Auto, so its note also says Approve stays out of reach.
export function approveModeNote(providerId: string): string {
  switch (providerId) {
    case 'claude-acp':
      return 'Claude asks for risky actions';
    case 'codex-acp':
      return 'Codex asks outside the workspace';
    case 'cursor-acp':
      return 'Cursor plans without editing';
    case 'agy':
      return 'agy cannot ask — Approve unavailable';
    default:
      return '';
  }
}

export function moreRuntimes(providers: readonly ProviderDetails[]): Runtime[] {
  const fixed = new Set(RUNTIMES.map((runtime) => runtime.id));
  return providers
    .filter((provider) => provider.is_configured && !fixed.has(provider.name))
    .map((provider) => ({ id: provider.name, label: provider.metadata.display_name }));
}

// An ACP adapter's `is_available` is whether its binary resolves; an API-key provider
// with no entry is unknown and is not blocked here.
export function needsInstall(providerId: string, providers: readonly ProviderDetails[]): boolean {
  const provider = providers.find((candidate) => candidate.name === providerId);
  return provider !== undefined && provider.uses_acp && !provider.is_available;
}

export type Mode = 'direct' | 'orchestrate';

export const ORCHESTRATOR_ROLE = 'orchestrator';
export const ORCHESTRATOR_RECIPE_TITLE = 'Orchestrator';

// Orchestrate is decided at session/new (the role body rides as recipe instructions,
// spine-bridge plan §Approach), so the session's recipe is the mode of record.
export function modeOfSession(session: Pick<Session, 'recipe'> | undefined): Mode {
  return session?.recipe?.title === ORCHESTRATOR_RECIPE_TITLE ? 'orchestrate' : 'direct';
}

// The plan gate (task 79): the orchestrator ends its turn after the Planner and implements
// only after the user's Accept. Appended to the recipe at session/new; routines strip it.
export const PLAN_GATE_LINE =
  "Plan gate: end your turn after the Planner returns; implement only after the user's Accept.";

export function orchestratorRecipe(
  role: { description: string; content: string },
  planGate: boolean
) {
  const instructions = planGate ? `${role.content}\n\n${PLAN_GATE_LINE}` : role.content;
  return {
    title: ORCHESTRATOR_RECIPE_TITLE,
    description: role.description,
    instructions,
  };
}

export const REVIEWER_ROLE = 'reviewer';
export const REVIEWER_RECIPE_TITLE = 'Reviewer';
const REVIEW_TITLE_PREFIX = 'Review: ';

// One seat of a role's `runtimes:` (`summon.rs` AgentRuntime), as the source entry's
// `properties.runtimes` carries it.
export interface RoleRuntime {
  provider: string;
  model: string;
  weight: number;
}

export function roleRuntimes(role: { properties?: Record<string, unknown> }): RoleRuntime[] {
  const listed = role.properties?.runtimes;
  if (!Array.isArray(listed)) return [];
  return listed.flatMap((entry): RoleRuntime[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { provider, model, weight } = entry as Partial<RoleRuntime>;
    if (typeof provider !== 'string' || typeof model !== 'string') return [];
    return [{ provider, model, weight: typeof weight === 'number' ? weight : 0 }];
  });
}

// Task 70: the review session's tag lives in its title — the ACP client writes no
// `extension_data`, and `session/rename` marks the name user-set so goose's own naming
// leaves it alone (`new_session.rs` client_title, `session_manager.rs` user_set_name).
export function reviewTitle(branch: string, base: string): string {
  return `${REVIEW_TITLE_PREFIX}${branch} vs ${base}`;
}

export function parseReviewTitle(title: string): { branch: string; base: string } | null {
  if (!title.startsWith(REVIEW_TITLE_PREFIX)) return null;
  const rest = title.slice(REVIEW_TITLE_PREFIX.length);
  const at = rest.lastIndexOf(' vs ');
  if (at <= 0) return null;
  const branch = rest.slice(0, at);
  const base = rest.slice(at + ' vs '.length);
  return base ? { branch, base } : null;
}

// The first prompt, as tasks.md entry 70 words it; Re-review sends the same one.
export function reviewPrompt(branch: string, base: string, cwd: string): string {
  return (
    `Review the diff of \`${branch}\` against \`${base}\` in \`${cwd}\`: ` +
    `run \`git diff ${base}...HEAD\`, judge it against \`docs/\` plans and \`tasks.md\`, ` +
    'return the Return shape.'
  );
}

// The Reviewer role as a recipe, the rolled seat pinned in its settings as summon pins a
// child's (`summon.rs` build_task_config): session/new reads `goose_provider` and
// `goose_model` before any `provider` meta (`new_session.rs` resolve_provider_and_model).
// The prompt is not in it: upstream's trust dialog keys on the recipe's hash
// (`utils/recipeHash.ts`), so a recipe that changed per branch would ask on every
// transcript opened; per seat it asks once.
export function reviewerRecipe(
  role: { description: string; content: string },
  seat: Pick<RoleRuntime, 'provider' | 'model'>
) {
  return {
    title: REVIEWER_RECIPE_TITLE,
    description: role.description,
    instructions: role.content,
    settings: { goose_provider: seat.provider, goose_model: seat.model },
  };
}

export type Stop = 'easy' | 'medium' | 'hard';

export interface StopTriple {
  provider: string;
  // The stop's model is whichever the adapter lists that matches; ids are adapter data.
  modelMatch: RegExp;
  // The claude CLI publishes no model list (its `initialize` returns `models: []`), so the
  // stop takes whatever the adapter is set to when nothing matches.
  anyModel?: boolean;
  mode: Mode;
}

// The stop table (task 58; the lever that picked one retired task 224): a stop is a
// (provider, model, mode) triple. A new Easy session takes `hard` (with `orchestratorRecipe`)
// when the folder can orchestrate, else `medium` (direct Opus) — `WorkspaceShell.tsx`'s
// `nextChat`.
export const LEVER: Record<Stop, StopTriple> = {
  easy: { provider: 'claude-acp', modelMatch: /sonnet/i, mode: 'direct' },
  medium: { provider: 'claude-acp', modelMatch: /opus/i, mode: 'direct' },
  hard: { provider: 'claude-code', modelMatch: /opus/i, anyModel: true, mode: 'orchestrate' },
};

export function stopModel(
  stop: Stop,
  choices: readonly { value: string; name: string }[]
): string | undefined {
  const { modelMatch, anyModel } = LEVER[stop];
  const matched = choices.find(
    (choice) => modelMatch.test(choice.value) || modelMatch.test(choice.name)
  )?.value;
  return matched ?? (anyModel ? choices[0]?.value : undefined);
}

// A client-side marker in the message list (PRD step 9); the handoff memo itself is
// the server's on the next prompt.
export function runtimeDividerMessage(id: string, text: string): Message {
  return {
    id,
    role: 'assistant',
    created: Math.floor(Date.now() / 1000),
    content: [{ type: 'systemNotification', notificationType: 'inlineMessage', msg: text }],
    metadata: { userVisible: true, agentVisible: false },
  };
}
