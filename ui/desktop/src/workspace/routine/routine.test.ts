import { describe, expect, it } from 'vitest';
import type { Message } from '../../types/message';
import type { SessionExtension } from '../../acp/session-extensions';
import {
  ROUTINE_DESCRIPTION,
  TRIGGER_CRON,
  firstUserPrompt,
  routineRecipe,
  routineScheduleId,
  triggerCron,
} from './routine';

const message = (role: Message['role'], text: string): Message => ({
  role,
  created: 0,
  content: [{ type: 'text', text }],
  metadata: { userVisible: true, agentVisible: true },
});

describe('routineScheduleId', () => {
  it('keeps what the server accepts and folds the rest to a dash', () => {
    expect(routineScheduleId('Add a line to notes.md')).toBe('Add a line to notes-md');
    expect(routineScheduleId('t59-routine_1')).toBe('t59-routine_1');
    expect(routineScheduleId('  Tidy: the (repo)!  ')).toBe('Tidy- the -repo');
  });

  it('never returns an empty id', () => {
    expect(routineScheduleId('')).toBe('routine');
    expect(routineScheduleId('…')).toBe('routine');
  });
});

describe('triggerCron', () => {
  it('maps the picked triggers to six-field crons, seconds first', () => {
    for (const cron of Object.values(TRIGGER_CRON)) {
      expect(cron.split(' ')).toHaveLength(6);
    }
    expect(triggerCron('hourly', '')).toBe('0 0 * * * *');
    expect(triggerCron('weekly', '')).toBe('0 0 9 * * 1');
    expect(triggerCron('manual', '')).toBe(TRIGGER_CRON.daily);
  });

  it('takes the custom cron as typed, trimmed', () => {
    expect(triggerCron('custom', '  0 30 8 * * 1-5 ')).toBe('0 30 8 * * 1-5');
  });
});

describe('firstUserPrompt', () => {
  it('is the first user text, not a divider or the reply', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        created: 0,
        content: [{ type: 'systemNotification', notificationType: 'inlineMessage', msg: '→ Hard' }],
        metadata: { userVisible: true, agentVisible: false },
      },
      message('user', '  Append a line to notes.md  '),
      message('assistant', 'done'),
      message('user', 'thanks'),
    ];
    expect(firstUserPrompt(messages)).toBe('Append a line to notes.md');
  });

  it('is empty with no user text', () => {
    expect(firstUserPrompt([])).toBe('');
    expect(firstUserPrompt([message('user', '   ')])).toBe('');
  });
});

describe('routineRecipe', () => {
  const extension: SessionExtension = {
    type: 'builtin',
    name: 'developer',
    extensionKey: 'developer',
  };

  it('carries the title, the prompt as instructions and the provider · model', () => {
    const recipe = routineRecipe({
      title: ' Tidy ',
      instructions: 'Append a line\n',
      provider: 'claude-acp',
      model: 'claude-sonnet-4-5',
      extensions: [extension],
    });
    expect(recipe).toEqual({
      version: '1.0.0',
      title: 'Tidy',
      description: ROUTINE_DESCRIPTION,
      instructions: 'Append a line',
      extensions: [{ type: 'builtin', name: 'developer' }],
      settings: { goose_provider: 'claude-acp', goose_model: 'claude-sonnet-4-5' },
    });
  });

  it("leaves the session's bridge out: its port and secret die with the process", () => {
    const bridge: SessionExtension = {
      type: 'streamable_http',
      name: 'goose',
      uri: 'http://127.0.0.1:64351/mcp/20260916_43',
      headers: { 'X-Secret-Key': 'secret' },
      extensionKey: 'goose',
    };
    const recipe = routineRecipe({
      title: 'Tidy',
      instructions: 'x',
      extensions: [bridge, extension],
    });
    expect(recipe.extensions).toEqual([{ type: 'builtin', name: 'developer' }]);
    expect(JSON.stringify(recipe)).not.toContain('secret');
    expect(
      routineRecipe({ title: 'Tidy', instructions: 'x', extensions: [bridge] })
    ).not.toHaveProperty('extensions');
  });

  it('leaves extensions and settings out when the session has none', () => {
    const recipe = routineRecipe({ title: 'Tidy', instructions: 'x', extensions: [] });
    expect('extensions' in recipe).toBe(false);
    expect('settings' in recipe).toBe(false);
  });
});
