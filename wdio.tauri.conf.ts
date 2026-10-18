import type { TauriCapabilities } from '@wdio/tauri-service'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line no-restricted-imports -- Native test configuration only.
import { fixturePaths } from './e2e/tauri/fixturePaths.js'

const repository = fileURLToPath(new URL('./', import.meta.url))
const fixture = fixturePaths()
const binary = path.join(
  repository,
  `src-tauri/target/debug/marklab-desktop${process.platform === 'win32' ? '.exe' : ''}`,
)
const driverPort = Number(process.env.MARKLAB_E2E_DRIVER_PORT)
if (!Number.isInteger(driverPort) || driverPort < 1024 || driverPort > 65535)
  throw new Error('Native E2E requires its allocated loopback driver port')
const artifacts = path.join(repository, 'test-results/tauri')
const capability: TauriCapabilities = {
  browserName: 'tauri',
  'tauri:options': { application: binary },
  // Splash can disappear while the driver queries its user agent. Bind the
  // session to the durable application root using the service's native option.
  'wdio:tauriServiceOptions': { windowLabel: 'main' },
}

export const config: WebdriverIO.Config = {
  runner: 'local',
  // The embedded service owns one resident app. Keep these journeys ordered in
  // one worker so window-state starts with the CLI-selected alpha workspace.
  specs: [['./e2e/tauri/windowState.spec.ts', './e2e/tauri/native.spec.ts']],
  maxInstances: 1,
  capabilities: [capability],
  services: [
    [
      '@wdio/tauri-service',
      {
        driverProvider: 'embedded',
        appBinaryPath: binary,
        appArgs: [fixture.alpha],
        embeddedPort: driverPort,
        autoInstallTauriDriver: false,
        autoDownloadEdgeDriver: false,
        captureBackendLogs: false,
        captureFrontendLogs: false,
        startTimeout: 90_000,
        commandTimeout: 20_000,
        env: {
          MARKLAB_E2E_DATA_DIR: fixture.data,
          MARKLAB_E2E_CACHE_DIR: fixture.cache,
          TAURI_WEBDRIVER_PORT: String(driverPort),
        },
      },
    ],
  ],
  framework: 'mocha',
  reporters: ['spec'],
  logLevel: 'warn',
  outputDir: artifacts,
  waitforTimeout: 20_000,
  connectionRetryTimeout: 30_000,
  connectionRetryCount: 0,
  specFileRetries: 0,
  mochaOpts: { ui: 'bdd', timeout: 90_000 },
  before: async () => {
    const { browser } = await import('@wdio/globals')
    await browser.setTimeout({ script: 20_000, pageLoad: 30_000, implicit: 0 })
  },
  afterTest: async (_test, _context, result) => {
    if (result.passed) return
    const { browser } = await import('@wdio/globals')
    await fs.mkdir(artifacts, { recursive: true })
    // Only generated fixture documents can appear in these failure artifacts.
    await browser.saveScreenshot(path.join(artifacts, 'native-failure.png')).catch(() => undefined)
    const source = await browser.getPageSource().catch(() => '<!-- native page unavailable -->')
    await fs.writeFile(path.join(artifacts, 'native-failure.html'), source.slice(0, 2_000_000))
  },
}
