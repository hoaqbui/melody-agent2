import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect, setAdvancedControls } from './fixtures';

// Task 89: the card and the Session controls note for Approve mode. Runs on `claude-acp`
// (a live seat), so the session picks it up by opening on a scratch repo with no session
// yet — the Runtime chip defaults to Claude. A file-write tool call is the one every seat
// can be asked to make and that carries a diff (task 77): probe.txt, HELLO.
const previousDir = process.env.GOOSE_TEST_DIR;
let scratch = '';

const git = (cwd: string, args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=approve-mode', '-c', 'user.email=approve-mode@test', ...args],
    { cwd, stdio: 'pipe' }
  ).toString();

test.describe('approve mode', () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-approve-mode-'));
    git(scratch, ['init', '-q']);
    // The fixture opens the window on GOOSE_TEST_DIR (see fixtures.ts); the app's own config
    // and providers stay ambient.
    process.env.GOOSE_TEST_DIR = scratch;
  });

  test.afterAll(() => {
    if (previousDir === undefined) delete process.env.GOOSE_TEST_DIR;
    else process.env.GOOSE_TEST_DIR = previousDir;
    rmSync(scratch, { recursive: true, force: true });
  });

  test('the note names what the seat does; the card shows the diff by the adapter tool name; Deny and Allow once', async ({
    goosePage,
  }) => {
    test.setTimeout(180_000);
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await setAdvancedControls(goosePage, true);

    // The Mode radios are the server's config options, so a session must exist before
    // Session controls lists them (task 109): one word from the hub starts it.
    const hubInput = goosePage.locator('[data-testid="chat-input"]');
    await hubInput.fill('Respond with the single word hello.');
    await hubInput.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    await expect(
      goosePage.locator('[data-testid="message-container"].assistant').last()
    ).toContainText(/hello/i, { timeout: 45000 });

    // Session controls → Mode → Approve; the note names what Claude does with it.
    await goosePage.locator('[data-testid="workspace-session-controls"]').click();
    const menu = goosePage.locator('[data-testid="workspace-session-controls-menu"]');
    await expect(menu).toBeVisible();
    await menu.locator('[data-testid="workspace-config-mode-approve"]').click();
    await expect(menu.locator('[data-testid="workspace-config-mode-note"]')).toHaveText(
      'Claude asks for risky actions',
      { timeout: 15000 }
    );
    await goosePage.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    const chatInput = goosePage.locator('[data-testid="chat-input"]');
    const card = goosePage.locator('[data-testid="tool-confirmation"]').last();
    const diffRow = card.locator('[data-testid="tool-confirmation-diff"]');

    // Deny once: the card collapses, the file never lands.
    await chatInput.fill('create probe.txt containing HELLO using your file-write tool');
    await chatInput.press('Enter');
    await expect(card).toBeVisible({ timeout: 45000 });
    // The adapter's own title, passed through: Claude's names the absolute path.
    await expect(card).toContainText(/Write \S*probe\.txt/);
    await expect(diffRow).toContainText('+HELLO');
    await card.locator('[data-testid="tool-approval-deny"]').click();
    await expect(card).toContainText(/Write \S*probe\.txt · Denied once/);
    expect(
      execFileSync('git', ['-C', scratch, 'status', '--porcelain', 'probe.txt']).toString().trim()
    ).toBe('');

    // Allow once, same prompt: the file lands. The second card is the one for a new tool
    // call — the first call's card can come back with live buttons when the next turn
    // starts (task 140), so the newest card is not simply the last one.
    const firstCallId = await card.getAttribute('data-tool-call-id');
    await chatInput.fill('create probe.txt containing HELLO using your file-write tool');
    await chatInput.press('Enter');
    const secondCard = goosePage.locator(
      `[data-testid="tool-confirmation"]:not([data-tool-call-id="${firstCallId}"])`
    );
    await expect(secondCard).toBeVisible({ timeout: 45000 });
    await secondCard.locator('[data-testid="tool-approval-allow-once"]').click();
    await expect(secondCard).toContainText(/Write \S*probe\.txt · Allowed once/);
    await expect
      .poll(() => execFileSync('git', ['-C', scratch, 'status', '--porcelain']).toString(), {
        timeout: 15000,
      })
      .toContain('probe.txt');

    // The seat switch is a config change, refused mid-turn: wait for the Stop disc to give
    // way to Send.
    await expect(goosePage.getByRole('button', { name: 'Stop' })).toHaveCount(0, {
      timeout: 60000,
    });

    // Runtime → agy under Approve: the seat refuses (it cannot ask) and the toast says so;
    // under Auto the switch lands and the Mode row names the limit. The seat has to be
    // installed on this machine; its row reads "agy — Install" otherwise and the leg is
    // recorded as skipped rather than failed.
    await goosePage.locator('[data-testid="workspace-runtime"]').click();
    const agyOption = goosePage.locator('[data-testid="workspace-runtime-option-agy"]');
    await expect(agyOption).toBeVisible();
    const agyInstalled = (await agyOption.getAttribute('data-disabled')) === null;
    if (agyInstalled) {
      await agyOption.click();
      await expect(goosePage.getByText(/agy .*cannot ask/)).toBeVisible({ timeout: 15000 });
      await expect(goosePage.locator('[data-testid="workspace-runtime"]')).toContainText('Claude');

      await goosePage.locator('[data-testid="workspace-session-controls"]').click();
      await expect(menu).toBeVisible();
      await menu.locator('[data-testid="workspace-config-mode-auto"]').click();
      await expect(menu.locator('[data-testid="workspace-config-mode-auto"]')).toHaveAttribute(
        'aria-checked',
        'true',
        { timeout: 15000 }
      );
      await goosePage.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);

      await goosePage.locator('[data-testid="workspace-runtime"]').click();
      await agyOption.click();
      await expect(goosePage.locator('[data-testid="workspace-runtime"]')).toContainText('agy', {
        timeout: 15000,
      });
      await goosePage.locator('[data-testid="workspace-session-controls"]').click();
      await expect(menu).toBeVisible();
      await expect(menu.locator('[data-testid="workspace-config-mode-note"]')).toHaveText(
        'agy cannot ask — Approve unavailable',
        { timeout: 15000 }
      );
      await expect(menu.locator('[data-testid="workspace-config-mode-auto"]')).toHaveAttribute(
        'aria-checked',
        'true'
      );
      await goosePage.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
    } else {
      test.info().annotations.push({ type: 'skipped-leg', description: 'agy not installed' });
      await goosePage.keyboard.press('Escape');
    }

    // Back on Claude with Approve, the three buttons reachable by Tab, fired by Enter.
    if (agyInstalled) {
      await goosePage.locator('[data-testid="workspace-runtime"]').click();
      await goosePage.locator('[data-testid="workspace-runtime-option-claude-acp"]').click();
      await goosePage.locator('[data-testid="workspace-session-controls"]').click();
      await expect(menu).toBeVisible();
      await menu.locator('[data-testid="workspace-config-mode-approve"]').click();
      await expect(menu.locator('[data-testid="workspace-config-mode-approve"]')).toHaveAttribute(
        'aria-checked',
        'true',
        { timeout: 15000 }
      );
      await goosePage.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
    }
    const secondCallId = await secondCard.getAttribute('data-tool-call-id');
    await chatInput.fill('create probe2.txt containing HELLO using your file-write tool');
    await chatInput.press('Enter');
    const thirdCard = goosePage.locator(
      `[data-testid="tool-confirmation"]:not([data-tool-call-id="${firstCallId}"]):not([data-tool-call-id="${secondCallId}"])`
    );
    await expect(thirdCard).toBeVisible({ timeout: 45000 });
    await thirdCard.locator('[data-testid="tool-approval-allow-once"]').focus();
    await goosePage.keyboard.press('Tab');
    await goosePage.keyboard.press('Tab');
    await expect(thirdCard.locator('[data-testid="tool-approval-deny"]')).toBeFocused();
    await goosePage.keyboard.press('Enter');
    await expect(thirdCard).toContainText('Denied once');
  });
});
