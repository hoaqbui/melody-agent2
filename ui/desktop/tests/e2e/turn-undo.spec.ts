import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { test, expect } from './fixtures';

const realHome = homedir();
const previousEnv = { HOME: process.env.HOME, HERMIT_STATE_DIR: process.env.HERMIT_STATE_DIR };
let scratch = '';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', ['-c', 'user.name=turn-undo', '-c', 'user.email=turn-undo@test', ...args], {
    cwd,
    stdio: 'pipe',
  }).toString();

test.describe('turn undo', () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-turn-undo-'));
    writeFileSync(join(scratch, 'notes.md'), 'original\n');
    mkdirSync(join(scratch, 'Library'), { recursive: true });
    process.env.HERMIT_STATE_DIR ??=
      process.platform === 'darwin'
        ? join(realHome, 'Library', 'Caches', 'hermit')
        : join(process.env.XDG_CACHE_HOME ?? join(realHome, '.cache'), 'hermit');
    process.env.HOME = scratch;
    git(scratch, ['init', '-q']);
    git(scratch, ['add', 'notes.md']);
    git(scratch, ['commit', '-q', '-m', 'base']);
  });

  test.afterAll(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
  });

  test('turn undo button renders in user messages', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });

    // Send a simple message to create a user message in the transcript
    const input = goosePage.locator('[data-testid="chat-input"]');
    await input.fill('test message');
    await input.press('Enter');

    // Wait for the user message to appear
    const userBubble = goosePage.locator('[data-testid="message-container"].user').last();
    await expect(userBubble).toBeVisible({ timeout: 5000 });

    // Hover to reveal action buttons
    await userBubble.hover();

    // The turn-undo button should exist (it will be disabled without snapshots)
    const turnUndoButton = goosePage.locator('[data-testid="turn-undo"]');
    await expect(turnUndoButton).toHaveCount(1);
  });
});
