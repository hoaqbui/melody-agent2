import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect, emptyDock, openPane } from './fixtures';

// Task 49: the Worktree chip on, a prompt sent from the Hub, and the session runs in
// `.worktrees/<slug>` — the chip reads `wt/<slug>`, the Terminal's `pwd` ends there, and the
// Changes pane offers Merge into main and Remove worktree. A commit on the branch merges
// into the main checkout (--no-ff, so its log has the merge commit); a conflicting one is the
// pane's Error state with the paths listed and Merge still enabled; Remove hands the chat
// back to the checkout. The window opens on a scratch repo through the fixture's
// GOOSE_TEST_DIR (task 58), set here so the repo path is the walk's own.
const previousTestDir = process.env.GOOSE_TEST_DIR;
let scratch = '';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

test.describe('worktree', () => {
  test.beforeAll(() => {
    scratch = realpathSync(mkdtempSync(join(tmpdir(), 'goose-worktree-')));
    writeFileSync(join(scratch, 'notes.md'), 'one\ntwo\nthree\n');
    writeFileSync(join(scratch, '.gitignore'), '.worktrees/\n');
    git(scratch, ['init', '-q', '-b', 'main']);
    // The sidecar's git sees no global config under the scratch root; worktrees share the
    // repo's own, and --no-ff needs an author.
    git(scratch, ['config', 'user.name', 'worktree']);
    git(scratch, ['config', 'user.email', 'worktree@test']);
    git(scratch, ['add', '.']);
    git(scratch, ['commit', '-q', '-m', 'base']);
    process.env.GOOSE_TEST_DIR = scratch;
  });

  test.afterAll(() => {
    if (previousTestDir === undefined) delete process.env.GOOSE_TEST_DIR;
    else process.env.GOOSE_TEST_DIR = previousTestDir;
    rmSync(scratch, { recursive: true, force: true });
  });

  test('starts a chat in its own worktree, merges it, meets a conflict, removes it', async ({
    goosePage,
  }) => {
    test.setTimeout(240_000);
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1400, height: 900 });

    // The toggle, off by default, names the path and the Rust cost once it is on.
    const chip = goosePage.locator('[data-testid="workspace-worktree"]');
    await expect(chip).toBeVisible({ timeout: 15000 });
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    await expect(chip).toHaveText('Worktree');
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    const slug = (await chip.getAttribute('data-slug')) ?? '';
    expect(slug).toMatch(/^wt-\d{8}-[0-9a-f]{4}$/);
    await expect(chip).toHaveText(`wt/${slug}`);
    await expect(chip).toHaveAttribute('title', new RegExp(`\\.worktrees/${slug}`));
    await expect(chip).toHaveAttribute('title', /CARGO_TARGET_DIR/);

    const hubInput = goosePage.locator('[data-testid="chat-input"]');
    await hubInput.fill('Respond with the single word hello.');
    await hubInput.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });

    // The session's cwd is the worktree: the chip reads the branch and toggles no more.
    await expect(chip).toHaveText(`wt/${slug}`, { timeout: 15000 });
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip).toBeDisabled();
    const worktree = join(scratch, '.worktrees', slug);
    expect(existsSync(worktree)).toBe(true);
    expect(git(scratch, ['worktree', 'list', '--porcelain'])).toContain(
      `branch refs/heads/wt/${slug}`
    );
    expect(git(scratch, ['status', '--porcelain']).trim()).toBe('');

    const reply = goosePage.locator('[data-testid="message-container"].assistant').last();
    await expect(reply).toContainText(/hello/i, { timeout: 45000 });

    await emptyDock(goosePage);
    await openPane(goosePage, 'terminal');
    const terminal = goosePage.locator('[data-testid="terminal-pane"]');
    await expect(terminal.locator('[data-testid="terminal-status"]')).toHaveCount(0, {
      timeout: 15000,
    });
    await terminal.locator('.xterm').click();
    await goosePage.keyboard.type('pwd\n');
    await expect
      .poll(async () => (await terminal.locator('.xterm-rows').innerText()).replace(/\s+/g, ''), {
        timeout: 30000,
      })
      .toContain(`.worktrees/${slug}`);

    // A commit on the branch, then Merge into main from the Changes pane.
    writeFileSync(join(worktree, 'added.md'), 'from the worktree\n');
    git(worktree, ['add', 'added.md']);
    git(worktree, ['commit', '-q', '-m', 'wt: add added.md']);

    await emptyDock(goosePage);
    await openPane(goosePage, 'diff');
    const pane = goosePage.locator('[data-testid="diff-pane"]');
    await expect(pane).toHaveAttribute('data-state', 'empty', { timeout: 15000 });
    const row = goosePage.locator('[data-testid="diff-worktree"]');
    await expect(row).toHaveAttribute('data-slug', slug);
    await expect(goosePage.locator('[data-testid="diff-branch"]')).toHaveText(`wt/${slug}`);
    const merge = goosePage.locator('[data-testid="diff-merge"]');
    await expect(merge).toHaveText('Merge into main');
    await expect(merge).toBeEnabled();
    await merge.click();
    await expect(goosePage.locator('[data-testid="diff-notice"]')).toContainText(
      'Merged into main',
      { timeout: 15000 }
    );
    expect(git(scratch, ['log', '--merges', '--format=%s', '-1']).trim()).toBe(
      `Merge branch 'wt/${slug}'`
    );
    expect(existsSync(join(scratch, 'added.md'))).toBe(true);
    await goosePage.screenshot({
      path: test.info().outputPath('worktree-changes.png'),
      fullPage: true,
    });

    // The same line changed on both sides: 409, the path listed, main left clean, Merge on.
    writeFileSync(join(scratch, 'notes.md'), 'one\ntwo, main\nthree\n');
    git(scratch, ['commit', '-q', '-am', 'main: two']);
    writeFileSync(join(worktree, 'notes.md'), 'one\ntwo, worktree\nthree\n');
    git(worktree, ['commit', '-q', '-am', 'wt: two']);
    await merge.click();
    const failure = goosePage.locator('[data-testid="diff-merge-error"]');
    await expect(failure).toBeVisible({ timeout: 15000 });
    await expect(failure).toContainText(`merge of wt/${slug} conflicts in 1 path(s)`);
    await expect(goosePage.locator('[data-testid="diff-conflicts"] li')).toHaveText(['notes.md']);
    await expect(pane).toHaveAttribute('data-state', 'error');
    await expect(merge).toBeEnabled();
    expect(git(scratch, ['status', '--porcelain']).trim()).toBe('');
    expect(git(scratch, ['log', '--format=%s', '-1']).trim()).toBe('main: two');
    await goosePage.screenshot({
      path: test.info().outputPath('worktree-conflict.png'),
      fullPage: true,
    });

    // Remove hands the chat back to the checkout; the row goes, the chip reads Worktree.
    await goosePage.locator('[data-testid="diff-remove-worktree"]').click();
    await expect(goosePage.locator('[data-testid="diff-notice"]')).toContainText(
      'Worktree removed',
      { timeout: 15000 }
    );
    await expect(row).toHaveCount(0);
    await expect(chip).toHaveText('Worktree', { timeout: 15000 });
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(existsSync(worktree)).toBe(false);
    expect(git(scratch, ['worktree', 'list', '--porcelain'])).not.toContain(slug);
    await emptyDock(goosePage);
  });
});
