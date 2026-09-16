import { test, expect, emptyDock } from './fixtures';

// Task 40: the pane menu in the code-editor standard — Terminal, Changes, Browser one click
// away and the rest under ⋯ — on a floating rail at the right edge (task 60) that slides
// into the dock's top strip while a panel is open. Click opens a pane into the dock's top
// panel; shift-click tears it off into its own panel (task 42). No session is needed: the
// Hub has the shell.
test.describe('pane menu', () => {
  test('opens panes from the rail and shows no "Diff"', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await emptyDock(goosePage);

    // Terminal, Changes, Browser and ⋯ — and nothing else on the rail, which floats.
    const menu = goosePage.locator('[data-testid="workspace-pane-menu"]');
    const buttons = menu.getByRole('button');
    await expect(buttons).toHaveCount(4);
    for (const [index, name] of ['Terminal', 'Changes', 'Browser', 'More panes'].entries()) {
      await expect(buttons.nth(index)).toHaveAccessibleName(name);
    }
    await expect(menu).toHaveAttribute('data-docked', 'false');
    await expect(goosePage.locator('[data-testid="workspace-header"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="workspace-header-status"]')).toHaveCount(0);

    const side = goosePage.locator('[data-testid="workspace-side-panel"]');
    const terminal = goosePage.locator('[data-testid="workspace-pane-button-terminal"]');
    await expect(terminal).toHaveAttribute('aria-pressed', 'false');
    await terminal.hover();
    await expect(goosePage.getByRole('tooltip')).toHaveText('Terminal');
    await terminal.click();
    await expect(side.locator('[data-testid="workspace-pane-terminal"]')).toBeVisible();
    await expect(terminal).toHaveAttribute('aria-pressed', 'true');
    // The rail is in the top panel's strip now; it leaves again when the dock empties.
    await expect(menu).toHaveAttribute('data-docked', 'true');
    const topStrip = side.locator('[data-testid="workspace-panel"]').first();
    await expect(topStrip.locator('[data-testid="workspace-pane-menu"]')).toHaveCount(1);

    await goosePage.locator('[data-testid="workspace-pane-more"]').click();
    const item = goosePage.locator('[data-testid="workspace-pane-item-markdown"]');
    await expect(item).toBeVisible();
    await expect(item).toHaveText('Markdown');
    await item.click();
    await expect(goosePage.locator('[data-testid="workspace-pane-more-menu"]')).toHaveCount(0);
    await expect(side.locator('[data-testid="workspace-pane-markdown"]')).toBeVisible();
    await expect(side.locator('[data-testid="workspace-side-tab-markdown"]')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(terminal).toHaveAttribute('aria-pressed', 'false');

    // Shift-click tears Browser off into a second panel; Markdown keeps the first.
    const browser = goosePage.locator('[data-testid="workspace-pane-button-browser"]');
    await browser.click({ modifiers: ['Shift'] });
    const panels = side.locator('[data-testid="workspace-panel"]');
    await expect(panels).toHaveCount(2);
    await expect(panels.nth(1).locator('[data-testid="workspace-side-tab-browser"]')).toHaveCount(
      1
    );
    const torn = side.locator('[data-testid="workspace-pane-browser"]');
    await expect(torn).toBeVisible();
    await expect(torn.locator('[data-testid="browser-pane"]')).toBeVisible();
    await expect(side.locator('[data-testid="workspace-pane-markdown"]')).toBeVisible();
    await expect(browser).toHaveAttribute('aria-pressed', 'true');
    // A click closes its own tooltip, and the closed ⋯ menu leaves no tooltip behind.
    await expect(goosePage.getByRole('tooltip')).toHaveCount(0);

    expect(await shell.innerText()).not.toMatch(/\bDiff\b/);

    await goosePage.screenshot({
      path: test.info().outputPath('pane-menu.png'),
      fullPage: true,
    });
    // The dock persists per project in the app's own storage: leave the user's empty.
    await emptyDock(goosePage);
    await expect(menu).toHaveAttribute('data-docked', 'false');
  });
});
