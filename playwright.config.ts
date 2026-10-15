import { defineConfig, devices } from '@playwright/test';

const gpuArgs = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-webgpu-adapter=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: gpuArgs } } },
  ],
  webServer: [
    {
      command: 'npx vite --port 4173 --strictPort',
      cwd: 'examples/clicker',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
    {
      command: 'npx vite --port 4174 --strictPort',
      cwd: 'examples/sprites',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
    },
  ],
});
