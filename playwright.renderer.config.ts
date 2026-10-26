import { defineConfig } from '@playwright/test'

const url = 'http://127.0.0.1:4175'
export default defineConfig({
  testDir: './e2e/renderer',
  outputDir: 'test-results/renderer',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report/renderer' }],
    ['json', { outputFile: 'test-results/renderer/results.json' }],
  ],
  webServer: {
    command: 'pnpm exec vite preview --host 127.0.0.1 --port 4175 --strictPort',
    url,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  use: {
    browserName: 'chromium',
    baseURL: url,
    viewport: { width: 1440, height: 960 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'smoke',
      testMatch: [
        '**/smoke.spec.ts',
        '**/layout.spec.ts',
        '**/publication-layout.spec.ts',
        '**/editor-integrations.spec.ts',
        '**/ai-composer.spec.ts',
        '**/spreadsheet-links.spec.ts',
        '**/markdown-navigation.spec.ts',
        '**/workspace-isolation.spec.ts',
        '**/fixture-contract.spec.ts',
      ],
    },
    {
      name: 'software-rendering',
      testMatch: '**/performance.spec.ts',
      timeout: 600_000,
      use: {
        trace: 'off',
        launchOptions: {
          // Headless Chromium hides scrollbars by default; this gate must drag one.
          ignoreDefaultArgs: ['--hide-scrollbars'],
          args: [
            '--disable-gpu',
            '--disable-gpu-compositing',
            '--disable-gpu-sandbox',
            '--use-angle=swiftshader',
            '--disable-features=VizDisplayCompositor,OverlayScrollbar,OverlayScrollbars',
          ],
        },
      },
    },
    {
      name: 'renderer-gpu',
      testMatch: '**/performance.spec.ts',
      timeout: 600_000,
      use: {
        trace: 'off',
        launchOptions: {
          ignoreDefaultArgs: ['--hide-scrollbars'],
          args: ['--disable-features=OverlayScrollbar,OverlayScrollbars'],
        },
      },
    },
  ],
})
