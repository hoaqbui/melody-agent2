import { execFileSync } from 'child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'fs';
import { homedir, tmpdir } from 'os';
import { delimiter, join } from 'path';
import { test, expect, openPane } from './fixtures';

const realHome = homedir();
const previousEnv = {
  HOME: process.env.HOME,
  HERMIT_STATE_DIR: process.env.HERMIT_STATE_DIR,
  PATH: process.env.PATH,
};
let scratch = '';
let runtimesBin = '';

const fakeRuntimes = {
  claude: `#!/bin/sh
echo '{"loggedIn": true, "email": "user@example.com"}'
exit 0
`,
  codex: `#!/bin/sh
echo "Not signed in"
exit 1
`,
  cursor: `#!/bin/sh
echo "Not installed"
exit 127
`,
  agy: `#!/bin/sh
echo 'gpt-4-turbo'
exit 0
`,
};

test.describe('runtimes gate', () => {
  test.beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), 'goose-runtimes-gate-'));
    mkdirSync(join(scratch, 'Library'), { recursive: true });
    process.env.HERMIT_STATE_DIR ??=
      process.platform === 'darwin'
        ? join(realHome, 'Library', 'Caches', 'hermit')
        : join(process.env.XDG_CACHE_HOME ?? join(realHome, '.cache'), 'hermit');
    process.env.HOME = scratch;

    runtimesBin = mkdtempSync(join(tmpdir(), 'goose-runtimes-'));
    for (const [name, script] of Object.entries(fakeRuntimes)) {
      const binPath = join(runtimesBin, name === 'claude' ? 'claude' : name === 'codex' ? 'codex' : name === 'cursor' ? 'cursor-agent' : 'agy');
      writeFileSync(binPath, script);
      chmodSync(binPath, 0o755);
    }
    process.env.PATH = `${runtimesBin}${delimiter}${previousEnv.PATH ?? ''}`;
  });

  test.afterAll(() => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(scratch, { recursive: true, force: true });
    rmSync(runtimesBin, { recursive: true, force: true });
  });

  test('shows runtimes gate on launch when no seat is ready', async ({ goosePage }) => {
    await expect(goosePage.locator('[data-testid="runtimes-gate"]')).toBeVisible({
      timeout: 30000,
    });
    expect(await goosePage.locator('[data-testid="runtimes-gate"]').getAttribute('data-state')).toBe('ready');
  });

  test('displays four seat rows with correct states', async ({ goosePage }) => {
    const gate = goosePage.locator('[data-testid="runtimes-gate"]');
    await expect(gate).toBeVisible();

    const claudeRow = goosePage.locator('[data-testid="runtimes-gate-row-claude"]');
    await expect(claudeRow).toHaveAttribute('data-seat-state', 'ready');

    const codexRow = goosePage.locator('[data-testid="runtimes-gate-row-codex"]');
    await expect(codexRow).toHaveAttribute('data-seat-state', 'signed-out');

    const cursorRow = goosePage.locator('[data-testid="runtimes-gate-row-cursor"]');
    await expect(cursorRow).toHaveAttribute('data-seat-state', 'missing');

    const agyRow = goosePage.locator('[data-testid="runtimes-gate-row-agy"]');
    await expect(agyRow).toHaveAttribute('data-seat-state', 'ready');
  });

  test('opens Terminal pane with sign-in command on Sign in button', async ({ goosePage }) => {
    const codexSignIn = goosePage.locator('[data-testid="runtimes-gate-sign-in-codex"]');
    await expect(codexSignIn).toBeVisible();
    await codexSignIn.click();

    const terminal = goosePage.locator('[data-testid="terminal-pane"]');
    await expect(terminal).toBeVisible({ timeout: 10000 });
  });

  test('Recheck button re-probes runtimes', async ({ goosePage }) => {
    const recheck = goosePage.locator('[data-testid="runtimes-gate-recheck"]');
    await expect(recheck).toBeVisible();
    const initialState = await goosePage.locator('[data-testid="runtimes-gate"]').getAttribute('data-state');
    await recheck.click();
    await goosePage.locator('[data-testid="runtimes-gate"]').waitFor({state: 'attached'});
    const newState = await goosePage.locator('[data-testid="runtimes-gate"]').getAttribute('data-state');
    expect(newState).toBe(initialState);
  });

  test('Done button navigates to Hub', async ({ goosePage }) => {
    const done = goosePage.locator('[data-testid="runtimes-gate-done"]');
    await expect(done).toBeVisible();
    await done.click();
    await expect(goosePage.locator('[data-testid="hub"]')).toBeVisible({ timeout: 10000 });
  });

  test('Settings › App opens runtimes gate via Runtimes… button', async ({ goosePage }) => {
    await goosePage.locator('[data-testid="workspace-pane-button-files"]').click();
    await openPane(goosePage, 'files');

    const settingsButton = goosePage.locator('button:has-text("⋯")').first();
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    const advancedControls = goosePage.locator('[data-testid="workspace-advanced-controls"]');
    await advancedControls.check();

    const settingsLink = goosePage.locator('button:has-text("Settings")');
    await expect(settingsLink).toBeVisible();
  });
});
