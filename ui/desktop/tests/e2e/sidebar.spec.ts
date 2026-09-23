import { test, expect } from './fixtures';

// Task 151: the rail is four tabs at its foot — Chats · Library · Automate · Settings —
// with the Chats panel above them: search first with New chat beside it, the repo chips,
// the day-grouped list with its sort control. Seat-free: the app starts on an empty
// profile, so the list is the empty state and the chips stay hidden; the grouping, chips,
// days and sorting are unit-tested in `sidebar-sessions.test.ts`.
test.describe('sidebar', { tag: '@smoke' }, () => {
  test('four tabs, the Chats panel, search, New chat and ⌘N', async ({ goosePage }) => {
    const sidebar = goosePage.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 30000 });
    await goosePage.setViewportSize({ width: 1200, height: 800 });

    // The tab bar, Chats selected, ARIA tabs.
    const tabs = goosePage.locator('[data-testid="sidebar-tabs"] [role="tab"]');
    await expect(tabs).toHaveCount(4);
    await expect(goosePage.locator('[data-testid="sidebar-tab-chats"]')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(sidebar).toHaveAttribute('data-tab', 'chats');

    // Search first, New chat beside it. The walks' profile may hold sessions from earlier
    // walks or none: with some, the chips (All pressed) and the sort show and a nonsense
    // query reads "No chats match"; with none, the list reads "No recent chats".
    const search = goosePage.locator('[data-testid="sidebar-search"]');
    await expect(search).toBeVisible();
    await expect(goosePage.locator('[data-testid="sidebar-new-chat"]')).toBeVisible();
    await expect(
      goosePage.locator('[data-testid^="sidebar-session-"], :text("No recent chats")').first()
    ).toBeVisible({ timeout: 15000 });
    const hasSessions = (await goosePage.locator('[data-testid^="sidebar-session-"]').count()) > 0;
    const hasChips = (await goosePage.locator('[data-testid^="sidebar-chip-"]').count()) > 2;

    // `/` focuses the search from the page; Esc clears and leaves it.
    await goosePage.locator('body').click({ position: { x: 600, y: 100 } });
    await goosePage.keyboard.press('/');
    await expect(search).toBeFocused();
    await search.fill('zzz-no-such-chat');
    if (hasSessions) {
      await expect(goosePage.locator('[data-testid="sidebar-no-match"]')).toBeVisible();
    }
    await goosePage.keyboard.press('Escape');
    await expect(search).toHaveValue('');
    if (hasChips) {
      await expect(goosePage.locator('[data-testid="sidebar-chip-all"]')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    }
    if (hasSessions) {
      await expect(goosePage.locator('[data-testid="sidebar-sort"]')).toHaveValue('recent');
      await expect(goosePage.locator('[data-testid="sidebar-day-Today"]')).toHaveCount(1);
      await goosePage.locator('[data-testid="sidebar-sort"]').selectOption('name');
      await expect(goosePage.locator('[data-testid="sidebar-day-Today"]')).toHaveCount(0);
      await goosePage.locator('[data-testid="sidebar-sort"]').selectOption('recent');
    } else {
      await expect(goosePage.getByText('No recent chats')).toBeVisible();
      await expect(goosePage.locator('[data-testid="sidebar-chip-all"]')).toHaveCount(0);
    }

    // Library and Automate hold the old rows; Settings is a route.
    await goosePage.locator('[data-testid="sidebar-tab-library"]').click();
    await expect(sidebar).toHaveAttribute('data-tab', 'library');
    await expect(goosePage.getByRole('button', { name: 'Recipes' })).toBeVisible();
    await expect(goosePage.getByRole('button', { name: 'Extensions' })).toBeVisible();
    await expect(search).toHaveCount(0);
    await goosePage.locator('[data-testid="sidebar-tab-automate"]').click();
    await expect(goosePage.getByRole('button', { name: 'Board' })).toBeVisible();
    await expect(goosePage.getByRole('button', { name: 'Scheduler' })).toBeVisible();
    // Arrow keys move between tabs.
    await goosePage.locator('[data-testid="sidebar-tab-automate"]').focus();
    await goosePage.keyboard.press('ArrowLeft');
    await expect(goosePage.locator('[data-testid="sidebar-tab-library"]')).toBeFocused();
    await goosePage.locator('[data-testid="sidebar-tab-settings"]').click();
    await expect(goosePage).toHaveURL(/#\/settings/);
    await expect(goosePage.locator('[data-testid="sidebar-tab-settings"]')).toHaveAttribute(
      'aria-selected',
      'true'
    );

    // Back to Chats; New chat lands on the hub; ⌘N does the same from anywhere.
    await goosePage.locator('[data-testid="sidebar-tab-chats"]').click();
    await goosePage.locator('[data-testid="sidebar-new-chat"]').click();
    await expect(goosePage).toHaveURL(/#\/(\?.*)?$/);
    await goosePage.locator('[data-testid="sidebar-tab-library"]').click();
    await goosePage.keyboard.press('Meta+n');
    await expect(goosePage).toHaveURL(/#\/(\?.*)?$/);
  });
});
