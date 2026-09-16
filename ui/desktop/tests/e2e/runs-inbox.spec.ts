import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

// Task 53: a schedule with one finished run is one unread row in the Runs inbox; Open lands
// in pair with Changes open since session start; back on the route the row reads as seen;
// Accept stages the run's diff and commits it in the window's checkout. The window opens on
// a scratch repo (GOOSE_TEST_DIR, or a temp dir) so the run's cwd is the sidecar's; the run
// itself goes through the app: Create Schedule from a deep link, then Run Schedule Now.
// Task 54: a recipe with `settings.worktree: true` runs in `.worktrees/<slug>` on
// `wt/<slug>`; the row names the branch, Accept merges it into the checkout (--no-ff, so
// the log has the merge commit), and Dismiss on a second run removes its worktree.
const gooseBinary = join(__dirname, '../../../../target/debug/goose');
const stamp = Date.now();
const scheduleId = `t53-run-${stamp}`;
const worktreeScheduleId = `t54-wt-${stamp}`;
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

const writeRecipe = (name: string, id: string, task: string, extra: string[] = []) =>
  writeFileSync(
    join(recipeDir, name),
    [
      'version: 1.0.0',
      `title: ${id}`,
      `description: Runs inbox walk (${task})`,
      'prompt: >-',
      `  Append the line "${task} ran" to the file notes.md in the current working directory`,
      '  (for example with a shell command), then reply with exactly the word done.',
      ...extra,
      '',
    ].join('\n')
  );

const createScheduleFromDeeplink = async (page: Page, recipe: string, id: string) => {
  const deeplink = execFileSync(gooseBinary, ['recipe', 'deeplink', join(recipeDir, recipe)])
    .toString()
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('goose://recipe?config='));
  expect(deeplink).toBeTruthy();

  await page.getByRole('button', { name: 'Create Schedule' }).click();
  await page.getByRole('button', { name: 'Deep link' }).click();
  await page.getByPlaceholder('Paste goose://recipe link here...').fill(deeplink!);
  await expect(page.locator('#scheduleId-modal')).toHaveValue(id);
  await page.locator('button[type="submit"][form="schedule-form"]').click();
  await expect(page.locator('#schedule-form')).toHaveCount(0);
};

// run_schedule_now is held open for the whole run; the toast lands when it returns, and
// waiting for it to leave again keeps a second run from reading the first one's toast.
const runScheduleNow = async (page: Page) => {
  await page.getByRole('button', { name: 'Run Schedule Now' }).click();
  const toast = page.getByText('Run completed');
  await expect(toast).toBeVisible({ timeout: 240_000 });
  await expect(toast).toBeHidden({ timeout: 30000 });
};

test.describe('runs inbox', () => {
  test.setTimeout(300_000);

  test.beforeAll(() => {
    scratch = process.env.GOOSE_TEST_DIR ?? mkdtempSync(join(tmpdir(), 'goose-runs-inbox-'));
    mkdirSync(scratch, { recursive: true });
    process.env.GOOSE_TEST_DIR = scratch;
    if (!existsSync(join(scratch, '.git'))) {
      writeFileSync(join(scratch, 'notes.md'), 'one\n');
      writeFileSync(join(scratch, '.gitignore'), '.worktrees/\n');
      git(scratch, ['init', '-q', '-b', 'main']);
      // The sidecar's merge passes no author; worktrees share the repo's own config.
      git(scratch, ['config', 'user.name', 'runs-inbox']);
      git(scratch, ['config', 'user.email', 'runs-inbox@test']);
      git(scratch, ['add', '.']);
      git(scratch, ['commit', '-q', '-m', 'base']);
    }
    recipeDir = mkdtempSync(join(dirname(scratch), 'runs-inbox-recipe-'));
    writeRecipe('recipe.yaml', scheduleId, 't53');
    writeRecipe('worktree.yaml', worktreeScheduleId, 't54', ['settings:', '  worktree: true']);
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
    await createScheduleFromDeeplink(goosePage, 'recipe.yaml', scheduleId);

    await goosePage.locator('h3', { hasText: scheduleId }).first().click();
    await runScheduleNow(goosePage);
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

  test('runs a worktree recipe on its own branch: Accept merges it, Dismiss removes the tree', async ({
    goosePage,
  }) => {
    test.setTimeout(600_000);
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await gotoSchedules(goosePage);
    await createScheduleFromDeeplink(goosePage, 'worktree.yaml', worktreeScheduleId);

    await goosePage.locator('h3', { hasText: worktreeScheduleId }).first().click();
    await runScheduleNow(goosePage);
    await runScheduleNow(goosePage);
    await goosePage.getByRole('button', { name: 'Back' }).click();

    const inbox = goosePage.locator('[data-testid="runs-inbox"]');
    await expect(inbox).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    const rows = goosePage.locator('[data-testid="runs-inbox-row"]', {
      hasText: worktreeScheduleId,
    });
    await expect(rows).toHaveCount(2);
    const slugs: string[] = [];
    for (const row of await rows.all()) {
      await expect(row).toHaveAttribute('data-outcome', 'done');
      const branch = await row.locator('[data-testid="runs-inbox-branch"]').textContent();
      expect(branch).toMatch(/^wt\/wt-\d{8}-[0-9a-f]{4}$/);
      const slug = branch!.slice('wt/'.length);
      expect(existsSync(join(scratch, '.worktrees', slug))).toBe(true);
      expect(git(scratch, ['status', '--porcelain', '--', 'notes.md'])).toBe('');
      slugs.push(slug);
    }
    const [newest, older] = slugs;
    await goosePage.screenshot({
      path: test.info().outputPath('runs-inbox-worktree.png'),
      fullPage: true,
    });

    const accept = rows.first().locator('[data-testid="runs-inbox-accept"]');
    await expect(accept).toBeEnabled();
    await accept.click();
    await expect(goosePage.getByText(`Merged wt/${newest}`)).toBeVisible({ timeout: 30000 });
    await expect(rows.first().locator('[data-testid="runs-inbox-error"]')).toHaveCount(0);
    expect(git(scratch, ['log', '--merges', '-1', '--format=%s']).trim()).toBe(
      `Merge branch 'wt/${newest}'`
    );
    expect(readFileSync(join(scratch, 'notes.md'), 'utf8')).toContain('t54 ran');

    await rows.nth(1).locator('[data-testid="runs-inbox-dismiss"]').click();
    await expect(rows).toHaveCount(1, { timeout: 30000 });
    expect(existsSync(join(scratch, '.worktrees', older))).toBe(false);
    expect(git(scratch, ['worktree', 'list', '--porcelain'])).not.toContain(older);
    expect(existsSync(join(scratch, '.worktrees', newest))).toBe(true);
    await goosePage.screenshot({
      path: test.info().outputPath('runs-inbox-worktree-dismissed.png'),
      fullPage: true,
    });
  });
});
