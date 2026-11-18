import { defineConfig } from '@playwright/test';

const external = process.env.SMARTFARM_E2E_BASE_URL;
export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  timeout: 45000,
  use: {
    baseURL: external || 'http://127.0.0.1:5173/',
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: process.env.PLAYWRIGHT_CHROMIUM_ARGS
        ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS)
        : [],
    },
  },
  webServer: external
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:5173/',
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
      },
});
