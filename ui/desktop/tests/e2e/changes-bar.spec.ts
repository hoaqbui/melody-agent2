import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { test, expect, openPane } from './fixtures';

const realHome = homedir();
const previousEnv = { HOME: process.env.HOME, HERMIT_STATE_DIR: process.env.HERMIT_STATE_DIR };
let scratch = '';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', ['-c', 'user.name=changes-bar', '-c', 'user.email=changes-bar@test', ...args], {
    cwd,
    stdio: 'pipe',
  }).toString();

test.describe('changes bar', () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-changes-bar-'));
    const notes = join(scratch, 'notes.md');
    writeFileSync(notes, 'line 1\nline 2\n');
    git(scratch, ['init', '-q']);
    git(scratch, ['add', 'notes.md']);
    git(scratch, ['commit', '-q', '-m', 'base']);
    mkdirSync(join(scratch, 'Library'), { recursive: true });
    process.env.HERMIT_STATE_DIR ??=
      process.platform === 'darwin'
        ? join(realHome, 'Library', 'Caches', 'hermit')
        : join(process.env.XDG_CACHE_HOME ?? join(realHome, '.cache'), 'hermit');
    process.env.HOME = scratch;
  });

  test.afterAll(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
  });

  test('shows changes bar with stats, Review, Accept all, and Discard, then Undo', async ({
    goosePage,
  }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });

    const changesBarInitial = goosePage.locator('[data-testid="changes-bar-stats"]');
    await expect(changesBarInitial).toHaveCount(0);

    // Step 2: Modify the tree — append two lines to notes.md and create new.txt
    const notes = join(scratch, 'notes.md');
    const newFile = join(scratch, 'new.txt');
    writeFileSync(notes, 'line 1\nline 2\nline 3\nline 4\n');
    writeFileSync(newFile, 'new content\n');

    // Wait for the bar to appear (within 35s from git status poll)
    const changesBarStats = goosePage.locator('[data-testid="changes-bar-stats"]');
    await expect(changesBarStats).toHaveText(/2 files · \+3 −0/, { timeout: 35000 });

    // Step 3: Click Review → Changes pane opens, notes.md selected
    const reviewButton = goosePage.locator('button', { hasText: 'Review' });
    await reviewButton.click();

    const diffPane = goosePage.locator('[data-testid="diff-pane"]');
    await expect(diffPane).toBeVisible({ timeout: 10000 });

    const notesRow = goosePage.locator('[data-testid="diff-file"][data-path="notes.md"]');
    await expect(notesRow).toBeVisible();

    // Step 4: Click Accept all → Git pane opens, files staged, commit box focused
    const acceptAllButton = goosePage.locator('[data-testid="changes-bar-accept"]');
    await acceptAllButton.click();

    const gitPane = goosePage.locator('[data-testid="git-pane"]');
    await expect(gitPane).toBeVisible({ timeout: 10000 });

    // Verify both files are staged
    const stagedRow = goosePage.locator('[data-testid="git-staged"]');
    await expect(stagedRow).toContainText('notes.md');
    await expect(stagedRow).toContainText('new.txt');

    // Verify commit textarea is focused
    const commitTextarea = goosePage.locator('[data-testid="git-message"]');
    const isFocused = await commitTextarea.evaluate((el) => document.activeElement === el);
    expect(isFocused).toBe(true);

    // Step 5: Unstage both files, click Discard → tree clean, bar shows Discarded · Undo
    const unstageButtons = goosePage.locator('[data-testid="git-unstage"]');
    const count = await unstageButtons.count();
    for (let i = 0; i < count; i++) {
      await unstageButtons.first().click();
    }

    // Go back to Changes pane (or anywhere that shows the bar)
    await openPane(goosePage, 'diff');

    const discardButton = goosePage.locator('[data-testid="changes-bar-discard"]');
    await discardButton.click();

    // Bar shows "Discarded · Undo" for at least 5 seconds
    const discardedMessage = goosePage.locator('text=Discarded');
    await expect(discardedMessage).toBeVisible();

    const undoButton = goosePage.locator('[data-testid="changes-bar-undo"]');
    await expect(undoButton).toBeVisible();

    // Step 6: Click Undo → files back
    await undoButton.click();

    // Bar should show stats again (within the next poll)
    await expect(changesBarStats).toContainText(/files/, { timeout: 10000 });

    // Step 7: Keyboard accessibility — tab through the bar's controls
    // Focus on Review button
    const reviewBtn = goosePage.locator('button', { hasText: 'Review' });
    const acceptBtn = goosePage.locator('[data-testid="changes-bar-accept"]');
    const discardBtn = goosePage.locator('[data-testid="changes-bar-discard"]');

    await reviewBtn.focus();
    let focused = await reviewBtn.evaluate((el) => document.activeElement === el);
    expect(focused).toBe(true);

    // Tab to Accept all
    await goosePage.keyboard.press('Tab');
    focused = await acceptBtn.evaluate((el) => document.activeElement === el);
    expect(focused).toBe(true);

    // Tab to Discard
    await goosePage.keyboard.press('Tab');
    focused = await discardBtn.evaluate((el) => document.activeElement === el);
    expect(focused).toBe(true);
  });
});
