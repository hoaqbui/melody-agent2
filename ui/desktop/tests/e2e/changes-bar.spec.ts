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
    ['-c', 'user.name=changes-bar', '-c', 'user.email=changes-bar@test', ...args],
    {
      cwd,
      stdio: 'pipe',
    }
  ).toString();

test.describe('changes bar', { tag: '@smoke' }, () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-changes-bar-'));
    const notes = join(scratch, 'notes.md');
    writeFileSync(notes, 'line 1\nline 2\n');
    git(scratch, ['init', '-q']);
    git(scratch, ['add', 'notes.md']);
    git(scratch, ['commit', '-q', '-m', 'base']);
    // The fixture opens the window on GOOSE_TEST_DIR (see fixtures.ts); the app's own config stays.
    process.env.GOOSE_TEST_DIR = scratch;
  });

  test.afterAll(() => {
    if (previousDir === undefined) delete process.env.GOOSE_TEST_DIR;
    else process.env.GOOSE_TEST_DIR = previousDir;
    rmSync(scratch, { recursive: true, force: true });
  });

  test('shows dirty, staged, committed and discarded, through Commit…, Push and Undo', async ({
    goosePage,
  }) => {
    // Several status polls (30 s each) sit inside this walk: dirty, staged, after the
    // commit clears, and after Undo.
    test.setTimeout(240_000);
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
    const reviewButton = goosePage.locator('[data-testid="changes-bar-review"]');
    await reviewButton.click();

    const diffPane = goosePage.locator('[data-testid="diff-pane"]');
    await expect(diffPane).toBeVisible({ timeout: 10000 });

    const notesRow = goosePage.locator('[data-testid="diff-file"][data-path="notes.md"]');
    await expect(notesRow).toBeVisible();
    await expect(notesRow).toHaveAttribute('aria-pressed', 'true');
    await expect(goosePage.locator('[data-testid="diff-view"]')).toBeVisible();

    // Step 4: Stage both files outside the app (as a background tool call would) → the bar
    // reads "staged · not committed", never "0 files · +0 −0" (14-after-commit.png).
    git(scratch, ['add', '-A']);
    await expect(changesBarStats).toHaveText(/2 files staged · not committed/, {
      timeout: 35000,
    });
    await expect(goosePage.locator('[data-testid="changes-bar-unstage"]')).toBeVisible();

    // Step 5: Commit… on the staged state opens the bar's own message box; Commit stages
    // whatever is shown (already staged here) and commits in one step.
    const commitButton = goosePage.locator('[data-testid="changes-bar-commit"]');
    await commitButton.click();

    const commitInput = goosePage.locator('[data-testid="changes-bar-commit-input"]');
    await expect(commitInput).toBeFocused();
    await commitInput.fill('notes: expand and add new.txt');
    await goosePage.locator('[data-testid="changes-bar-commit-send"]').click();

    // Step 6: Committed — sha + subject, Push, and no Undo (no route resets a commit yet).
    const committed = goosePage.locator('[data-testid="changes-bar-committed"]');
    await expect(committed).toBeVisible({ timeout: 10000 });
    await expect(committed).toHaveText(/Committed [0-9a-f]{7} · notes: expand and add new\.txt/);
    await expect(goosePage.locator('[data-testid="changes-bar-push"]')).toBeVisible();
    await expect(goosePage.locator('[data-testid="changes-bar-undo"]')).toHaveCount(0);

    // Step 7: The committed banner clears itself well inside a 30 s poll's worth of time,
    // and the tree is clean, so nothing takes its place — never "0 files · +0 −0".
    await expect(committed).toHaveCount(0, { timeout: 10000 });
    await expect(changesBarStats).toHaveCount(0);

    // Step 8: Dirty again → Discard → Discarded · Undo → Undo brings the files back.
    writeFileSync(notes, 'line 1\nline 2\nline 3\nline 4\nline 5\n');
    await expect(changesBarStats).toHaveText(/1 file · \+1 −0/, { timeout: 35000 });

    const discardButton = goosePage.locator('[data-testid="changes-bar-discard"]');
    await discardButton.click();

    const discardedMessage = goosePage.locator('text=Discarded');
    await expect(discardedMessage).toBeVisible();

    const undoButton = goosePage.locator('[data-testid="changes-bar-undo"]');
    await expect(undoButton).toBeVisible();
    await undoButton.click();

    await expect(changesBarStats).toContainText(/files?/, { timeout: 35000 });

    // Step 9: Keyboard accessibility — tab through the dirty bar's controls.
    const reviewBtn = goosePage.locator('[data-testid="changes-bar-review"]');
    const commitBtn = goosePage.locator('[data-testid="changes-bar-commit"]');
    const discardBtn = goosePage.locator('[data-testid="changes-bar-discard"]');

    await reviewBtn.focus();
    let focused = await reviewBtn.evaluate((el) => document.activeElement === el);
    expect(focused).toBe(true);

    await goosePage.keyboard.press('Tab');
    focused = await commitBtn.evaluate((el) => document.activeElement === el);
    expect(focused).toBe(true);

    await goosePage.keyboard.press('Tab');
    focused = await discardBtn.evaluate((el) => document.activeElement === el);
    expect(focused).toBe(true);
  });
});
