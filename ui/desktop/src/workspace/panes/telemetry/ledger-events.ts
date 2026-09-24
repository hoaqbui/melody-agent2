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
import { turnsOf } from './telemetry-now';

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

// The id of the user message that opened the turn holding a tool call — the same split
// `telemetry-now.ts`'s rows use, so a worker's `turnId` and an `undo` event's `turnId` (266's
// `undone` rule) agree on what a turn is by construction, not by two splitters staying in sync.
function turnIdFor(messages: readonly Message[], toolCallId: string): string | undefined {
  return turnsOf(messages).find((turn) => turn.toolCallIds.has(toolCallId))?.id;
}

// The `instructions` argument of the `delegate` call a tool-request id names, if the call is
// still in the transcript.
function delegateInstructions(messages: readonly Message[], toolCallId: string): string | null {
  for (const message of messages) {
    for (const request of getToolRequests(message)) {
      if (request.id !== toolCallId) continue;
      const call = request.toolCall as { value?: { arguments?: unknown } };
      const args = (call.value?.arguments ?? {}) as Record<string, unknown>;
      return typeof args.instructions === 'string' ? args.instructions : null;
    }
  }
  return null;
}

const TASK_REF = /\btask\s+(\d+)\b/i;

// The first `task NNN` named in the child's title (sessions the orchestrator starts are named
// after the task, per this file's own delegation fixtures — `title: 'task 128'`) or, failing
// that, the delegate call's `instructions` — the pointer back to `tasks.md`. `taskHash` (a hash
// of that task's card, to catch drift) waits on reading the file, which this pure builder does
// not do.
function taskRefOf(delegation: Delegation, messages: readonly Message[]): string | null {
  const fromTitle = TASK_REF.exec(delegation.title);
  if (fromTitle) return `task ${fromTitle[1]}`;
  const instructions = delegation.parentToolCallId
    ? delegateInstructions(messages, delegation.parentToolCallId)
    : null;
  const fromInstructions = instructions ? TASK_REF.exec(instructions) : null;
  return fromInstructions ? `task ${fromInstructions[1]}` : null;
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
    // Job identity (task 264): turnId and taskRef read from what the transcript already holds;
    // member stands in for a real team member until M2; charterSha, taskHash and baseSha need a
    // git read or a run-start capture this pure builder does not have — null, not omitted.
    turnId: delegation.parentToolCallId
      ? (turnIdFor(messages, delegation.parentToolCallId) ?? null)
      : null,
    member: delegation.source ?? null,
    charterSha: null,
    taskRef: taskRefOf(delegation, messages),
    taskHash: null,
    baseSha: null,
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
  at = new Date().toISOString(),
  redo = false
): UndoEvent {
  return { kind: 'undo', at, sessionId, turnId, redo };
}

// The natural id a kind carries in place of `messageId`, when it has one — mirrors the
// sidecar's own `NATURAL_ID_FIELD` (`ui/sidecar/src/ledger.ts`) exactly, field for field.
const NATURAL_ID_FIELD: Partial<Record<LedgerEvent['kind'], string>> = {
  correction: 'toolCallId',
  land: 'sha',
};
// `undo` has no natural id: an undo and its redo share a turnId (task 266), so they key by `at`.

// task 265: the key the sidecar dedups appends by — (kind, sessionId, workerSessionId,
// messageId), the last slot falling back to the kind's natural id, then to `at`. This is now
// only a cache of that key (`useLedgerWriter` skips sending what it already sent this session);
// the sidecar's own key, computed the same way, is what actually keeps a replay from writing
// twice.
export function eventKey(event: LedgerEvent): string {
  const record = event as unknown as Record<string, unknown>;
  const workerSessionId = typeof record.workerSessionId === 'string' ? record.workerSessionId : '';
  const messageId = typeof record.messageId === 'string' ? record.messageId : undefined;
  const naturalField = NATURAL_ID_FIELD[event.kind];
  const natural =
    naturalField && typeof record[naturalField] === 'string'
      ? (record[naturalField] as string)
      : undefined;
  return [event.kind, event.sessionId, workerSessionId, messageId ?? natural ?? event.at].join(':');
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
