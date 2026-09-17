import { test as base, expect, Page, Browser, chromium } from '@playwright/test';
import { exec, spawn, ChildProcess } from 'child_process';
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
export const test = base.extend<GooseTestFixtures>({
  // Test-scoped fixture: launches a fresh Electron app for each test
  goosePage: async ({ browserName }, providePage, testInfo) => {
    void browserName;
    console.log(`Launching fresh Electron app for test: ${testInfo.title}`);

    let appProcess: ChildProcess | null = null;
    let browser: Browser | null = null;

    try {
      // Assign a unique debug port for this test to enable parallel execution
      // Base port 9222, offset by worker index * 100 + parallel slot. Two checkouts running
      // walks at once would attach to each other's app on the same port, so the base can be
      // moved per checkout.
      const basePort = Number(process.env.PLAYWRIGHT_DEBUG_PORT_BASE ?? 9222);
      const debugPort = basePort + (testInfo.parallelIndex * 10);
      console.log(`Using debug port ${debugPort} for parallel test execution`);

      // Start the electron-forge process with Playwright remote debugging enabled
      // Use detached mode on Unix to create a process group we can kill together.
      // GOOSE_TEST_DIR opens the window on that directory instead of the user's most
      // recent one (a walk that needs the project's own `.agents/agents/` role, task 58).
      const testDir = process.env.GOOSE_TEST_DIR;
      const appArgs = ['run', 'start-gui', ...(testDir ? ['--', '--dir', testDir] : [])];
      appProcess = spawn('pnpm', appArgs, {
        cwd: join(__dirname, '../..'),
        stdio: 'pipe',
        detached: process.platform !== 'win32',
        env: {
          ...process.env,
          ELECTRON_IS_DEV: '1',
          NODE_ENV: 'development',
          GOOSE_ALLOWLIST_BYPASS: 'true',
          ENABLE_PLAYWRIGHT: 'true',
          PLAYWRIGHT_DEBUG_PORT: debugPort.toString(), // Unique port per test for parallel execution
          RUST_LOG: 'info', // Enable info-level logging for goosed backend
        }
      });

      // Log process output for debugging
      if (process.env.DEBUG_TESTS) {
        appProcess.stdout?.on('data', (data) => {
          console.log('App stdout:', data.toString());
        });

        appProcess.stderr?.on('data', (data) => {
          console.log('App stderr:', data.toString());
        });
      }

      // Wait for the app to start and remote debugging to be available
      // Retry connection until it succeeds (app is ready) or timeout
      console.log(`Waiting for Electron app to start on port ${debugPort}...`);
      // A cold `start-gui` builds goose-acp-client and the forge targets first, ~20s here.
      const maxRetries = 600; // 600 retries * 100ms = 60 seconds max
      const retryDelay = 100; // 100ms between retries

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
          console.log(`Connected to Electron app on attempt ${attempt} (~${(attempt * retryDelay) / 1000}s)`);
          break;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (attempt === maxRetries) {
            throw new Error(`Failed to connect to Electron app after ${maxRetries} attempts (${(maxRetries * retryDelay) / 1000}s). Last error: ${errorMessage}`);
          }
          // Wait before next retry
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }

      if (!browser) {
        throw new Error('Browser connection failed unexpectedly');
      }

      // Wait for Electron to create its first window after the CDP endpoint is up.
      let page: Page | null = null;
      for (let attempt = 1; attempt <= 100; attempt++) {
        const contexts = browser.contexts();
        page = contexts.flatMap((context) => context.pages())[0] ?? null;
        if (page) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!page) {
        throw new Error('No windows/pages found');
      }

      // Wait for page to be ready
      await page.waitForLoadState('domcontentloaded');

      // Try to wait for networkidle
      try {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
      } catch {
        console.log('NetworkIdle timeout (likely due to MCP activity), continuing...');
      }

      // Wait for React app to be ready
      await page.waitForFunction(() => {
        const root = document.getElementById('root');
        return root && root.children.length > 0;
      }, { timeout: 30000 });

      console.log('App ready, starting test...');

      // Provide the page to the test
      await providePage(page);

    } finally {
      console.log('Cleaning up Electron app for this test...');

      // Close the CDP connection
      if (browser) {
        await browser.close().catch(console.error);
      }

      // Kill the npm process tree
      if (appProcess && appProcess.pid) {
        try {
          if (process.platform === 'win32') {
            // On Windows, kill the entire process tree
            await execAsync(`taskkill /F /T /PID ${appProcess.pid}`);
          } else {
            // On Unix, kill the entire process group
            try {
              // First try SIGTERM for graceful shutdown
              process.kill(-appProcess.pid, 'SIGTERM');
              await new Promise(resolve => setTimeout(resolve, 2000));
            } catch {
              // Process might already be dead
            }
            // Then SIGKILL if still running
            try {
              process.kill(-appProcess.pid, 'SIGKILL');
            } catch {
              // Process already exited
            }
          }
          console.log('Cleaned up app process');
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
    }
  },
});

export { expect } from '@playwright/test';

// The Work column's tab bar (task 71): every pane is a tab, Terminal, Changes and Browser
// first; a narrow bar folds the rest under a chevron, and the ⋯ session menu lists them too.
// A click opens the pane into the column: full alone, the bottom half beside one.
export async function openPane(page: Page, id: string): Promise<void> {
  const button = page.locator(`[data-testid="workspace-pane-button-${id}"]`);
  if ((await button.count()) > 0) {
    await button.click();
    return;
  }
  await page.locator('[data-testid="workspace-pane-more"]').click();
  await page.locator(`[data-testid="workspace-pane-item-${id}"]`).click();
}

// The column is remembered per project in the app's own storage, so a walk that counts
// open tabs first closes whatever an earlier run, or the user, left open.
export async function emptyDock(page: Page): Promise<void> {
  const tabs = page.locator('[data-dock-tab]');
  for (;;) {
    const open = await tabs.count();
    if (open === 0) return;
    await page.locator('[data-testid^="workspace-pane-close-"]').first().click();
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
