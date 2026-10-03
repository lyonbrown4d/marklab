import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron performance tests share the production-build renderer server.
import { closeRendererServer, startRendererServer } from '../electron/electronTestHarness.js'
/* eslint-disable no-restricted-imports -- Node-run Playwright helpers use explicit relative ESM imports. */
import { type GraphicsMode } from './electronPerformanceHarness.js'
import { runLocalHistoryRestoreSample } from './localHistoryRestoreScenario.js'
import type { LocalHistoryDocumentKind } from './localHistoryRestoreFixture.js'
import { performanceBudgetForProject } from './performanceBudgets.js'
/* eslint-enable no-restricted-imports */

const writeArtifact = async (
  testInfo: Parameters<typeof runLocalHistoryRestoreSample>[0]['testInfo'],
  value: unknown,
) => {
  const artifactPath = testInfo.outputPath('local-history-restore-metrics.json')
  fs.writeFileSync(artifactPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await testInfo.attach('local-history-restore-metrics.json', {
    contentType: 'application/json',
    path: artifactPath,
  })
}

test.describe('large local-history restore @performance @blackbox', () => {
  let rendererServer: http.Server | undefined
  let rendererUrl = ''

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererServer = renderer.server
    rendererUrl = renderer.url
  })

  test.afterAll(async () => closeRendererServer(rendererServer))

  const runRestoreCase = async ({
    documentKind,
    expectedBlocks,
    minimumBytes,
    testInfo,
  }: {
    documentKind: LocalHistoryDocumentKind
    expectedBlocks: number
    minimumBytes: number
    testInfo: Parameters<typeof runLocalHistoryRestoreSample>[0]['testInfo']
  }) => {
    const graphicsMode = testInfo.project.name as GraphicsMode
    const budget = performanceBudgetForProject(testInfo.project.name)
    let sample: Awaited<ReturnType<typeof runLocalHistoryRestoreSample>> | null = null
    let failure: { message: string; stack?: string } | null = null
    try {
      sample = await runLocalHistoryRestoreSample({
        documentKind,
        graphicsMode,
        rendererUrl,
        testInfo,
      })
      const { restoreFrames } = sample

      expect.soft(sample.fixture.historyBytes).toBeGreaterThan(minimumBytes)
      expect.soft(sample.fixture.historyBlocks).toBe(expectedBlocks)
      expect.soft(sample.fixture.historyLines).toBe(29_256)
      expect.soft(sample.restoredMarkerRendered).toBe(true)
      expect.soft(sample.restoredFileMatchedSnapshot).toBe(true)
      expect.soft(sample.input.applied).toBe(true)
      expect.soft(sample.input.samples.length).toBeGreaterThan(0)
      expect.soft(sample.input.summary?.maxMs).toBeLessThanOrEqual(budget.inputCatastrophicMaxMs)
      expect.soft(sample.inputPersisted).toBe(true)
      expect.soft(sample.finalState.activeEditors).toBe(1)
      expect.soft(sample.finalState.renderedElementCount).toBe(expectedBlocks)
      expect
        .soft(restoreFrames.loadingFrames, 'restore did not expose incremental loading frames')
        .toBeGreaterThan(0)
      expect.soft(restoreFrames.frameCount).toBeGreaterThanOrEqual(budget.minFrameCount)
      expect.soft(restoreFrames.maxVisibleSurfaces).toBeLessThanOrEqual(budget.maxVisibleSurfaces)
      expect.soft(restoreFrames.maxFrameMs).toBeLessThanOrEqual(budget.maxFrameMs)
      if (restoreFrames.supportsLongTask) {
        expect.soft(restoreFrames.longTaskCount).toBeLessThanOrEqual(budget.maxLongTaskCount)
        expect
          .soft(restoreFrames.longTaskDurationMs)
          .toBeLessThanOrEqual(budget.maxLongTaskDurationMs)
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      failure = { message: normalized.message, stack: normalized.stack }
      throw error
    } finally {
      await writeArtifact(testInfo, { budget, failure, graphicsMode, sample })
    }
  }

  // eslint-disable-next-line no-empty-pattern -- Electron owns the browser lifecycle; Playwright still requires a destructured fixture argument.
  test('keeps the renderer responsive while restoring a 1.36MB legacy snapshot', async ({}, testInfo) => {
    await runRestoreCase({
      documentKind: 'text-heavy',
      expectedBlocks: 488,
      minimumBytes: 1_300_000,
      testInfo,
    })
  })

  // eslint-disable-next-line no-empty-pattern -- Electron owns the browser lifecycle; Playwright still requires a destructured fixture argument.
  test('streams a 4,000-block local-history snapshot without freezing input', async ({}, testInfo) => {
    await runRestoreCase({
      documentKind: 'block-heavy',
      expectedBlocks: 4_000,
      minimumBytes: 30_000,
      testInfo,
    })
  })
})
