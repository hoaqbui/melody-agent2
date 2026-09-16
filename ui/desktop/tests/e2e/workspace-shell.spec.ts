import { test, expect, setAdvancedControls } from './fixtures';

// PRD steps 2-3: pick a Runtime and a Mode from the chips in the chat card's bottom row
// (task 60: no header), send a prompt, see a reply. The Runtime is the installed adapter
// the ambient config defaults to. Orchestrate needs the session cwd's own
// `.agents/agents/orchestrator.md`; when the fixture's cwd has one the Mode pick starts
// the session, otherwise the walk stays Direct and the Hub starts it. The chips are
// Advanced's (task 58), so the walk switches there first and hands Easy back at the end.
test.describe('workspace shell', () => {
  test('picks a runtime and a mode, then gets a reply', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await expect(goosePage.locator('[data-testid="workspace-header"]')).toHaveCount(0);
    await setAdvancedControls(goosePage, true);
    try {
      // Each chip is a popover of rows; the chip carries the current id.
      const runtime = goosePage.locator('[data-testid="workspace-runtime"]');
      await expect(runtime).toBeEnabled();
      const pickedRuntime = (await runtime.getAttribute('data-value')) ?? '';
      expect(pickedRuntime).not.toBe('');
      await runtime.click();
      const runtimeRow = goosePage.locator(
        `[data-testid="workspace-runtime-option-${pickedRuntime}"]`
      );
      await expect(runtimeRow).toHaveAttribute('aria-checked', 'true');
      await runtimeRow.click();
      await expect(runtimeRow).toHaveCount(0);

      const canOrchestrate = (await shell.getAttribute('data-orchestrator-role')) === 'present';
      const mode = goosePage.locator('[data-testid="workspace-mode"]');
      await mode.click();
      if (canOrchestrate) {
        await goosePage.locator('[data-testid="workspace-mode-orchestrate"]').click();
      } else {
        await expect(goosePage.locator('[data-testid="workspace-mode-note"]')).toHaveText(
          'no orchestrator role in this project'
        );
        await goosePage.locator('[data-testid="workspace-mode-direct"]').click();
        const hubInput = goosePage.locator('[data-testid="chat-input"]');
        await hubInput.fill('Respond with the single word hello.');
        await hubInput.press('Enter');
      }

      await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
      // The session's runtime · mode is the chips' tooltip (task 40).
      await expect(mode).toHaveAttribute('title', canOrchestrate ? /· Orchestrate$/ : /· Direct$/, {
        timeout: 15000,
      });
      await expect(runtime).toHaveAttribute('data-value', pickedRuntime);
      await expect(goosePage.locator('[data-testid="workspace-pane-menu"]')).toBeVisible();

      if (canOrchestrate) {
        const chatInput = goosePage.locator('[data-testid="chat-input"]');
        await chatInput.fill('Respond with the single word hello.');
        await chatInput.press('Enter');
      }

      const reply = goosePage.locator('[data-testid="message-container"].assistant').last();
      await expect(reply).toContainText(/hello/i, { timeout: 45000 });

      await goosePage.screenshot({
        path: test.info().outputPath('workspace-shell.png'),
        fullPage: true,
      });
    } finally {
      await setAdvancedControls(goosePage, false);
    }
  });
});
