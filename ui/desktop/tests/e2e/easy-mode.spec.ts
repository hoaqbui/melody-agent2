import { test, expect, setAdvancedControls, trustRecipeIfAsked } from './fixtures';

// Task 58 (lever retired task 224): a fresh app starts as a chat — Easy's row is folder,
// attach and send, no Runtime chip and no difficulty pick. The first prompt typed into the
// Hub starts the session on the orchestrator setup: claude-code with the orchestrator recipe
// when the cwd has the role and the runtime is installed, else direct Opus on claude-acp (both
// branch as workspace-shell.spec.ts does). ⋯ → Advanced shows the Runtime chip, the model chip
// and the Session controls popover, unaffected by the lever's retirement.
test.describe('easy mode', { tag: '@seat' }, () => {
  test('starts on the orchestrator setup and shows Advanced', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1200, height: 800 });
    // A walk that died mid-run may have left Advanced on; Easy is the default.
    await setAdvancedControls(goosePage, false);
    const canOrchestrate = (await shell.getAttribute('data-orchestrator-role')) === 'present';

    // The lever is gone (task 224): no Runtime/Mode chips, no model chip, no difficulty pick.
    await expect(goosePage.locator('[data-testid="workspace-runtime"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="workspace-mode"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="model-chip"]')).toHaveCount(0);
    await expect(goosePage.getByText(/\/ \d+k$/)).toHaveCount(0);
    // Easy's row: folder, attach, the send disc in its usage ring — no worktree, routine or
    // Session controls (task 140).
    await expect(goosePage.locator('[data-testid="usage-ring"]')).toHaveCount(1);
    await expect(goosePage.locator('[data-testid="usage-ring"] .send-disc')).toHaveCount(1);
    await expect(goosePage.locator('[data-testid="chat-attach"]')).toHaveCount(1);
    await expect(goosePage.locator('[data-testid="chat-folder"]')).toHaveCount(1);
    await expect(goosePage.locator('[data-testid="workspace-worktree"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="workspace-routine"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="workspace-session-controls"]')).toHaveCount(0);
    await expect(goosePage.locator('[data-testid="chat-dictate"]')).toHaveCount(0);
    await expect(goosePage.getByRole('button', { name: /live voice/i })).toHaveCount(0);
    await goosePage.screenshot({ path: test.info().outputPath('easy-no-lever.png') });

    // A first prompt typed straight into the Hub starts the session on the orchestrator
    // setup with no pick (task 224; found driving the phone build, 2026-09-16, still applies
    // to the default the lever used to set explicitly).
    const hubInput = goosePage.locator('[data-testid="chat-input"]');
    await hubInput.fill('Respond with the single word hello.');
    await hubInput.press('Enter');
    await trustRecipeIfAsked(goosePage);
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    await expect(
      goosePage.locator('[data-testid="message-container"].assistant').last()
    ).toContainText(/hello/i, { timeout: 45000 });

    let opusListed = false;
    try {
      await setAdvancedControls(goosePage, true);
      const runtime = goosePage.locator('[data-testid="workspace-runtime"]');
      await expect(runtime).toBeVisible();
      await expect(goosePage.locator('[data-testid="workspace-mode"]')).toBeVisible();
      // Advanced adds the model chip (task 123); the ring stays on send.
      await expect(goosePage.locator('[data-testid="model-chip"]')).toHaveCount(1);
      await expect(goosePage.locator('[data-testid="usage-ring"]')).toHaveCount(1);
      // Task 141: seat · mode · worktree · folder · branch read in one sans face; the model id
      // alone is mono (PRD journey 3); Session controls sits with the icon-only controls, after
      // the folder; no glyph twice — the cube is the model's.
      await expect(goosePage.locator('[data-testid="workspace-worktree"]')).toHaveCount(1);
      const faces = await goosePage.evaluate(() => {
        const face = (selector: string) =>
          getComputedStyle(document.querySelector(selector)!).fontFamily;
        return {
          seat: face('[data-testid="workspace-runtime"]'),
          folder: face('[data-testid="chat-folder"]'),
          model: face('[data-testid="model-chip"] span'),
          controlsAfterFolder: Boolean(
            document
              .querySelector('[data-testid="chat-folder"]')!
              .compareDocumentPosition(
                document.querySelector('[data-testid="workspace-session-controls"]')!
              ) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
        };
      });
      expect(faces.folder).toBe(faces.seat);
      expect(faces.folder).not.toMatch(/mono/i);
      expect(faces.model).toMatch(/mono/i);
      expect(faces.controlsAfterFolder).toBe(true);
      const seatGlyph = await goosePage
        .locator('[data-testid="workspace-runtime"] svg path')
        .first()
        .getAttribute('d');
      const modelGlyph = await goosePage
        .locator('[data-testid="model-chip"] svg path')
        .first()
        .getAttribute('d');
      expect(seatGlyph).not.toBe(modelGlyph);
      if (canOrchestrate) {
        await expect(runtime).toHaveAttribute('data-value', 'claude-code');
        await expect(goosePage.locator('[data-testid="workspace-mode"]')).toHaveAttribute(
          'title',
          /· Orchestrate$/
        );
      } else {
        await expect(runtime).toHaveAttribute('data-value', 'claude-acp');
        await expect(goosePage.locator('[data-testid="workspace-mode"]')).toHaveAttribute(
          'title',
          /· Direct$/
        );
      }

      // Every control the session has, rendered from the server's list.
      await goosePage.locator('[data-testid="workspace-session-controls"]').click();
      const menu = goosePage.locator('[data-testid="workspace-session-controls-menu"]');
      await expect(menu).toBeVisible();
      for (const id of ['provider', 'mode', 'model']) {
        await expect(menu.locator(`[data-testid="workspace-config-${id}"]`)).toBeVisible();
      }
      if (canOrchestrate) {
        // thinking_effort is claude-code's own option; unverified whether claude-acp
        // publishes one, so this check stays on the orchestrate branch.
        await expect(
          menu.locator('[data-testid="workspace-config-thinking_effort"]')
        ).toBeVisible();
        await expect(
          menu.locator('[data-testid="workspace-config-provider-claude-code"]')
        ).toHaveAttribute('aria-checked', 'true');
        await expect(menu.locator('[data-testid="workspace-role"]')).toHaveText('orchestrator');
        const models = await menu
          .locator('[data-testid^="workspace-config-model-"]')
          .evaluateAll((rows) => rows.map((row) => row.textContent ?? ''));
        // Hard takes the adapter's sole model when none matches (the claude CLI lists no
        // models), so any non-empty list means the model landed as Opus; the run says what it
        // saw.
        opusListed = models.length > 0;
        console.log(`claude-code models: ${models.join(', ')} → opus listed: ${opusListed}`);
      } else {
        await expect(
          menu.locator('[data-testid="workspace-config-provider-claude-acp"]')
        ).toHaveAttribute('aria-checked', 'true');
      }
      await expect(menu.locator('[data-testid="workspace-cwd"]')).toBeVisible();
      await expect(menu.locator('[data-testid="workspace-open-files"]')).toBeVisible();
      await expect(menu.locator('[data-testid="workspace-extensions"]')).toHaveText(
        /\d+ extensions? enabled/
      );
      // Task 59: enabled once a session is open; Easy's ⋯ menu carries it too.
      await expect(menu.locator('[data-testid="workspace-save-routine"]')).toBeVisible();
      await expect(menu.locator('[data-testid="workspace-save-routine"]')).not.toHaveAttribute(
        'data-disabled',
        ''
      );
      await goosePage.screenshot({ path: test.info().outputPath('advanced-controls.png') });
      await goosePage.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
    } finally {
      await setAdvancedControls(goosePage, false);
    }

    // Back in Easy: still no Runtime chip — the session it started on is fixed for its
    // lifetime (task 224 gives Easy no mid-session switch; Advanced's chips do that).
    await expect(goosePage.locator('[data-testid="workspace-runtime"]')).toHaveCount(0);
    console.log(
      `resolved on ${canOrchestrate ? 'claude-code orchestrate' : 'claude-acp direct'}, opus listed: ${opusListed}`
    );
    await goosePage.screenshot({ path: test.info().outputPath('easy-no-lever-session.png') });
  });
});
