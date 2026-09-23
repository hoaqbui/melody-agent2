import { execFileSync } from 'child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// Task 176: the loop from a prompt to a commit with keys only — type a task on the Hub, Enter,
// reach the Changes bar's Commit…, take the drafted message, Enter. A step keys cannot reach
// fails here rather than being skipped.
const previousDir = process.env.GOOSE_TEST_DIR;
let scratch = '';
const git = (args: string[]) =>
  execFileSync('git', args, { cwd: scratch, stdio: 'pipe' }).toString().trim();

async function tabTo(page: Page, testId: string, key: 'Tab' | 'Shift+Tab', limit = 25) {
  for (let step = 0; step < limit; step++) {
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
    if (focused === testId) return;
    await page.keyboard.press(key);
  }
  throw new Error(`${testId} is not reachable with ${key} within ${limit} presses`);
}

test.describe('keyboard', { tag: '@seat' }, () => {
  test.beforeAll(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), 'goose-keyboard-')));
    writeFileSync(join(scratch, 'notes.md'), 'one\ntwo\nthree\n');
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.name', 'keyboard']);
    git(['config', 'user.email', 'keyboard@test']);
    git(['add', '.']);
    git(['commit', '-q', '-m', 'base']);
    process.env.GOOSE_TEST_DIR = scratch;
  });
  test.afterAll(() => {
    if (previousDir === undefined) delete process.env.GOOSE_TEST_DIR;
    else process.env.GOOSE_TEST_DIR = previousDir;
    rmSync(scratch, { recursive: true, force: true });
  });

  test('prompt to commit with keys only', async ({ goosePage }) => {
    test.setTimeout(240_000);
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await goosePage.setViewportSize({ width: 1400, height: 900 });

    const input = goosePage.locator('[data-testid="chat-input"]');
    await expect(input).toBeFocused({ timeout: 15000 });
    await goosePage.keyboard.type(
      'In notes.md, replace the line two with keyboard. Edit the file directly.'
    );
    await goosePage.keyboard.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    await expect(goosePage.locator('[data-testid="changes-bar-stats"]')).toBeVisible({
      timeout: 120_000,
    });

    // The composer keeps focus through the turn; the bar sits above it.
    await expect(input).toBeFocused();
    await tabTo(goosePage, 'changes-bar-commit', 'Shift+Tab');
    await goosePage.keyboard.press('Enter');

    const message = goosePage.locator('[data-testid="changes-bar-commit-input"]');
    await expect(message).toBeFocused();
    await expect(message).not.toHaveValue('');
    await goosePage.keyboard.press('Enter');

    await expect(goosePage.locator('[data-testid="changes-bar-committed"]')).toBeVisible({
      timeout: 15000,
    });
    expect(git(['status', '--porcelain'])).toBe('');
    expect(git(['log', '--oneline']).split('\n')).toHaveLength(2);
  });
});
