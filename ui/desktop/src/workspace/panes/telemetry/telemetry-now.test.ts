import { describe, expect, it } from 'vitest';
import type { Delegation } from '../../../acp/delegations';
import type { LedgerEvent, WorkerEvent } from '../../../native/ledger';
import type { Message, MessageContent } from '../../../types/message';
import type { Session } from '../../../types/session';
import { gateWord, sessionSettings, shortModel, turnRows, turnsOf } from './telemetry-now';

const T0 = 1_758_400_000;
const msg = (
  role: 'user' | 'assistant',
  content: MessageContent[],
  overrides: Partial<Message> = {}
): Message => ({
  role,
  content,
  created: T0,
  metadata: { agentVisible: true, userVisible: true },
  ...overrides,
});
const text = (t: string): MessageContent => ({ type: 'text', text: t });
const call = (id: string): MessageContent => ({
  type: 'toolRequest',
  id,
  toolCall: {
    status: 'success',
    value: { name: 'summon__delegate', arguments: { source: 'implementer' } },
  },
});
const inference = {
  provider: 'claude-code',
  requestedModel: 'claude-opus-5',
  resolvedModel: 'claude-opus-5-20260814',
};
const usage = { inputTokens: 1000, outputTokens: 50 };
const meta = (extra: Partial<Message['metadata']>): Message['metadata'] => ({
  agentVisible: true,
  userVisible: true,
  ...extra,
});

const session: Session = {
  id: 's1',
  name: 'per-panel tab bars',
  created_at: '',
  updated_at: '',
  extension_data: {},
  message_count: 0,
  working_dir: '/repo',
  provider_name: 'claude-acp',
  goose_mode: 'auto',
  model_config: { model_name: 'claude-opus-5', toolshim: false, context_limit: 200_000 },
};

describe('sessionSettings', () => {
  it('names the runtime, the model, the gate and the context, ids beneath', () => {
    const rows = sessionSettings(session, [], 'high', {
      accumulatedInputTokens: 0,
      accumulatedOutputTokens: 0,
      accumulatedTotalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 64_200,
      contextLimit: 200_000,
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.runtime).toMatchObject({ value: 'Claude', detail: 'claude-acp' });
    expect(byId.model).toMatchObject({ value: 'Opus', detail: 'claude-opus-5' });
    expect(byId.effort).toMatchObject({ value: 'high', detail: 'thinking_effort' });
    expect(byId.gate).toMatchObject({ value: 'Autonomous', detail: 'GOOSE_MODE=auto' });
    expect(byId.context).toMatchObject({ value: '64.2k / 200k', detail: '32% of context_limit' });
    expect(sessionSettings(undefined, [], undefined, undefined)).toEqual([]);
  });

  it('reads the gate and the short model name', () => {
    expect(gateWord('approve')).toBe('Manual');
    expect(gateWord(undefined)).toBe('Autonomous');
    expect(shortModel('gpt-6-astra')).toBe('Astra');
    expect(shortModel('claude-sonnet-5')).toBe('Sonnet');
    expect(shortModel('')).toBe('—');
  });
});

describe('turnsOf', () => {
  it('opens a turn on each user message and collects its tool call ids', () => {
    const messages = [
      msg('user', [text('a')], { id: 'u1' }),
      msg('assistant', [call('d1')]),
      msg('assistant', [text('done')], { metadata: meta({ inference, usage }) }),
      msg('user', [text('b')], { id: 'u2', created: T0 + 100 }),
      msg('assistant', [text('…')], { created: T0 + 101 }),
    ];
    const turns = turnsOf(messages);
    expect(turns.map((t) => t.id)).toEqual(['u1', 'u2']);
    expect(turns[0].toolCallIds.has('d1')).toBe(true);
    expect(turns[0].assistant).toHaveLength(2);
  });
});

describe('turnRows', () => {
  const delegation: Delegation = {
    subagentSessionId: 'child-1',
    parentSessionId: 's1',
    source: 'implementer',
    provider: 'claude-code',
    model: 'claude-sonnet-5',
    title: 'task',
    status: 'done',
    parentToolCallId: 'd1',
  };
  const messages = [
    msg('user', [text('a')], { id: 'u1' }),
    msg('assistant', [call('d1')], { created: T0 + 1 }),
    msg('assistant', [text('done')], { created: T0 + 60, metadata: meta({ inference, usage }) }),
    msg('user', [text('b')], { id: 'u2', created: T0 + 100 }),
    msg('assistant', [text('…')], { created: T0 + 101, metadata: meta({ inference }) }),
  ];
  const NOW = new Date('2026-09-20T12:00:00.000Z').getTime();
  const JOB_AT = '2026-09-20T00:00:00.000Z';
  // The job outcome fold (266) needs the actual ledger `worker` line to read a job's outcome —
  // the delegation on the wire carries no filesChanged or turnId.
  const workerLine = (overrides: Partial<WorkerEvent> = {}): WorkerEvent => ({
    kind: 'worker',
    at: JOB_AT,
    sessionId: 's1',
    workerSessionId: 'child-1',
    status: 'done',
    blocked: false,
    filesChanged: ['a.ts'],
    ...overrides,
  });
  const landOn = (paths: string[]): LedgerEvent => ({
    kind: 'land',
    at: '2026-09-20T00:05:00.000Z',
    sessionId: 's1',
    sha: 'abc123',
    paths,
    message: 'commit',
  });

  it('gives one session row per turn, newest first, the worker nested under its turn', () => {
    const rows = turnRows(messages, [delegation], [workerLine(), landOn(['a.ts'])], false, NOW);
    expect(rows.map((r) => [r.id, r.who, r.outcome])).toEqual([
      ['u2', 'session', 'landed'],
      ['worker:child-1', 'worker', 'landed'],
      ['u1', 'session', 'landed'],
    ]);
    expect(rows[2]).toMatchObject({ resolvedModel: 'claude-opus-5-20260814', inputTokens: 1000 });
    expect(rows[1]).toMatchObject({ role: 'implementer', requestedModel: 'claude-sonnet-5' });
  });

  it('done without a land is not landed', () => {
    // A job on the ledger, status done, no commit ever matched its files.
    const withJob = turnRows(messages, [delegation], [workerLine()], false, NOW);
    expect(withJob[1].outcome).toBe('unknown');
    // Not even written to the ledger yet: same verdict, not a crash.
    const noJob = turnRows(messages, [delegation], [], false, NOW);
    expect(noJob[1].outcome).toBe('unknown');
  });

  it('marks the newest turn running while streaming, and reads outcomes from the ledger', () => {
    const events: LedgerEvent[] = [
      { kind: 'undo', at: '', sessionId: 's1', turnId: 'u1', redo: false },
      workerLine(),
      {
        kind: 'correction',
        at: '2026-09-20T00:10:00.000Z',
        sessionId: 's1',
        workerSessionId: 'child-1',
        path: 'a.ts',
        toolCallId: 'e1',
      },
    ];
    const rows = turnRows(messages, [delegation], events, true, NOW);
    expect(rows[0].outcome).toBe('running');
    expect(rows[1].outcome).toBe('corrected');
    expect(rows[2].outcome).toBe('undone');
    const blocked = turnRows(
      messages,
      [delegation],
      [workerLine({ blocked: true }), landOn(['a.ts'])],
      false,
      NOW
    );
    expect(blocked[1].outcome).toBe('blocked');
    expect(
      turnRows(messages, [{ ...delegation, status: 'failed' }], [], false, NOW)[1].outcome
    ).toBe('failed');
  });

  it('a linked later fix reads reworked, never landed', () => {
    const events: LedgerEvent[] = [
      workerLine(),
      landOn(['a.ts']),
      workerLine({ workerSessionId: 'child-2', at: '2026-09-20T01:00:00.000Z' }),
      {
        kind: 'link',
        at: '2026-09-20T02:00:00.000Z',
        sessionId: 's1',
        workerSessionId: 'child-1',
        by: 'user',
        fromWorkerSessionId: 'child-2',
      },
    ];
    const rows = turnRows(messages, [delegation], events, false, NOW);
    expect(rows[1].outcome).toBe('reworked');
  });
});
