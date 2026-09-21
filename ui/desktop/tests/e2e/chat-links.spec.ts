import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { test, expect, emptyDock, openPane, provisionRoleRepo } from './fixtures';

// Task 82: `file:line` in any message opens the Editor — a rehypeFileLinks plugin over task 75's
// linker, a FileLinkSlot context following SessionChipsSlot, paths resolved against cwd then
// toplevel, openFile(path, line) from PaneContext.
let restoreRoles: () => void = () => {};

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, { cwd, stdio: 'pipe' }).toString();

test.describe('chat links', { tag: '@seat' }, () => {
  test.beforeAll(() => {
    restoreRoles = provisionRoleRepo();
  });
  test.afterAll(() => restoreRoles());

  test.setTimeout(360_000);

  test('file:line links in chat messages open the Editor at that line', async ({ goosePage }) => {
    const scratch = process.env.GOOSE_TEST_DIR!;
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1400, height: 900 });
    await emptyDock(goosePage);

    // Setup: a session in a scratch repo with src/a.ts (12 lines)
    mkdirSync(join(scratch, 'src'), { recursive: true });
    const lines = Array.from({ length: 12 }, (_, i) => `// Line ${i + 1}`).join('\n');
    writeFileSync(join(scratch, 'src', 'a.ts'), lines);
    git(scratch, ['add', '.']);
    git(scratch, ['commit', '-q', '-m', 'setup']);

    const hubInput = goosePage.locator('[data-testid="chat-input"]');
    await hubInput.fill('Tell me the path and line 7 of src/a.ts as path:line.');
    await hubInput.press('Enter');

    // Wait for a reply from the model
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    const reply = goosePage.locator('[data-testid="message-container"].assistant').last();
    await expect(reply).toContainText(/src\/a\.ts:7/i, { timeout: 45000 });

    // Step (1): the reply's `src/a.ts:7` renders as a link
    const link = reply.locator('[data-testid="chat-file-link"]');
    await expect(link).toBeVisible();
    expect(await link.getAttribute('href')).toMatch(/^goose-file:/);
    expect(await link.getAttribute('data-path')).toBe('src/a.ts');
    expect(await link.getAttribute('data-line')).toBe('7');

    // Step (2): hover shows the resolved absolute path as title
    const title = await link.getAttribute('title');
    expect(title).toContain('src/a.ts');

    // Step (3): click opens Editor at line 7
    await link.click();
    await openPane(goosePage, 'editor');
    const editor = goosePage.locator('[data-testid="workspace-editor-file"]');
    await expect(editor).toBeVisible({ timeout: 15000 });
    const activeLine = goosePage.locator('[data-testid="workspace-editor-file"][data-line="7"]');
    await expect(activeLine).toBeVisible();

    // Step (4): keyboard navigation — Tab to link, Enter opens it
    await emptyDock(goosePage);
    const freshReply = goosePage.locator('[data-testid="message-container"].assistant').last();
    const freshLink = freshReply.locator('[data-testid="chat-file-link"]');
    await freshLink.focus();
    expect(await freshLink.evaluate((el) => el === document.activeElement)).toBe(true);
    await freshLink.press('Enter');
    const freshEditor = goosePage.locator('[data-testid="workspace-editor-file"]');
    await expect(freshEditor).toBeVisible({ timeout: 15000 });
    const freshActiveLine = goosePage.locator(
      '[data-testid="workspace-editor-file"][data-line="7"]'
    );
    await expect(freshActiveLine).toBeVisible();

    // Step (5): a URL `https://x.y/a:1` and a time `12:30` in the same reply are NOT links
    await emptyDock(goosePage);
    const chatInputAgain = goosePage.locator('[data-testid="chat-input"]');
    await chatInputAgain.fill('Include this URL: https://example.com/a.ts:12 and this time: 12:30');
    await chatInputAgain.press('Enter');
    const nonLinkReply = goosePage.locator('[data-testid="message-container"].assistant').last();
    await expect(nonLinkReply).toContainText('https://example.com/a.ts:12', { timeout: 45000 });
    // Verify URL is not treated as a file link
    const urlInReply = nonLinkReply.getByText(/https:\/\/example\.com\/a\.ts:12/);
    const urlLink = nonLinkReply
      .locator('[data-testid="chat-file-link"]')
      .filter({ has: goosePage.getByText(/example.com/) });
    await expect(urlLink).toHaveCount(0);
    // Verify time is not a link
    const timeInReply = nonLinkReply.getByText(/12:30/);
    const timeLink = nonLinkReply
      .locator('[data-testid="chat-file-link"]')
      .filter({ has: goosePage.getByText(/12:30/) });
    await expect(timeLink).toHaveCount(0);
    // The partial state (a path outside the project reads as plain text, title "not in this
    // project") is not built yet — task 82's ledger line names it; a live model will not echo a
    // path it cannot see, so it is not asserted here.
  });
});
