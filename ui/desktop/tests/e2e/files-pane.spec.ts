import { test, expect, emptyDock, openPane } from './fixtures';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

const createFilesTestRepo = (): string => {
  const scratch = mkdtempSync(join(tmpdir(), 'goose-files-pane-'));
  git(scratch, ['init', '-q', '-b', 'main']);
  git(scratch, ['config', 'user.name', 'files-test']);
  git(scratch, ['config', 'user.email', 'files@test']);

  // Create 6 files: 4 committed, 1 modified, 1 untracked
  writeFileSync(join(scratch, 'file1.ts'), 'console.log("1");\n');
  writeFileSync(join(scratch, 'file2.ts'), 'console.log("2");\n');
  writeFileSync(join(scratch, 'notes.md'), 'original notes\n');
  writeFileSync(join(scratch, 'readme.md'), '# Project\n');

  git(scratch, ['add', '.']);
  git(scratch, ['commit', '-q', '-m', 'initial']);

  // Modify notes.md (M status)
  writeFileSync(join(scratch, 'notes.md'), 'modified notes\n');

  // Create untracked file (? status)
  writeFileSync(join(scratch, 'untracked.txt'), 'untracked\n');

  // Create one more file
  writeFileSync(join(scratch, 'config.json'), '{}');
  git(scratch, ['add', 'config.json']);
  git(scratch, ['commit', '-q', '-m', 'add config']);

  process.env.GOOSE_TEST_DIR = scratch;
  return scratch;
};

// PRD step 4: open Files, see the cwd tree, click a file → the Editor pane takes the column
// with that file and Files stays a tab (one pane at a time, 2026-09-20). The tree is the window's working
// directory, so the walk reads the root the pane shows and picks the first rows instead of
// naming any.
test.describe('files pane', () => {
  test('shows the cwd tree and opens a file in the editor', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });

    // Files folds under the bar's chevron at the default width and sits under ⋯ too (task
    // 40); the column is emptied first.
    await emptyDock(goosePage);
    await openPane(goosePage, 'files');
    const pane = goosePage.locator('[data-testid="files-pane"]');
    await expect(pane).toBeVisible();
    await expect(pane).not.toHaveAttribute('data-state', 'loading', { timeout: 15000 });
    await expect(pane).not.toHaveAttribute('data-state', 'error');

    const root = await goosePage.locator('[data-testid="files-root"]').innerText();
    expect(root).toMatch(/^\//);
    const underRoot = new RegExp(`^${escapeRegExp(root)}/`);

    const rows = goosePage.locator('[data-testid="files-row"]');
    expect(await rows.count()).toBeGreaterThan(0);

    const dirRow = goosePage.locator('[data-testid="files-row"][data-type="dir"]').first();
    if ((await dirRow.count()) > 0) {
      await dirRow.click();
      await expect(dirRow).toHaveAttribute('aria-expanded', 'true');
      await dirRow.click();
      await expect(dirRow).toHaveAttribute('aria-expanded', 'false');
    }

    const fileRow = goosePage.locator('[data-testid="files-row"][data-type="file"]').first();
    await expect(fileRow).toBeVisible();
    const filePath = (await fileRow.getAttribute('data-path')) ?? '';
    expect(filePath).toMatch(underRoot);
    await fileRow.click();

    const editor = goosePage.locator('[data-testid="workspace-pane-editor"]');
    await expect(editor).toBeVisible();
    await expect(editor.locator('[data-testid="workspace-editor-file"]')).toContainText(filePath);
    // The Editor takes the column and Files is one tab away (one pane at a time, 2026-09-20).
    await expect(editor).toHaveAttribute('data-position', 'full');
    await expect(
      goosePage.locator(
        '[data-testid="workspace-side-tab-editor"] [data-testid="workspace-pane-button-editor"]'
      )
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(pane).toBeHidden();
    await expect(goosePage.locator('[data-testid="workspace-pane-button-files"]')).toHaveAttribute(
      'data-open',
      'true'
    );

    await goosePage.screenshot({
      path: test.info().outputPath('files-pane.png'),
      fullPage: true,
    });
    // The dock persists per project in the app's own storage: leave the user's empty.
    await emptyDock(goosePage);
  });

  // The fixture launches the app before the test body runs, so the scratch repo (and
  // GOOSE_TEST_DIR, which points the window at it) must exist in beforeAll.
  test.describe('on a scratch repo', () => {
    let scratch = '';
    const previousDir = process.env.GOOSE_TEST_DIR;
    test.beforeAll(() => {
      scratch = createFilesTestRepo();
    });
    test.afterAll(() => {
      if (scratch) rmSync(scratch, { recursive: true, force: true });
      if (previousDir === undefined) delete process.env.GOOSE_TEST_DIR;
      else process.env.GOOSE_TEST_DIR = previousDir;
    });

    test('filter, context menu, git tints, create/rename/delete with undo', async ({
      goosePage,
    }) => {
      try {
        const shell = goosePage.locator('[data-testid="workspace-shell"]');
        await expect(shell).toBeVisible({ timeout: 30000 });

        await emptyDock(goosePage);
        await openPane(goosePage, 'files');
        const pane = goosePage.locator('[data-testid="files-pane"]');
        await expect(pane).toBeVisible();
        await expect(pane).not.toHaveAttribute('data-state', 'loading', { timeout: 15000 });

        // Test 1: Filter with Shift+Cmd+F
        const filterInput = goosePage.locator('[data-testid="files-filter"]');
        await goosePage.keyboard.press('Shift+Meta+F');
        await expect(filterInput).toBeFocused();
        await filterInput.type('notes');
        let rows = goosePage.locator('[data-testid="files-row"]');
        await expect(rows).toHaveCount(1);
        const notesRow = rows.first();
        await expect(notesRow).toContainText('notes.md');
        await filterInput.press('Escape');
        await expect(filterInput).toHaveValue('');

        // Test 2: Git status tints
        await filterInput.clear();
        rows = goosePage.locator('[data-testid="files-row"]');
        const modifiedRow = goosePage.locator('[data-testid="files-row"][data-git="M"]');
        await expect(modifiedRow).toContainText('notes.md');
        const untrackedRow = goosePage.locator('[data-testid="files-row"][data-git="?"]');
        await expect(untrackedRow).toContainText('untracked.txt');

        // Test 3: Right-click context menu
        await notesRow.click({ button: 'right' });
        const menu = goosePage.locator('[data-testid="files-menu"]');
        await expect(menu).toBeVisible();
        const renameBtn = goosePage.locator('[data-testid="files-menu-rename"]');
        await expect(renameBtn).toBeVisible();
        const deleteBtn = goosePage.locator('[data-testid="files-menu-delete"]');
        await expect(deleteBtn).toBeVisible();
        const copyPathBtn = goosePage.locator('[data-testid="files-menu-copy-path"]');
        await expect(copyPathBtn).toBeVisible();
        const addToChatBtn = goosePage.locator('[data-testid="files-menu-add-to-chat"]');
        await expect(addToChatBtn).toBeVisible();
        await goosePage.keyboard.press('Escape');
        await expect(menu).toBeHidden();

        // Test 4: Create new file
        await filterInput.clear();
        const newFileBtn = goosePage.locator('[data-testid="files-new-file"]');
        await newFileBtn.click();
        const nameInput = goosePage.locator('[data-testid="files-name-input"]');
        await expect(nameInput).toBeFocused();
        await nameInput.type('test.ts');
        await nameInput.press('Enter');
        // The new file opens in the Editor, which takes the column (one pane at a time,
        // 2026-09-20); Files is one tab away for the rest of the walk.
        const editor = goosePage.locator('[data-testid="workspace-pane-editor"]');
        await expect(editor).toBeVisible();
        await openPane(goosePage, 'files');
        const testRow = goosePage.locator('[data-testid="files-row"][data-path*="test.ts"]');
        await expect(testRow).toBeVisible();

        // Test 5: Rename
        await testRow.click({ button: 'right' });
        await goosePage.locator('[data-testid="files-menu-rename"]').click();
        const renameInput = goosePage.locator('[data-testid="files-name-input"]');
        await expect(renameInput).toBeFocused();
        await renameInput.fill('');
        await renameInput.type('renamed.ts');
        await renameInput.press('Enter');
        // The rename re-opens the file, so the Editor takes the column showing the new name;
        // Files comes back to the front for the row.
        const editorFile = goosePage.locator('[data-testid="workspace-editor-file"]');
        await expect(editorFile).toContainText('renamed.ts');
        await openPane(goosePage, 'files');
        const renamedRow = goosePage.locator('[data-testid="files-row"][data-path*="renamed.ts"]');
        await expect(renamedRow).toBeVisible();

        // Test 6: Delete with Undo
        await renamedRow.click({ button: 'right' });
        await goosePage.locator('[data-testid="files-menu-delete"]').click();
        await expect(renamedRow).not.toBeVisible();
        const undoBtn = goosePage.locator('[data-testid="files-undo-button"]');
        await expect(undoBtn).toBeVisible();
        await undoBtn.click();
        await expect(renamedRow).toBeVisible();

        // Test 7: Copy path (the filter is clear now, so name the row by its path)
        const notesRowUnfiltered = goosePage.locator(
          '[data-testid="files-row"][data-path$="notes.md"]'
        );
        await notesRowUnfiltered.click({ button: 'right' });
        await goosePage.locator('[data-testid="files-menu-copy-path"]').click();
        const clipboardText = await goosePage.evaluate('navigator.clipboard.readText()');
        expect(clipboardText).toContain('notes.md');

        // Test 8: Keyboard navigation
        await filterInput.focus();
        await goosePage.keyboard.press('ArrowDown');
        const focusedRow = await goosePage.evaluate(
          () => document.querySelector('[data-testid="files-row"]:focus') !== null
        );
        expect(focusedRow).toBe(true);

        await emptyDock(goosePage);
      } finally {
        await emptyDock(goosePage).catch(() => {});
      }
    });
  });
});
