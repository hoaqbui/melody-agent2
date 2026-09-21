import { test, expect } from './fixtures';

// Task 122/124: the send disc's ring shows the most spent limit — the context window after
// one reply — and hovering it opens the breakdown above the composer; Esc closes it and the
// disc still sends. Needs a live seat for the one reply.
test.describe('usage ring', { tag: '@seat' }, () => {
  test('fills after a reply, opens the breakdown on hover, closes on Esc, still sends', async ({
    goosePage,
  }) => {
    test.setTimeout(120_000);
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    const ring = goosePage.locator('[data-testid="usage-ring"]');
    await expect(ring).toHaveCount(1);
    await expect(ring).toHaveAttribute('role', 'meter');

    const input = goosePage.locator('[data-testid="chat-input"]');
    await input.fill('Reply with exactly the word done.');
    await input.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    await expect(
      goosePage.locator('[data-testid="message-container"].assistant').last()
    ).toContainText(/done/i, { timeout: 60000 });

    // The context window is a limit now: the ring carries a number, and not zero once the
    // turn's tokens land.
    await expect(ring).toHaveAttribute('data-state', /filling|warm|empty/, { timeout: 30000 });
    await expect(ring).toHaveAttribute('aria-valuenow', /^\d+$/);
    await expect(ring).toHaveAttribute('title', /Context window: .* \/ .* \(\d+%\)/);

    // Hover opens the breakdown with the context row and the seat's plan-limit line.
    await ring.hover();
    const breakdown = goosePage.locator('[data-testid="usage-breakdown"]');
    await expect(breakdown).toBeVisible();
    await expect(breakdown.locator('[data-testid="usage-limit-context"]')).toContainText(
      'Context window'
    );
    await expect(breakdown).toContainText('Compacts automatically at 97%');
    await expect(breakdown.locator('[data-testid="usage-not-reported"]')).toContainText(
      /Plan limits: not reported by/
    );
    await goosePage.screenshot({ path: test.info().outputPath('usage-ring.png') });

    // Esc closes it; the disc underneath still sends.
    await goosePage.keyboard.press('Escape');
    await expect(breakdown).toHaveCount(0);
    await input.fill('Reply with exactly the word again.');
    await ring.locator('.send-disc').click();
    await expect(
      goosePage.locator('[data-testid="message-container"].assistant').last()
    ).toContainText(/again/i, { timeout: 60000 });
  });
});
