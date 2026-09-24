import type { Locator, Page } from '@playwright/test';
import {
  test,
  expect,
  emptyDock,
  openPane,
  setAdvancedControls,
  provisionRoleRepo,
  trustRecipeIfAsked,
} from './fixtures';

// Task 28 (PRD step 10): the Agents pane under ⋯ is empty before any delegation; a new Easy
// session starts on the orchestrator setup on claude-code by default when the fixture's cwd
// has the role (task 224 retires the lever), so the first prompt alone starts Orchestrate —
// a prompt that delegates once puts one row in the tree while the delegate call runs
// (`running`, then `done`), with the child's runtime and the task title; a click opens the
// child's transcript in place, read-only, and Back returns to the tree. The delegate needs
// `GOOSE_TEST_DIR` to carry `.agents/agents/spike-echo.md` beside the orchestrator role.
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

    const canOrchestrate = (await shell.getAttribute('data-orchestrator-role')) === 'present';
    if (!canOrchestrate) {
      console.log('no orchestrator role here: the empty state is the walk');
      await goosePage.screenshot({ path: test.info().outputPath('agents-empty.png') });
      await emptyDock(goosePage);
      return;
    }

    try {
      // The lever is gone (task 224): the first prompt typed into the Hub starts
      // Orchestrate on its own, no click needed.
      const chatInput = goosePage.locator('[data-testid="chat-input"]');
      await expect(chatInput).toHaveCount(1, { timeout: 15000 });
      await chatInput.fill(
        "Delegate exactly once to the spike-echo role with instructions 'say hello', then reply DONE"
      );
      await chatInput.press('Enter');
      await trustRecipeIfAsked(goosePage);
      await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });

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

  // Task 200 (plan 181, step 4): the socket drops mid-turn — here by the system-resume path —
  // and the server keeps the run. The reloaded chat shows the turn still running with Stop,
  // the parent's reply lands once (no replayed duplicate), and a Stop pressed after a second
  // reconnect reaches the server: its run ends and no turn failure is shown.
  test('reconnect during a Hard turn keeps the reply once and Stop working', async ({
    goosePage,
  }) => {
    test.setTimeout(420000);
    const shell = goosePage.locator('[data-testid="workspace-shell"]');
    await expect(shell).toBeVisible({ timeout: 30000 });
    await expect(shell).not.toHaveAttribute('data-orchestrator-role', 'loading', {
      timeout: 15000,
    });
    await goosePage.setViewportSize({ width: 1400, height: 900 });
    await emptyDock(goosePage);
    await setAdvancedControls(goosePage, false);
    test.skip(
      (await shell.getAttribute('data-orchestrator-role')) !== 'present',
      'no orchestrator role here: no Hard turn to reconnect during'
    );

    try {
      await openPane(goosePage, 'agents');
      const pane = goosePage.locator('[data-testid="agents-pane"]');
      const runningRow = pane.locator('[data-testid="agents-row"][data-status="running"]');

      const hubInput = goosePage.locator('[data-testid="chat-input"]');
      await expect(hubInput).toHaveCount(1, { timeout: 15000 });
      // The reply token is never written out in the prompt, so every copy of it in the
      // transcript is the orchestrator's; a replayed duplicate would show a second one.
      const firstPrompt =
        "Delegate exactly once to the spike-echo role with instructions 'say hello'. Write " +
        'nothing before or while delegating. When it returns, reply with only the word made ' +
        "by joining 'RECON' and 'OK' with a hyphen.";
      const replyToken = /RECON-OK/g;
      await hubInput.fill(firstPrompt);
      await hubInput.press('Enter');
      await trustRecipeIfAsked(goosePage);
      await expect(goosePage).toHaveURL(/resumeSessionId=/, { timeout: 30000 });
      const sessionId = /resumeSessionId=([^&#]+)/.exec(goosePage.url())?.[1] ?? '';
      expect(sessionId).not.toBe('');

      const chat = goosePage
        .locator(`[data-session-id="${sessionId}"]`)
        .filter({ has: goosePage.locator('[data-testid="chat-input"]') });
      const stop = chat.getByRole('button', { name: 'Stop', exact: true });
      const turnFailure = chat.locator('[data-testid="turn-failure-card"]');
      const transcript = chat.locator('[data-testid="message-container"]');
      const userMessages = chat.locator('[data-testid="message-container"].user');
      const transcriptText = async () => (await transcript.allInnerTexts()).join('\n');

      // Mid-turn: the parent's run is inside its delegate call.
      await expect(runningRow).toHaveCount(1, { timeout: 120000 });
      await logSeat(goosePage, sessionId, runningRow, 'turn 1');
      await expect(stop).toBeVisible();
      await reconnectMidTurn(goosePage);

      // The reloaded chat follows the server's run: still streaming, Stop still offered.
      await expect
        .poll(() => goosePage.evaluate(chatFollowingRunScript(sessionId)), { timeout: 30000 })
        .toBe(true);
      await expect(stop).toBeVisible();
      await goosePage.screenshot({ path: test.info().outputPath('reconnect-streaming.png') });

      await expect
        .poll(async () => (await transcriptText()).match(replyToken)?.length ?? 0, {
          timeout: 180000,
        })
        .toBeGreaterThan(0);
      await expect(stop).toHaveCount(0, { timeout: 30000 });
      expect((await transcriptText()).match(replyToken)?.length).toBe(1);
      await expect(userMessages.filter({ hasText: 'say hello' })).toHaveCount(1);
      await expect(turnFailure).toHaveCount(0);
      await goosePage.screenshot({ path: test.info().outputPath('reconnect-reply-once.png') });

      // Turn 2 can only end by a cancel inside the window below: its delegate waits 300 s.
      // A Stop that reached the server brings the run to idle within 90 s. (Claude Code
      // refuses a bare foreground `sleep`, so the wait is a Python one.)
      const chatInput = chat.locator('[data-testid="chat-input"]');
      await chatInput.fill(
        "Delegate exactly once to the spike-echo role with instructions 'use the Bash tool " +
          'with timeout 600000 to run python3 -c "import time; time.sleep(300)" and wait ' +
          "for it to finish, then say goodbye'. When it returns, reply with only the word " +
          "made by joining 'LATE' and 'BYE' with a hyphen."
      );
      await chatInput.press('Enter');
      await expect(runningRow).toHaveCount(1, { timeout: 120000 });
      const delegateStartedAt = Date.now();
      await logSeat(goosePage, sessionId, runningRow, 'turn 2');
      await reconnectMidTurn(goosePage);
      await expect
        .poll(() => goosePage.evaluate(chatFollowingRunScript(sessionId)), { timeout: 30000 })
        .toBe(true);
      // Still sleeping well after it began, so the run cannot end on its own soon.
      await goosePage.waitForTimeout(Math.max(0, 30000 - (Date.now() - delegateStartedAt)));
      await expect(runningRow).toHaveCount(1);
      await expect(stop).toBeVisible();
      const stoppedAt = Date.now();
      await stop.click();
      await expect(stop).toHaveCount(0);
      await expect
        .poll(() => goosePage.evaluate(chatRunSettledScript(sessionId)), { timeout: 90000 })
        .toBe(true);
      const settledAfterMs = Date.now() - stoppedAt;
      const sinceDelegateMs = Date.now() - delegateStartedAt;
      console.log(
        `turn 2: idle ${settledAfterMs} ms after Stop, ${sinceDelegateMs} ms after the delegate began`
      );
      expect(sinceDelegateMs).toBeLessThan(300000);
      expect(await transcriptText()).not.toMatch(/LATE-BYE/);
      await expect(turnFailure).toHaveCount(0);
      await goosePage.screenshot({ path: test.info().outputPath('reconnect-stopped.png') });
    } finally {
      await setAdvancedControls(goosePage, false);
      await emptyDock(goosePage);
    }
  });
});

// Which seat and role ran the turn, from the delegate's row and the parent's session.
async function logSeat(page: Page, sessionId: string, row: Locator, label: string) {
  const provider = await row.getAttribute('data-provider');
  const role = await row.locator('[data-testid="agents-row-role"]').innerText();
  const parent = await page.evaluate(`import('/src/acp/chatSessionStore.ts').then((m) => {
    const session = m.acpChatSessionStore.getSnapshot(${JSON.stringify(sessionId)})?.session;
    return JSON.stringify({
      provider: session?.provider_name ?? null,
      model: session?.model_config?.model_name ?? null,
      recipe: session?.recipe?.title ?? null,
    });
  })`);
  console.log(`${label}: parent ${String(parent)}; delegate role ${role} on ${provider}`);
}

// Evaluated as strings so Playwright's transform leaves the dev server's module URLs alone.
const ACP_CONNECTION_MODULE = "import('/src/acp/acpConnection.ts')";

// Drops the ACP socket the way a system resume does and waits for the new one. Recovering
// right after the call proves it reached the app's live connection, not a fresh module copy.
async function reconnectMidTurn(page: Page): Promise<void> {
  const recovering = await page.evaluate(
    `${ACP_CONNECTION_MODULE}.then((m) => { m.reconnectAcpAfterSystemResume(); return m.isAcpRecovering(); })`
  );
  expect(recovering).toBe(true);
  await expect
    .poll(() => page.evaluate(`${ACP_CONNECTION_MODULE}.then((m) => m.isAcpRecovering())`), {
      timeout: 30000,
    })
    .toBe(false);
}

function chatSnapshotScript(sessionId: string, predicate: string): string {
  return `import('/src/acp/chatSessionStore.ts').then((m) => {
    const snapshot = m.acpChatSessionStore.getSnapshot(${JSON.stringify(sessionId)});
    return Boolean(snapshot) && (${predicate});
  })`;
}

// Loaded (not replaying), streaming the server's run under the turn's own prompt attempt.
function chatFollowingRunScript(sessionId: string): string {
  return chatSnapshotScript(
    sessionId,
    "snapshot.chatState === 'streaming' && snapshot.activeRunId !== null && snapshot.activePromptAttemptId !== null"
  );
}

// Idle with no run and no Stop still waiting on the server's idle update.
function chatRunSettledScript(sessionId: string): string {
  return chatSnapshotScript(
    sessionId,
    "snapshot.chatState === 'idle' && snapshot.activeRunId === null && snapshot.activePromptAttemptId === null && snapshot.pendingCancelPromptAttemptId === null"
  );
}
