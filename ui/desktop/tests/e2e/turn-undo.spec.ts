import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect } from './fixtures';

const previousDir = process.env.GOOSE_TEST_DIR;
let scratch = '';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', ['-c', 'user.name=turn-undo', '-c', 'user.email=turn-undo@test', ...args], {
    cwd,
    stdio: 'pipe',
  }).toString();

test.describe('turn undo', { tag: '@seat' }, () => {
  test.setTimeout(120000);

  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-turn-undo-'));
    writeFileSync(join(scratch, 'notes.md'), 'original\n');
    process.env.GOOSE_TEST_DIR = scratch;
    git(scratch, ['init', '-q']);
    git(scratch, ['add', 'notes.md']);
    git(scratch, ['commit', '-q', '-m', 'base']);
  });

  test.afterAll(() => {
    if (previousDir === undefined) delete process.env.GOOSE_TEST_DIR;
    else process.env.GOOSE_TEST_DIR = previousDir;
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
