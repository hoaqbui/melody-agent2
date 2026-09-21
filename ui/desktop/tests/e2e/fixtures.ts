import { test as base, expect, Page, Browser, chromium } from '@playwright/test';
import { exec, execFileSync, spawn, ChildProcess } from 'child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

type GooseTestFixtures = {
  goosePage: Page;
};

/**
 * Test-scoped fixture that launches a fresh Electron app for EACH test.
 *
 * Isolation: ⚠️ Partial - each test gets a fresh app instance, but uses ambient user config
 * Speed: ⚠️ Slow - ~3s startup overhead per test
 *
 * This ensures each test starts with a fresh app instance, but the app uses the
 * user's existing Goose configuration (providers, models, etc.).
 *
 * Usage:
 *   import { test, expect } from './fixtures';
 *
 *   test('my test', async ({ goosePage }) => {
 *     await goosePage.waitForSelector('[data-testid="chat-input"]');
 *     // ... test code
 *   });
 */
// The debug port is the walk's own: whatever still listens on it is an Electron a previous
// run's group kill missed (forge re-parents it), and the next run would attach to that
// corpse instead of its app — and both write the same main.log (task 139a).
async function freeDebugPort(port: number): Promise<void> {
  if (process.platform === 'win32') return;
  for (let attempt = 1; attempt <= 10; attempt++) {
    let pids: string[] = [];
    try {
      const { stdout } = await execAsync(`lsof -ti tcp:${port} -sTCP:LISTEN`);
      pids = stdout.split('\n').filter(Boolean);
    } catch {
      // lsof exits 1 when nothing listens.
    }
    if (pids.length === 0) return;
    console.log(`Debug port ${port} still held by ${pids.join(', ')}; killing`);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        // Already gone.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Debug port ${port} could not be freed`);
}

// Start the electron-forge process with Playwright remote debugging enabled, detached so the
// whole group can be killed together. GOOSE_TEST_DIR opens the window on that directory
// instead of the user's most recent one (task 58). `start-gui:walk` keeps Vite's dependency
// cache — `just walk` builds the ACP client once up front — because a cold-cache launch
// reloads the renderer 4–5s in (task 139a).
async function launchApp(
  debugPort: number
): Promise<{ appProcess: ChildProcess; rendererReady: Promise<void> }> {
  const testDir = process.env.GOOSE_TEST_DIR;
  const appArgs = ['run', 'start-gui:walk', ...(testDir ? ['--', '--dir', testDir] : [])];
  const appProcess = spawn('pnpm', appArgs, {
    cwd: join(__dirname, '../..'),
    stdio: 'pipe',
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      ELECTRON_IS_DEV: '1',
      NODE_ENV: 'development',
      GOOSE_ALLOWLIST_BYPASS: 'true',
      ENABLE_PLAYWRIGHT: 'true',
      PLAYWRIGHT_DEBUG_PORT: debugPort.toString(),
      RUST_LOG: 'info',
    },
  });
  const rendererReady = new Promise<void>((resolve) => {
    appProcess.stdout?.on('data', (data) => {
      if (String(data).includes('React ready event received')) resolve();
    });
  });
  if (process.env.DEBUG_TESTS) {
    appProcess.stdout?.on('data', (data) => console.log('App stdout:', data.toString()));
    appProcess.stderr?.on('data', (data) => console.log('App stderr:', data.toString()));
  }
  console.log(`Waiting for Electron app to start on port ${debugPort}...`);
  return { appProcess, rendererReady };
}

// The app's first window, loaded and with React mounted.
async function readyPage(browser: Browser): Promise<Page> {
  const page = await firstPage(browser);
  await page.waitForLoadState('domcontentloaded');
  try {
    await page.waitForLoadState('networkidle', { timeout: 10000 });
  } catch {
    console.log('NetworkIdle timeout (likely due to MCP activity), continuing...');
  }
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    },
    { timeout: 30000 }
  );
  return page;
}

// SIGTERM the process group, then SIGKILL whatever is left; forge re-parents Electron, so
// the caller checks the debug port afterwards.
async function killApp(appProcess: ChildProcess | null): Promise<void> {
  if (!appProcess?.pid) return;
  try {
    if (process.platform === 'win32') {
      await execAsync(`taskkill /F /T /PID ${appProcess.pid}`);
      return;
    }
    try {
      process.kill(-appProcess.pid, 'SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch {
      // Already gone.
    }
    try {
      process.kill(-appProcess.pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  } catch (error) {
    if (
      error instanceof Error &&
      !('code' in error && error.code === 'ESRCH') &&
      !error.message.includes('No such process')
    ) {
      console.error('Error killing app process:', error);
    }
  }
}

// A cold `start-gui` builds goose-acp-client and the forge targets first, ~20s here. The
// connection waits for main's "React ready" line on stdout: the dev renderer's first load
// never mounts (Vite optimises and reloads it), and a Playwright session attached across
// that reload left the window closed 1.4s later, about one launch in four (task 139a; the
// close shows no IPC, navigation or crash in main's log).
async function connectToApp(debugPort: number, rendererReady: Promise<void>): Promise<Browser> {
  const maxRetries = 900;
  const retryDelay = 100;
  const endpoint = `http://127.0.0.1:${debugPort}`;
  await Promise.race([
    rendererReady,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Renderer not ready after ${(maxRetries * retryDelay) / 1000}s`)),
        maxRetries * retryDelay
      )
    ),
  ]);
  for (let attempt = 1; ; attempt++) {
    try {
      const browser = await chromium.connectOverCDP(endpoint);
      console.log(`Connected to Electron app on attempt ${attempt}`);
      return browser;
    } catch (error) {
      if (attempt === maxRetries) {
        throw new Error(`Failed to connect to Electron app on ${endpoint}`, { cause: error });
      }
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }
}

async function firstPage(browser: Browser): Promise<Page> {
  for (let attempt = 1; attempt <= 100; attempt++) {
    const page = browser.contexts().flatMap((context) => context.pages())[0];
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('No windows/pages found');
}

export const test = base.extend<GooseTestFixtures>({
  // Test-scoped fixture: launches a fresh Electron app for each test. Its own timeout: a
  // cold `start-gui` plus the attach gate can pass the 60s test budget on its own.
  goosePage: [
    async ({ browserName }, providePage, testInfo) => {
      void browserName;
      console.log(`Launching fresh Electron app for test: ${testInfo.title}`);

      let appProcess: ChildProcess | null = null;
      let browser: Browser | null = null;
      let debugPort = 0;

      try {
        // Assign a unique debug port for this test to enable parallel execution
        // Base port 9222, offset by worker index * 100 + parallel slot. Two checkouts running
        // walks at once would attach to each other's app on the same port, so the base can be
        // moved per checkout.
        const basePort = Number(process.env.PLAYWRIGHT_DEBUG_PORT_BASE ?? 9222);
        debugPort = basePort + testInfo.parallelIndex * 10;
        console.log(`Using debug port ${debugPort} for parallel test execution`);

        // The dev app closes its own window a second or two after its first paint about one
        // launch in four — no IPC, navigation or crash behind it in main's log, and the
        // process stays up windowless (task 139a). A launch whose window closes is killed and
        // started again, once.
        let page: Page | null = null;
        for (let launch = 1; launch <= 2 && !page; launch++) {
          await freeDebugPort(debugPort);
          const started = await launchApp(debugPort);
          appProcess = started.appProcess;
          try {
            browser = await connectToApp(debugPort, started.rendererReady);
            page = await readyPage(browser);
          } catch (error) {
            if (launch === 2 || !/closed|No windows/.test(String(error))) throw error;
            console.log('Window closed during launch; relaunching the app...');
            await browser?.close().catch(() => {});
            browser = null;
            await killApp(appProcess);
            appProcess = null;
          }
        }
        if (!page || !browser) {
          throw new Error('No windows/pages found');
        }

        console.log('App ready, starting test...');

        // Provide the page to the test
        await providePage(page);
      } finally {
        console.log('Cleaning up Electron app for this test...');

        // Close the CDP connection. Electron does not exit on a CDP close, so the call can
        // hang for minutes; the process group is killed right after either way.
        if (browser) {
          await Promise.race([
            browser.close().catch(console.error),
            new Promise((resolve) => setTimeout(resolve, 5000)),
          ]);
        }

        await killApp(appProcess);
        await freeDebugPort(debugPort);
        console.log('Cleaned up app process');
      }
    },
    { timeout: 150000 },
  ],
});

export { expect } from '@playwright/test';

// The Work column's tab bars (tasks 117–120): each panel's bar holds only its open panes;
// + at the bar's end lists the rest. A pane already open is clicked on its tab; a closed
// one is added through the first bar's +.
export async function openPane(page: Page, id: string): Promise<void> {
  const button = page.locator(`[data-testid="workspace-pane-button-${id}"]`);
  if ((await button.count()) > 0) {
    await button.scrollIntoViewIfNeeded();
    await button.click();
    return;
  }
  await page.locator('[data-testid="workspace-panel-add"]').click();
  await page.locator(`[data-testid="workspace-panel-add-${id}"]`).click();
  // The menu animates closed; a click on + before it is gone toggles it shut again.
  await expect(page.locator('[data-testid="workspace-panel-add-menu"]')).toHaveCount(0);
  await expect(page.locator(`[data-testid="workspace-pane-button-${id}"]`)).toHaveAttribute(
    'aria-pressed',
    'true'
  );
}

// The column is remembered per project in the app's own storage, so a walk that counts
// open tabs first closes whatever an earlier run, or the user, left open — through each
// tab's × (shown on hover, always in the DOM).
export async function emptyDock(page: Page): Promise<void> {
  const tabs = page.locator('[data-dock-tab]');
  for (;;) {
    const open = await tabs.count();
    if (open === 0) return;
    await page.locator('[data-testid^="workspace-pane-close-"]').first().click({ force: true });
    await expect(tabs).toHaveCount(open - 1);
  }
}

// Task 58: Easy is the default, so a walk that clicks the Runtime · Mode chips switches the
// workspace to Advanced first, through the rail's ⋯ menu, and hands Easy back in `finally`:
// the setting lands in the user's own settings.json.
export async function setAdvancedControls(page: Page, on: boolean): Promise<void> {
  const shell = page.locator('[data-testid="workspace-shell"]');
  const want = on ? 'advanced' : 'easy';
  await expect(shell).toHaveAttribute('data-ui', /easy|advanced/, { timeout: 15000 });
  if ((await shell.getAttribute('data-ui')) === want) return;
  await page.locator('[data-testid="workspace-pane-more"]').click();
  await page.locator('[data-testid="workspace-advanced-controls"]').click();
  await expect(shell).toHaveAttribute('data-ui', want);
  await expect(page.locator('[data-testid="workspace-pane-more-menu"]')).toHaveCount(0);
}

// A scratch repo carrying this repo's `.agents/agents/` roles plus a `spike-echo` role whose
// reply starts with a known token, so a delegation walk needs no particular window directory.
// Call from `beforeAll`; returns the restore function for `afterAll`.
export function provisionRoleRepo(): () => void {
  const previous = process.env.GOOSE_TEST_DIR;
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'goose-roles-')));
  const repoRoot = join(__dirname, '..', '..', '..', '..');
  mkdirSync(join(scratch, '.agents'), { recursive: true });
  cpSync(join(repoRoot, '.agents', 'agents'), join(scratch, '.agents', 'agents'), {
    recursive: true,
  });
  writeFileSync(
    join(scratch, '.agents', 'agents', 'spike-echo.md'),
    '---\nname: spike-echo\ndescription: Echo role for the delegation walks.\n---\n\n' +
      'Begin every reply with the token spike-ok-30. Then answer the task in one sentence.\n'
  );
  writeFileSync(join(scratch, 'notes.md'), 'one\ntwo\nthree\n');
  writeFileSync(join(scratch, '.gitignore'), '.worktrees/\n');
  const git = (args: string[]) => execFileSync('git', args, { cwd: scratch, stdio: 'pipe' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.name', 'roles']);
  git(['config', 'user.email', 'roles@test']);
  git(['add', '.']);
  git(['commit', '-q', '-m', 'base']);
  process.env.GOOSE_TEST_DIR = scratch;
  return () => {
    if (previous === undefined) delete process.env.GOOSE_TEST_DIR;
    else process.env.GOOSE_TEST_DIR = previous;
    rmSync(scratch, { recursive: true, force: true });
  };
}
