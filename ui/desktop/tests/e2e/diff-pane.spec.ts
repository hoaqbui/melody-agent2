import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { test, expect, openPane } from './fixtures';

// PRD step 5: a modified file shows in the Changes list; unified and side-by-side render.
// Task 50: a file with two separated edits is reviewed per chunk — Stage, Reject, Undo — and
// git's own view of the index and the working tree confirms each step. With no --dir and a
// piped stdin the app opens in $HOME, so the walk points HOME at a scratch repo with the
// committed, then modified, files. Hermit resolves its state dir from HOME too, so that is
// pinned to the real one first.
const realHome = homedir();
const previousEnv = { HOME: process.env.HOME, HERMIT_STATE_DIR: process.env.HERMIT_STATE_DIR };
let scratch = '';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', ['-c', 'user.name=diff-pane', '-c', 'user.email=diff-pane@test', ...args], {
    cwd,
    stdio: 'pipe',
  }).toString();

const TEN_LINES = 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8\nl9\nl10\n';

test.describe('diff pane', () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-diff-pane-'));
    const file = join(scratch, 'notes.md');
    const hunks = join(scratch, 'hunks.md');
    writeFileSync(file, 'one\ntwo\nthree\n');
    writeFileSync(hunks, TEN_LINES);
    git(scratch, ['init', '-q']);
    git(scratch, ['add', 'notes.md', 'hunks.md']);
    git(scratch, ['commit', '-q', '-m', 'base']);
    writeFileSync(file, 'one\ntwo, changed\nthree\nfour\n');
    writeFileSync(hunks, TEN_LINES.replace('l2', 'L2').replace('l9', 'L9'));
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

  test('stages one hunk, rejects the other, and undoes it', async ({ goosePage }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await openPane(goosePage, 'diff');

    const pane = goosePage.locator('[data-testid="diff-pane"]');
    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(goosePage.locator('[data-testid="diff-scope"]')).toHaveValue('unstaged');
    const row = goosePage.locator('[data-testid="diff-file"][data-path="hunks.md"]');
    await row.click();

    const unified = goosePage.locator('[data-testid="diff-view"][data-view="unified"]');
    const chunks = unified.locator('.cm-deletedChunk');
    await expect(chunks).toHaveCount(2);
    await expect(chunks.first().locator('[data-testid="diff-chunk-stage"]')).toBeEnabled();
    await expect(chunks.first().locator('[data-testid="diff-chunk-reject"]')).toBeEnabled();
    await goosePage.screenshot({
      path: test.info().outputPath('diff-pane-hunks.png'),
      fullPage: true,
    });

    await chunks.first().locator('[data-testid="diff-chunk-stage"]').click();
    await expect(goosePage.locator('[data-testid="diff-undo"]')).toBeVisible();
    await expect(chunks).toHaveCount(1);
    expect(git(scratch, ['diff', '--cached'])).toContain('+L2');
    expect(git(scratch, ['diff'])).not.toContain('L2');
    expect(git(scratch, ['diff'])).toContain('+L9');

    await goosePage.locator('[data-testid="diff-scope"]').selectOption('staged');
    await expect(goosePage.locator('[data-testid="diff-files"]')).toHaveAttribute(
      'aria-busy',
      'false'
    );
    await expect(goosePage.locator('[data-testid="diff-file"]')).toHaveCount(1);
    await row.click();
    await expect(chunks).toHaveCount(1);
    await expect(unified.locator('.cm-deletedChunk', { hasText: 'l2' })).toBeVisible();
    await expect(chunks.locator('button')).toHaveCount(0);

    await goosePage.locator('[data-testid="diff-scope"]').selectOption('unstaged');
    await expect(goosePage.locator('[data-testid="diff-files"]')).toHaveAttribute(
      'aria-busy',
      'false'
    );
    await row.click();
    await expect(chunks).toHaveCount(1);
    await chunks.first().locator('[data-testid="diff-chunk-reject"]').click();
    await expect(row).toHaveCount(0);
    expect(readFileSync(join(scratch, 'hunks.md'), 'utf8')).toBe(TEN_LINES.replace('l2', 'L2'));
    expect(git(scratch, ['diff', '--', 'hunks.md'])).toBe('');

    await goosePage.locator('[data-testid="diff-undo"]').click();
    await expect(row).toBeVisible();
    await expect(goosePage.locator('[data-testid="diff-undo"]')).toHaveCount(0);
    expect(git(scratch, ['diff', '--', 'hunks.md'])).toContain('+L9');
    expect(git(scratch, ['diff', '--cached', '--', 'hunks.md'])).toContain('+L2');
  });
});
