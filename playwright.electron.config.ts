import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/electron',
  // A cold Electron session may spend up to 30s creating the main window and
  // another 30s mounting the renderer. Keep interaction assertions on their
  // shorter local timeouts while leaving enough room for both startup phases.
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
})
