import { execFileSync } from 'child_process';
import { test, expect, emptyDock, openPane, provisionRoleRepo } from './fixtures';

// Task 30: an Orchestrate session (lever Hard) delegates once to the `spike-echo` role in
// GOOSE_TEST_DIR's `.agents/agents/` (its body: "Begin every reply with the token
// spike-ok-30"); the Artifact pane from the ⋯ launcher lists that child — one row, role ·
// runtime · model in the header — with the worker's last message rendered, Copy puts it on
// the clipboard and Open transcript navigates the chat to the child session. Needs the
// orchestrator role in the cwd and the claude runtimes installed, as easy-mode does.
test.describe('artifact pane', { tag: '@seat' }, () => {
  let restoreRoles: () => void = () => {};
  test.beforeAll(() => {
    restoreRoles = provisionRoleRepo();
  });
  test.afterAll(() => restoreRoles());

  test.setTimeout(300_000);

  test('lists the delegated child, shows its handoff, copies it, opens its transcript', async ({
    goosePage,
  }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1400, height: 900 });
    await emptyDock(goosePage);

    // Before any session: the pane opens from ⋯ and reads empty.
    await openPane(goosePage, 'artifact');
    const pane = goosePage.locator('[data-testid="artifact-pane"]');
    await expect(pane).toBeVisible();
    await expect(pane).toHaveAttribute('data-state', 'empty');
    await expect(pane.locator('[data-testid="artifact-empty"]')).toHaveText(
      'No artifacts yet — delegate work and the results land here'
    );
    await emptyDock(goosePage);

    const hard = goosePage.locator('[data-testid="workspace-lever-stop-hard"]');
    await expect(shell).toHaveAttribute('data-orchestrator-role', 'present');
    await expect(hard).not.toHaveAttribute('data-blocked', 'true');
    await hard.click();
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    const parentId = /resumeSessionId=([^&]+)/.exec(goosePage.url())?.[1];
    console.log(`parent session ${parentId}`);

    // The Hub's input and the new session's overlap for a moment after the route change.
    const input = goosePage.locator('[data-testid="chat-input"]');
    await expect(input).toHaveCount(1, { timeout: 15000 });
    await input.fill(
      "Delegate exactly once to the spike-echo role with instructions 'say hello', then reply DONE"
    );
    await input.press('Enter');
    const reply = goosePage.locator('[data-testid="message-container"].assistant').last();
    await expect(reply).toContainText(/DONE/, { timeout: 180_000 });

    await openPane(goosePage, 'artifact');
    await expect(pane).toBeVisible();
    const rows = pane.locator('[data-testid^="artifact-row-"]');
    await expect(rows).toHaveCount(1, { timeout: 30000 });
    await expect(rows.first()).toHaveAttribute('aria-selected', 'true');
    const childId = (await rows.first().getAttribute('data-testid'))!.replace('artifact-row-', '');
    console.log(`child session ${childId}`);
    expect(childId).not.toBe(parentId);

    await expect(pane).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    const header = pane.locator('[data-testid="artifact-header"]');
    await expect(header).toContainText('spike-echo');
    console.log(`header: ${await header.innerText()}`);
    const body = pane.locator('[data-testid="artifact-body"]');
    const text = await body.innerText();
    console.log(`artifact body: ${text}`);
    // The pane is still fading in (DESIGN.md Into Rule) when the body is first readable.
    await goosePage.screenshot({
      path: test.info().outputPath('artifact-pane.png'),
      animations: 'disabled',
    });
    expect(text).toContain('spike-ok-30');

    // Copy: the markdown source lands on the clipboard.
    const copy = pane.locator('[data-testid="artifact-copy"]');
    await copy.click();
    await expect(copy).toHaveText('Copied');
    const clipboard =
      process.platform === 'darwin'
        ? execFileSync('pbpaste').toString()
        : await goosePage.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('spike-ok-30');
    await expect(copy).toHaveText('Copy', { timeout: 5000 });

    // Open transcript: the chat moves to the child session.
    await pane.locator('[data-testid="artifact-open-transcript"]').click();
    await expect(goosePage).toHaveURL(new RegExp(`resumeSessionId=${childId}`), {
      timeout: 30000,
    });
    await expect(
      goosePage.locator('[data-testid="message-container"].assistant').last()
    ).toContainText('spike-ok-30', { timeout: 30000 });
    await goosePage.screenshot({ path: test.info().outputPath('artifact-transcript.png') });
    // A child session carries its role as a recipe, so upstream's recipe-trust dialog opens
    // over it on first open; the walk declines it (not this pane's to decide).
    const cancel = goosePage.getByRole('button', { name: 'Cancel' });
    if (await cancel.isVisible().catch(() => false)) await cancel.click();

    // The dock persists per project in the app's own storage: leave the user's empty.
    await emptyDock(goosePage);
  });
});
