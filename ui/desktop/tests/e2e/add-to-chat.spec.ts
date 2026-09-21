import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect, emptyDock, openPane } from './fixtures';

// Task 83: every pane's "Add to chat" lands in the chat input through task 76's one door,
// as a fenced block under a header the model can locate — and nothing is sent. The panes'
// own buttons belong to their tasks (85 Files, 86 Terminal, 87 Browser, 94 Changes); the
// Editor and Markdown buttons are this task's.
const git = (cwd: string, args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t83', '-c', 'user.email=t83@test', ...args], {
    cwd,
    stdio: 'pipe',
  }).toString();

const previousDir = process.env.GOOSE_TEST_DIR;
let scratch = '';

test.describe('add to chat', () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-add-to-chat-'));
    writeFileSync(join(scratch, 'notes.md'), 'one\ntwo\nthree\n');
    writeFileSync(join(scratch, 'doc.md'), '# Doc\n\nA sentence to quote here.\n');
    git(scratch, ['init', '-q']);
    git(scratch, ['add', '.']);
    git(scratch, ['commit', '-q', '-m', 'base']);
    writeFileSync(join(scratch, 'notes.md'), 'one\ntwo\nthree\nfour\n');
    process.env.GOOSE_TEST_DIR = scratch;
  });

  test.afterAll(() => {
    if (previousDir === undefined) delete process.env.GOOSE_TEST_DIR;
    else process.env.GOOSE_TEST_DIR = previousDir;
    rmSync(scratch, { recursive: true, force: true });
  });

  test('every pane quotes into the input through one door, and nothing is sent', async ({
    goosePage,
  }) => {
    test.setTimeout(120000);
    await expect(goosePage.locator('[data-testid="workspace-shell"]')).toBeVisible({
      timeout: 30000,
    });
    const chatInput = goosePage.locator('[data-testid="chat-input"]');
    await expect(chatInput).toHaveCount(1, { timeout: 15000 });
    await emptyDock(goosePage);

    // Step 1: Editor — lines 1–2 of notes.md.
    await openPane(goosePage, 'files');
    const files = goosePage.locator('[data-testid="files-pane"]');
    await expect(files).not.toHaveAttribute('data-state', 'loading', { timeout: 15000 });
    await files.locator('[data-testid="files-row"][data-path$="/notes.md"]').click();
    const editor = goosePage.locator('[data-testid="editor-pane"]');
    await expect(editor).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    const editorAdd = editor.locator('[data-testid="editor-add-to-chat"]');
    await expect(editorAdd).toBeDisabled();
    await expect(editorAdd).toHaveAttribute('title', 'Select text first');
    await editor.locator('.cm-content').click();
    await goosePage.keyboard.press('Meta+ArrowUp');
    await goosePage.keyboard.press('Shift+ArrowDown');
    await goosePage.keyboard.press('Shift+ArrowDown');
    await expect(editorAdd).toBeEnabled();
    await editorAdd.click();
    await expect(chatInput).toHaveValue(/```notes\.md:1-2\none\ntwo\n```/);

    // Step 2: Markdown — a selected sentence of doc.md, header without lines. The Editor took
    // the column when notes.md opened, so Files comes back to the front first.
    await openPane(goosePage, 'files');
    await files.locator('[data-testid="files-row"][data-path$="/doc.md"]').click();
    await openPane(goosePage, 'markdown');
    const markdown = goosePage.locator('[data-testid="markdown-pane"]');
    await expect(markdown.locator('[data-testid="workspace-markdown-file"]')).toContainText(
      'doc.md'
    );
    const markdownAdd = markdown.locator('[data-testid="markdown-add-to-chat"]');
    await expect(markdownAdd).toBeDisabled();
    await markdown
      .locator('[data-testid="markdown-view"] p', { hasText: 'A sentence to quote here.' })
      .click({ clickCount: 3 });
    await expect(markdownAdd).toBeEnabled();
    await markdownAdd.click();
    await expect(chatInput).toHaveValue(/```doc\.md\nA sentence to quote here\.\n```/);

    // Step 3: Terminal — a selected output line, through task 86's pill.
    await openPane(goosePage, 'terminal');
    const terminal = goosePage.locator('[data-testid="terminal-pane"]');
    await expect(terminal.locator('[data-testid="terminal-status"]')).toHaveCount(0, {
      timeout: 15000,
    });
    await terminal.locator('.xterm').click();
    await goosePage.keyboard.type('echo hello-t83\n');
    const outputRow = terminal.locator('.xterm-rows > div', { hasText: /^\s*hello-t83\s*$/ });
    await expect(outputRow).toHaveCount(1, { timeout: 30000 });
    // xterm's screen layer sits over its rows, so the triple-click goes to the row's spot.
    const rowBox = (await outputRow.boundingBox())!;
    await goosePage.mouse.click(rowBox.x + 20, rowBox.y + rowBox.height / 2, { clickCount: 3 });
    await terminal.locator('[data-testid="terminal-send"]').click();
    await expect(chatInput).toHaveValue(/```terminal\n[^`]*hello-t83[^`]*```/);

    // Step 4: Files — the whole file from the row's menu, header relative to the project.
    await openPane(goosePage, 'files');
    await files
      .locator('[data-testid="files-row"][data-path$="/notes.md"]')
      .click({ button: 'right' });
    await goosePage.locator('[data-testid="files-menu-add-to-chat"]').click();
    await expect(chatInput).toHaveValue(/```notes\.md\none\ntwo\nthree\nfour\n\n?```/);

    // Step 5: Changes — the hunk's Ask about this, header with the hunk's lines.
    await openPane(goosePage, 'diff');
    const diff = goosePage.locator('[data-testid="diff-pane"]');
    await expect(diff).toHaveAttribute('data-state', 'ready', { timeout: 15000 });
    await diff.locator('[data-testid="diff-file"][data-path="notes.md"]').click();
    const chunk = goosePage
      .locator('[data-testid="diff-view"][data-view="unified"] .cm-deletedChunk')
      .first();
    await chunk.locator('[data-testid="diff-hunk-ask"]').click();
    await expect(chatInput).toHaveValue(/```notes\.md:4-4\nfour\n\n?```/);

    // Step 6 (Browser ▸ Share ▸ Screenshot) is not walked: it captures a loaded page, and
    // the walk has no server to load — the browser-pane walk covers the Share row itself.

    // Step 7: nothing was sent — every block is still in the input, and Esc keeps it.
    await goosePage.keyboard.press('Escape');
    const value = await chatInput.inputValue();
    for (const header of ['notes.md:1-2', 'doc.md', 'terminal', 'notes.md', 'notes.md:4-4']) {
      expect(value).toContain('```' + header + '\n');
    }
    expect(value).not.toContain('``````');
    await expect(goosePage.locator('[data-testid="message-container"]')).toHaveCount(0);

    await goosePage.screenshot({
      path: test.info().outputPath('add-to-chat.png'),
      fullPage: true,
    });
    await emptyDock(goosePage);
  });
});
