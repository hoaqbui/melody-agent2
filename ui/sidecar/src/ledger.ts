// The work ledger (plan docs/2026-09-20-work-ledger-plan-v1.md): one append-only JSONL per
// project, under goose's state dir and never inside the repo. The renderer appends an event at
// each moment it already knows about; every telemetry chart is a fold over these lines.

import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { isInside, toplevelOf, WORKTREES_DIR } from './git.js';
import { HttpError, type JsonHandler, requireString } from './http.js';

export const EVENT_KINDS = [
  'turn',
  'worker',
  'correction',
  'confirm',
  'review',
  'undo',
  'handoff',
  'land',
  'verdict',
  'link',
  'gap',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface LedgerEvent {
  at: string;
  kind: EventKind;
  sessionId: string;
  [key: string]: unknown;
}

// Task 264's four payload shapes, keyed by kind rather than restating each kind as a literal
// (the list above is the one place `kind` is spelled out). `requireEvent` below validates only
// the fields every kind carries; a payload beyond that is between the writers that append it
// (267, 268) and the fold that reads it (266) — the sidecar itself stores whatever object
// arrives once its kind is known.
export interface LedgerPayloadByKind {
  land: { sha: string; paths: string[]; message: string };
  verdict: { workerSessionId: string; verdict: 'good' | 'fixed' | 'wrong'; why?: string };
  link: {
    workerSessionId: string;
    by: 'user' | 'melody';
    fromWorkerSessionId?: string;
    fromSha?: string;
  };
  gap: { from: string; to: string };
}

// The same root goose uses for its own state (`Paths::state_dir`: XDG on every platform).
export const defaultLedgerDir = (): string =>
  path.join(
    process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'),
    'goose',
    'ledger'
  );

// One file per repository: the toplevel's basename for the human, a hash of its path so two
// checkouts with the same name never share a ledger.
export const ledgerFileFor = (ledgerDir: string, toplevel: string): string =>
  path.join(
    ledgerDir,
    `${path.basename(toplevel)}-${createHash('sha256').update(toplevel).digest('hex').slice(0, 8)}.jsonl`
  );

const isKind = (value: unknown): value is EventKind =>
  typeof value === 'string' && (EVENT_KINDS as readonly string[]).includes(value);

const requireEvent = (body: Record<string, unknown>): LedgerEvent => {
  const event = body.event;
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    throw new HttpError(400, 'event must be an object');
  }
  const record = event as Record<string, unknown>;
  if (!isKind(record.kind)) {
    throw new HttpError(400, `event.kind must be one of ${EVENT_KINDS.join(', ')}`);
  }
  if (typeof record.at !== 'string' || Number.isNaN(Date.parse(record.at))) {
    throw new HttpError(400, 'event.at must be an ISO 8601 timestamp');
  }
  if (typeof record.sessionId !== 'string' || record.sessionId === '') {
    throw new HttpError(400, 'event.sessionId must be a non-empty string');
  }
  return record as LedgerEvent;
};

// The natural id a kind carries in place of `messageId`, when it has one — the field this
// kind's own writer already treats as unique (a tool call, a commit, a turn). Everything else,
// including `verdict` and `gap`, falls back to `at` below: not every kind has an id of its own,
// and a replay of the same event always carries the same timestamp.
const NATURAL_ID_FIELD: Partial<Record<EventKind, string>> = {
  correction: 'toolCallId',
  land: 'sha',
};
// `undo` has no natural id: an undo and its redo share a turnId (task 266), so they key by `at`.

// The key task 265 dedups appends by: (kind, sessionId, workerSessionId, messageId), with the
// last slot falling back to the kind's natural id, then to `at`, when the event has no
// `messageId` of its own. `eventKey` in the renderer (`ledger-events.ts`) mirrors this exactly —
// this is the one place the rule is spelled out.
export const dedupeKeyOf = (event: LedgerEvent): string => {
  const record = event as unknown as Record<string, unknown>;
  const workerSessionId = typeof record.workerSessionId === 'string' ? record.workerSessionId : '';
  const messageId = typeof record.messageId === 'string' ? record.messageId : undefined;
  const naturalField = NATURAL_ID_FIELD[event.kind];
  const natural =
    naturalField && typeof record[naturalField] === 'string'
      ? (record[naturalField] as string)
      : undefined;
  return [event.kind, event.sessionId, workerSessionId, messageId ?? natural ?? event.at].join(':');
};

export const readLedger = async (file: string, since?: string): Promise<LedgerEvent[]> => {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const events: LedgerEvent[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as LedgerEvent;
      if (since === undefined || parsed.at > since) events.push(parsed);
    } catch {
      // a torn last line from a crash mid-append is dropped, never fatal
    }
  }
  return events;
};

// One key set per ledger file, loaded from disk on first use and kept up to date as this
// process appends — never re-read after that, so a growing file costs one parse, not one per
// append. A concurrent first load is awaited once, not raced into two reads.
const keysByFile = new Map<string, Set<string>>();
const loadingByFile = new Map<string, Promise<Set<string>>>();

const keysFor = async (file: string): Promise<Set<string>> => {
  const loaded = keysByFile.get(file);
  if (loaded) return loaded;
  let loading = loadingByFile.get(file);
  if (!loading) {
    loading = readLedger(file).then((events) => {
      const keys = new Set(events.map(dedupeKeyOf));
      keysByFile.set(file, keys);
      loadingByFile.delete(file);
      return keys;
    });
    loadingByFile.set(file, loading);
  }
  return loading;
};

export const ledgerRoutes = (
  spawnCwd: string,
  ledgerDir: string = defaultLedgerDir()
): Record<string, JsonHandler> => {
  // The `/fs/*` boundary: the spawn cwd's repository, or the spawn cwd itself outside any
  // repository (the Hub on a home directory), or a sibling worktree of it.
  const fileFor = async (body: Record<string, unknown>): Promise<string> => {
    let toplevel: string;
    let cwd: string;
    try {
      toplevel = await toplevelOf(spawnCwd).catch(() => realpath(spawnCwd));
      cwd = await realpath(
        body.cwd === undefined ? spawnCwd : path.resolve(spawnCwd, requireString(body, 'cwd'))
      );
    } catch (error) {
      throw new HttpError(400, `cwd is not usable: ${(error as Error).message}`);
    }
    const roots = [toplevel];
    const parent = path.dirname(toplevel);
    if (path.basename(parent) === WORKTREES_DIR) roots.push(parent);
    if (!roots.some((root) => isInside(cwd, root))) {
      throw new HttpError(400, 'cwd is outside the repository the sidecar was started in');
    }
    // A worktree shares its repository's ledger: the work is the project's, whichever checkout.
    return ledgerFileFor(ledgerDir, toplevel);
  };
  return {
    'POST /ledger/append': async (body) => {
      const event = requireEvent(body);
      const file = await fileFor(body);
      const keys = await keysFor(file);
      const key = dedupeKeyOf(event);
      if (keys.has(key)) return { ok: true, duplicate: true };
      await mkdir(path.dirname(file), { recursive: true });
      await appendFile(file, JSON.stringify(event) + '\n', 'utf8');
      keys.add(key);
      return { ok: true, file };
    },
    'POST /ledger/read': async (body) => {
      const since = body.since === undefined ? undefined : requireString(body, 'since');
      const file = await fileFor(body);
      return { events: await readLedger(file, since), file };
    },
  };
};
