import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect, emptyDock } from './fixtures';

// Task 69: the rail's ⋯ is the session's whole menu, laid out as Claude Code desktop's —
// the groups in order with their shortcuts, and no second ⋯ in the chat header. The rail's
// icons carry a dot for what arrived while a pane was hidden: an edit on disk dots Changes
// (the 30 s porcelain poll) and opening the pane clears it. Keep computer awake is main's
// word (the `keep-awake` IPC answers whether a blocker runs, and the check reads that
// answer). R renames, F forks (a second session opens), A archives it (it leaves the list).
// The window opens on a scratch repo (GOOSE_TEST_DIR) so the poll has a working tree.
const stamp = Date.now();
const prompt = 'Reply with exactly the word done.';
const renamed = `t69-session-${stamp}`;
let scratch = '';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t69', '-c', 'user.email=t69@test', ...args], {
    cwd,
    stdio: 'pipe',
  }).toString();

test.describe('session menu', () => {
  test.setTimeout(300_000);

  test.beforeAll(() => {
    scratch = process.env.GOOSE_TEST_DIR ?? mkdtempSync(join(tmpdir(), 'goose-t69-'));
    mkdirSync(scratch, { recursive: true });
    process.env.GOOSE_TEST_DIR = scratch;
    if (!existsSync(join(scratch, '.git'))) {
      writeFileSync(join(scratch, 'notes.md'), 'one\n');
      git(scratch, ['init', '-q']);
      git(scratch, ['add', 'notes.md']);
      git(scratch, ['commit', '-q', '-m', 'base']);
    }
    // A clean tree, so the Changes dot is this walk's edit and nothing older.
    git(scratch, ['checkout', '-q', '--', '.']);
    git(scratch, ['clean', '-fdq']);
  });

  test('one ⋯ on the rail, dots on the icons, R · F · A on the session', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1200, height: 800 });
    await emptyDock(goosePage);

    // One prompt from the Hub starts the session on the default runtime.
    const input = goosePage.locator('[data-testid="chat-input"]');
    await input.fill(prompt);
    await input.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    const firstUrl = goosePage.url();
    const reply = goosePage.locator('[data-testid="message-container"].assistant').last();
    await expect(reply).toContainText(/done/i, { timeout: 120_000 });

    const more = goosePage.locator('[data-testid="workspace-pane-more"]');
    const menu = goosePage.locator('[data-testid="workspace-pane-more-menu"]');
    const openMenu = async () => {
      await more.click();
      await expect(menu).toBeVisible();
    };

    // The groups in order, separators between them, the shortcuts right of their rows.
    await openMenu();
    await expect(menu.locator('[data-testid^="workspace-"]')).toHaveText([
      'Files⇧⌘F',
      'Editor',
      'Git',
      'Markdown',
      'Background tasks',
      'Open in',
      'RenameR',
      'ForkF',
      'Transcript view',
      'Output style',
      'Keep computer awakeOnly for this session',
      'Advanced controls',
      'Open on phone…',
      'Save as routine…',
      'ArchiveA',
      'DeleteD',
    ]);
    await expect(menu.locator('[data-slot="dropdown-menu-separator"]')).toHaveCount(4);
    await expect(goosePage.locator('[data-testid="workspace-delete"]')).toHaveAttribute(
      'data-variant',
      'destructive'
    );
    // No second ⋯: upstream's header menu is hidden on the workspace route.
    await expect(goosePage.getByRole('button', { name: 'Session actions' })).toHaveCount(0);
    // The submenus open: Transcript view carries Full · Compact and the JSON views.
    const transcriptView = goosePage.locator('[data-testid="workspace-transcript-view"]');
    await transcriptView.hover();
    await transcriptView.click();
    await expect(goosePage.locator('[data-testid="workspace-transcript-compact"]')).toBeVisible();
    await expect(goosePage.locator('[data-testid="workspace-view-json"]')).toBeVisible();
    // The submenu grows out of its row; the picture waits for it to land.
    await goosePage.waitForTimeout(400);
    await expect(goosePage.locator('[data-testid="workspace-transcript-compact"]')).toBeVisible();
    await goosePage.screenshot({ path: test.info().outputPath('session-menu.png') });
    if (process.env.T69_SHOTS) {
      await goosePage.screenshot({ path: join(process.env.T69_SHOTS, 'session-menu.png') });
    }
    await goosePage.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // An edit on disk dots Changes within one poll; opening the pane clears it.
    const changes = goosePage.locator('[data-testid="workspace-pane-button-diff"]');
    await expect(changes).toHaveAttribute('data-unseen', 'false');
    writeFileSync(join(scratch, 'notes.md'), `one\nt69 ${stamp}\n`);
    await expect(changes).toHaveAttribute('data-unseen', 'true', { timeout: 45_000 });
    await expect(goosePage.locator('[data-testid="workspace-pane-dot-diff"]')).toBeVisible();
    if (process.env.T69_SHOTS) {
      await goosePage.screenshot({ path: join(process.env.T69_SHOTS, 'rail-dot.png') });
    }
    await changes.click();
    await expect(changes).toHaveAttribute('data-unseen', 'false');
    await expect(goosePage.locator('[data-testid="workspace-pane-dot-diff"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="workspace-pane-diff"]')).toBeVisible();
    await emptyDock(goosePage);

    // Keep computer awake: the check is what main answered after starting the blocker.
    const keepAwake = goosePage.locator('[data-testid="workspace-keep-awake"]');
    await openMenu();
    await expect(keepAwake).toHaveAttribute('aria-checked', 'false');
    await keepAwake.click();
    await expect(menu).toHaveCount(0);
    await openMenu();
    await expect(keepAwake).toHaveAttribute('aria-checked', 'true');
    await keepAwake.click();
    await expect(menu).toHaveCount(0);
    await openMenu();
    await expect(keepAwake).toHaveAttribute('aria-checked', 'false');
    await goosePage.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // R renames, through upstream's dialog. The Sessions column stays folded when an earlier
    // walk (or the user) left it so — upstream's toggle in the titlebar opens it.
    const sessions = goosePage.locator('[data-testid="workspace-column-sessions"]');
    const openNavigation = goosePage.getByRole('button', { name: 'Open navigation' });
    if ((await openNavigation.count()) > 0) await openNavigation.click();
    await expect(sessions.locator('..')).not.toHaveCSS('width', '0px');
    await openMenu();
    await goosePage.keyboard.press('r');
    const rename = goosePage.locator('[data-testid="session-rename-dialog"]');
    await expect(rename).toBeVisible();
    await expect(menu).toHaveCount(0);
    await rename.locator('[data-testid="session-rename-input"]').fill(renamed);
    await rename.locator('[data-testid="session-rename-save"]').click();
    await expect(rename).toHaveCount(0);
    await expect(sessions).toContainText(renamed);

    // F forks: a second session opens, named after the first.
    await openMenu();
    await goosePage.keyboard.press('f');
    await expect(menu).toHaveCount(0);
    await expect(goosePage).not.toHaveURL(firstUrl, { timeout: 30000 });
    await expect(goosePage).toHaveURL(/resumeSessionId=/);
    await expect(sessions).toContainText(`${renamed} (copy)`, { timeout: 15000 });

    // A archives the fork: it leaves the list and the chat lands on the Hub.
    await openMenu();
    await goosePage.keyboard.press('a');
    await expect(menu).toHaveCount(0);
    await expect(goosePage).not.toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    await expect(sessions).not.toContainText(`${renamed} (copy)`);
    await expect(sessions).toContainText(renamed);
  });
});
