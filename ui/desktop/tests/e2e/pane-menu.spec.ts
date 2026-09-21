import { test, expect, emptyDock, openPane } from './fixtures';

// Task 40: the pane menu in the code-editor standard — Terminal, Changes, Browser one click
// away and the rest under ⋯ — on the Work column's permanent tab bar (task 71, which retired
// task 60's floating rail): at the default width the other launchers fold under a chevron
// and the ⋯ session menu lists them too. A click opens a pane into the column, one at a
// time (a split is a drag, 2026-09-20). No session is needed: the Hub has the shell.
test.describe('pane menu', () => {
  test('opens panes from the bar and shows no "Diff"', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await emptyDock(goosePage);

    // An empty bar holds + and ⋯ only (tasks 117–120): tabs are what is open.
    const menu = goosePage.locator('[data-testid="workspace-pane-menu"]');
    const buttons = menu.getByRole('button');
    await expect(buttons).toHaveCount(2);
    // Task 69: ⋯ is the session's menu, so its name says so.
    for (const [index, name] of ['Add a tab', 'Session menu'].entries()) {
      await expect(buttons.nth(index)).toHaveAccessibleName(name);
    }
    await expect(goosePage.locator('[data-testid="workspace-header"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="workspace-header-status"]')).toHaveCount(0);

    const side = goosePage.locator('[data-testid="workspace-side-panel"]');
    // The bar starts with no tabs: + lists every pane (tasks 117–120); Terminal added
    // through it is the bar's one pressed tab, its tooltip its name.
    await expect(goosePage.locator('[data-testid="workspace-panel-empty"]')).toBeVisible();
    await openPane(goosePage, 'terminal');
    const terminal = goosePage.locator('[data-testid="workspace-pane-button-terminal"]');
    await expect(side.locator('[data-testid="workspace-pane-terminal"]')).toBeVisible();
    await expect(terminal).toHaveAttribute('aria-pressed', 'true');
    await terminal.hover();
    await expect(goosePage.getByRole('tooltip')).toHaveText('Terminal');

    await goosePage.locator('[data-testid="workspace-pane-more"]').click();
    const item = goosePage.locator('[data-testid="workspace-pane-item-markdown"]');
    await expect(item).toBeVisible();
    await expect(item).toHaveText('Markdown');
    await item.click();
    await expect(goosePage.locator('[data-testid="workspace-pane-more-menu"]')).toHaveCount(0);
    // Markdown takes the column and parks Terminal (one pane at a time, 2026-09-20); the
    // opened tab joins the bar pressed, Terminal's stays open but not pressed.
    const markdown = side.locator('[data-testid="workspace-pane-markdown"]');
    await expect(markdown).toBeVisible();
    await expect(markdown).toHaveAttribute('data-position', 'full');
    await expect(
      goosePage.locator('[data-testid="workspace-pane-button-markdown"]')
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(terminal).toHaveAttribute('aria-pressed', 'false');

    // + lists only what is not open; Browser added through it takes the column and parks
    // Markdown — still open, its tab there.
    await goosePage.locator('[data-testid="workspace-panel-add"]').click();
    await expect(goosePage.locator('[data-testid="workspace-panel-add-files"]')).toBeVisible();
    await expect(goosePage.locator('[data-testid="workspace-panel-add-terminal"]')).toHaveCount(0);
    await goosePage.locator('[data-testid="workspace-panel-add-browser"]').click();
    const browser = goosePage.locator('[data-testid="workspace-pane-button-browser"]');
    const opened = side.locator('[data-testid="workspace-pane-browser"]');
    await expect(opened).toBeVisible();
    await expect(opened).toHaveAttribute('data-position', 'full');
    await expect(opened.locator('[data-testid="browser-pane"]')).toBeVisible();
    await expect(markdown).toBeHidden();
    await expect(
      goosePage.locator('[data-testid="workspace-pane-button-markdown"]')
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(browser).toHaveAttribute('aria-pressed', 'true');
    // A click closes its own tooltip, and the closed ⋯ menu leaves no tooltip behind.
    await expect(goosePage.getByRole('tooltip')).toHaveCount(0);

    expect(await shell.innerText()).not.toMatch(/\bDiff\b/);

    await goosePage.screenshot({
      path: test.info().outputPath('pane-menu.png'),
      fullPage: true,
    });
    // The column persists per project in the app's own storage: leave the user's empty.
    await emptyDock(goosePage);
    await expect(menu).toBeVisible();
  });
});
