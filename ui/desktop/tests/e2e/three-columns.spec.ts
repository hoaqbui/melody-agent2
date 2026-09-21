import type { Page } from '@playwright/test';
import { test, expect, emptyDock, openPane } from './fixtures';

// Task 60: three columns — Sessions · Chat · Work — and no top bar. The Work seam drags the
// Work column wider and the width survives a reload (remembered per project); ⌘1 · ⌘2 · ⌘3
// focus the columns; the frame clamps to the viewport at 600 and 1200 px, where the old
// header note and side tabs used to push the page sideways. Task 71: the Work column is
// there with nothing open, its tab bar the launchers. No session is needed.
async function fits(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="workspace-shell"]');
    return {
      document: document.documentElement.scrollWidth === window.innerWidth,
      shell: !!shell && shell.scrollWidth === shell.clientWidth && shell.scrollLeft === 0,
    };
  });
}

test.describe('three columns', { tag: '@smoke' }, () => {
  test('lays out Sessions · Chat · Work, resizes on the seam, keeps the width', async ({
    goosePage,
  }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await goosePage.setViewportSize({ width: 1200, height: 800 });
    await emptyDock(goosePage);

    const sessions = goosePage.locator('[data-testid="workspace-column-sessions"]');
    const chat = goosePage.locator('[data-testid="workspace-column-chat"]');
    const work = goosePage.locator('[data-testid="workspace-column-work"]');
    await expect(goosePage.locator('[data-testid="workspace-header"]')).toHaveCount(0);
    await expect(chat).toBeVisible();
    // Work with nothing open is the tab bar over an empty column, at the right edge.
    await expect(work).toBeVisible();
    const bar = goosePage.locator('[data-testid="workspace-pane-menu"]');
    await expect(bar).toBeVisible();
    const barBox = await bar.boundingBox();
    const shellBox = await shell.boundingBox();
    expect(barBox && shellBox && barBox.x + barBox.width > shellBox.width - 40).toBe(true);

    await openPane(goosePage, 'terminal');
    await expect(work).toBeVisible();
    const before = await work.boundingBox();
    if (!before) throw new Error('the Work column is not on screen');

    // Drag the Work seam 100 px left: the column grows by 100 px, the store rounds to px.
    const seam = goosePage.locator('[data-testid="workspace-seam-work"]');
    await expect(seam).toHaveAttribute('aria-valuenow', String(Math.round(before.width)));
    const seamBox = await seam.boundingBox();
    if (!seamBox) throw new Error('the Work seam is not on screen');
    const x = seamBox.x + seamBox.width / 2;
    const y = seamBox.y + seamBox.height / 2;
    await goosePage.mouse.move(x, y);
    await goosePage.mouse.down();
    await goosePage.mouse.move(x - 100, y, { steps: 10 });
    await goosePage.mouse.up();
    const widened = Math.round(before.width) + 100;
    await expect(seam).toHaveAttribute('aria-valuenow', String(widened));
    const after = await work.boundingBox();
    expect(Math.round(after?.width ?? 0)).toBe(widened);
    // Arrow keys move it too (DESIGN.md §Accessibility).
    await seam.focus();
    await goosePage.keyboard.press('ArrowRight');
    await expect(seam).toHaveAttribute('aria-valuenow', String(widened - 16));
    await goosePage.keyboard.press('ArrowLeft');
    await expect(seam).toHaveAttribute('aria-valuenow', String(widened));

    // ⌘1 · ⌘2 · ⌘3 put focus in Sessions, the chat's input, the Work column.
    await goosePage.keyboard.press('Meta+2');
    await expect(goosePage.locator('[data-testid="chat-input"]')).toBeFocused();
    await goosePage.keyboard.press('Meta+3');
    expect(await work.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    if ((await sessions.boundingBox())?.width) {
      await goosePage.keyboard.press('Meta+1');
      expect(await sessions.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }

    // Nothing pushes the page sideways at either width, dock open; the Sessions column
    // eases shut under 700 px, so the narrow check waits for it.
    const fitting = { document: true, shell: true };
    await expect.poll(() => fits(goosePage)).toEqual(fitting);
    await goosePage.screenshot({ path: test.info().outputPath('three-columns-1200.png') });
    await goosePage.setViewportSize({ width: 600, height: 700 });
    await expect(chat).toBeVisible();
    // Upstream folds the sidebar under 700 px; the column eases shut into the toggle (its
    // wrapper's width, the column itself keeps its hairline).
    await expect(sessions.locator('..')).toHaveCSS('width', '0px');
    await expect.poll(() => fits(goosePage)).toEqual(fitting);
    await goosePage.locator('[data-testid="chat-input"]').focus();
    await expect.poll(() => fits(goosePage)).toEqual(fitting);
    await goosePage.screenshot({ path: test.info().outputPath('three-columns-600.png') });
    await goosePage.setViewportSize({ width: 1200, height: 800 });

    // The width is remembered per project across a reload; the open pane comes back too.
    await goosePage.reload();
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(work).toBeVisible();
    await expect(goosePage.locator('[data-testid="workspace-pane-terminal"]')).toBeVisible();
    await expect(seam).toHaveAttribute('aria-valuenow', String(widened));
    const reloaded = await work.boundingBox();
    expect(Math.round(reloaded?.width ?? 0)).toBe(widened);

    // Leave the project's layout as it was found: the default width, nothing open.
    await goosePage.mouse.move(x - 100, y);
    await goosePage.mouse.down();
    await goosePage.mouse.move(x, y, { steps: 10 });
    await goosePage.mouse.up();
    await expect(seam).toHaveAttribute('aria-valuenow', String(Math.round(before.width)));
    await emptyDock(goosePage);
    await expect(work).toBeVisible();
    await expect(goosePage.locator('[data-dock-tab]')).toHaveCount(0);
  });
});
