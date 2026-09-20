import { join } from 'path';
import type { Locator, Page } from '@playwright/test';
import { test, expect, emptyDock, openPane } from './fixtures';

// Task 71: the Work column's tab bar and three dock positions. Open Terminal → it is Full;
// open Changes → Terminal Top, Changes Bottom; set Changes Full from its header → Terminal
// stays an open tab, parked; drag the Terminal tab onto the column's top half → both halves
// again; the seam between them resizes from the keyboard; the tab's right-click menu offers
// the same positions and Close. No session is needed: the Hub has the shell.
// `hover` settles on the source's centre once it is stable; the ghost's text says what the
// press picked up before the drop, and the drop zone under the pointer lights.
async function dragTo(page: Page, source: Locator, lifts: string, half: 'top' | 'bottom') {
  await source.hover();
  await page.mouse.down();
  const to = await page.locator('[data-testid="workspace-side-panel"]').boundingBox();
  if (!to) throw new Error('drag: the slots are not on screen');
  const y = to.y + to.height * (half === 'top' ? 0.25 : 0.75);
  await page.mouse.move(to.x + to.width / 2, y, { steps: 12 });
  await expect(page.locator('[data-testid="workspace-dock-ghost"]')).toHaveText(lifts);
  await expect(page.locator(`[data-testid="workspace-dock-drop-${half}"]`)).toHaveAttribute(
    'data-over',
    'true'
  );
  await page.mouse.up();
  await expect(page.locator('[data-testid="workspace-dock-ghost"]')).toHaveCount(0);
}

test.describe('dock', () => {
  test('docks panes full, top and bottom from the bar, the header and a drag', async ({
    goosePage,
  }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await emptyDock(goosePage);
    const openTabs = goosePage.locator('[data-dock-tab]');
    await expect(openTabs).toHaveCount(0);
    // The bar is there with nothing open: every launcher a tab, the session menu at its end.
    const bar = goosePage.locator('[data-testid="workspace-pane-menu"]');
    await expect(bar).toBeVisible();
    await expect(goosePage.locator('[data-testid="workspace-column-work"]')).toBeVisible();
    await expect(bar.locator('[data-testid="workspace-pane-more"]')).toBeVisible();

    const terminalTab = goosePage.locator('[data-testid="workspace-pane-button-terminal"]');
    const diffTab = goosePage.locator('[data-testid="workspace-pane-button-diff"]');
    const terminalPane = goosePage.locator('[data-testid="workspace-pane-terminal"]');
    const diffPane = goosePage.locator('[data-testid="workspace-pane-diff"]');

    // Terminal alone is Full.
    await openPane(goosePage, 'terminal');
    await expect(openTabs).toHaveCount(1);
    await expect(terminalPane).toBeVisible();
    await expect(terminalPane).toHaveAttribute('data-position', 'full');
    await expect(terminalTab).toHaveAttribute('aria-pressed', 'true');
    await expect(
      terminalPane.locator('[data-testid="workspace-dock-position-full"]')
    ).toHaveAttribute('aria-pressed', 'true');
    await goosePage.screenshot({ path: test.info().outputPath('dock-full.png'), fullPage: true });
    if (process.env.T71_SHOTS) {
      await goosePage.screenshot({ path: join(process.env.T71_SHOTS, 'bar-full.png') });
    }

    // A second pane takes the bottom half; the full one moves up.
    await openPane(goosePage, 'diff');
    await expect(openTabs).toHaveCount(2);
    await expect(terminalPane).toHaveAttribute('data-position', 'top');
    await expect(diffPane).toHaveAttribute('data-position', 'bottom');
    await expect(terminalPane).toBeVisible();
    await expect(diffPane).toBeVisible();
    await expect(diffTab).toHaveAttribute('aria-pressed', 'true');
    // The seam between them resizes from the keyboard too (DESIGN.md §Accessibility).
    // The split persists per project, so the walk moves from wherever the seam is.
    const seam = goosePage.locator('[data-testid="workspace-dock-seam"]');
    await expect(seam).toHaveAttribute('aria-valuenow', /^\d+$/);
    const start = Number(await seam.getAttribute('aria-valuenow'));
    await seam.focus();
    await goosePage.keyboard.press('ArrowDown');
    await expect(seam).toHaveAttribute('aria-valuenow', String(start + 5));
    await goosePage.keyboard.press('ArrowUp');
    await expect(seam).toHaveAttribute('aria-valuenow', String(start));
    await goosePage.screenshot({
      path: test.info().outputPath('dock-top-bottom.png'),
      fullPage: true,
    });
    if (process.env.T71_SHOTS) {
      await goosePage.screenshot({ path: join(process.env.T71_SHOTS, 'bar-top-bottom.png') });
    }

    // Changes Full from its header: Terminal is parked — still open, its tab not pressed.
    await diffPane.locator('[data-testid="workspace-dock-position-full"]').click();
    await expect(diffPane).toHaveAttribute('data-position', 'full');
    await expect(terminalPane).toBeHidden();
    await expect(openTabs).toHaveCount(2);
    await expect(terminalTab).toHaveAttribute('aria-pressed', 'false');
    await expect(terminalTab).toHaveAttribute('data-open', 'true');
    await expect(seam).toHaveCount(0);

    // A plain click on a parked tab brings it back into the half it last showed in.
    await terminalTab.click();
    await expect(terminalPane).toHaveAttribute('data-position', 'top');
    await expect(diffPane).toHaveAttribute('data-position', 'bottom');

    // Park it again, then drag its tab onto the column's top half: both halves again.
    await diffPane.locator('[data-testid="workspace-dock-position-full"]').click();
    await expect(terminalPane).toBeHidden();
    await dragTo(goosePage, terminalTab, 'Terminal', 'top');
    await expect(terminalPane).toHaveAttribute('data-position', 'top');
    await expect(diffPane).toHaveAttribute('data-position', 'bottom');
    await expect(terminalPane).toBeVisible();
    await expect(diffPane).toBeVisible();

    // The tab's right-click menu: the same three positions and Close.
    await diffTab.click({ button: 'right' });
    const menu = goosePage.locator('[data-testid="workspace-tab-menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-testid="workspace-dock-position-bottom"]')).toHaveAttribute(
      'aria-current',
      'true'
    );
    await menu.locator('[data-testid="workspace-dock-position-top"]').click();
    await expect(menu).toHaveCount(0);
    await expect(diffPane).toHaveAttribute('data-position', 'top');
    await expect(terminalPane).toHaveAttribute('data-position', 'bottom');
    await diffTab.click({ button: 'right' });
    await menu.locator('[data-testid="workspace-tab-close"]').click();
    await expect(menu).toHaveCount(0);
    await expect(diffPane).toHaveCount(0);
    await expect(openTabs).toHaveCount(1);
    // The closed tab is a launcher again; the one left takes the column.
    await expect(diffTab).toHaveAttribute('aria-pressed', 'false');
    await expect(diffTab).toHaveAttribute('data-open', 'false');
    await expect(terminalPane).toHaveAttribute('data-position', 'full');

    await goosePage.screenshot({
      path: test.info().outputPath('dock.png'),
      fullPage: true,
    });
    await emptyDock(goosePage);
    await expect(openTabs).toHaveCount(0);
    await expect(bar).toBeVisible();
  });
});
