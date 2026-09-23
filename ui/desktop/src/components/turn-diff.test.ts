import { describe, expect, it } from 'vitest';
import { repoRelative, turnDiffFromToolCall } from './turn-diff';
import type { ToolRequestMessageContent, ToolResponseMessageContent } from '../types/message';

function request(
  name: string,
  args: Record<string, unknown>,
  metadata?: Record<string, unknown>
): ToolRequestMessageContent {
  return {
    id: 'call-1',
    type: 'toolRequest',
    toolCall: { status: 'success', value: { name, arguments: args } },
    ...(metadata ? { metadata } : {}),
  };
}

function response(metadata: Record<string, unknown>): ToolResponseMessageContent {
  return {
    id: 'call-1',
    type: 'toolResponse',
    toolResult: { status: 'success', value: { content: [], isError: false } },
    metadata,
  };
}

describe('turnDiffFromToolCall', () => {
  it('prefers the ACP diff content item on the tool response', () => {
    const toolRequest = request('Edit greet.js', { file_path: '/tmp/other.js' });
    const toolResponse = response({
      content: [{ type: 'diff', path: '/tmp/greet.js', oldText: 'old', newText: 'new' }],
    });
    expect(turnDiffFromToolCall(toolRequest, toolResponse)).toEqual({
      path: '/tmp/greet.js',
      oldText: 'old',
      newText: 'new',
      kind: 'edit',
    });
  });

  it('reads a Claude Edit tool call from its arguments', () => {
    const toolRequest = request('Edit greet.js', {
      file_path: '/tmp/greet.js',
      old_string: 'hello',
      new_string: 'goodbye',
    });
    expect(turnDiffFromToolCall(toolRequest)).toEqual({
      path: '/tmp/greet.js',
      oldText: 'hello',
      newText: 'goodbye',
      kind: 'edit',
    });
  });

  it('reads a Claude Write tool call from its arguments, with no old text', () => {
    const toolRequest = request('Write greet.js', {
      file_path: '/tmp/greet.js',
      content: 'console.log("hi")',
    });
    expect(turnDiffFromToolCall(toolRequest)).toEqual({
      path: '/tmp/greet.js',
      oldText: '',
      newText: 'console.log("hi")',
      kind: 'write',
    });
  });

  it('reads a goose developer__text_editor str_replace call', () => {
    const toolRequest = request('developer__text_editor', {
      command: 'str_replace',
      path: '/tmp/notes.md',
      old_str: 'two',
      new_str: 't93',
    });
    expect(turnDiffFromToolCall(toolRequest)).toEqual({
      path: '/tmp/notes.md',
      oldText: 'two',
      newText: 't93',
      kind: 'edit',
    });
  });

  it('returns null for a non-edit tool call, such as a shell command', () => {
    const toolRequest = request('shell', { command: 'sed -i "s/two/t93/" notes.md' });
    expect(turnDiffFromToolCall(toolRequest)).toBeNull();
  });

  it('prefers metadata.locations over the arguments path', () => {
    const toolRequest = request(
      'Edit greet.js',
      { file_path: '/tmp/greet.js', old_string: 'a', new_string: 'b' },
      { locations: [{ path: '/tmp/real.js', line: 4 }] }
    );
    expect(turnDiffFromToolCall(toolRequest)?.path).toBe('/tmp/real.js');
  });
  it("reads goose's flattened diff text on an external tool call with empty arguments", () => {
    const toolRequest = request('Edit', {});
    const toolResponse: ToolResponseMessageContent = {
      id: 'call-1',
      type: 'toolResponse',
      toolResult: {
        status: 'success',
        value: {
          content: [
            {
              type: 'text',
              text: '--- /tmp/r/notes.md\none\ntwo\nthree\n+++ /tmp/r/notes.md\none\nt93\nthree',
            },
          ],
          isError: false,
        },
      },
    };
    expect(turnDiffFromToolCall(toolRequest, toolResponse)).toEqual({
      path: '/tmp/r/notes.md',
      oldText: 'one\ntwo\nthree',
      newText: 'one\nt93\nthree',
      kind: 'edit',
    });
  });
});

describe('repoRelative', () => {
  it('strips the toplevel across /var and /private/var', () => {
    expect(repoRelative('/var/t/repo/notes.md', '/private/var/t/repo')).toBe('notes.md');
    expect(repoRelative('/private/var/t/repo/a/b.ts', '/var/t/repo/')).toBe('a/b.ts');
  });
  it('leaves a path outside the repo as it is', () => {
    expect(repoRelative('/etc/hosts', '/var/t/repo')).toBe('/etc/hosts');
  });
});
