import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { test, expect, openPane } from './fixtures';

// PRD step 5: a modified file shows in the Changes list; unified and side-by-side render.
// With no --dir and a piped stdin the app opens in $HOME, so the walk points HOME at a
// scratch repo with one committed, then modified, file. Hermit resolves its state dir from
// HOME too, so that is pinned to the real one first.
const realHome = homedir();
const previousEnv = { HOME: process.env.HOME, HERMIT_STATE_DIR: process.env.HERMIT_STATE_DIR };
let scratch = '';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', ['-c', 'user.name=diff-pane', '-c', 'user.email=diff-pane@test', ...args], {
    cwd,
    stdio: 'pipe',
  });

test.describe('diff pane', () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-diff-pane-'));
    const file = join(scratch, 'notes.md');
    writeFileSync(file, 'one\ntwo\nthree\n');
    git(scratch, ['init', '-q']);
    git(scratch, ['add', 'notes.md']);
    git(scratch, ['commit', '-q', '-m', 'base']);
    writeFileSync(file, 'one\ntwo, changed\nthree\nfour\n');
    mkdirSync(join(scratch, 'Library'), { recursive: true });
    process.env.HERMIT_STATE_DIR ??=
      process.platform === 'darwin'
        ? join(realHome, 'Library', 'Caches', 'hermit')
        : join(process.env.XDG_CACHE_HOME ?? join(realHome, '.cache'), 'hermit');
    process.env.HOME = scratch;
  });

  test.afterAll(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
  });

  test('lists the modified file and renders it unified and side by side', async ({ goosePage }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await openPane(goosePage, 'diff');

    const pane = goosePage.locator('[data-testid="diff-pane"]');
    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(goosePage.locator('[data-testid="diff-base"]')).toHaveValue('head');

    const row = goosePage.locator('[data-testid="diff-file"][data-path="notes.md"]');
    await expect(row).toContainText('+2');
    await expect(row).toContainText('−1');
    await row.click();

    const unified = goosePage.locator('[data-testid="diff-view"][data-view="unified"]');
    await expect(unified.locator('.cm-deletedChunk', { hasText: 'two' })).toBeVisible();
    await expect(unified.locator('.cm-changedLine', { hasText: 'two, changed' })).toBeVisible();

    await goosePage.locator('[data-testid="diff-view-split"]').click();
    const split = goosePage.locator('[data-testid="diff-view"][data-view="split"]');
    await expect(split.locator('.cm-mergeViewEditor')).toHaveCount(2);
    await expect(split.locator('.cm-merge-a .cm-changedLine', { hasText: 'two' })).toBeVisible();
    await expect(split.locator('.cm-merge-b .cm-changedLine', { hasText: 'four' })).toBeVisible();

    await goosePage.screenshot({
      path: test.info().outputPath('diff-pane.png'),
      fullPage: true,
    });
  });
});
