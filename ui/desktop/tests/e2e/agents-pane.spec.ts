import {
  test,
  expect,
  emptyDock,
  openPane,
  setAdvancedControls,
  provisionRoleRepo,
} from './fixtures';

// Task 28 (PRD step 10): the Agents pane under ⋯ is empty before any delegation; the lever's
// Hard starts an Orchestrate session on claude-code (when the fixture's cwd has the role and
// the runtime is installed — both branch as easy-mode.spec.ts does), a prompt that delegates
// once puts one row in the tree while the delegate call runs (`running`, then `done`), with
// the child's runtime and the task title; a click opens the child's transcript in place,
// read-only, and Back returns to the tree. The delegate needs `GOOSE_TEST_DIR` to carry
// `.agents/agents/spike-echo.md` beside the orchestrator role.
test.describe('agents pane', { tag: '@seat' }, () => {
  let restoreRoles: () => void = () => {};
  test.beforeAll(() => {
    restoreRoles = provisionRoleRepo();
  });
  test.afterAll(() => restoreRoles());

  test('shows a delegated worker running then done, and opens its transcript', async ({
    goosePage,
  }) => {
    test.setTimeout(240000);
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1400, height: 900 });
    await emptyDock(goosePage);
    await setAdvancedControls(goosePage, false);

    await openPane(goosePage, 'agents');
    const pane = goosePage.locator('[data-testid="agents-pane"]');
    await expect(pane).toBeVisible();
    await expect(pane).toHaveAttribute('data-state', 'empty');
    await expect(pane.locator('[data-testid="agents-empty"]')).toContainText(
      'No delegated work yet'
    );
    await expect(
      goosePage.locator('[data-testid="workspace-pane-button-agents"]')
    ).toHaveAccessibleName(/Agents/);

    const lever = goosePage.locator('[data-testid="workspace-lever"]');
    const hard = lever.locator('[data-testid="workspace-lever-stop-hard"]');
    const canOrchestrate = (await shell.getAttribute('data-orchestrator-role')) === 'present';
    const hardReachable = canOrchestrate && (await hard.getAttribute('data-blocked')) === null;
    if (!hardReachable) {
      console.log('no orchestrator role or runtime here: the empty state is the walk');
      await goosePage.screenshot({ path: test.info().outputPath('agents-empty.png') });
      await emptyDock(goosePage);
      return;
    }

    try {
      await hard.click();
      await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
      await expect(lever).toHaveAttribute('data-stop', /hard|custom/, { timeout: 15000 });

      const chatInput = goosePage.locator('[data-testid="chat-input"]');
      // The Hub's textarea lingers a beat after the session opens (task 30 guards the same).
      await expect(chatInput).toHaveCount(1, { timeout: 15000 });
      await chatInput.fill(
        "Delegate exactly once to the spike-echo role with instructions 'say hello', then reply DONE"
      );
      await chatInput.press('Enter');

      // The row appears when the delegate call starts, not when it ends.
      const row = pane.locator('[data-testid="agents-row"]');
      await expect(row).toHaveCount(1, { timeout: 120000 });
      await expect(row).toHaveAttribute('data-status', 'running');
      await expect(pane).toHaveAttribute('data-state', 'running');
      // The role file in GOOSE_TEST_DIR decides the seat; both Claude seats are valid here.
      await expect(row).toHaveAttribute('data-provider', /^claude-(acp|code)$/);
      await expect(row.locator('[data-testid="agents-row-role"]')).toHaveText('spike-echo');
      await expect(row.locator('[data-testid="agents-row-runtime"]')).toContainText(
        /claude-(acp|code)/
      );
      const title = (
        await row.locator('[data-testid="agents-row-open"] > span').first().innerText()
      ).trim();
      console.log(`row title: ${title}`);
      expect(title).toMatch(/hello/i);
      const childId = (await row.getAttribute('data-session-id')) ?? '';
      expect(childId).not.toBe('');
      // A running child cannot be opened yet; the row says why in place.
      const open = row.locator('[data-testid="agents-row-open"]');
      await expect(open).toHaveAttribute('aria-disabled', 'true');
      await expect(open).toHaveAttribute('title', 'Opens once the worker is done');
      await goosePage.screenshot({ path: test.info().outputPath('agents-running.png') });

      await expect(row).toHaveAttribute('data-status', 'done', { timeout: 120000 });
      await expect(pane).toHaveAttribute('data-state', 'ready');
      await expect(row.locator('[data-testid="agents-row-error"]')).toHaveCount(0);
      await expect(open).toHaveAttribute('aria-disabled', 'false');
      await goosePage.screenshot({ path: test.info().outputPath('agents-done.png') });

      await open.click();
      const transcript = pane.locator('[data-testid="agents-transcript"]');
      await expect(transcript).toBeVisible({ timeout: 30000 });
      await expect(transcript).toHaveAttribute('data-session-id', childId);
      await expect(pane).toHaveAttribute('data-state', 'ready');
      await expect(transcript.locator('[data-testid="message-container"]').first()).toBeVisible();
      await expect(
        transcript.locator('[data-testid="message-container"].assistant').last()
      ).toContainText(/hello/i);
      // Read-only: no input in the pane, no Edit on the worker's prompt.
      await expect(pane.locator('[data-testid="chat-input"]')).toHaveCount(0);
      await expect(pane.getByRole('button', { name: /Edit message/ })).toHaveCount(0);
      await expect(pane).toContainText('Read-only');
      await goosePage.screenshot({ path: test.info().outputPath('agents-transcript.png') });

      await pane.locator('[data-testid="agents-back"]').click();
      await expect(transcript).toHaveCount(0);
      await expect(row).toHaveCount(1);
      await expect(row).toHaveAttribute('data-status', 'done');

      // The parent session is still usable: its own reply lands.
      await expect(
        goosePage.locator('[data-testid="message-container"].assistant').last()
      ).toContainText(/DONE/, { timeout: 120000 });
    } finally {
      await setAdvancedControls(goosePage, false);
      await emptyDock(goosePage);
    }
  });
});
