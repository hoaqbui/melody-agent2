import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect } from './fixtures';

const previousDir = process.env.GOOSE_TEST_DIR;
let scratch = '';

const git = (cwd: string, args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=transcript-diff', '-c', 'user.email=transcript-diff@test', ...args],
    {
      cwd,
      stdio: 'pipe',
    }
  ).toString();

test.describe('transcript diff cards', { tag: '@seat' }, () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-transcript-diff-'));
    writeFileSync(join(scratch, 'notes.md'), 'one\ntwo\nthree\n');
    git(scratch, ['init', '-q']);
    git(scratch, ['add', 'notes.md']);
    git(scratch, ['commit', '-q', '-m', 'base']);
    process.env.GOOSE_TEST_DIR = scratch;
  });

  test.afterAll(() => {
    if (previousDir === undefined) delete process.env.GOOSE_TEST_DIR;
    else process.env.GOOSE_TEST_DIR = previousDir;
    rmSync(scratch, { recursive: true, force: true });
  });

  test('an edit tool call renders a card with the real change', async ({ goosePage }) => {
    test.setTimeout(120_000);

    const hubInput = goosePage.locator('[data-testid="chat-input"]');
    await hubInput.fill('In notes.md, replace the line two with t93. Edit the file directly.');
    await hubInput.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });

    const card = goosePage.locator('[data-testid="turn-diff-card"][data-path$="notes.md"]');
    await expect(card).toBeVisible({ timeout: 90_000 });
    await expect(card).toContainText('+1');
    await expect(card).toContainText('−1');

    await card.getByRole('button').first().click();
    await expect(card).toContainText('t93');

    await card.getByRole('button', { name: 'Open in Changes' }).click();
    const diffPane = goosePage.locator('[data-testid="diff-pane"]');
    await expect(diffPane).toBeVisible({ timeout: 10000 });
    const notesRow = goosePage.locator('[data-testid="diff-file"][data-path="notes.md"]');
    await expect(notesRow).toHaveAttribute('aria-pressed', 'true');
  });
});
