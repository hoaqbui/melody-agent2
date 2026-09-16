import { test, expect } from './fixtures';

// PRD step 6: the Terminal tab opens a shell in the session's working directory; `pwd`
// prints it. The session starts as in workspace-shell.spec.ts, on the ambient runtime.
test.describe('terminal pane', () => {
  test('opens a shell in the session cwd', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });

    await goosePage.locator('[data-testid="workspace-mode-direct"]').click();
    const hubInput = goosePage.locator('[data-testid="chat-input"]');
    await hubInput.fill('Respond with the single word hello.');
    await hubInput.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });

    const cwd = await goosePage.evaluate(() => window.appConfig.get('GOOSE_WORKING_DIR') as string);
    expect(cwd).not.toBe('');

    await goosePage.locator('[data-testid="workspace-side-tab-terminal"]').click();
    // Wide enough that the path does not soft-wrap across rows.
    await goosePage.getByRole('button', { name: 'Open as pane' }).click();
    const pane = goosePage.locator('[data-testid="terminal-pane"]');
    await expect(pane).toBeVisible();
    await expect(pane.locator('[data-testid="terminal-status"]')).toHaveCount(0, {
      timeout: 15000,
    });

    const xterm = pane.locator('.xterm');
    await xterm.click();
    await goosePage.keyboard.type('pwd\n');

    const rows = pane.locator('.xterm-rows');
    await expect
      .poll(async () => (await rows.innerText()).replace(/\s+/g, ''), { timeout: 30000 })
      .toContain(cwd.replace(/\s+/g, ''));

    await goosePage.screenshot({
      path: test.info().outputPath('terminal-pane.png'),
      fullPage: true,
    });
  });
});
