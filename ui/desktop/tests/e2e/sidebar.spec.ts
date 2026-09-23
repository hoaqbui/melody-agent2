import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect } from './fixtures';

// Task 151: the rail is four tabs at its foot — Chats · Library · Automate · Settings —
// with the Chats panel above them: search first with New chat beside it, the repo chips,
// the day-grouped list with its sort control. Seat-free: the app starts on an empty
// profile, so the list is the empty state and the chips stay hidden; the grouping, chips,
// days and sorting are unit-tested in `sidebar-sessions.test.ts`.
//
// Task 171: one search over titles and transcripts — the local title/repo filter plus the
// server's own keyword match in message text (`sidebar-sessions.ts:131`,
// `session_manager.rs:364`), merged and deduped by id in `mergeSearchResults`. The
// transcript-only step below seeds a session with `goose session import` (a plain Claude
// Code `.jsonl` line, no model call — this walk stays seat-free) whose title never says
// the keyword, only a message in it does.
const gooseBinary = join(__dirname, '../../../../target/debug/goose');
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

    // A session whose transcript, not its title, says the keyword still turns up: seed one
    // directly (no live model needed) and search for what was said in it, not its name.
    const stamp = Date.now();
    const keyword = `zzzconversationmatch${stamp}`;
    const pathRoot = join(tmpdir(), 'goose-walks-profile');
    for (const dir of ['config', 'data', 'state']) {
      mkdirSync(join(pathRoot, dir), { recursive: true });
    }
    const transcriptFile = join(pathRoot, `sidebar-search-${stamp}.jsonl`);
    writeFileSync(
      transcriptFile,
      [
        JSON.stringify({ type: 'ai-title', aiTitle: `Sidebar tabs C3 ${stamp}` }),
        JSON.stringify({
          type: 'user',
          cwd: `/tmp/goose-sidebar-search-walk-${stamp}`,
          sessionId: `sidebar-search-${stamp}`,
          timestamp: new Date().toISOString(),
          message: { content: `can we ${keyword} the tree filter?` },
        }),
        '',
      ].join('\n')
    );
    execFileSync(gooseBinary, ['session', 'import', transcriptFile], {
      env: { ...process.env, GOOSE_PATH_ROOT: pathRoot },
      stdio: 'pipe',
    });

    await search.fill(keyword);
    await expect(
      goosePage.locator('[data-testid="sidebar-day-In the conversation"]')
    ).toBeVisible({ timeout: 15000 });
    await expect(goosePage.locator('[data-testid="sidebar-day-Titles"]')).toHaveCount(0);
    await expect(goosePage.getByText(`Sidebar tabs C3 ${stamp}`)).toBeVisible();
    await search.fill('');
    await expect(search).toHaveValue('');

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
