import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// Task 53: a schedule with one finished run is one unread row in the Runs inbox; Open lands
// in pair with Changes open since session start; back on the route the row reads as seen;
// Accept stages the run's diff and commits it in the window's checkout. The window opens on
// a scratch repo (GOOSE_TEST_DIR, or a temp dir) so the run's cwd is the sidecar's; the run
// itself goes through the app: Create Schedule from a deep link, then Run Schedule Now.
const gooseBinary = join(__dirname, '../../../../target/debug/goose');
const stamp = Date.now();
const scheduleId = `t53-run-${stamp}`;
let scratch = '';
let recipeDir = '';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', ['-c', 'user.name=runs-inbox', '-c', 'user.email=runs-inbox@test', ...args], {
    cwd,
    stdio: 'pipe',
  }).toString();

const gotoSchedules = async (page: Page) => {
  await page.evaluate(() => {
    window.location.hash = '#/schedules';
  });
  await expect(page.locator('[data-testid="runs-inbox"]')).toBeVisible({ timeout: 30000 });
};

test.describe('runs inbox', () => {
  test.setTimeout(300_000);

  test.beforeAll(() => {
    scratch = process.env.GOOSE_TEST_DIR ?? mkdtempSync(join(tmpdir(), 'goose-runs-inbox-'));
    mkdirSync(scratch, { recursive: true });
    process.env.GOOSE_TEST_DIR = scratch;
    if (!existsSync(join(scratch, '.git'))) {
      writeFileSync(join(scratch, 'notes.md'), 'one\n');
      git(scratch, ['init', '-q']);
      git(scratch, ['add', 'notes.md']);
      git(scratch, ['commit', '-q', '-m', 'base']);
    }
    recipeDir = mkdtempSync(join(dirname(scratch), 'runs-inbox-recipe-'));
    writeFileSync(
      join(recipeDir, 'recipe.yaml'),
      [
        'version: 1.0.0',
        `title: ${scheduleId}`,
        'description: Runs inbox walk (task 53)',
        'prompt: >-',
        '  Append the line "t53 ran" to the file notes.md in the current working directory',
        '  (for example with a shell command), then reply with exactly the word done.',
        '',
      ].join('\n')
    );
  });

  test.afterAll(() => {
    rmSync(recipeDir, { recursive: true, force: true });
  });

  test('lists a finished run unread, opens it on Changes since session start, then reads it', async ({
    goosePage,
  }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await gotoSchedules(goosePage);

    const deeplink = execFileSync(gooseBinary, [
      'recipe',
      'deeplink',
      join(recipeDir, 'recipe.yaml'),
    ])
      .toString()
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('goose://recipe?config='));
    expect(deeplink).toBeTruthy();

    await goosePage.getByRole('button', { name: 'Create Schedule' }).click();
    await goosePage.getByRole('button', { name: 'Deep link' }).click();
    await goosePage.getByPlaceholder('Paste goose://recipe link here...').fill(deeplink!);
    await expect(goosePage.locator('#scheduleId-modal')).toHaveValue(scheduleId);
    await goosePage.locator('button[type="submit"][form="schedule-form"]').click();
    await expect(goosePage.locator('#schedule-form')).toHaveCount(0);

    await goosePage.locator('h3', { hasText: scheduleId }).first().click();
    await goosePage.getByRole('button', { name: 'Run Schedule Now' }).click();
    // run_schedule_now is held open for the whole run; the toast lands when it returns.
    await expect(goosePage.getByText('Run completed')).toBeVisible({ timeout: 240_000 });
    await goosePage.getByRole('button', { name: 'Back' }).click();

    const inbox = goosePage.locator('[data-testid="runs-inbox"]');
    await expect(inbox).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    const row = goosePage.locator('[data-testid="runs-inbox-row"]', { hasText: scheduleId });
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-outcome', 'done');
    await expect(row).toHaveAttribute('data-unread', 'true');
    await expect(row).toContainText(scratch);
    await expect(row.locator('[data-testid="runs-inbox-accept"]')).toBeEnabled();
    await goosePage.screenshot({
      path: test.info().outputPath('runs-inbox.png'),
      fullPage: true,
    });

    await row.locator('[data-testid="runs-inbox-open"]').click();
    await expect(goosePage).toHaveURL(/#\/pair\?resumeSessionId=/);
    const pane = goosePage.locator('[data-testid="diff-pane"]');
    await expect(pane).toBeVisible({ timeout: 30000 });
    await expect(pane).toHaveAttribute('data-state', /ready|empty/, { timeout: 30000 });
    await expect(goosePage.locator('[data-testid="diff-base"]')).toHaveValue('session');
    await goosePage.screenshot({
      path: test.info().outputPath('runs-inbox-open.png'),
      fullPage: true,
    });

    await gotoSchedules(goosePage);
    await expect(row).toHaveAttribute('data-unread', 'false');
  });

  test("Accept stages the run's diff and commits it in the checkout", async ({ goosePage }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await gotoSchedules(goosePage);
    const row = goosePage.locator('[data-testid="runs-inbox-row"]', { hasText: scheduleId });
    await expect(row).toHaveCount(1, { timeout: 30000 });
    const accept = row.locator('[data-testid="runs-inbox-accept"]');
    await expect(accept).toBeEnabled();
    expect(git(scratch, ['status', '--porcelain'])).toContain('notes.md');

    await accept.click();
    await expect(goosePage.getByText('Accepted')).toBeVisible({ timeout: 30000 });
    await expect(row.locator('[data-testid="runs-inbox-error"]')).toHaveCount(0);
    expect(git(scratch, ['log', '-1', '--format=%s'])).toContain(scheduleId);
    expect(git(scratch, ['status', '--porcelain', '--', 'notes.md'])).toBe('');
    await goosePage.screenshot({
      path: test.info().outputPath('runs-inbox-accepted.png'),
      fullPage: true,
    });
  });
});
