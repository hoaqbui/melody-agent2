import { test, expect, emptyDock, setAdvancedControls, provisionRoleRepo, trustRecipeIfAsked } from './fixtures';

// Task 29 (PRD step 11): no strip before any delegation; a new Easy session starts on the
// orchestrator setup by default when the folder has the role (task 224 retires the lever),
// so the first prompt alone starts Orchestrate — a prompt that delegates once to the
// `researcher` role lights Research — active while the delegate call runs, done once it
// returns — and a click on Research opens the Artifact pane on that child. The researcher
// role rolls its own runtime (agy, then Cursor), so the walk needs those installed beside
// the orchestrator role in GOOSE_TEST_DIR, as agents-pane and artifact-pane need claude-code.
test.describe('rpi strip', { tag: '@seat' }, () => {
  let restoreRoles: () => void = () => {};
  test.beforeAll(() => {
    restoreRoles = provisionRoleRepo();
  });
  test.afterAll(() => restoreRoles());

  test.setTimeout(300_000);

  test('lights Research active then done, and opens the Artifact pane on its child', async ({
    goosePage,
  }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1400, height: 900 });
    await emptyDock(goosePage);
    // The lever is Easy's; the face is handed back at the end.
    const advanced = (await shell.getAttribute('data-ui')) === 'advanced';
    await setAdvancedControls(goosePage, false);

    const strip = goosePage.locator('[data-testid="rpi-strip"]');
    await expect(strip).toHaveCount(0);

    try {
      // The lever is gone (task 224): the folder has the role, so the first prompt typed
      // into the Hub starts Orchestrate on its own — no click needed.
      await expect(shell).toHaveAttribute('data-orchestrator-role', 'present');
      const input = goosePage.locator('[data-testid="chat-input"]');
      await expect(input).toHaveCount(1, { timeout: 15000 });
      await input.fill(
        "Delegate exactly once to the researcher role with instructions 'In one sentence, what does notes.md contain? Do not run anything.', then reply DONE"
      );
      await input.press('Enter');
      await trustRecipeIfAsked(goosePage);
      await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
      // A Direct session, or an Orchestrate session before its first delegate, shows nothing.
      await expect(strip).toHaveCount(0);

      // The strip appears when the delegate call starts, Research pulsing and not clickable.
      const research = strip.locator('[data-testid="rpi-phase-research"]');
      await expect(research).toHaveAttribute('data-status', 'active', { timeout: 120_000 });
      await expect(strip).toHaveAttribute('data-state', 'loading');
      await expect(research).toHaveAttribute('aria-disabled', 'true');
      await expect(research).toHaveAttribute('title', /Running — Opens once the worker is done/);
      for (const phase of ['plan', 'implement', 'review']) {
        await expect(strip.locator(`[data-testid="rpi-phase-${phase}"]`)).toHaveAttribute(
          'data-status',
          'dim'
        );
      }
      await expect(strip.locator('[data-testid="rpi-phase-research-runs"]')).toHaveCount(0);
      await goosePage.screenshot({ path: test.info().outputPath('rpi-strip-active.png') });

      await expect(research).toHaveAttribute('data-status', 'done', { timeout: 120_000 });
      await expect(strip).toHaveAttribute('data-state', 'ready');
      await expect(research).toHaveAttribute('aria-disabled', 'false');
      await expect(research).toHaveAttribute('data-runs', '1');
      const childId = (await research.getAttribute('data-artifact')) ?? '';
      console.log(`research child ${childId}`);
      expect(childId).not.toBe('');
      await goosePage.screenshot({ path: test.info().outputPath('rpi-strip-done.png') });

      await research.click();
      const pane = goosePage.locator('[data-testid="artifact-pane"]');
      await expect(pane).toBeVisible({ timeout: 30000 });
      await expect(pane.locator(`[data-testid="artifact-row-${childId}"]`)).toHaveAttribute(
        'aria-selected',
        'true'
      );
      await expect(pane).toHaveAttribute('data-state', /ready|partial/, { timeout: 30000 });
      console.log(
        `artifact header: ${await pane.locator('[data-testid="artifact-header"]').innerText()}`
      );
      await goosePage.screenshot({
        path: test.info().outputPath('rpi-strip-artifact.png'),
        animations: 'disabled',
      });

      // The parent session is still usable: its own reply lands.
      await expect(
        goosePage.locator('[data-testid="message-container"].assistant').last()
      ).toContainText(/DONE/, { timeout: 120_000 });
    } finally {
      await setAdvancedControls(goosePage, advanced);
      await emptyDock(goosePage);
    }
  });
});
