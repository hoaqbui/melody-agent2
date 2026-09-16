import { PlaywrightTestConfig, devices } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  timeout: 60000,
  expect: {
    timeout: 30000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['html'],
    ['list']
  ],
  use: {
    actionTimeout: 30000,
    navigationTimeout: 30000,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    { name: 'chromium', testIgnore: /phone\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    // Task 20: the web build at phone width — an iPhone's viewport, touch and UA in Chromium,
    // against a sidecar started out of band (see tests/e2e/phone.spec.ts).
    {
      name: 'phone',
      testMatch: /phone\.spec\.ts/,
      use: {
        ...devices['iPhone 14'],
        defaultBrowserType: 'chromium',
        viewport: { width: 390, height: 844 }
      }
    }
  ],
  outputDir: 'test-results',
  preserveOutput: 'always'
};

export default config;