import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Message } from '../../../types/message';
import {
  ARTIFACT_PANE_STATES,
  artifactFromExport,
  firstLine,
  lastAssistantText,
  paneState,
} from './artifact-state';

function message(role: Message['role'], text: string, userVisible = true): Message {
  return {
    role,
    created: 0,
    content: text ? [{ type: 'text', text }] : [],
    metadata: { userVisible, agentVisible: true },
  };
}

// The shape a delegated child's JSON export came back in (task 30 probe against task 65's
// proof root: `_goose/unstable/session/export`, format json, 2026-09-16).
const EXPORT = JSON.stringify({
  id: '20260916_2',
  session_type: 'sub_agent',
  provider_name: 'claude-acp',
  conversation: [
    message('user', 'say hello'),
    message('user', 'turn context', false),
    message('assistant', '# Research Brief\n\n## Objective\n\nspike-ok-30 Hello!'),
  ],
});

describe('artifact text', () => {
  it('is the last assistant message with text, tool-only and hidden messages skipped', () => {
    const messages = [
      message('user', 'task'),
      message('assistant', 'first'),
      message('assistant', 'handoff'),
      message('assistant', ''),
      message('assistant', 'hidden', false),
    ];
    expect(lastAssistantText(messages)).toBe('handoff');
    expect(lastAssistantText([message('user', 'task')])).toBeNull();
    expect(lastAssistantText([])).toBeNull();
  });

  it('reads the export record', () => {
    expect(artifactFromExport(EXPORT)).toBe(
      '# Research Brief\n\n## Objective\n\nspike-ok-30 Hello!'
    );
    expect(artifactFromExport(JSON.stringify({ id: 'x', conversation: null }))).toBeNull();
  });

  it('titles a row by the first line, heading marks dropped', () => {
    expect(firstLine('# Research Brief\n\n## Objective')).toBe('Research Brief');
    expect(firstLine('\n\n  ## Plan  \nbody')).toBe('Plan');
    expect(firstLine('spike-ok-30 Hello!')).toBe('spike-ok-30 Hello!');
    expect(firstLine('')).toBe('');
  });
});

describe('pane state', () => {
  it('declares only states from DESIGN.md §Shared component states, plus ready', () => {
    const design = readFileSync(resolve(__dirname, '../../../../../../DESIGN.md'), 'utf8');
    const table = design.split('## Shared component states')[1].split('\n## ')[0];
    const named = [...table.matchAll(/^\| (\w+) \|/gm)].map((match) => match[1].toLowerCase());
    expect(named).toContain('empty');
    for (const state of ARTIFACT_PANE_STATES) {
      if (state !== 'ready') expect(named).toContain(state);
    }
  });

  it('follows the task lines for Artifact', () => {
    expect(paneState(undefined, false)).toBe('empty');
    expect(paneState(undefined, true)).toBe('loading');
    expect(paneState({ status: 'loading' }, true)).toBe('loading');
    expect(paneState({ status: 'error', message: 'Session not found' }, true)).toBe('error');
    expect(paneState({ status: 'loaded', text: null }, true)).toBe('partial');
    expect(paneState({ status: 'loaded', text: '# Plan' }, true)).toBe('ready');
  });
});
