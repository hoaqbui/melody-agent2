import { test, expect } from './fixtures';

// PRD step 12: the Browser pane is a browser. The sidecar's own /health and /config are
// loopback pages every run has, so the walk loads one, refreshes, loads the other, steps
// back and forward, picks /health again from the address bar's suggestions, and shares it
// with the agent — the chat input then holds `Page:` and the page's text, `ok`.
test.describe('browser pane', () => {
  test('loads, refreshes, steps back and forward, suggests history, shares', async ({
    goosePage,
  }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    const sidecar = await goosePage.evaluate(() => window.electron.getSidecarUrl());
    expect(sidecar).toMatch(/^http:\/\//);
    // The URL carries `?key=` (task 61); the pages sit on its origin.
    const health = new URL('/health', sidecar).toString();
    const config = new URL('/config', sidecar).toString();
    // The sidecar's port changes per run, so an earlier run's /health would be a second row.
    await goosePage.evaluate(() => {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith('goose.browserHistory:'))
        .forEach((key) => window.localStorage.removeItem(key));
    });

    await goosePage.locator('[data-testid="workspace-pane-button-browser"]').click();
    const pane = goosePage.locator('[data-testid="browser-pane"]');
    await expect(pane).toHaveAttribute('data-state', 'empty');
    const address = pane.locator('[data-testid="browser-address"]');
    const back = pane.locator('[data-testid="browser-back"]');
    const forward = pane.locator('[data-testid="browser-forward"]');
    const refresh = pane.locator('[data-testid="browser-refresh"]');
    await expect(back).toBeDisabled();
    await expect(forward).toBeDisabled();
    await expect(refresh).toBeDisabled();

    await address.fill(health);
    await address.press('Enter');
    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(address).toHaveValue(health);
    await expect(pane.locator('[data-testid="browser-frame"]')).toBeVisible();

    await expect(refresh).toHaveAttribute('data-action', 'refresh');
    await refresh.click();
    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(address).toHaveValue(health);

    await address.fill(config);
    await address.press('Enter');
    await expect(address).toHaveValue(config, { timeout: 15000 });
    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(back).toBeEnabled();
    await expect(forward).toBeDisabled();

    await back.click();
    await expect(address).toHaveValue(health, { timeout: 15000 });
    await expect(forward).toBeEnabled();
    await forward.click();
    await expect(address).toHaveValue(config, { timeout: 15000 });
    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 15000 });

    await address.fill('hea');
    const suggestions = pane.locator('[data-testid="browser-suggestion"]');
    await expect(suggestions).toHaveCount(1);
    await expect(suggestions.first()).toHaveAttribute('data-url', health);
    await expect(suggestions.first()).toBeVisible();
    await expect(address).toHaveAttribute('aria-expanded', 'true');
    await address.press('Escape');
    await expect(address).toHaveAttribute('aria-expanded', 'false');
    await expect(pane.locator('[data-testid="browser-suggestions"]')).toBeHidden();
    await address.press('ArrowDown');
    await expect(address).toHaveAttribute('aria-expanded', 'true');
    await expect(suggestions.first()).toHaveAttribute('aria-selected', 'true');
    await address.press('Enter');
    await expect(address).toHaveValue(health, { timeout: 15000 });
    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 15000 });

    await pane.locator('[data-testid="browser-share"]').click();
    const chatInput = goosePage.locator('[data-testid="chat-input"]');
    await expect(chatInput).toBeFocused();
    await expect(chatInput).toHaveValue(new RegExp(`^Page: .*\\n${health}\\n\\nok$`));

    // main.ts locks the guest down: no node in the page, and a popup loads in place.
    const guestEval = (code: string) =>
      goosePage.evaluate(
        ([js]) =>
          (
            document.querySelector('webview') as unknown as {
              executeJavaScript(code: string): Promise<unknown>;
            }
          ).executeJavaScript(js),
        [code]
      );
    expect(await guestEval('typeof require + typeof process')).toBe('undefinedundefined');
    await guestEval(`window.open(${JSON.stringify(config)})`);
    await expect(address).toHaveValue(config, { timeout: 15000 });

    await goosePage.screenshot({
      path: test.info().outputPath('browser-pane.png'),
      fullPage: true,
    });
  });
});
