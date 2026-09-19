import { test, expect, emptyDock, openPane } from './fixtures';

// Task 102: Light is the Studio board (DESIGN.md §Tokens & theme, 2026-09-18). The walk
// switches the app to Light, reads the board's values back from computed styles, exercises
// the Send disc's arming and lift, and stills the beats under reduced motion.
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

test.describe('studio light', () => {
  test('paints the board: white page, frosted sessions, floating composer, teal send', async ({
    goosePage,
  }) => {
    test.setTimeout(180_000);
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });

    const previous = await goosePage.evaluate(async () => ({
      useSystem: await window.electron.getSetting('useSystemTheme'),
      theme: await window.electron.getSetting('theme'),
    }));
    try {
      await goosePage.evaluate(async () => {
        await window.electron.setSetting('useSystemTheme', false);
        await window.electron.setSetting('theme', 'light');
      });
      await goosePage.reload();
      await expect(shell).toBeVisible({ timeout: 30000 });
      await expect(goosePage.locator('html')).toHaveAttribute('data-theme', 'light');
      await goosePage.setViewportSize({ width: 1400, height: 900 });
      await emptyDock(goosePage);

      // (1) the page and the ink
      const body = goosePage.locator('body');
      await expect
        .poll(() => body.evaluate((el) => window.getComputedStyle(el).backgroundColor))
        .toBe(rgb('#ffffff'));
      const family = await body.evaluate((el) => window.getComputedStyle(el).fontFamily);
      expect(family).toContain('Schibsted Grotesk');
      // the five-size scale: body 13 px, the chat input's small text 12 px
      expect(await body.evaluate((el) => window.getComputedStyle(el).fontSize)).toBe('13px');
      const smallText = goosePage.locator('.text-sm').first();
      await expect
        .poll(() => smallText.evaluate((el) => window.getComputedStyle(el).fontSize))
        .toBe('12px');
      const tokenText = await goosePage.evaluate(() =>
        window
          .getComputedStyle(document.documentElement)
          .getPropertyValue('--color-text-primary')
          .trim()
      );
      expect(tokenText).toBe('#1e1d1a');

      // (2) the Sessions column is frosted ivory
      const sessions = goosePage.locator('[data-testid="workspace-column-sessions"]');
      await expect(sessions).toBeVisible();
      const frost = await sessions.evaluate((el) => window.getComputedStyle(el).backdropFilter);
      expect(frost).toContain('blur');

      // (3) the active Work tab is white with a blue icon
      await openPane(goosePage, 'terminal');
      const tab = goosePage.locator('[data-testid="workspace-pane-button-terminal"]');
      await expect(tab).toHaveAttribute('data-active', 'true');
      // the tab's colour slides over --motion-base: poll, do not read once
      await expect
        .poll(() => tab.evaluate((el) => window.getComputedStyle(el).backgroundColor))
        .toBe(rgb('#ffffff'));
      await expect
        .poll(() =>
          tab
            .locator('svg')
            .first()
            .evaluate((el) => window.getComputedStyle(el).color)
        )
        .toBe(rgb('#2277cc'));

      // (4) the composer floats without an outline
      const card = goosePage.locator('.chat-input-card').first();
      await expect(card).toBeVisible();
      const cardStyle = await card.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return { shadow: s.boxShadow, border: s.borderTopColor, outline: s.outlineStyle };
      });
      expect(cardStyle.shadow).not.toBe('none');
      expect(cardStyle.border).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

      // (5) the Send disc arms once there is text, and lifts on hover
      const input = goosePage.locator('[data-testid="chat-input"]').first();
      const send = goosePage.locator('.send-disc');
      await input.fill('reply with exactly: hi');
      await expect(send).toHaveAttribute('data-armed', 'true');
      // the fill transitions from the disabled tertiary to teal: poll
      await expect
        .poll(() => send.evaluate((el) => window.getComputedStyle(el).backgroundColor))
        .toBe(rgb('#44c1b8'));
      await send.hover();
      await expect
        .poll(() => send.evaluate((el) => window.getComputedStyle(el).transform))
        .toMatch(/matrix\(1, 0, 0, 1, 0, -1\)/);

      // (6) your message is the light-blue floating bubble
      await input.press('Enter');
      await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
      const bubble = goosePage.locator('.user-message-bubble').last();
      await expect(bubble).toBeVisible({ timeout: 15000 });
      expect(await bubble.evaluate((el) => window.getComputedStyle(el).backgroundColor)).toBe(
        rgb('#f3f8fd')
      );
      expect(await bubble.evaluate((el) => window.getComputedStyle(el).boxShadow)).not.toBe('none');

      // Playwright empties test-results on every run; STUDIO_SHOT names a place that survives.
      await goosePage.screenshot({
        path: process.env.STUDIO_SHOT ?? 'test-results/studio-light.png',
      });

      // (7) reduced motion stills the beats
      await goosePage.emulateMedia({ reducedMotion: 'reduce' });
      await goosePage.locator('[data-testid="chat-input"]').first().fill('x');
      expect(await send.evaluate((el) => window.getComputedStyle(el).animationName)).toBe('none');
      await goosePage.emulateMedia({ reducedMotion: 'no-preference' });
    } finally {
      await goosePage.evaluate(async (p) => {
        await window.electron.setSetting('theme', p.theme);
        await window.electron.setSetting('useSystemTheme', p.useSystem);
      }, previous);
    }
  });
});
