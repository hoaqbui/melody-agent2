import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect, emptyDock, openPane } from './fixtures';

// PRD step 4: open a file from Files, type, ⌘S → the file on disk changed. Then the two
// disk-change paths (a clean buffer follows disk; a dirty one gets the reload bar) and the
// markdown Preview. GOOSE_TEST_DIR (task 58) opens the window on a scratch directory holding
// one markdown file; the user's own config stays where it is, so the provider check on launch
// still finds a seat (task 104).
const previousDir = process.env.GOOSE_TEST_DIR;
let scratch = '';
let file = '';

test.describe('editor pane', () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-editor-pane-'));
    file = join(scratch, 'notes.md');
    writeFileSync(file, '# Title\n\none\ntwo\n');
    process.env.GOOSE_TEST_DIR = scratch;
  });

  test.afterAll(() => {
    if (previousDir === undefined) delete process.env.GOOSE_TEST_DIR;
    else process.env.GOOSE_TEST_DIR = previousDir;
    rmSync(scratch, { recursive: true, force: true });
  });

  test('edits a file, saves it with ⌘S, follows disk and previews markdown', async ({
    goosePage,
  }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await emptyDock(goosePage);
    await openPane(goosePage, 'files');
    const files = goosePage.locator('[data-testid="files-pane"]');
    await expect(files).not.toHaveAttribute('data-state', 'loading', { timeout: 15000 });
    await goosePage.locator('[data-testid="files-row"][data-path$="/notes.md"]').click();

    const pane = goosePage.locator('[data-testid="editor-pane"]');
    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(pane.locator('[data-testid="workspace-editor-file"]')).toContainText('notes.md');
    const content = pane.locator('.cm-content');
    await expect(content).toContainText('two');
    const save = pane.locator('[data-testid="editor-save"]');
    await expect(save).toBeDisabled();

    await pane.locator('.cm-line').last().click();
    await goosePage.keyboard.type('three\n');
    await expect(pane).toHaveAttribute('data-dirty', 'true');
    await expect(save).toBeEnabled();
    await goosePage.keyboard.press('Meta+s');
    await expect.poll(() => readFileSync(file, 'utf8')).toBe('# Title\n\none\ntwo\nthree\n');
    await expect(pane).not.toHaveAttribute('data-dirty', 'true');
    await expect(pane).toHaveAttribute('data-state', 'ready');

    // Clean buffer: an outside write is taken silently.
    writeFileSync(file, '# Title\n\nexternal\n');
    await expect(content).toContainText('external');
    await expect(pane).not.toHaveAttribute('data-dirty', 'true');

    // Dirty buffer: the outside write waits behind the reload bar until Reload.
    await pane.locator('.cm-line').last().click();
    await goosePage.keyboard.type('mine');
    await expect(pane).toHaveAttribute('data-dirty', 'true');
    writeFileSync(file, '# Title\n\ntheirs\n');
    const bar = pane.locator('[data-testid="editor-reload-bar"]');
    await expect(bar).toBeVisible();
    await expect(pane).toHaveAttribute('data-state', 'partial');
    await expect(content).toContainText('mine');
    await pane.locator('[data-testid="editor-reload"]').click();
    await expect(bar).toHaveCount(0);
    await expect(content).toContainText('theirs');
    await expect(pane).not.toHaveAttribute('data-dirty', 'true');

    await pane.locator('[data-testid="editor-view-preview"]').click();
    await expect(pane.locator('[data-testid="editor-preview"] h1')).toHaveText('Title');
    await expect(content).toHaveCount(0);
    await pane.locator('[data-testid="editor-view-source"]').click();
    await expect(pane.locator('.cm-content')).toContainText('theirs');

    await goosePage.screenshot({
      path: test.info().outputPath('editor-pane.png'),
      fullPage: true,
    });
  });
});
