import type {} from '@wdio/types'
import type {} from 'webdriverio'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// eslint-disable-next-line no-restricted-imports -- Native test configuration only.
import { fixturePaths } from './e2e/tauri/fixturePaths.js'
// eslint-disable-next-line no-restricted-imports -- Native test configuration only.
import { applicationBinary, usesCef } from './e2e/tauri/application.ts'

const repository = fileURLToPath(new URL('./', import.meta.url))
const fixture = fixturePaths()
const binary = applicationBinary()
const driverPort = Number(process.env.MARKLAB_E2E_DRIVER_PORT)
if (!Number.isInteger(driverPort) || driverPort < 1024 || driverPort > 65535)
  throw new Error('Native E2E requires its allocated loopback driver port')
const artifacts = path.join(repository, 'test-results/tauri')
if (usesCef && !/^\d+\.\d+\.\d+\.\d+$/.test(process.env.MARKLAB_E2E_CHROMIUM_VERSION ?? ''))
  throw new Error('Launch CEF through the native E2E runner before loading its WDIO config')
const capability = usesCef
  ? {
      browserName: 'chrome',
      'wdio:enforceWebDriverClassic': true,
      browserVersion: process.env.MARKLAB_E2E_CHROMIUM_VERSION,
      // The binary and version prevent WDIO from downloading a separate Chrome.
      'goog:chromeOptions': { binary, debuggerAddress: `127.0.0.1:${driverPort}` },
      'wdio:chromedriverOptions': {
        allowedIps: ['127.0.0.1'],
        allowedOrigins: ['http://127.0.0.1'],
        ...(process.env.MARKLAB_E2E_CHROMEDRIVER
          ? { binary: process.env.MARKLAB_E2E_CHROMEDRIVER }
          : {}),
      },
    }
  : {
      browserName: 'tauri',
      'tauri:options': { application: binary },
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
  services: usesCef
    ? []
    : [
        [
          '@wdio/tauri-service',
          {
            driverProvider: 'external',
            appBinaryPath: binary,
            appArgs: ['--workspace', fixture.performance ?? fixture.alpha],
            tauriDriverPort: driverPort,
            autoInstallTauriDriver: false,
            autoDownloadEdgeDriver: true,
            captureBackendLogs: false,
            captureFrontendLogs: false,
            startTimeout: 90_000,
            commandTimeout: 20_000,
            env: {
              MARKLAB_E2E_DATA_DIR: fixture.data,
              MARKLAB_E2E_CACHE_DIR: fixture.cache,
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
