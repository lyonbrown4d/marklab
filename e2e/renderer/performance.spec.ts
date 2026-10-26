import { expect, test, type TestInfo } from '@playwright/test'
/* eslint-disable no-restricted-imports -- Renderer performance imports the unchanged fixture/budget/statistics contracts. */
import {
  writeLargeDocumentWorkspace,
  LARGE_DOCUMENT_EXPECTATIONS,
} from '../performance/largeDocumentFixture.js'
import {
  writeBlockHeavyDocumentWorkspace,
  BLOCK_HEAVY_DOCUMENT_EXPECTATIONS,
} from '../performance/blockHeavyDocumentFixture.js'
import { performanceBudgetForProject } from '../performance/performanceBudgets.js'
import {
  collectPerformanceSamples,
  PERFORMANCE_SAMPLE_PLAN,
  summarizeDurations,
} from '../performance/performanceStatistics.js'
import { runRendererPerformanceSample } from './rendererPerformanceScenario.js'
import { assertRendererSample } from './performanceAssertions.js'
/* eslint-enable no-restricted-imports */

const attach = (info: TestInfo, name: string, value: unknown) =>
  info.attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' })
const gates = [
  {
    name: 'text-heavy 1.36MB',
    createFixture: writeLargeDocumentWorkspace,
    stats: LARGE_DOCUMENT_EXPECTATIONS,
    minimumSelection: 500_000,
  },
  {
    name: 'block-heavy 4000-block',
    createFixture: writeBlockHeavyDocumentWorkspace,
    stats: BLOCK_HEAVY_DOCUMENT_EXPECTATIONS,
    minimumSelection: 3_500,
  },
]

for (const gate of gates)
  test(`gates Plate renderer with ${gate.name} document @performance`, async ({
    browser,
    baseURL,
  }, info) => {
    if (!baseURL) throw new Error('Production renderer baseURL is required')
    const graphics = await browser.newBrowserCDPSession()
    try {
      const { gpu } = await graphics.send('SystemInfo.getInfo')
      await attach(info, 'renderer-graphics.json', {
        devices: gpu.devices,
        featureStatus: gpu.featureStatus,
        displayType: gpu.auxAttributes?.displayType,
      })
    } finally {
      await graphics.detach()
    }
    const budget = performanceBudgetForProject(info.project.name)
    let collection:
      | Awaited<
          ReturnType<
            typeof collectPerformanceSamples<
              Awaited<ReturnType<typeof runRendererPerformanceSample>>
            >
          >
        >
      | undefined
    let summary: unknown
    let failure: string | undefined
    try {
      collection = await collectPerformanceSamples({
        plan: PERFORMANCE_SAMPLE_PLAN,
        maxAttempts:
          (PERFORMANCE_SAMPLE_PLAN.warmupRuns + PERFORMANCE_SAMPLE_PLAN.measuredRuns) * 2,
        runSample: ({ attemptIndex, warmup }) =>
          runRendererPerformanceSample({
            browser,
            rendererUrl: baseURL,
            createFixture: gate.createFixture,
            runIndex: attemptIndex,
            testInfo: info,
            warmup,
          }),
      })
      expect.soft(collection.failures, 'Every failed attempt remains a gate failure').toEqual([])
      const measured = collection.samples.filter((sample) => !sample.warmup)
      expect.soft(measured).toHaveLength(PERFORMANCE_SAMPLE_PLAN.measuredRuns)
      measured.forEach((sample) =>
        assertRendererSample(sample, budget, gate.stats, gate.minimumSelection),
      )
      const initialization = summarizeDurations(
        measured.map((sample) => sample.initialization.navigationToReadyMs),
      )
      const inputs = measured.flatMap((sample) =>
        [...sample.firstInput.samples, ...sample.continuousInput.samples].map(
          (entry) => entry.inputToPaintMs,
        ),
      )
      const input = summarizeDurations(inputs)
      const slowInputSampleCount = inputs.filter((value) => value > budget.inputSlowSampleMs).length
      summary = {
        rendererNavigationToReady: initialization,
        input,
        slowInputSampleCount,
        reliability: {
          attemptedRuns: collection.attemptCount,
          failedRuns: collection.failures.length,
          successfulRuns: collection.samples.length,
        },
      }
      expect.soft(initialization.firstMs).toBeLessThanOrEqual(budget.windowOpenToReadyFirstMs)
      expect.soft(initialization.p95Ms).toBeLessThanOrEqual(budget.windowOpenToReadyP95Ms)
      expect.soft(initialization.maxMs).toBeLessThanOrEqual(budget.windowOpenToReadyMaxMs)
      expect.soft(input.firstMs).toBeLessThanOrEqual(budget.inputFirstMs)
      expect.soft(input.p95Ms).toBeLessThanOrEqual(budget.inputP95Ms)
      expect.soft(input.maxMs).toBeLessThanOrEqual(budget.inputCatastrophicMaxMs)
      expect.soft(slowInputSampleCount).toBeLessThanOrEqual(budget.inputMaxSlowSampleCount)
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      await attach(info, 'renderer-document-metrics.json', {
        scope:
          'Chromium production renderer; fixture backend, not native window/FS/process acceptance',
        graphicsMode: info.project.name,
        samplePlan: PERFORMANCE_SAMPLE_PLAN,
        failure,
        collection,
        summary,
      })
      await attach(info, 'performance-budget.json', budget)
    }
  })
