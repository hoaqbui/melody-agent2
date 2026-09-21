// The work ledger's event builders (task 127): pure functions from what the renderer already
// holds — the session's messages and its delegations — to the events the sidecar appends
// (`native/ledger.ts`). No ACP, no React; the shell wires them.

import type {
  CorrectionEvent,
  LedgerEvent,
  ReviewEvent,
  TurnEvent,
  UndoEvent,
  WorkerEvent,
} from '../../../native/ledger';
import type { Delegation } from '../../../acp/delegations';
import { getToolRequests, getToolResponses, type Message } from '../../../types/message';
import { verdictOf } from '../review/review-parse';

const isoOf = (message: Message): string => new Date(message.created * 1000).toISOString();

// One event per turn: the assistant message carrying `metadata.usage` (usage lands once per
// turn, on the last assistant message — agent.rs attach_turn_usage), never every message that
// shares the turn's `inference`.
export function turnEvents(sessionId: string, messages: readonly Message[]): TurnEvent[] {
  const events: TurnEvent[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.metadata.usage) continue;
    const usage = message.metadata.usage;
    const inference = message.metadata.inference;
    events.push({
      kind: 'turn',
      at: isoOf(message),
      sessionId,
      messageId: message.id ?? undefined,
      who: 'session',
      provider: inference?.provider ?? '',
      requestedModel: inference?.requestedModel ?? '',
      resolvedModel: inference?.resolvedModel ?? undefined,
      inputTokens: usage.inputTokens ?? undefined,
      outputTokens: usage.outputTokens ?? undefined,
      cacheReadTokens: usage.cacheReadTokens ?? undefined,
      cost: usage.cost ?? undefined,
      costSource: usage.costSource ?? undefined,
      elapsedMs: usage.elapsedMs ?? undefined,
      timeToFirstTokenMs: usage.timeToFirstTokenMs ?? undefined,
    });
  }
  return events;
}

// The message holding a tool call's response — its `created` is when the call returned.
function responseMessage(
  messages: readonly Message[],
  toolCallId: string
): { message: Message; text: string } | null {
  for (const message of messages) {
    for (const response of getToolResponses(message)) {
      if (response.id !== toolCallId) continue;
      const result = response.toolResult as { status?: string; value?: { content?: unknown } };
      const content = result.value?.content;
      const text = Array.isArray(content)
        ? content
            .map((block) =>
              typeof block === 'object' &&
              block !== null &&
              typeof (block as { text?: unknown }).text === 'string'
                ? (block as { text: string }).text
                : ''
            )
            .join('\n')
        : '';
      return { message, text };
    }
  }
  return null;
}

// The text a tool call returned, read from the response's content blocks.
export function toolResponseText(messages: readonly Message[], toolCallId: string): string | null {
  return responseMessage(messages, toolCallId)?.text ?? null;
}

// The Implementer's contract (`.agents/agents/implementer.md`): a plan whose assumption failed
// comes back as `BLOCKED …` — on the wire it still reads Done.
export function isBlockedReturn(text: string | null): boolean {
  if (!text) return false;
  return /^\s*(?:#+\s*)?(?:\*\*)?BLOCKED\b/m.test(text.slice(0, 400));
}

// Paths listed under the return's `## Files Changed` (until the next heading): list items,
// backticked paths, or bare paths — whatever the seat wrote.
export function parseFilesChanged(text: string | null): string[] {
  if (!text) return [];
  const match = /^##\s*Files Changed\s*$([\s\S]*?)(?=^##\s|\s*$(?![\s\S]))/m.exec(text);
  if (!match) return [];
  const paths = new Set<string>();
  for (const raw of match[1].split('\n')) {
    const line = raw.replace(/^\s*[-*+]\s*/, '').trim();
    if (!line) continue;
    const ticked = /`([^`]+)`/.exec(line);
    const candidate = (ticked ? ticked[1] : line.split(/\s+/)[0]).replace(/[:,]$/, '');
    if (/[\\/.]/.test(candidate)) paths.add(candidate);
  }
  return [...paths];
}

// A live `DelegationUpdate` carries no timestamp: the worker returned when the parent's
// `delegate` call answered, so its `at` is the message holding that response; a row seeded
// from the session record keeps its `updatedAt`; otherwise now.
export function workerEvent(
  sessionId: string,
  delegation: Delegation,
  messages: readonly Message[],
  now: () => string = () => new Date().toISOString()
): WorkerEvent | null {
  if (delegation.status !== 'done' && delegation.status !== 'failed') return null;
  const answered = delegation.parentToolCallId
    ? responseMessage(messages, delegation.parentToolCallId)
    : null;
  const text = answered?.text ?? null;
  const at = answered ? isoOf(answered.message) : (delegation.updatedAt ?? now());
  return {
    kind: 'worker',
    at,
    sessionId,
    workerSessionId: delegation.subagentSessionId,
    source: delegation.source,
    provider: delegation.provider,
    model: delegation.model,
    status: delegation.status,
    error: delegation.error,
    blocked: delegation.status === 'done' && isBlockedReturn(text),
    filesChanged: parseFilesChanged(text),
    parentToolCallId: delegation.parentToolCallId,
  };
}

const WRITE_COMMANDS = new Set(['write', 'str_replace', 'insert', 'create']);

// The path a tool request writes, or null when it only reads. An ACP seat marks the call
// `kind: 'edit'` with `locations`; goose's own text_editor carries `command` and `path`; a shell
// command is unknowable and never counted.
export function editedPath(request: { toolCall: unknown; metadata?: unknown }): string | null {
  const metadata = (request.metadata ?? {}) as { kind?: unknown; locations?: unknown };
  const call = request.toolCall as {
    status?: string;
    value?: { name?: unknown; arguments?: unknown };
  };
  const args = (call.value?.arguments ?? {}) as Record<string, unknown>;
  const name = typeof call.value?.name === 'string' ? call.value.name : '';
  const location = Array.isArray(metadata.locations)
    ? (metadata.locations[0] as { path?: unknown } | undefined)?.path
    : undefined;
  const argPath = args.path ?? args.file_path;
  const path =
    typeof location === 'string' ? location : typeof argPath === 'string' ? argPath : null;
  if (!path) return null;
  if (metadata.kind === 'edit') return path;
  if (/text_editor|write|edit/i.test(name)) {
    if (typeof args.command !== 'string') return /write|edit/i.test(name) ? path : null;
    return WRITE_COMMANDS.has(args.command) ? path : null;
  }
  return null;
}

const sameFile = (edited: string, listed: string): boolean =>
  edited === listed ||
  edited.endsWith('/' + listed) ||
  listed.endsWith('/' + edited) ||
  edited.split('/').pop() === listed.split('/').pop();

// A session edit on a file a worker returned as changed, after that worker returned. The
// number that says the seat cost more than it saved.
export function correctionEvents(
  sessionId: string,
  messages: readonly Message[],
  workers: readonly WorkerEvent[]
): CorrectionEvent[] {
  const events: CorrectionEvent[] = [];
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    const at = isoOf(message);
    for (const request of getToolRequests(message)) {
      const path = editedPath(request);
      if (!path) continue;
      const worker = workers.find(
        (w) => w.status === 'done' && w.at <= at && w.filesChanged.some((f) => sameFile(path, f))
      );
      if (!worker) continue;
      events.push({
        kind: 'correction',
        at,
        sessionId,
        workerSessionId: worker.workerSessionId,
        path,
        toolCallId: request.id,
      });
    }
  }
  return events;
}

// A review session's reply with a verdict; the branch and base come from the session's title
// ("Review: <branch> vs <base>", task 70).
export function reviewEvent(
  sessionId: string,
  title: string,
  messages: readonly Message[]
): ReviewEvent | null {
  const named = /^Review:\s*(.+?)\s+vs\s+(.+)$/.exec(title.trim());
  if (!named) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== 'assistant') continue;
    const text = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n');
    const verdict = verdictOf(text);
    if (!verdict) continue;
    return {
      kind: 'review',
      at: isoOf(message),
      sessionId,
      verdict,
      branch: named[1],
      base: named[2],
    };
  }
  return null;
}

export function undoEvent(
  sessionId: string,
  turnId: string,
  at = new Date().toISOString()
): UndoEvent {
  return { kind: 'undo', at, sessionId, turnId };
}

// The key that makes an event idempotent across re-renders and app restarts.
export function eventKey(event: LedgerEvent): string {
  switch (event.kind) {
    case 'turn':
      return `turn:${event.sessionId}:${event.messageId ?? event.at}`;
    case 'worker':
      return `worker:${event.workerSessionId}`;
    case 'correction':
      return `correction:${event.toolCallId}:${event.path}`;
    case 'review':
      return `review:${event.sessionId}:${event.at}`;
    case 'undo':
      return `undo:${event.turnId}`;
    default:
      return `${event.kind}:${event.sessionId}:${event.at}`;
  }
}

// Everything a session's current state implies, minus what was already written.
export function pendingEvents(
  sessionId: string,
  title: string,
  messages: readonly Message[],
  delegations: readonly Delegation[],
  written: ReadonlySet<string>
): LedgerEvent[] {
  const workers = delegations
    .map((d) => workerEvent(sessionId, d, messages))
    .filter((w): w is WorkerEvent => w !== null);
  const all: LedgerEvent[] = [
    ...turnEvents(sessionId, messages),
    ...workers,
    ...correctionEvents(sessionId, messages, workers),
  ];
  const review = reviewEvent(sessionId, title, messages);
  if (review) all.push(review);
  return all.filter((event) => !written.has(eventKey(event)));
}
