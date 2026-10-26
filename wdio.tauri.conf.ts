import type { TauriCapabilities } from '@wdio/tauri-service'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line no-restricted-imports -- Native test configuration only.
import { fixturePaths } from './e2e/tauri/fixturePaths.js'

const repository = fileURLToPath(new URL('./', import.meta.url))
const fixture = fixturePaths()
const binaryVariant =
  process.env.MARKLAB_E2E_CANVAS_BASELINE === '1'
    ? '-uninstrumented'
    : process.env.MARKLAB_E2E_BASELINE === '1'
      ? '-baseline'
      : process.env.MARKLAB_E2E_REACT_PROFILE === '1'
        ? '-react-profiler'
        : ''
const binary = path.join(
  repository,
  `src-tauri/target/debug/marklab-desktop${binaryVariant}${process.platform === 'win32' ? '.exe' : ''}`,
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

const selectedSpecs = (() => {
  const source = process.env.MARKLAB_E2E_SPEC_FILES
  if (!source) return []
  let selected: unknown
  try {
    selected = JSON.parse(source)
  } catch {
    throw new Error('MARKLAB_E2E_SPEC_FILES must be a JSON array of non-empty spec paths')
  }
  if (!Array.isArray(selected))
    throw new Error('MARKLAB_E2E_SPEC_FILES must be a JSON array of non-empty spec paths')
  return selected.map((file: unknown) => {
    if (typeof file !== 'string' || file.trim().length === 0)
      throw new Error('MARKLAB_E2E_SPEC_FILES must contain only non-empty spec paths')
    return file
  })
})()

const defaultSpecs = [
  './e2e/tauri/windowState.spec.ts',
  './e2e/tauri/titlebar.spec.ts',
  './e2e/tauri/rendering.spec.ts',
  './e2e/tauri/native.spec.ts',
  './e2e/tauri/memory.spec.ts',
  './e2e/tauri/selection.spec.ts',
  './e2e/tauri/webTabs.spec.ts',
  './e2e/tauri/webTabs.persistence.spec.ts',
  './e2e/tauri/webTabs.layout.spec.ts',
  './e2e/tauri/plantuml.spec.ts',
  './e2e/tauri/documentPreviews.spec.ts',
  ...(process.env.MARKLAB_E2E_NETWORK_PREVIEWS === '1'
    ? ['./e2e/tauri/previews.network.spec.ts']
    : []),
  './e2e/tauri/cli.spec.ts',
]

export const config: WebdriverIO.Config = {
  runner: 'local',
  // The embedded service owns one resident app. Keep these journeys ordered in
  // one worker so window-state starts with the CLI-selected alpha workspace.
  specs: [selectedSpecs.length > 0 ? selectedSpecs : defaultSpecs],
  maxInstances: 1,
  capabilities: [capability],
  services: [
    [
      '@wdio/tauri-service',
      {
        driverProvider: 'embedded',
        appBinaryPath: binary,
        appArgs: ['--workspace', fixture.performance ?? fixture.alpha],
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
  connectionRetryTimeout: fixture.performance ? 600_000 : 30_000,
  connectionRetryCount: 0,
  specFileRetries: 0,
  mochaOpts: { ui: 'bdd', timeout: 90_000 },
  before: async () => {
    const { browser } = await import('@wdio/globals')
    await browser.setTimeout({ script: 20_000, pageLoad: 30_000, implicit: 0 })
  },
  beforeTest: (test) => {
    console.info(`[native] ${new Date().toISOString()} start ${test.parent}: ${test.title}`)
  },
  afterTest: async (test, _context, result) => {
    console.info(
      `[native] ${new Date().toISOString()} ${result.passed ? 'passed' : 'failed'} ${test.parent}: ${test.title}`,
    )
    if (result.passed && process.env.MARKLAB_E2E_GRAPH_SCREENSHOT !== '1') return
    const { browser } = await import('@wdio/globals')
    await fs.mkdir(artifacts, { recursive: true })
    if (result.passed) {
      await browser.saveScreenshot(path.join(artifacts, 'wiki-graph-current.png'))
      return
    }
    // Only generated fixture documents can appear in these failure artifacts.
    await browser.saveScreenshot(path.join(artifacts, 'native-failure.png')).catch(() => undefined)
    const source = await browser.getPageSource().catch(() => '<!-- native page unavailable -->')
    await fs.writeFile(path.join(artifacts, 'native-failure.html'), source.slice(0, 2_000_000))
  },
}
