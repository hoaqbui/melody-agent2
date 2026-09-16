import { test, expect, emptyDock, openPane, setAdvancedControls } from './fixtures';

// PRD step 6: the Terminal tab opens a shell in the session's working directory; `pwd`
// prints it. The session starts as in workspace-shell.spec.ts, on the ambient runtime.
test.describe('terminal pane', () => {
  test('opens a shell in the session cwd', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });

    // The Mode chip is Advanced's (task 58); Easy comes back once the session is open.
    await setAdvancedControls(goosePage, true);
    try {
      await goosePage.locator('[data-testid="workspace-mode"]').click();
      await goosePage.locator('[data-testid="workspace-mode-direct"]').click();
    } finally {
      await setAdvancedControls(goosePage, false);
    }
    const hubInput = goosePage.locator('[data-testid="chat-input"]');
    await hubInput.fill('Respond with the single word hello.');
    await hubInput.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });

    const cwd = await goosePage.evaluate(() => window.appConfig.get('GOOSE_WORKING_DIR') as string);
    expect(cwd).not.toBe('');

    await emptyDock(goosePage);
    await openPane(goosePage, 'terminal');
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
    // The dock persists per project in the app's own storage: leave the user's empty.
    await emptyDock(goosePage);
  });
});
