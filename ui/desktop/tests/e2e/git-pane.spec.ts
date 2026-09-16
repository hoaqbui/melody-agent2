import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { test, expect, openPane } from './fixtures';

// PRD step 7: the branch is shown, a modified file is staged and committed, and the Changes
// pane's "vs HEAD" is empty afterwards. As diff-pane.spec.ts: the app opens in $HOME, so HOME
// points at a scratch repo; Hermit's state dir is pinned to the real one first. The commit
// runs in the sidecar, which sees no global gitconfig under the scratch HOME, so the author
// is set in the repo's own config.
const realHome = homedir();
const previousEnv = { HOME: process.env.HOME, HERMIT_STATE_DIR: process.env.HERMIT_STATE_DIR };
let scratch = '';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

test.describe('git pane', () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-git-pane-'));
    const file = join(scratch, 'notes.md');
    writeFileSync(file, 'one\ntwo\nthree\n');
    git(scratch, ['init', '-q', '-b', 'main']);
    git(scratch, ['config', 'user.name', 'git-pane']);
    git(scratch, ['config', 'user.email', 'git-pane@test']);
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

  test('shows the branch, stages a file, commits, and leaves no changes vs HEAD', async ({
    goosePage,
  }) => {
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    await openPane(goosePage, 'git');

    const pane = goosePage.locator('[data-testid="git-pane"]');
    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await expect(goosePage.locator('[data-testid="git-branch"]')).toHaveText('main');

    const unstaged = goosePage.locator('[data-testid="git-unstaged"]');
    const staged = goosePage.locator('[data-testid="git-staged"]');
    await expect(unstaged.locator('[data-testid="git-file"][data-path="notes.md"]')).toBeVisible();
    await expect(staged.locator('[data-testid="git-file"]')).toHaveCount(0);

    const commit = goosePage.locator('[data-testid="git-commit"]');
    await expect(commit).toBeDisabled();
    await expect(goosePage.locator('[data-testid="git-commit-blocker"]')).toHaveAttribute(
      'data-blocker',
      'nothingStaged'
    );

    await unstaged.locator('[data-testid="git-stage"]').click();
    await expect(staged.locator('[data-testid="git-file"][data-path="notes.md"]')).toBeVisible();
    await expect(unstaged.locator('[data-testid="git-file"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="git-commit-blocker"]')).toHaveAttribute(
      'data-blocker',
      'noMessage'
    );

    await goosePage.locator('[data-testid="git-message"]').fill('notes: add four');
    await expect(commit).toBeEnabled();
    await commit.click();

    await expect(goosePage.locator('[data-testid="git-output"]')).toContainText('notes: add four');
    await expect(goosePage.locator('[data-testid="git-clean"]')).toBeVisible();
    await expect(goosePage.locator('[data-testid="git-message"]')).toHaveValue('');
    expect(git(scratch, ['log', '--format=%s', '-1']).trim()).toBe('notes: add four');

    await openPane(goosePage, 'diff');
    const diff = goosePage.locator('[data-testid="diff-pane"]');
    await expect(diff).toHaveAttribute('data-state', 'empty', { timeout: 15000 });
    await expect(goosePage.locator('[data-testid="diff-base"]')).toHaveValue('head');

    await goosePage.screenshot({
      path: test.info().outputPath('git-pane.png'),
      fullPage: true,
    });
  });
});
