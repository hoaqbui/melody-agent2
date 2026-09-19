import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { test, expect } from './fixtures';

// Task 91: the runtimes gate. The sidecar probes four fixed argv arrays on PATH
// (`claude auth status --json`, `codex login status`, `cursor-agent status`, `agy models`), so a
// scratch bin dir ahead of PATH fakes each seat — every seat, since the real ones sit later on
// PATH; a shim exiting 127 is "not installed". The app is launched by the fixture with
// process.env, so PATH is set in beforeAll. Two setups: one seat Ready (no redirect, the gate
// reached by its route), then no seat Ready (the gate on launch).
const previousPath = process.env.PATH;
let runtimesBin = '';

const seats = (scripts: Record<string, string>) => {
  runtimesBin = mkdtempSync(join(tmpdir(), 'goose-runtimes-'));
  mkdirSync(runtimesBin, { recursive: true });
  for (const [bin, script] of Object.entries(scripts)) {
    const path = join(runtimesBin, bin);
    writeFileSync(path, `#!/bin/sh\n${script}\n`);
    chmodSync(path, 0o755);
  }
  process.env.PATH = `${runtimesBin}${delimiter}${previousPath ?? ''}`;
};

const restore = () => {
  if (previousPath === undefined) delete process.env.PATH;
  else process.env.PATH = previousPath;
  if (runtimesBin) rmSync(runtimesBin, { recursive: true, force: true });
};

test.describe('runtimes gate', () => {
  test.describe('one seat Ready', () => {
    // claude Ready · codex installed, signed out · cursor-agent absent · agy Ready
    test.beforeAll(() =>
      seats({
        claude: `echo '{"loggedIn": true, "email": "user@example.com"}'`,
        codex: `echo "Not logged in"; exit 1`,
        'cursor-agent': `exit 127`,
        agy: `echo 'gpt-4-turbo'`,
      })
    );
    test.afterAll(restore);

    test('does not redirect on launch; the gate shows four rows, signs in, rechecks, and returns to the Hub', async ({
      goosePage,
    }) => {
      test.setTimeout(120_000);
      const shell = goosePage.locator('[data-testid="workspace-shell"]');
      await expect(shell).toBeVisible({ timeout: 30000 });
      await expect(goosePage.locator('[data-testid="runtimes-gate"]')).toHaveCount(0);

      await goosePage.evaluate(() => {
        window.location.hash = '#/runtimes';
      });
      const gate = goosePage.locator('[data-testid="runtimes-gate"]');
      await expect(gate).toBeVisible({ timeout: 15000 });
      await expect(goosePage.locator('[data-testid="runtimes-gate-row-claude"]')).toHaveAttribute(
        'data-seat-state',
        'ready',
        { timeout: 20000 }
      );
      await expect(goosePage.locator('[data-testid="runtimes-gate-row-codex"]')).toHaveAttribute(
        'data-seat-state',
        'signed-out'
      );
      await expect(goosePage.locator('[data-testid="runtimes-gate-row-cursor"]')).toHaveAttribute(
        'data-seat-state',
        'missing'
      );
      await expect(goosePage.locator('[data-testid="runtimes-gate-row-agy"]')).toHaveAttribute(
        'data-seat-state',
        'ready'
      );

      // Recheck re-probes: the same four states come back
      await goosePage.locator('[data-testid="runtimes-gate-recheck"]').click();
      await expect(goosePage.locator('[data-testid="runtimes-gate-row-codex"]')).toHaveAttribute(
        'data-seat-state',
        'signed-out',
        { timeout: 20000 }
      );

      // Sign in on Codex opens the Terminal pane with the login command typed, not run
      await goosePage.locator('[data-testid="runtimes-gate-sign-in-codex"]').click();
      await expect(goosePage.locator('[data-testid="terminal-pane"]')).toBeVisible({
        timeout: 20000,
      });

      // Back to the gate, Done → the Hub
      await goosePage.evaluate(() => {
        window.location.hash = '#/runtimes';
      });
      await expect(gate).toBeVisible({ timeout: 15000 });
      await goosePage.locator('[data-testid="runtimes-gate-done"]').click();
      await expect(gate).toHaveCount(0);
      await expect(shell).toBeVisible({ timeout: 15000 });
    });
  });

  test.describe('no seat Ready', () => {
    test.beforeAll(() =>
      seats({
        claude: `echo '{"loggedIn": false}'`,
        codex: `echo "Not logged in"; exit 1`,
        'cursor-agent': `exit 127`,
        agy: `echo "sign in first"; exit 1`,
      })
    );
    test.afterAll(restore);

    test('shows the gate on launch', async ({ goosePage }) => {
      const gate = goosePage.locator('[data-testid="runtimes-gate"]');
      await expect(gate).toBeVisible({ timeout: 45000 });
      await expect(goosePage.locator('[data-testid="runtimes-gate-row-claude"]')).toHaveAttribute(
        'data-seat-state',
        'signed-out',
        { timeout: 20000 }
      );
      await expect(goosePage.locator('[data-testid="runtimes-gate-row-cursor"]')).toHaveAttribute(
        'data-seat-state',
        'missing'
      );
    });
  });
});
