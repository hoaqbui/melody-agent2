import { test, expect, emptyDock, openPane } from './fixtures';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// PRD step 4: open Files, see the cwd tree, click a file → the Editor pane opens in its own
// panel under Files (task 42) with that file. The tree is the window's working directory, so
// the walk reads the root the pane shows and picks the first rows instead of naming any.
test.describe('files pane', () => {
  test('shows the cwd tree and opens a file in the editor', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });

    // Files sits under ⋯ in the header's pane menu (task 40); the dock is emptied first.
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
    await expect(goosePage.locator('[data-testid="workspace-side-tab-editor"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(pane).toBeVisible();

    await goosePage.screenshot({
      path: test.info().outputPath('files-pane.png'),
      fullPage: true,
    });
    // The dock persists per project in the app's own storage: leave the user's empty.
    await emptyDock(goosePage);
  });
});
