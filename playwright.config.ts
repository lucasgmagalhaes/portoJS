import { defineConfig, devices } from '@playwright/test';

// Browser tests drive the example game, which imports the library straight from src/.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite --port 4173 --strictPort',
    cwd: 'examples/clicker',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
