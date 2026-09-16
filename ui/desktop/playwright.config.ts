import { PlaywrightTestConfig, devices } from '@playwright/test';

const FORK_WALKS = [
  'browser-pane',
  'diff-pane',
  'dock',
  'easy-mode',
  'editor-pane',
  'files-pane',
  'git-pane',
  'pane-menu',
  'phone-card',
  'routine',
  'runs-inbox',
  'terminal-pane',
  'three-columns',
  'workspace-shell',
  'worktree',
].map((name) => `${name}.spec.ts`);

const config: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  timeout: 60000,
  expect: {
    timeout: 30000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['html'], ['list']],
  use: {
    actionTimeout: 30000,
    navigationTimeout: 30000,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Upstream's specs only; the fork's walks are their own project so the full run has no
    // duplicates and the light run needs no grep.
    {
      name: 'chromium',
      testIgnore: [/phone\.spec\.ts/, ...FORK_WALKS],
      use: { ...devices['Desktop Chrome'] },
    },
    // The fork's own walks (one per workspace feature, ~25 s each): the light suite. Upstream's
    // specs (app, context-management, performance, loading-state, web-build) run only in the full.
    {
      name: 'walks',
      testMatch: FORK_WALKS,
      use: { ...devices['Desktop Chrome'] },
    },
    // Task 20: the web build at phone width — an iPhone's viewport, touch and UA in Chromium,
    // against a sidecar started out of band (see tests/e2e/phone.spec.ts).
    {
      name: 'phone',
      testMatch: /phone\.spec\.ts/,
      use: {
        ...devices['iPhone 14'],
        defaultBrowserType: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  outputDir: 'test-results',
  preserveOutput: 'always',
};

export default config;
