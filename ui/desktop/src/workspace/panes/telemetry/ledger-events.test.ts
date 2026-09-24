import { describe, expect, it } from 'vitest';
import type { Delegation } from '../../../acp/delegations';
import type { Message, MessageContent } from '../../../types/message';
import {
  correctionEvents,
  editedPath,
  eventKey,
  gapEvent,
  isBlockedReturn,
  landEvent,
  linkEventFromCommit,
  parseFilesChanged,
  parseFixesJobTrailer,
  pendingEvents,
  reviewEvent,
  turnEvents,
  workerEvent,
} from './ledger-events';

const T0 = 1_758_400_000;
const msg = (
  role: 'user' | 'assistant',
  content: MessageContent[],
  overrides: Partial<Message> = {}
): Message => ({
  role,
  content,
  created: T0,
  id: undefined,
  metadata: { agentVisible: true, userVisible: true },
  ...overrides,
});
const text = (t: string): MessageContent => ({ type: 'text', text: t });
type ToolRequestContent = MessageContent & { type: 'toolRequest' };
const edit = (id: string, path: string, command = 'str_replace'): ToolRequestContent => ({
  type: 'toolRequest',
  id,
  toolCall: {
    status: 'success',
    value: { name: 'developer__text_editor', arguments: { command, path } },
  },
});
const acpEdit = (id: string, path: string): ToolRequestContent => ({
  type: 'toolRequest',
  id,
  toolCall: { status: 'success', value: { name: 'Edit', arguments: { file_path: path } } },
  metadata: { kind: 'edit', locations: [{ path }] },
});
const response = (id: string, body: string): MessageContent => ({
  type: 'toolResponse',
  id,
  toolResult: { status: 'success', value: { content: [{ type: 'text', text: body }] } },
});
const inference = {
  provider: 'claude-code',
  requestedModel: 'claude-opus-5',
  resolvedModel: 'claude-opus-5-20260814',
};
const usage = { inputTokens: 1200, outputTokens: 80, cost: 0.02, costSource: 'estimated' as const };

describe('turnEvents', () => {
  it('writes one event per turn — the message carrying usage — not one per assistant message', () => {
    const messages = [
      msg('user', [text('go')], { id: 'u1' }),
      msg('assistant', [text('thinking'), edit('t1', 'a.ts')], {
        id: 'a1',
        metadata: { agentVisible: true, userVisible: true, inference },
      }),
      msg('assistant', [response('t1', 'ok')], {
        id: 'a2',
        metadata: { agentVisible: true, userVisible: true, inference },
      }),
      msg('assistant', [text('done')], {
        id: 'a3',
        created: T0 + 30,
        metadata: { agentVisible: true, userVisible: true, inference, usage },
      }),
    ];
    const events = turnEvents('s1', messages);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'turn',
      sessionId: 's1',
      messageId: 'a3',
      who: 'session',
      provider: 'claude-code',
      requestedModel: 'claude-opus-5',
      resolvedModel: 'claude-opus-5-20260814',
      inputTokens: 1200,
      outputTokens: 80,
      cost: 0.02,
      costSource: 'estimated',
    });
    expect(events[0].at).toBe(new Date((T0 + 30) * 1000).toISOString());
  });
});

describe('the worker return', () => {
  it('reads BLOCKED at the start of the return, with or without a heading', () => {
    expect(isBlockedReturn('BLOCKED: the plan assumes X owns init; Y does')).toBe(true);
    expect(isBlockedReturn('# Implementation Result\n\n**BLOCKED** — the plan assumes …')).toBe(
      true
    );
    expect(
      isBlockedReturn('# Implementation Result\n\n## Changes Made\n- nothing was BLOCKED')
    ).toBe(false);
    expect(isBlockedReturn(null)).toBe(false);
  });

  it('lists the paths under ## Files Changed and nothing under other headings', () => {
    const body = [
      '# Implementation Result',
      '## Changes Made',
      '- added the pane',
      '## Files Changed',
      '- `ui/desktop/src/workspace/pane-store.ts`',
      '- ui/desktop/src/workspace/WorkspaceShell.tsx (icon map)',
      '',
      '## Tests Run',
      '- `pnpm vitest run pane-store` → 12 passed',
    ].join('\n');
    expect(parseFilesChanged(body)).toEqual([
      'ui/desktop/src/workspace/pane-store.ts',
      'ui/desktop/src/workspace/WorkspaceShell.tsx',
    ]);
    expect(parseFilesChanged('no sections here')).toEqual([]);
  });

  it('builds a worker event from a done delegation and its delegate response', () => {
    const delegation: Delegation = {
      subagentSessionId: 'child-1',
      parentSessionId: 's1',
      source: 'implementer',
      provider: 'claude-code',
      model: 'claude-sonnet-5',
      title: 'task 128',
      status: 'done',
      parentToolCallId: 'd1',
      updatedAt: '2026-09-20T10:00:00.000Z',
    };
    const messages = [
      msg(
        'assistant',
        [response('d1', 'BLOCKED: nothing owns the icon map\n## Files Changed\n- `a.ts`')],
        { created: T0 + 90 }
      ),
    ];
    const event = workerEvent('s1', delegation, messages);
    expect(event).toMatchObject({
      kind: 'worker',
      workerSessionId: 'child-1',
      source: 'implementer',
      status: 'done',
      blocked: true,
      filesChanged: ['a.ts'],
      // when the delegate call answered, not the row's own stamp
      at: new Date((T0 + 90) * 1000).toISOString(),
    });
    expect(workerEvent('s1', { ...delegation, status: 'running' }, messages)).toBeNull();
  });

  it('job identity: turnId and taskRef read from the transcript today, member stands in for delegation.source, charterSha/taskHash/baseSha wait on M2', () => {
    const delegation: Delegation = {
      subagentSessionId: 'child-3',
      parentSessionId: 's1',
      source: 'implementer',
      title: 'task 264',
      status: 'done',
      parentToolCallId: 'd3',
    };
    const messages = [
      msg('user', [text('please pick up task 264 from tasks.md')], { id: 'u1', created: T0 }),
      msg(
        'assistant',
        [
          {
            type: 'toolRequest',
            id: 'd3',
            toolCall: {
              status: 'success',
              value: {
                name: 'delegate',
                arguments: { instructions: 'implement task 264: ledger schema for jobs' },
              },
            },
          } as ToolRequestContent,
        ],
        { created: T0 + 1 }
      ),
      msg('assistant', [response('d3', '## Files Changed\n- `ledger.ts`')], {
        created: T0 + 90,
      }),
    ];
    const event = workerEvent('s1', delegation, messages);
    expect(event).toMatchObject({
      turnId: 'u1',
      member: 'implementer',
      taskRef: 'task 264',
      charterSha: null,
      taskHash: null,
      baseSha: null,
    });
  });

  it('leaves the new worker fields null, not omitted, when the delegate call left no trace', () => {
    const delegation: Delegation = {
      subagentSessionId: 'child-4',
      parentSessionId: 's1',
      source: 'implementer',
      title: 'ad hoc',
      status: 'done',
      updatedAt: '2026-09-20T10:00:00.000Z',
    };
    const event = workerEvent('s1', delegation, []);
    expect(event).toMatchObject({ turnId: null, taskRef: null, charterSha: null });
  });

  it('dates a live delegation by its delegate response, so a later session edit counts', () => {
    const live: Delegation = {
      subagentSessionId: 'child-2',
      parentSessionId: 's1',
      source: 'implementer',
      title: 'task 2',
      status: 'done',
      parentToolCallId: 'd2',
    };
    const messages = [
      msg('assistant', [response('d2', '## Files Changed\n- `src/b.ts`')], { created: T0 }),
      msg('assistant', [edit('e9', 'src/b.ts')], { created: T0 + 30 }),
    ];
    const worker = workerEvent('s1', live, messages, () => '2099-01-01T00:00:00.000Z');
    expect(worker?.at).toBe(new Date(T0 * 1000).toISOString());
    expect(correctionEvents('s1', messages, [worker!])).toHaveLength(1);
    const seeded = workerEvent(
      's1',
      { ...live, parentToolCallId: undefined, updatedAt: '2026-09-20T09:00:00.000Z' },
      messages
    );
    expect(seeded?.at).toBe('2026-09-20T09:00:00.000Z');
  });
});

describe('editedPath', () => {
  it('reads the path of a write, an ACP edit, and nothing from a read or a shell', () => {
    expect(editedPath(edit('x', 'src/a.ts', 'write'))).toBe('src/a.ts');
    expect(editedPath(edit('x', 'src/a.ts', 'str_replace'))).toBe('src/a.ts');
    expect(editedPath(edit('x', 'src/a.ts', 'view'))).toBeNull();
    expect(editedPath(acpEdit('x', '/repo/src/a.ts'))).toBe('/repo/src/a.ts');
    expect(
      editedPath({
        toolCall: {
          status: 'success',
          value: { name: 'developer__shell', arguments: { command: 'sed -i s/a/b/ a.ts' } },
        },
      })
    ).toBeNull();
  });
});

describe('correctionEvents', () => {
  const worker = {
    kind: 'worker' as const,
    at: new Date(T0 * 1000).toISOString(),
    sessionId: 's1',
    workerSessionId: 'child-1',
    status: 'done' as const,
    blocked: false,
    filesChanged: ['ui/desktop/src/workspace/pane-store.ts', 'src/b.ts'],
  };

  it("counts a session edit on a worker's file after the worker returned", () => {
    const messages = [
      msg('assistant', [acpEdit('e1', '/Users/me/repo/ui/desktop/src/workspace/pane-store.ts')], {
        created: T0 + 60,
      }),
      msg('assistant', [edit('e2', 'src/c.ts')], { created: T0 + 61 }),
      msg('assistant', [edit('e3', 'src/b.ts', 'view')], { created: T0 + 62 }),
    ];
    const events = correctionEvents('s1', messages, [worker]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'correction',
      workerSessionId: 'child-1',
      toolCallId: 'e1',
    });
  });

  it('ignores an edit before the worker returned', () => {
    const messages = [msg('assistant', [edit('e0', 'src/b.ts')], { created: T0 - 10 })];
    expect(correctionEvents('s1', messages, [worker])).toEqual([]);
  });
});

describe('reviewEvent', () => {
  it('reads the verdict from a review session and nothing from a plain chat', () => {
    const messages = [
      msg('assistant', [text('## Verdict\nPASS WITH ISSUES\n\n## Correctness Issues\n- one')], {
        created: T0,
      }),
    ];
    expect(reviewEvent('r1', 'Review: wt/undo vs main', messages)).toMatchObject({
      kind: 'review',
      verdict: 'PASS WITH ISSUES',
      branch: 'wt/undo',
      base: 'main',
    });
    expect(reviewEvent('s1', 'per-panel tab bars', messages)).toBeNull();
  });
});

describe('landEvent', () => {
  it('records land paths and message for the sha', () => {
    const event = landEvent('s1', 'abc123', ['a.ts', 'b.ts'], 'task 267: land', '2026-09-23T10:00:00.000Z');
    expect(event).toEqual({
      kind: 'land',
      at: '2026-09-23T10:00:00.000Z',
      sessionId: 's1',
      sha: 'abc123',
      paths: ['a.ts', 'b.ts'],
      message: 'task 267: land',
    });
  });

  // 269's Telemetry fold filters ledger events by `e.sessionId === sessionId` (the chat on
  // screen) before it ever looks at `land` — a land keyed to a worker's session id would never
  // be seen, and that worker would read `unknown` forever.
  it('carries the committing session S, not a worker id, so 269s fold can find it', () => {
    const event = landEvent('parent-session-S', 'sha1', ['a.ts'], 'msg');
    expect(event.sessionId).toBe('parent-session-S');
  });
});

describe('linkEventFromCommit', () => {
  it('reads a Fixes-job trailer and appends a link', () => {
    const message = 'task 267: land the writers\n\nFixes-job: child-9\n';
    expect(parseFixesJobTrailer(message)).toBe('child-9');
    expect(linkEventFromCommit('s1', message, 'sha1', '2026-09-23T10:00:00.000Z')).toEqual({
      kind: 'link',
      at: '2026-09-23T10:00:00.000Z',
      sessionId: 's1',
      workerSessionId: 'child-9',
      by: 'user',
      fromSha: 'sha1',
    });
  });

  it('appends no link from a commit message with no trailer', () => {
    expect(parseFixesJobTrailer('just a commit message')).toBeNull();
    expect(linkEventFromCommit('s1', 'just a commit message', 'sha1')).toBeNull();
  });
});

describe('gapEvent', () => {
  it('appends a gap after a heartbeat older than 10 minutes', () => {
    const now = '2026-09-23T10:00:00.000Z';
    const tenMinAgo = '2026-09-23T09:50:00.000Z';
    const elevenMinAgo = '2026-09-23T09:49:00.000Z';
    expect(gapEvent('s1', elevenMinAgo, now)).toEqual({
      kind: 'gap',
      at: now,
      sessionId: 's1',
      from: elevenMinAgo,
      to: now,
    });
    expect(gapEvent('s1', tenMinAgo, now)).toBeNull();
    expect(gapEvent('s1', null, now)).toBeNull();
  });
});

describe('pendingEvents', () => {
  it('returns every implied event once and skips what was already written', () => {
    const delegation: Delegation = {
      subagentSessionId: 'child-1',
      parentSessionId: 's1',
      source: 'implementer',
      title: 'task 1',
      status: 'done',
      parentToolCallId: 'd1',
      updatedAt: new Date(T0 * 1000).toISOString(),
    };
    const messages = [
      msg('assistant', [response('d1', '## Files Changed\n- `a.ts`')], { created: T0 }),
      msg('assistant', [edit('e1', 'a.ts')], {
        id: 'a2',
        created: T0 + 5,
        metadata: { agentVisible: true, userVisible: true, inference, usage },
      }),
    ];
    const first = pendingEvents('s1', 'chat', messages, [delegation], new Set());
    expect(first.map((e) => e.kind).sort()).toEqual(['correction', 'turn', 'worker']);
    const written = new Set(first.map(eventKey));
    expect(pendingEvents('s1', 'chat', messages, [delegation], written)).toEqual([]);
  });
});
