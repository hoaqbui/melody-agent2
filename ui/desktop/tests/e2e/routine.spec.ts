import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect, setAdvancedControls } from './fixtures';

// Task 59: a session that worked becomes a routine. One prompt in a fresh chat, then
// Advanced → Session controls → Save as routine…: the sheet carries the session's name,
// its first prompt, what it ran with and its cwd; Manual + Save lands on Schedules with the
// routine listed (paused); Run now runs it and the run lands in the Runs inbox; opening the
// run shows the "Routine: <title>" chip, which links back to the schedule. The window opens
// on a scratch repo (GOOSE_TEST_DIR) so the run's cwd is the sidecar's, as runs-inbox does.
const stamp = Date.now();
const routineTitle = `t59-routine-${stamp}`;
const prompt =
  'Append the line "t59 ran" to the file notes.md in the current working directory (for example with a shell command), then reply with exactly the word done.';
let scratch = '';

const git = (cwd: string, args: string[]) =>
  execFileSync('git', ['-c', 'user.name=routine', '-c', 'user.email=routine@test', ...args], {
    cwd,
    stdio: 'pipe',
  }).toString();

test.describe('routine', () => {
  test.setTimeout(300_000);

  test.beforeAll(() => {
    scratch = process.env.GOOSE_TEST_DIR ?? mkdtempSync(join(tmpdir(), 'goose-routine-'));
    mkdirSync(scratch, { recursive: true });
    process.env.GOOSE_TEST_DIR = scratch;
    if (!existsSync(join(scratch, '.git'))) {
      writeFileSync(join(scratch, 'notes.md'), 'one\n');
      git(scratch, ['init', '-q']);
      git(scratch, ['add', 'notes.md']);
      git(scratch, ['commit', '-q', '-m', 'base']);
    }
  });

  test('saves the session as a routine, runs it, and links the run back', async ({ goosePage }) => {
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1200, height: 800 });

    // One prompt from the Hub starts the session on the default runtime.
    const input = goosePage.locator('[data-testid="chat-input"]');
    await input.fill(prompt);
    await input.press('Enter');
    await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
    const reply = goosePage.locator('[data-testid="message-container"].assistant').last();
    await expect(reply).toContainText(/done/i, { timeout: 120_000 });

    // Advanced, for the Session controls chip; Easy is handed back on the Hub at the end
    // (the rail, and so the ⋯ menu, lives on the workspace routes only).
    try {
      await setAdvancedControls(goosePage, true);
      await goosePage.locator('[data-testid="workspace-session-controls"]').click();
      const save = goosePage.locator('[data-testid="workspace-save-routine"]');
      await expect(save).not.toHaveAttribute('data-disabled', '');
      await save.click();

      const sheet = goosePage.locator('[data-testid="routine-sheet"]');
      await expect(sheet).toBeVisible();
      await expect(
        goosePage.locator('[data-testid="workspace-session-controls-menu"]')
      ).toHaveCount(0);
      const title = sheet.locator('[data-testid="routine-title"]');
      await expect(title).not.toHaveValue('');
      console.log(`prefilled title: ${await title.inputValue()}`);
      await expect(sheet.locator('[data-testid="routine-instructions"]')).toHaveValue(prompt);
      await expect(sheet.locator('[data-testid="routine-trigger"]')).toHaveValue('manual');
      await expect(sheet.locator('[data-testid="routine-cwd"]')).toContainText(scratch);
      const runsWith = sheet.locator('[data-testid="routine-runs-with"]');
      await expect(runsWith).toContainText(/extension/, { timeout: 15000 });
      console.log(`runs with: ${await runsWith.textContent()}`);
      await goosePage.screenshot({ path: test.info().outputPath('routine-sheet.png') });

      // The title is the schedule id; a stamp keeps reruns from colliding.
      await title.fill(routineTitle);
      await sheet.locator('[data-testid="routine-save"]').click();
      await expect(sheet).toHaveCount(0, { timeout: 30000 });
      await expect(goosePage).toHaveURL(/#\/schedules/);
    } catch (error) {
      await goosePage.evaluate(() => {
        window.location.hash = '#/';
      });
      await setAdvancedControls(goosePage, false);
      throw error;
    }

    const card = goosePage.locator('h3', { hasText: routineTitle }).first();
    await expect(card).toBeVisible({ timeout: 30000 });
    await expect(goosePage.getByText('Paused').first()).toBeVisible();
    await goosePage.screenshot({
      path: test.info().outputPath('routine-listed.png'),
      fullPage: true,
    });

    await card.click();
    await goosePage.getByRole('button', { name: 'Run Schedule Now' }).click();
    // run_schedule_now is held open for the whole run; the toast lands when it returns.
    await expect(goosePage.getByText('Run completed')).toBeVisible({ timeout: 240_000 });
    await goosePage.getByRole('button', { name: 'Back' }).click();

    const inbox = goosePage.locator('[data-testid="runs-inbox"]');
    await expect(inbox).toHaveAttribute('data-state', 'ready', { timeout: 30000 });
    const row = goosePage.locator('[data-testid="runs-inbox-row"]', { hasText: routineTitle });
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-outcome', 'done');
    await goosePage.screenshot({
      path: test.info().outputPath('routine-run.png'),
      fullPage: true,
    });

    // The run's session names its routine and links back to the schedule.
    await row.locator('[data-testid="runs-inbox-open"]').click();
    await expect(goosePage).toHaveURL(/#\/pair\?resumeSessionId=/);
    const chip = goosePage.locator('[data-testid="workspace-routine"]');
    await expect(chip).toHaveText(`Routine: ${routineTitle}`, { timeout: 30000 });
    await expect(chip).toBeEnabled({ timeout: 30000 });
    await goosePage.screenshot({ path: test.info().outputPath('routine-chip.png') });
    await chip.click();
    await expect(goosePage).toHaveURL(/#\/schedules/);
    await expect(goosePage.getByText(`Viewing Schedule ID: ${routineTitle}`)).toBeVisible({
      timeout: 30000,
    });

    await goosePage.evaluate(() => {
      window.location.hash = '#/';
    });
    await setAdvancedControls(goosePage, false);
  });
});
