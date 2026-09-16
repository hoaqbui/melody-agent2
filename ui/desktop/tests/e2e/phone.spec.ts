import { test, expect, type Page } from '@playwright/test';

// PRD step 13 at 390 × 844 (the `phone` project): the web build shows the chat first behind
// a tab rail; Files is the cwd's listing; a file opens the Editor; Terminal shows the key bar
// and `pwd` prints the cwd. Runs like web-build.spec.ts, against a sidecar serving dist-web/
// and proxying /acp to a goose serve, both started out of band; WEB_BUILD_URL carries the
// sidecar's `?key=` (task 61). Screenshots land under PHONE_SHOTS_DIR when it is set.
const WEB_BUILD_URL = process.env.WEB_BUILD_URL ?? 'http://127.0.0.1:3285';
const SHOTS_DIR = process.env.PHONE_SHOTS_DIR;

// The arriving body grows out of its tab (DESIGN.md §Motion); the picture waits for it.
const shot = async (page: Page, name: string, shown: string) => {
  await page
    .locator(`[data-testid="workspace-pane-${shown}"]`)
    .evaluate((body) => Promise.all(body.getAnimations().map((animation) => animation.finished)));
  await page.screenshot({
    path: SHOTS_DIR ? `${SHOTS_DIR}/${name}.png` : test.info().outputPath(`${name}.png`),
  });
};

test('phone: chat first, Files, a file in the Editor, Terminal with the key bar', async ({
  page,
}) => {
  await page.goto(WEB_BUILD_URL);

  const shell = page.locator('[data-testid="workspace-shell"]');
  await expect(shell).toHaveAttribute('data-mode', 'phone');
  const rail = page.locator('[data-testid="workspace-tab-rail"]');
  await expect(rail).toBeVisible();
  await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="workspace-tab-chat"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  // Upstream folds the sidebar under 700 px; it eases shut into the toggle.
  await expect(page.locator('[data-testid="workspace-column-sessions"]').locator('..')).toHaveCSS(
    'width',
    '0px'
  );
  // No split: the desktop's dock and floating rail are not on screen.
  await expect(page.locator('[data-testid="workspace-column-work"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="workspace-pane-menu"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await shot(page, 'phone-chat', 'chat');

  const cwd = await page.evaluate(() => window.appConfig.get('GOOSE_WORKING_DIR') as string);
  expect(cwd).not.toBe('');

  // Files: the cwd's listing, one level at a time on the phone.
  await page.locator('[data-testid="workspace-tab-files"]').tap();
  const files = page.locator('[data-testid="files-pane"]');
  await expect(files).toBeVisible();
  await expect(page.locator('[data-testid="chat-input"]')).toBeHidden();
  await expect(files).not.toHaveAttribute('data-state', 'loading', { timeout: 15000 });
  await expect(files).not.toHaveAttribute('data-state', 'error');
  await expect(page.locator('[data-testid="files-root"]')).toHaveText(cwd);
  const fileRow = page.locator('[data-testid="files-row"][data-type="file"]').first();
  await expect(fileRow).toBeVisible();
  const filePath = (await fileRow.getAttribute('data-path')) ?? '';
  await shot(page, 'phone-files', 'files');

  // A file → the Editor takes the screen with it.
  await fileRow.tap();
  const editor = page.locator('[data-testid="workspace-pane-editor"]');
  await expect(editor).toBeVisible();
  await expect(editor.locator('[data-testid="workspace-editor-file"]')).toContainText(filePath);
  await expect(page.locator('[data-testid="workspace-tab-editor"]')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(files).toBeHidden();

  // Terminal: the key bar (task 15) shows at phone width; the shell is in the cwd.
  await page.locator('[data-testid="workspace-tab-terminal"]').tap();
  const terminal = page.locator('[data-testid="terminal-pane"]');
  await expect(terminal).toBeVisible();
  await expect(terminal.locator('[data-testid="terminal-key-bar"]')).toBeVisible();
  await expect(terminal.locator('[data-testid="terminal-status"]')).toHaveCount(0, {
    timeout: 15000,
  });
  await terminal.locator('.xterm').tap();
  await page.keyboard.type('pwd\n');
  const rows = terminal.locator('.xterm-rows');
  await expect
    .poll(async () => (await rows.innerText()).replace(/\s+/g, ''), { timeout: 30000 })
    .toContain(cwd.replace(/\s+/g, ''));
  await shot(page, 'phone-terminal', 'terminal');

  // Back to the chat: the transcript column is where it was.
  await page.locator('[data-testid="workspace-tab-chat"]').tap();
  await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
  await expect(terminal).toBeHidden();
});
