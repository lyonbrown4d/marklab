import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Performance E2E reuses local Electron fixtures.
import { closeRendererServer, startRendererServer } from '../electron/electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Performance E2E reuses the deterministic HTTPS fixture.
import { startLocalHttpsFixture } from '../electron/localHttpsFixture.js'
/* eslint-disable no-restricted-imports -- Node-run Playwright helpers use explicit relative ESM imports. */
import {
  closePerformanceSession,
  launchPerformanceSession,
  type ElectronPerformanceSession,
  type GraphicsMode,
} from './electronPerformanceHarness.js'
import {
  runWebTabPerformanceSample,
  type WebTabPerformanceSample,
} from './webTabPerformanceScenario.js'
/* eslint-enable no-restricted-imports */

const summarize = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right)
  const percentile = (fraction: number) => sorted[Math.ceil(sorted.length * fraction) - 1]
  return {
    firstMs: values[0],
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted.at(-1),
    sampleCount: values.length,
  }
}

test.describe('Embedded web tab performance baseline', () => {
  let rendererServer: http.Server | undefined
  let rendererUrl = ''
  let fixture: Awaited<ReturnType<typeof startLocalHttpsFixture>> | undefined
  let session: ElectronPerformanceSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererServer = renderer.server
    rendererUrl = renderer.url
    fixture = await startLocalHttpsFixture()
  })

  test.afterAll(async () => {
    await Promise.all([closeRendererServer(rendererServer), fixture?.close()])
  })

  test.afterEach(async () => {
    await closePerformanceSession(session)
    session = undefined
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument.
  test('records cold, warm, resize, and resource baselines without timing budgets', async ({}, testInfo) => {
    if (!fixture) throw new Error('Local HTTPS fixture was not started')
    const warmupRuns = 1
    const measuredRuns = 5
    const measured: WebTabPerformanceSample[] = []
    let warmup: WebTabPerformanceSample | null = null
    try {
      for (let runIndex = 0; runIndex < warmupRuns + measuredRuns; runIndex += 1) {
        session = await launchPerformanceSession(
          rendererUrl,
          testInfo.project.name as GraphicsMode,
          {
            trustedCertificateSpki: fixture.spkiFingerprint,
          },
        )
        try {
          const sample = await runWebTabPerformanceSample(session, fixture.url, runIndex)
          expect(sample.warmSwitchMs).toHaveLength(5)
          expect(sample.snapshots.one.webContentsCount).toBe(1)
          expect(sample.snapshots.three.webContentsCount).toBe(3)
          expect(sample.snapshots.closed.webContentsCount).toBe(0)
          if (runIndex === 0) warmup = sample
          else measured.push(sample)
        } finally {
          await closePerformanceSession(session)
          session = undefined
        }
      }
      expect(measured).toHaveLength(measuredRuns)
    } finally {
      const artifactPath = testInfo.outputPath('web-tab-metrics.json')
      const artifact = {
        schemaVersion: 1,
        graphicsMode: testInfo.project.name,
        plan: { warmupRuns, measuredRuns, warmSwitchesPerRun: 5 },
        warmup,
        measured,
        summary:
          measured.length === 0
            ? null
            : {
                coldActivate: summarize(measured.map((sample) => sample.coldActivateMs)),
                warmSwitch: summarize(measured.flatMap((sample) => sample.warmSwitchMs)),
                boundsStable: summarize(measured.map((sample) => sample.boundsStableMs)),
              },
      }
      fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2))
      await testInfo.attach('web-tab-metrics', {
        path: artifactPath,
        contentType: 'application/json',
      })
    }
  })
})
