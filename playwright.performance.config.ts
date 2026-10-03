import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/performance',
  timeout: 600_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  outputDir: 'test-results/electron-performance',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/performance' }],
    ['json', { outputFile: 'test-results/electron-performance/results.json' }],
  ],
  retries: 0,
  workers: 1,
  projects: [{ name: 'native-gpu' }, { name: 'software-rendering' }],
  use: {
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
  },
})
