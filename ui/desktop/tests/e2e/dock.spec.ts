import type { Locator, Page } from '@playwright/test';
import { test, expect, emptyDock, openPane } from './fixtures';

// Task 42: the right dock. Open Terminal and Changes → one panel with two tabs; drag
// Changes' tab below → two panels; drag the lower panel above the upper → the order swaps;
// close Changes → one panel again. Then the same tear-off and move from the panel's ⋯ menu,
// the keyboard's route. No session is needed: the Hub has the shell.
// `hover` settles on the source's centre once it is stable; the ghost's text says what the
// press picked up (a tab's title, or every tab of a dragged panel) before the drop.
async function dragTo(
  page: Page,
  source: Locator,
  lifts: string,
  target: Locator,
  atHeight: number
) {
  await source.hover();
  await page.mouse.down();
  const to = await target.boundingBox();
  if (!to) throw new Error('drag: the target is not on screen');
  await page.mouse.move(to.x + to.width / 2, to.y + to.height * atHeight, { steps: 12 });
  await expect(page.locator('[data-testid="workspace-dock-ghost"]')).toHaveText(lifts);
  await page.mouse.up();
  await expect(page.locator('[data-testid="workspace-dock-ghost"]')).toHaveCount(0);
}

const tabsOf = (panel: Locator) => panel.locator('[data-dock-tab]');

test.describe('dock', () => {
  test('tears a tab off, reorders panels, and closes back into one', async ({ goosePage }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await emptyDock(goosePage);
    const panels = goosePage.locator('[data-testid="workspace-panel"]');
    await expect(panels).toHaveCount(0);

    await openPane(goosePage, 'terminal');
    await openPane(goosePage, 'diff');
    await expect(panels).toHaveCount(1);
    await expect(tabsOf(panels.first())).toHaveCount(2);
    await expect(tabsOf(panels.first()).nth(0)).toHaveAttribute('data-dock-tab', 'terminal');
    await expect(tabsOf(panels.first()).nth(1)).toHaveAttribute('data-dock-tab', 'diff');
    const diffPane = goosePage.locator('[data-testid="workspace-pane-diff"]');
    const terminalPane = goosePage.locator('[data-testid="workspace-pane-terminal"]');
    await expect(diffPane).toBeVisible();
    await expect(terminalPane).toBeHidden();

    // A plain click on a tab is a switch, not a drag.
    await goosePage.locator('[data-testid="workspace-side-tab-terminal"]').click();
    await expect(terminalPane).toBeVisible();
    await expect(diffPane).toBeHidden();
    await goosePage.locator('[data-testid="workspace-side-tab-diff"]').click();
    await expect(diffPane).toBeVisible();

    // Changes' tab into the lower half of the panel: it tears off into a panel below.
    await dragTo(
      goosePage,
      goosePage.locator('[data-testid="workspace-side-tab-diff"]'),
      'Changes',
      diffPane,
      0.9
    );
    await expect(panels).toHaveCount(2);
    await expect(tabsOf(panels.nth(0))).toHaveAttribute('data-dock-tab', 'terminal');
    await expect(tabsOf(panels.nth(1))).toHaveAttribute('data-dock-tab', 'diff');
    await expect(terminalPane).toBeVisible();
    await expect(diffPane).toBeVisible();

    // The lower panel's header onto the upper half of the top panel: the order swaps.
    const grip = panels.nth(1).locator('svg').first();
    await dragTo(goosePage, grip, 'Changes', terminalPane, 0.1);
    await expect(tabsOf(panels.nth(0))).toHaveAttribute('data-dock-tab', 'diff');
    await expect(tabsOf(panels.nth(1))).toHaveAttribute('data-dock-tab', 'terminal');
    // The seam between them resizes from the keyboard too (DESIGN.md §Accessibility).
    const seam = goosePage.locator('[data-testid="workspace-dock-seam-1"]');
    await expect(seam).toHaveAttribute('aria-valuenow', '50');
    await seam.focus();
    await goosePage.keyboard.press('ArrowDown');
    await expect(seam).toHaveAttribute('aria-valuenow', '55');
    await goosePage.keyboard.press('ArrowUp');
    await expect(seam).toHaveAttribute('aria-valuenow', '50');

    await goosePage.locator('[data-testid="workspace-pane-close-diff"]').click();
    await expect(panels).toHaveCount(1);
    await expect(tabsOf(panels.first())).toHaveAttribute('data-dock-tab', 'terminal');
    await expect(diffPane).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="workspace-pane-button-diff"]')).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    // The ⋯ menu does the same without a pointer: Tear off, then Move up.
    await openPane(goosePage, 'diff');
    await expect(tabsOf(panels.first())).toHaveCount(2);
    const menu = goosePage.locator('[data-testid="workspace-panel-menu-content"]');
    await panels.first().locator('[data-testid="workspace-panel-menu"]').click();
    await goosePage.locator('[data-testid="workspace-panel-tear-off"]').click();
    await expect(panels).toHaveCount(2);
    await expect(tabsOf(panels.nth(1))).toHaveAttribute('data-dock-tab', 'diff');
    // The closed menu animates out; the next one opens once it has gone.
    await expect(menu).toHaveCount(0);
    await panels.nth(1).locator('[data-testid="workspace-panel-menu"]').click();
    await goosePage.locator('[data-testid="workspace-panel-move-up"]').click();
    await expect(tabsOf(panels.nth(0))).toHaveAttribute('data-dock-tab', 'diff');
    await expect(menu).toHaveCount(0);

    await goosePage.screenshot({
      path: test.info().outputPath('dock.png'),
      fullPage: true,
    });
    await emptyDock(goosePage);
    await expect(panels).toHaveCount(0);
  });
});
