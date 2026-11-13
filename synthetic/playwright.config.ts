import { defineConfig, devices } from '@playwright/test';

// Synthetic tests run against the REAL deployed site — no local webServer, no mocks.
export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 2, // a check only "fails" after 3 attempts, so one network blip doesn't page anyone
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }], ['json', { outputFile: 'report/results.json' }]],
  use: {
    baseURL: process.env.SITE_URL ?? 'https://pizza.deck-network.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
