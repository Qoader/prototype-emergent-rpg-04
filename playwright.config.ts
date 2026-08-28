import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'html',
  use: { baseURL: 'http://127.0.0.1:4173/prototype-emergent-rpg-04/', trace: 'retain-on-failure' },
  webServer: { command: 'pnpm preview --host 127.0.0.1', url: 'http://127.0.0.1:4173/prototype-emergent-rpg-04/', reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'chromium', use: { ...devices['iPhone 13'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['iPhone 13'] } }
  ]
});
