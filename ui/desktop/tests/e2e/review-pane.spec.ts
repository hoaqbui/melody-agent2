import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { test, expect, emptyDock, openPane, provisionRoleRepo } from './fixtures';

// Task 70: a chat in its own worktree, one committed change on the branch whose defect the
// plan and tasks.md name, then Review branch… in the Changes pane's worktree row starts a
// session on the Reviewer role (the scratch repo's `.agents/agents/reviewer.md`, its
// `runtimes:` rolled — Codex 9 : Cursor 1) and opens the Review pane on it: the header names
// branch · base · runtime · model, a Verdict chip lands within 120 s, a finding's `file:line`
// opens the Editor at that line, and the Git pane's PR section offers the same button. The
// window opens on the role repo through the fixture's GOOSE_TEST_DIR.
let restoreRoles: () => void = () => {};

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

test.describe('review branch', () => {
  test.beforeAll(() => {
    restoreRoles = provisionRoleRepo();
  });
  test.afterAll(() => restoreRoles());

  test.setTimeout(360_000);

  test('reviews the worktree branch and opens a finding in the Editor', async ({ goosePage }) => {
    const scratch = process.env.GOOSE_TEST_DIR!;
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1400, height: 900 });
    await emptyDock(goosePage);

    // Before any review: the pane opens from the bar and reads empty.
    await openPane(goosePage, 'review');
    const pane = goosePage.locator('[data-testid="review-pane"]');
    await expect(pane).toHaveAttribute('data-state', 'empty', { timeout: 15000 });
    await expect(pane.locator('[data-testid="review-empty"]')).toHaveText(
      'No review yet — Review branch… in Changes'
    );
    await emptyDock(goosePage);

    const chip = goosePage.locator('[data-testid="workspace-worktree"]');
    await expect(chip).toBeVisible({ timeout: 15000 });
    await chip.click();
    const slug = (await chip.getAttribute('data-slug')) ?? '';
    expect(slug).toMatch(/^wt-/);
    const hubInput = goosePage.locator('[data-testid="chat-input"]');
    await hubInput.fill('Respond with the single word hello.');
    await hubInput.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    await expect(chip).toHaveText(`wt/${slug}`, { timeout: 15000 });
    await expect(
      goosePage.locator('[data-testid="message-container"].assistant').last()
    ).toContainText(/hello/i, { timeout: 45000 });

    // The change under review: the plan and tasks.md say add, the code subtracts, so the
    // reviewer has a line to cite.
    const worktree = join(scratch, '.worktrees', slug);
    mkdirSync(join(worktree, 'src'), { recursive: true });
    mkdirSync(join(worktree, 'docs'), { recursive: true });
    writeFileSync(
      join(worktree, 'src', 'add.ts'),
      '// task 1: the sum of a and b\nexport function add(a: number, b: number): number {\n  return a - b;\n}\n'
    );
    writeFileSync(join(worktree, 'tasks.md'), '- 1. `add(a, b)` in src/add.ts returns a + b.\n');
    writeFileSync(
      join(worktree, 'docs', 'plan.md'),
      '## Plan\n\n- src/add.ts: `add` returns a + b.\n'
    );
    git(worktree, ['add', '.']);
    git(worktree, ['commit', '-q', '-m', 'task 1: add']);

    await openPane(goosePage, 'diff');
    const row = goosePage.locator('[data-testid="diff-worktree"]');
    await expect(row).toHaveAttribute('data-slug', slug, { timeout: 15000 });
    const review = goosePage.locator('[data-testid="diff-review"]');
    await expect(review).toHaveText('Review branch…');
    await review.click();

    // The pane opens on the new session: the header first, the verdict once the reviewer
    // has replied.
    await expect(pane).toBeVisible({ timeout: 30000 });
    const header = pane.locator('[data-testid="review-header"]');
    await expect(header).toContainText(`wt/${slug} · main`, { timeout: 30000 });
    console.log(`review header: ${await header.innerText()}`);
    expect(await header.innerText()).toMatch(/· (Codex|Cursor) · /);
    await expect(pane).toHaveAttribute('data-state', 'loading');
    const verdict = pane.locator('[data-testid="review-verdict"]');
    await expect(verdict).toBeVisible({ timeout: 120_000 });
    const word = (await verdict.getAttribute('data-verdict')) ?? '';
    console.log(`verdict: ${word}`);
    expect(['PASS', 'PASS WITH ISSUES', 'FAIL']).toContain(word);
    await expect(pane).toHaveAttribute('data-state', 'ready');
    await expect(pane.locator('[data-testid="review-rerun"]')).toBeEnabled();
    // The session carries the tag in its title, so the Sessions list finds it again.
    await expect(
      goosePage
        .locator('[data-testid="workspace-column-sessions"]')
        .getByText(`Review: wt/${slug} vs main`)
    ).toBeVisible({ timeout: 15000 });
    await goosePage.screenshot({
      path: process.env.T70_SHOTS
        ? join(process.env.T70_SHOTS, 'review-pane.png')
        : test.info().outputPath('review-pane.png'),
      animations: 'disabled',
    });

    // A finding's file:line opens the Editor on that file, the cursor on that line.
    const links = pane.locator('[data-testid="review-link"]');
    expect(await links.count()).toBeGreaterThan(0);
    const first = links.first();
    const path = (await first.getAttribute('data-path')) ?? '';
    const line = (await first.getAttribute('data-line')) ?? '';
    console.log(`first link: ${path}:${line}`);
    await first.click();
    const editor = goosePage.locator('[data-testid="editor-pane"]');
    await expect(editor).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    const tail = path.replace(/^\.?\//, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(goosePage.locator('[data-testid="workspace-editor-file"]')).toHaveText(
      new RegExp(`${tail}$`)
    );
    const cited = path.startsWith('/') ? path : join(worktree, path);
    const lineText = readFileSync(cited, 'utf8').split('\n')[Number(line) - 1] ?? '';
    await expect(editor.locator('.cm-activeLine').first()).toHaveText(lineText);

    // The Git pane's PR section offers the same start.
    await openPane(goosePage, 'git');
    await expect(goosePage.locator('[data-testid="git-review"]')).toBeEnabled({ timeout: 15000 });
    await emptyDock(goosePage);
  });
});
