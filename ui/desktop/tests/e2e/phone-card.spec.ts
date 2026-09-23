import { test, expect } from './fixtures';

// Task 62: ⋯ → "Open on phone…" lands on Settings › App's Phone card, which shows the
// sidecar's tailnet URL with this launch's key as text and as a QR code, or says there is
// no tailnet. The port field carries the `sidecar.port` setting, 7788 by default; the walk
// reads it back rather than asserting 7788, since a second checkout may hold that port and
// the sidecar then falls back to one the OS picked.
test.describe('phone card', () => {
  test('opens from the rail menu with the tailnet URL and its code', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await goosePage.setViewportSize({ width: 1200, height: 800 });

    await goosePage.locator('[data-testid="workspace-pane-more"]').click();
    const item = goosePage.locator('[data-testid="workspace-open-phone"]');
    await expect(item).toHaveText('Open on phone…');
    await item.click();

    await expect(goosePage).toHaveURL(/\/settings/);
    await expect(goosePage.locator('[data-testid="settings-app-tab"]')).toHaveAttribute(
      'data-state',
      'active'
    );
    const card = goosePage.locator('[data-testid="settings-phone"]');
    await expect(card).toBeVisible();
    await expect(card).toBeInViewport();

    const url = card.locator('[data-testid="settings-phone-url"]');
    await expect(url).toBeVisible();
    const text = (await url.innerText()).trim();
    const tailnet = /^http:\/\/\d+(\.\d+){3}:(\d+)\/\?key=[0-9a-f]{64}$/.exec(text);
    if (tailnet) {
      await expect(card.locator('[data-testid="settings-phone-qr"] svg[role="img"]')).toBeVisible();
      await expect(card.locator('[data-testid="settings-phone-copy"]')).toHaveText('Copy');
      const port = card.locator('[data-testid="settings-phone-port"]');
      await expect(port).toHaveValue(/^\d+$/);
      console.log(`phone url ${text} · sidecar.port ${await port.inputValue()}`);
    } else {
      expect(text).toBe('No tailnet address — start Tailscale and relaunch Melody');
      await expect(card.locator('[data-testid="settings-phone-qr"]')).toHaveCount(0);
    }

    await card.screenshot({ path: test.info().outputPath('phone-card.png') });
  });
});
