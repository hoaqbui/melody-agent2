import { test, expect } from './fixtures';

// Task 40: the header's right is a pane menu in the code-editor standard — Terminal,
// Changes, Browser one click away and the rest under ⋯. Click shows a pane in the side
// panel; shift-click opens it in the centre. No session is needed: the Hub has the shell.
test.describe('pane menu', () => {
  test('opens panes from the header and shows no "Diff"', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });

    // Terminal, Changes, Browser and ⋯ — and nothing else on the header's right.
    const menu = goosePage.locator('[data-testid="workspace-pane-menu"]');
    const buttons = menu.getByRole('button');
    await expect(buttons).toHaveCount(4);
    for (const [index, name] of ['Terminal', 'Changes', 'Browser', 'More panes'].entries()) {
      await expect(buttons.nth(index)).toHaveAccessibleName(name);
    }
    expect(await menu.evaluate((node) => node.nextElementSibling === null)).toBe(true);
    await expect(goosePage.locator('[data-testid="workspace-header-status"]')).toHaveCount(0);

    const side = goosePage.locator('[data-testid="workspace-side-panel"]');
    const terminal = goosePage.locator('[data-testid="workspace-pane-button-terminal"]');
    await expect(terminal).toHaveAttribute('aria-pressed', 'false');
    await terminal.hover();
    await expect(goosePage.getByRole('tooltip')).toHaveText('Terminal');
    await terminal.click();
    await expect(side.locator('[data-testid="workspace-pane-terminal"]')).toBeVisible();
    await expect(terminal).toHaveAttribute('aria-pressed', 'true');

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

    const browser = goosePage.locator('[data-testid="workspace-pane-button-browser"]');
    await browser.click({ modifiers: ['Shift'] });
    const centre = goosePage.locator('[data-testid="workspace-pane-browser"]');
    await expect(centre).toBeVisible();
    await expect(centre).toContainText('Browser — Not available yet');
    expect(await side.locator('[data-testid="workspace-pane-browser"]').count()).toBe(0);
    await expect(browser).toHaveAttribute('aria-pressed', 'true');
    // A click closes its own tooltip, and the closed ⋯ menu leaves no tooltip behind.
    await expect(goosePage.getByRole('tooltip')).toHaveCount(0);

    expect(await shell.innerText()).not.toMatch(/\bDiff\b/);

    await goosePage.screenshot({
      path: test.info().outputPath('pane-menu.png'),
      fullPage: true,
    });
  });
});
