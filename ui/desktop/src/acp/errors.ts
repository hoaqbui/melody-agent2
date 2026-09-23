import { RequestError } from '@agentclientprotocol/sdk';
import { errorMessage } from '../utils/conversionUtils';

export interface AcpCreditsExhaustedError {
  message: string;
  url?: string;
}

const CREDITS_EXHAUSTED_REASON = 'credits_exhausted';
const AUTH_REQUIRED_CODE = -32000;

// The one message formatAcpError produces for an auth-required rejection; classifyTurnError
// matches it exactly rather than guessing at auth wording.
export const AUTH_REQUIRED_MESSAGE = 'Sign in to your provider, then try again.';

// Kept in sync with RECIPE_PARAMS_CANCELLED_REASON in crates/goose/src/acp/server/recipe.rs.
const RECIPE_PARAMS_CANCELLED_REASON = 'recipe_params_cancelled';

export const RECIPE_PARAMETER_SCOPES_UNSUPPORTED_MESSAGE =
  'The connected Goose server does not support securely scoped deeplink recipe parameters. Update the server and try again.';

export class RecipeParameterScopesUnsupportedError extends Error {
  constructor() {
    super(RECIPE_PARAMETER_SCOPES_UNSUPPORTED_MESSAGE);
    this.name = 'RecipeParameterScopesUnsupportedError';
  }
}

export function isRecipeParameterScopesUnsupported(
  error: unknown
): error is RecipeParameterScopesUnsupportedError {
  return error instanceof RecipeParameterScopesUnsupportedError;
}

export class RecipeDeclinedError extends Error {
  constructor() {
    super('Recipe was not trusted by the user');
    this.name = 'RecipeDeclinedError';
  }
}

export function isRecipeDeclined(error: unknown): error is RecipeDeclinedError {
  return error instanceof RecipeDeclinedError;
}

export function isRecipeParamsCancelled(error: unknown): boolean {
  return asAcpJsonRpcError(error)?.data?.reason === RECIPE_PARAMS_CANCELLED_REASON;
}

export function parseAcpCreditsExhaustedError(error: unknown): AcpCreditsExhaustedError | null {
  const jsonRpcError = asAcpJsonRpcError(error);
  if (jsonRpcError?.data?.reason !== CREDITS_EXHAUSTED_REASON) {
    return null;
  }

  const url = typeof jsonRpcError.data.url === 'string' ? jsonRpcError.data.url : undefined;

  return {
    message: jsonRpcError.message,
    ...(url ? { url } : {}),
  };
}

export function formatAcpError(error: unknown): string {
  if (error instanceof RequestError && error.code === AUTH_REQUIRED_CODE) {
    return AUTH_REQUIRED_MESSAGE;
  }
  return errorMessage(error);
}

export type TurnErrorKind = 'auth' | 'quota' | 'network' | 'other';

export interface ClassifiedTurnError {
  failedAt?: number;
  kind: TurnErrorKind;
  detail: string;
  resetAt?: string;
}

// Quota/rate-limit errors from claude-agent-acp and codex-acp are already folded into
// `credits_exhausted` by goosed (crates/goose/src/acp/provider.rs `is_quota_exhausted`) and
// diverted into a transcript notification before a message ever reaches this classifier
// (chatSessionController.ts submitMessage). This pattern is a safety net for the rest —
// a quota-shaped string that reaches the failed-turn path some other way.
const QUOTA_ERROR_PATTERN = /credits_exhausted|rate[ -]?limit|usage limit|quota/i;

// The stream-level rejection goosed sends when the agent event stream itself errors
// (crates/goose/src/acp/server.rs `forward_agent_stream`'s `Err(error)` arm: "Error in agent
// response stream: {error}"), plus the process-death wording claude-agent-acp's query loop
// throws when its transport dies (acp-agent.js catch block).
const NETWORK_ERROR_PATTERN =
  /error in agent response stream|econnreset|econnrefused|etimedout|processtransport|terminated process|process exited with|process terminated by signal|failed to write to process stdin|connection (?:closed|lost|reset)/i;

export function classifyTurnError(message: string): ClassifiedTurnError {
  const detail = message.trim();
  if (detail === AUTH_REQUIRED_MESSAGE) {
    return { kind: 'auth', detail };
  }
  if (QUOTA_ERROR_PATTERN.test(detail)) {
    return { kind: 'quota', detail };
  }
  if (NETWORK_ERROR_PATTERN.test(detail)) {
    return { kind: 'network', detail };
  }
  return { kind: 'other', detail };
}

interface AcpJsonRpcError {
  message: string;
  data: Record<string, unknown>;
}

function asAcpJsonRpcError(error: unknown): AcpJsonRpcError | null {
  if (!isRecord(error)) {
    return null;
  }

  const candidate = isRecord(error.error) ? error.error : error;
  if (typeof candidate.message !== 'string' || !isRecord(candidate.data)) {
    return null;
  }

  return {
    message: candidate.message,
    data: candidate.data,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function acpErrorMessage(error: unknown): string | null {
  if (!isRecord(error)) {
    return null;
  }

  const candidate = 'error' in error && isRecord(error.error) ? error.error : error;
  if (!isRecord(candidate)) {
    return null;
  }
  if (typeof candidate.data === 'string') {
    return candidate.data;
  }
  return typeof candidate.message === 'string' ? candidate.message : null;
}

export function normalizeAcpError(error: unknown, fallback: string): Error {
  const message = acpErrorMessage(error);
  if (message) {
    return new Error(message);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(fallback);
}
