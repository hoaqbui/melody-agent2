import { test, expect, setAdvancedControls } from './fixtures';

// Task 58: a fresh app starts as a chat — the lever in the chat card, no Runtime chip.
// Hard starts a session on claude-code with the orchestrator recipe (when the cwd has the
// role and the runtime is installed; both branch as workspace-shell.spec.ts does). ⋯ →
// Advanced shows the Runtime chip and the Session controls popover, the lever gone; back
// to Easy the lever sits on the stop the session matches — Hard, or Custom when the
// adapter lists no Opus model (the stop's model is a match over the adapter's list).
test.describe('easy mode', () => {
  test('starts on the lever, moves to Hard, shows Advanced, comes back', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1200, height: 800 });
    // A walk that died mid-run may have left Advanced on; Easy is the default.
    await setAdvancedControls(goosePage, false);

    const lever = goosePage.locator('[data-testid="workspace-lever"]');
    const slider = lever.locator('[role="slider"]');
    await expect(lever).toBeVisible();
    await expect(goosePage.locator('[data-testid="workspace-runtime"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="workspace-mode"]')).toHaveCount(0);
    await expect(lever).toHaveAttribute('data-stop', 'easy');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Easy');
    await expect(lever.locator('[data-testid="workspace-lever-label"]')).toHaveText('Easy');
    // The tooltip names the triple in one line.
    await expect(slider).toHaveAttribute('title', /^Claude · .+ · Direct$/);
    await goosePage.screenshot({ path: test.info().outputPath('easy-lever.png') });

    // A first prompt typed straight into the Hub, lever untouched, must start on Easy's
    // triple rather than the config default (found driving the phone build, 2026-09-16).
    const hubInput = goosePage.locator('[data-testid="chat-input"]');
    await hubInput.fill('Respond with the single word hello.');
    await hubInput.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    await expect(lever).toHaveAttribute('data-stop', 'easy', { timeout: 15000 });
    await expect(slider).toHaveAttribute('title', /^Claude · sonnet.* · Direct$/);
    await expect(
      goosePage.locator('[data-testid="message-container"].assistant').last()
    ).toContainText(/hello/i, { timeout: 45000 });

    const hard = lever.locator('[data-testid="workspace-lever-stop-hard"]');
    const canOrchestrate = (await shell.getAttribute('data-orchestrator-role')) === 'present';
    const hardReachable = canOrchestrate && (await hard.getAttribute('data-blocked')) === null;
    if (!canOrchestrate) {
      await expect(hard).toHaveAttribute('data-blocked', 'true');
      await expect(hard).toHaveAttribute('title', 'no orchestrator role in this project');
    }

    let opusListed = false;
    try {
      if (hardReachable) {
        await hard.click();
        await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
        await expect(lever).toHaveAttribute('data-stop', /hard|custom/, { timeout: 15000 });
      }

      await setAdvancedControls(goosePage, true);
      await expect(lever).toHaveCount(0);
      const runtime = goosePage.locator('[data-testid="workspace-runtime"]');
      await expect(runtime).toBeVisible();
      await expect(goosePage.locator('[data-testid="workspace-mode"]')).toBeVisible();
      if (hardReachable) {
        await expect(runtime).toHaveAttribute('data-value', 'claude-code');
        await expect(goosePage.locator('[data-testid="workspace-mode"]')).toHaveAttribute(
          'title',
          /· Orchestrate$/
        );
      }

      // Every control the session has, rendered from the server's list.
      await goosePage.locator('[data-testid="workspace-session-controls"]').click();
      const menu = goosePage.locator('[data-testid="workspace-session-controls-menu"]');
      await expect(menu).toBeVisible();
      if (hardReachable) {
        for (const id of ['provider', 'mode', 'model', 'thinking_effort']) {
          await expect(menu.locator(`[data-testid="workspace-config-${id}"]`)).toBeVisible();
        }
        await expect(
          menu.locator('[data-testid="workspace-config-provider-claude-code"]')
        ).toHaveAttribute('aria-checked', 'true');
        await expect(menu.locator('[data-testid="workspace-role"]')).toHaveText('orchestrator');
        const models = await menu
          .locator('[data-testid^="workspace-config-model-"]')
          .evaluateAll((rows) => rows.map((row) => row.textContent ?? ''));
        // Hard takes the adapter's sole model when none matches (the claude CLI lists no
        // models), so any non-empty list lands on Hard; the run says what it saw.
        opusListed = models.length > 0;
        console.log(`claude-code models: ${models.join(', ')} → ${opusListed ? 'hard' : 'custom'}`);
      }
      await expect(menu.locator('[data-testid="workspace-cwd"]')).toBeVisible();
      await expect(menu.locator('[data-testid="workspace-open-files"]')).toBeVisible();
      await expect(menu.locator('[data-testid="workspace-extensions"]')).toHaveText(
        /\d+ extensions? enabled/
      );
      // Task 59: enabled once a session is open; Easy's ⋯ menu carries it too.
      await expect(menu.locator('[data-testid="workspace-save-routine"]')).toBeVisible();
      if (hardReachable) {
        await expect(menu.locator('[data-testid="workspace-save-routine"]')).not.toHaveAttribute(
          'data-disabled',
          ''
        );
      }
      await goosePage.screenshot({ path: test.info().outputPath('advanced-controls.png') });
      await goosePage.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
    } finally {
      await setAdvancedControls(goosePage, false);
    }

    await expect(lever).toBeVisible();
    await expect(goosePage.locator('[data-testid="workspace-runtime"]')).toHaveCount(0);
    if (hardReachable) {
      await expect(lever).toHaveAttribute('data-stop', opusListed ? 'hard' : 'custom');
    }
    await goosePage.screenshot({ path: test.info().outputPath('easy-lever-session.png') });

    // Medium is Direct, so from an Orchestrate session it starts a new one on claude-acp;
    // the stop lands when the adapter lists an Opus model, else the lever reads Custom.
    const before = goosePage.url();
    await lever.locator('[data-testid="workspace-lever-stop-medium"]').click();
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    await expect.poll(() => goosePage.url()).not.toBe(before);
    await expect(lever).toHaveAttribute('data-stop', /medium|custom/, { timeout: 15000 });
    console.log(
      `medium → ${await lever.getAttribute('data-stop')} (${await slider.getAttribute('title')})`
    );
    await expect(slider).toHaveAttribute('title', /^Claude · .+ · Direct$|^Custom$/);

    // Easy is Direct too, so it switches the open session in place: the "→ Easy from here"
    // divider, then the stop's model; a Sonnet-less list reads Custom.
    await lever.locator('[data-testid="workspace-lever-stop-easy"]').click();
    await expect(goosePage.locator('text=→ Easy from here')).toBeVisible({ timeout: 30000 });
    await expect(lever).toHaveAttribute('data-stop', /easy|custom/, { timeout: 15000 });
    console.log(
      `easy → ${await lever.getAttribute('data-stop')} (${await slider.getAttribute('title')})`
    );

    // Arrow keys move it (DESIGN.md §Accessibility): one step right is Medium, in place.
    await slider.focus();
    await goosePage.keyboard.press('ArrowRight');
    await expect(goosePage.locator('text=→ Medium from here')).toBeVisible({ timeout: 30000 });
    await expect(lever).toHaveAttribute('data-stop', /medium|custom/, { timeout: 15000 });
  });
});
