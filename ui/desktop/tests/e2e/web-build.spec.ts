import { test, expect } from '@playwright/test';

// Runs against a sidecar that serves dist-web/ and proxies /acp to a running goose serve
// (tasks 18 and 19); the sidecar's loopback confirm port is the default.
const WEB_BUILD_URL = process.env.WEB_BUILD_URL ?? 'http://127.0.0.1:3285';

test('web build', async ({ page }) => {
  await page.goto(WEB_BUILD_URL);

  const chatInput = page.locator('[data-testid="chat-input"]');
  await expect(chatInput).toBeVisible();
  await chatInput.fill('Reply with the single word pong.');
  await chatInput.press('Enter');

  const loading = page.locator('[data-testid="loading-indicator"]');
  await expect(loading).toBeVisible();
  await expect(loading).toBeHidden({ timeout: 60000 });

  const reply = page.locator('[data-testid="message-container"]').last();
  await expect(reply).toBeVisible();
  expect((await reply.textContent())?.trim()).toBeTruthy();
});
