import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect, openPane } from './fixtures';

// PRD step 5: a modified file shows in the Changes list; unified and side-by-side render.
// Task 50: a file with two separated edits is reviewed per chunk — Stage, Reject, Undo — and
// git's own view of the index and the working tree confirms each step. GOOSE_TEST_DIR (task
// 58) opens the window on the scratch repo with the committed, then modified, files; the
// user's own config stays where it is, so the provider check on launch still finds a seat.
const previousDir = process.env.GOOSE_TEST_DIR;
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
    process.env.GOOSE_TEST_DIR = scratch;
  });

  test.afterAll(() => {
    if (previousDir === undefined) delete process.env.GOOSE_TEST_DIR;
    else process.env.GOOSE_TEST_DIR = previousDir;
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

    // Task 94: the Changes tab's badge, off the same two dirty files as the row below —
    // the app's first git-status poll (task 74) already ran by the time this assertion
    // reads it, no 30s wait needed here.
    await expect(goosePage.locator('[data-testid="workspace-tab-badge-diff"]')).toHaveText(
      '2 · +4 −3',
      { timeout: 15000 }
    );

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
    // Task 94's row actions below push the badge through another git-status poll tick
    // (task 74, every 30s); this test waits one out.
    test.setTimeout(120000);
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
    // Task 94: Stage/Reject stay off the staged view, but Ask about this and Open in
    // Editor read every hunk regardless of scope — this is the one chunk's whole bar.
    await expect(chunks.locator('button')).toHaveCount(2);
    const stagedChunk = chunks.first();
    await expect(stagedChunk.locator('[data-testid="diff-hunk-ask"]')).toBeVisible();
    await expect(stagedChunk.locator('[data-testid="diff-hunk-open"]')).toBeVisible();

    await stagedChunk.locator('[data-testid="diff-hunk-ask"]').click();
    const chatInput = goosePage.locator('[data-testid="chat-input"]');
    await expect(chatInput).toHaveValue(/hunks\.md:2-2[\s\S]*L2/);

    await stagedChunk.locator('[data-testid="diff-hunk-open"]').click();
    await expect(
      goosePage.locator('[data-testid="workspace-editor-file"][data-line="2"]')
    ).toBeVisible({ timeout: 15000 });
    // Open in Editor docks the Editor full, taking the diff pane's slot; the pane itself
    // stays mounted (selection and all), so bringing its tab back just shows it again.
    await openPane(goosePage, 'diff');

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

    // Task 94: a row's own Stage file finishes what the chunk buttons above left
    // unstaged — the whole L9 hunk — so hunks.md leaves the unstaged list entirely.
    await row.hover();
    await goosePage.locator('[data-testid="diff-row-stage"][data-path="hunks.md"]').click();
    await expect(row).toHaveCount(0);
    expect(git(scratch, ['diff', '--', 'hunks.md'])).toBe('');
    expect(git(scratch, ['diff', '--cached', '--', 'hunks.md'])).toContain('+L2');
    expect(git(scratch, ['diff', '--cached', '--', 'hunks.md'])).toContain('+L9');

    // The badge (task 94) reflects the tree at the app's own launch until the next
    // git-status poll (task 74); staging hunks.md's row above leaves only notes.md
    // unstaged, so the next tick should read it alone.
    await expect(goosePage.locator('[data-testid="workspace-tab-badge-diff"]')).toHaveText(
      '1 · +2 −1',
      { timeout: 35000 }
    );

    // Discard file on notes.md (dirty since beforeAll, untouched until now): it leaves
    // the list, a toast carries Undo, and Undo brings the row and its edit back.
    const notesRow = goosePage.locator('[data-testid="diff-file"][data-path="notes.md"]');
    await notesRow.hover();
    await goosePage.locator('[data-testid="diff-row-discard"][data-path="notes.md"]').click();
    await expect(notesRow).toHaveCount(0);
    const undoButton = goosePage.locator('[data-testid="diff-discard-undo"]');
    await expect(undoButton).toBeVisible();
    expect(readFileSync(join(scratch, 'notes.md'), 'utf8')).toBe('one\ntwo\nthree\n');

    await undoButton.click();
    await expect(notesRow).toBeVisible();
    expect(readFileSync(join(scratch, 'notes.md'), 'utf8')).toBe(
      'one\ntwo, changed\nthree\nfour\n'
    );

    // Keyboard: Tab from the row's own button reaches Stage file, then Discard file.
    await notesRow.focus();
    await goosePage.keyboard.press('Tab');
    await expect(
      goosePage.locator('[data-testid="diff-row-stage"][data-path="notes.md"]')
    ).toBeFocused();
    await goosePage.keyboard.press('Tab');
    await expect(
      goosePage.locator('[data-testid="diff-row-discard"][data-path="notes.md"]')
    ).toBeFocused();
  });
});
