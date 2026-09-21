import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import type { Page } from '@playwright/test';
import { test, expect, setAdvancedControls } from './fixtures';

// Task 67: the Board reads status from the work. Two sessions in the scratch repo — one in
// the main checkout, which the walk then dirties (→ Needs review), one in its own worktree,
// clean (→ Done, card reads `wt/<slug>`) — and one finished routine run the inbox has not
// opened (→ Needs review). Open a card → `/pair?resumeSessionId=`. The window opens on the
// scratch repo (GOOSE_TEST_DIR, or a temp dir) so every cwd is the sidecar's; the run goes
// through the app as the runs-inbox walk does: Create Schedule from a deep link, Run Now.
const gooseBinary = join(__dirname, '../../../../target/debug/goose');
const stamp = Date.now();
const scheduleId = `t67-run-${stamp}`;
let scratch = '';
let recipeDir = '';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', ['-c', 'user.name=board', '-c', 'user.email=board@test', ...args], {
    cwd,
    stdio: 'pipe',
  }).toString();

const goto = async (page: Page, hash: string) => {
  await page.evaluate((next) => {
    window.location.hash = next;
  }, hash);
};

// The pair chat stays mounted, hidden, on the Hub (its streams stay alive), so the Hub's
// input is the visible one.
const sendFromHub = async (page: Page) => {
  const hubInput = page.locator('[data-testid="chat-input"]:visible');
  await hubInput.fill('Respond with the single word hello.');
  await hubInput.press('Enter');
  await expect(page).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
  const reply = page.locator('[data-testid="message-container"].assistant').last();
  await expect(reply).toContainText(/hello/i, { timeout: 45000 });
  const hash = new URL(page.url()).hash;
  return new URLSearchParams(hash.slice(hash.indexOf('?') + 1)).get('resumeSessionId') ?? '';
};

const createScheduleFromDeeplink = async (page: Page) => {
  const deeplink = execFileSync(gooseBinary, ['recipe', 'deeplink', join(recipeDir, 'recipe.yaml')])
    .toString()
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('goose://recipe?config='));
  expect(deeplink).toBeTruthy();

  await page.getByRole('button', { name: 'Create Schedule' }).click();
  await page.getByRole('button', { name: 'Deep link' }).click();
  await page.getByPlaceholder('Paste goose://recipe link here...').fill(deeplink!);
  await expect(page.locator('#scheduleId-modal')).toHaveValue(scheduleId);
  await page.locator('button[type="submit"][form="schedule-form"]').click();
  await expect(page.locator('#schedule-form')).toHaveCount(0);
};

test.describe('task board', { tag: '@seat' }, () => {
  test.setTimeout(420_000);

  test.beforeAll(() => {
    scratch = process.env.GOOSE_TEST_DIR ?? mkdtempSync(join(tmpdir(), 'goose-board-'));
    mkdirSync(scratch, { recursive: true });
    process.env.GOOSE_TEST_DIR = scratch;
    if (!existsSync(join(scratch, '.git'))) {
      writeFileSync(join(scratch, 'notes.md'), 'one\n');
      writeFileSync(join(scratch, '.gitignore'), '.worktrees/\n');
      git(scratch, ['init', '-q', '-b', 'main']);
      git(scratch, ['config', 'user.name', 'board']);
      git(scratch, ['config', 'user.email', 'board@test']);
      git(scratch, ['add', '.']);
      git(scratch, ['commit', '-q', '-m', 'base']);
    }
    recipeDir = mkdtempSync(join(dirname(scratch), 'board-recipe-'));
    writeFileSync(
      join(recipeDir, 'recipe.yaml'),
      [
        'version: 1.0.0',
        `title: ${scheduleId}`,
        'description: Board walk (t67)',
        'prompt: Reply with exactly the word done.',
        '',
      ].join('\n')
    );
  });

  test.afterAll(() => {
    rmSync(recipeDir, { recursive: true, force: true });
  });

  test('cards land in Running · Needs review · Done from the work itself; Open lands in pair', async ({
    goosePage,
  }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1400, height: 900 });
    await setAdvancedControls(goosePage, false);

    // The first session lives in the main checkout; the walk dirties it once the reply is in.
    const mainSessionId = await sendFromHub(goosePage);
    expect(mainSessionId).not.toBe('');

    // The second session gets its own worktree (task 49): a clean checkout of its own.
    await goto(goosePage, '#/');
    await setAdvancedControls(goosePage, true);
    const chip = goosePage.locator('[data-testid="workspace-worktree"]');
    await expect(chip).toHaveAttribute('aria-pressed', 'false', { timeout: 15000 });
    await chip.click();
    const slug = (await chip.getAttribute('data-slug')) ?? '';
    expect(slug).toMatch(/^wt-\d{8}-[0-9a-f]{4}$/);
    await setAdvancedControls(goosePage, false);
    const worktreeSessionId = await sendFromHub(goosePage);
    expect(worktreeSessionId).not.toBe(mainSessionId);
    expect(existsSync(join(scratch, '.worktrees', slug))).toBe(true);

    // A routine run, finished and never opened from the inbox.
    await goto(goosePage, '#/schedules');
    await expect(goosePage.locator('[data-testid="runs-inbox"]')).toBeVisible({ timeout: 30000 });
    await createScheduleFromDeeplink(goosePage);
    await goosePage.locator('h3', { hasText: scheduleId }).first().click();
    await goosePage.getByRole('button', { name: 'Run Schedule Now' }).click();
    await expect(goosePage.getByText('Run completed')).toBeVisible({ timeout: 240_000 });

    writeFileSync(join(scratch, 'notes.md'), 'one\ntwo\n');
    expect(git(scratch, ['status', '--porcelain'])).toContain('notes.md');
    expect(git(join(scratch, '.worktrees', slug), ['status', '--porcelain']).trim()).toBe('');

    await goto(goosePage, '#/board');
    const board = goosePage.locator('[data-testid="board"]');
    await expect(board).toHaveAttribute('data-state', /ready|partial/, { timeout: 60000 });
    await expect(board).toHaveAttribute('data-ui', 'easy');
    await expect(goosePage.locator('[data-testid="board-filters"]')).toHaveCount(0);

    const card = (id: string) =>
      goosePage.locator(`[data-testid="board-card"][data-session-id="${id}"]`);
    const column = (name: string) => goosePage.locator(`[data-testid="board-column-${name}"]`);

    const mainCard = card(mainSessionId);
    await expect(mainCard).toHaveAttribute('data-kind', 'session');
    await expect(mainCard).toHaveAttribute('data-status', 'review');
    await expect(column('review').locator(mainCard)).toHaveCount(1);

    const worktreeCard = card(worktreeSessionId);
    await expect(worktreeCard).toHaveAttribute('data-status', 'done');
    await expect(column('done').locator(worktreeCard)).toHaveCount(1);
    await expect(worktreeCard.locator('[data-testid="board-card-branch"]')).toHaveText(
      `wt/${slug}`
    );

    const runCard = goosePage.locator('[data-testid="board-card"][data-kind="run"]', {
      hasText: scheduleId,
    });
    await expect(runCard).toHaveCount(1);
    await expect(runCard).toHaveAttribute('data-status', 'review');
    await expect(column('review').locator(runCard)).toHaveCount(1);
    await expect(goosePage.locator('[data-testid="board-card-status"]').first()).toBeVisible();

    await goosePage.screenshot({
      path: test.info().outputPath('board.png'),
      fullPage: true,
    });

    await mainCard.click();
    await expect(goosePage).toHaveURL(new RegExp(`#/pair\\?resumeSessionId=${mainSessionId}`));

    // Back on the board the run, opened, has left Needs review — the inbox's own mark.
    await goto(goosePage, '#/board');
    await expect(board).toHaveAttribute('data-state', /ready|partial/, { timeout: 60000 });
    await runCard.click();
    await expect(goosePage).toHaveURL(/#\/pair\?resumeSessionId=/);
    await goto(goosePage, '#/board');
    await expect(runCard).toHaveAttribute('data-status', 'done', { timeout: 60000 });

    // Advanced adds the filter row (task 58's face, read the way the shell reads it).
    await goto(goosePage, `#/pair?resumeSessionId=${mainSessionId}`);
    await setAdvancedControls(goosePage, true);
    try {
      await goto(goosePage, '#/board');
      await expect(board).toHaveAttribute('data-ui', 'advanced', { timeout: 15000 });
      const filters = goosePage.locator('[data-testid="board-filters"]');
      await expect(filters).toBeVisible();
      await goosePage.locator('[data-testid="board-filter-status"]').selectOption('review');
      await expect(mainCard).toBeVisible();
      await expect(worktreeCard).toHaveCount(0);
      await goosePage.screenshot({
        path: test.info().outputPath('board-advanced.png'),
        fullPage: true,
      });
    } finally {
      await goto(goosePage, `#/pair?resumeSessionId=${mainSessionId}`);
      await setAdvancedControls(goosePage, false);
    }
  });
});
