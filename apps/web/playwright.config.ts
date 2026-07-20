import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    env: {
      NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4999/api/v1',
      NEXT_PUBLIC_E2E: 'true',
      WEB_PORT: '3100',
    },
    url: 'http://127.0.0.1:3100/login',
    reuseExistingServer: !process.env.CI,
  },
});
