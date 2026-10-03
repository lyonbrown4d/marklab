import { expect, test, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Performance E2E reuses the production-build renderer server.
import { closeRendererServer, startRendererServer } from '../electron/electronTestHarness.js'
/* eslint-disable no-restricted-imports -- Node-run Playwright helpers use explicit relative ESM imports. */
import { type GraphicsMode } from './electronPerformanceHarness.js'
import {
  BLOCK_HEAVY_DOCUMENT_EXPECTATIONS,
  writeBlockHeavyDocumentWorkspace,
} from './blockHeavyDocumentFixture.js'
import type { FrameMetrics } from './frameProbe.js'
import { runLargeDocumentSample, type PerformanceSample } from './largeDocumentScenario.js'
import {
  LARGE_DOCUMENT_EXPECTATIONS,
  type LargeDocumentFixture,
  type LargeDocumentStats,
  writeLargeDocumentWorkspace,
} from './largeDocumentFixture.js'
import { performanceBudgetForProject } from './performanceBudgets.js'
import { PERFORMANCE_SAMPLE_PLAN, summarizeDurations } from './performanceStatistics.js'
/* eslint-enable no-restricted-imports */

const assertFrameBudget = (
  label: string,
  metrics: FrameMetrics,
  budget: ReturnType<typeof performanceBudgetForProject>,
) => {
  expect.soft(metrics.blankFrames, `${label} produced blank editor frames`).toBe(0)
  expect.soft(metrics.loadingFrames, `${label} exposed a loading editor surface`).toBe(0)
  expect
    .soft(metrics.frameCount, `${label} produced too few frame samples`)
    .toBeGreaterThanOrEqual(budget.minFrameCount)
  expect
    .soft(metrics.readyToLoadingTransitions, `${label} transitioned from ready back to loading`)
    .toBe(0)
  if (metrics.supportsLayoutShift) {
    expect
      .soft(metrics.layoutShift, `${label} layout shift exceeded its budget`)
      .toBeLessThanOrEqual(budget.maxLayoutShift)
  }
  expect
    .soft(metrics.maxVisibleSurfaces, `${label} exposed too many editor surfaces in one frame`)
    .toBeLessThanOrEqual(budget.maxVisibleSurfaces)
  if (metrics.supportsLongTask) {
    expect
      .soft(metrics.longTaskCount, `${label} exceeded its long-task count budget`)
      .toBeLessThanOrEqual(budget.maxLongTaskCount)
    expect
      .soft(metrics.longTaskDurationMs, `${label} exceeded its cumulative long-task budget`)
      .toBeLessThanOrEqual(budget.maxLongTaskDurationMs)
  }
  expect
    .soft(metrics.p95FrameMs, `${label} p95 frame time exceeded its budget`)
    .toBeLessThanOrEqual(budget.p95FrameMs)
  expect
    .soft(metrics.maxFrameMs, `${label} maximum frame time exceeded its budget`)
    .toBeLessThanOrEqual(budget.maxFrameMs)
}

const assertSample = (
  sample: PerformanceSample,
  budget: ReturnType<typeof performanceBudgetForProject>,
  expectedStats: LargeDocumentStats,
  minimumSelectionLength: number,
) => {
  const label = `run ${sample.runIndex}`
  expect
    .soft(sample.initialization.installedBeforeReady, `${label} probe installed too late`)
    .toBe(true)
  expect
    .soft(sample.initialization.loadingObserved, `${label} did not observe Plate loading`)
    .toBe(true)
  expect
    .soft(
      sample.initialization.loadingFrameCount,
      `${label} loading did not yield enough animation frames`,
    )
    .toBeGreaterThanOrEqual(budget.loadingMinFrameCount)
  expect
    .soft(sample.initialization.loadingMaxFrameMs, `${label} loading frame exceeded budget`)
    .toBeLessThanOrEqual(budget.loadingMaxFrameMs)
  expect
    .soft(sample.initialization.loadingP95FrameMs, `${label} loading p95 frame exceeded budget`)
    .toBeLessThanOrEqual(budget.loadingP95FrameMs)
  if (sample.initialization.supportsLongTask) {
    expect
      .soft(
        sample.initialization.loadingLongTaskCount,
        `${label} loading long-task count exceeded budget`,
      )
      .toBeLessThanOrEqual(budget.loadingMaxLongTaskCount)
    expect
      .soft(
        sample.initialization.loadingLongTaskDurationMs,
        `${label} loading long-task duration exceeded budget`,
      )
      .toBeLessThanOrEqual(budget.loadingMaxLongTaskDurationMs)
  }
  expect.soft(sample.sourceStats, `${label} fixture shape drifted`).toEqual(expectedStats)
  expect.soft(sample.hydration.allPresent, `${label} hydration lost a sentinel`).toBe(true)
  expect.soft(sample.hydration.ordered, `${label} hydration reordered sentinels`).toBe(true)
  expect.soft(sample.initial.activeEditors, `${label} initial editor count`).toBe(1)
  expect.soft(sample.finalState.activeEditors, `${label} final editor count`).toBe(1)
  expect.soft(sample.firstInput.applied, `${label} first input was not applied`).toBe(true)
  expect
    .soft(sample.continuousInput.applied, `${label} continuous input was not applied`)
    .toBe(true)
  expect.soft(sample.persistence.flushCompleted, `${label} flush did not complete`).toBe(true)
  expect
    .soft(sample.persistence.firstMarkerPersisted, `${label} first marker was not saved`)
    .toBe(true)
  expect.soft(sample.persistence.markerPersisted, `${label} typing marker was not saved`).toBe(true)
  expect.soft(sample.persistence.sentinels.allPresent, `${label} save lost a sentinel`).toBe(true)
  expect.soft(sample.persistence.sentinels.ordered, `${label} save reordered sentinels`).toBe(true)
  expect.soft(sample.selectAll.insideEditor, `${label} select-all escaped Plate`).toBe(true)
  expect
    .soft(sample.selectAll.textLength, `${label} select-all was incomplete`)
    .toBeGreaterThan(minimumSelectionLength)
  expect.soft(sample.wheel.distance, `${label} wheel did not scroll`).toBeGreaterThan(0)
  expect
    .soft(
      sample.scrollbar.native?.supported,
      `${label} native scrollbar unsupported: ${sample.scrollbar.native?.reason ?? 'unknown'}`,
    )
    .toBe(true)
  expect
    .soft(
      sample.scrollbar.native?.moved,
      `${label} native scrollbar drag failed: ${sample.scrollbar.native?.reason ?? 'unknown'}`,
    )
    .toBe(true)
  expect.soft(sample.focusMs, `${label} focus exceeded budget`).toBeLessThanOrEqual(budget.focusMs)
  expect
    .soft(sample.initial.domNodeCount, `${label} DOM node budget`)
    .toBeLessThanOrEqual(budget.maxDomNodeCount)
  expect
    .soft(sample.initial.renderedElementCount, `${label} Slate element budget`)
    .toBeLessThanOrEqual(budget.maxRenderedElementCount)
  expect
    .soft(sample.initial.renderedElementCount, `${label} parsed block count`)
    .toBe(expectedStats.blockCount)
  expect
    .soft(sample.initial.chunkCount, `${label} minimum chunk count`)
    .toBeGreaterThanOrEqual(budget.minChunkCount)
  expect
    .soft(sample.initial.chunkCount, `${label} maximum chunk count`)
    .toBeLessThanOrEqual(budget.maxChunkCount)
  assertFrameBudget(`${label} wheel`, sample.wheel, budget)
  assertFrameBudget(`${label} native scrollbar`, sample.scrollbar, budget)
  assertFrameBudget(`${label} typing`, sample.typing, budget)
}

const writeArtifact = async (testInfo: TestInfo, name: string, value: unknown) => {
  const artifactPath = testInfo.outputPath(name)
  fs.writeFileSync(artifactPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await testInfo.attach(name, { contentType: 'application/json', path: artifactPath })
}

type DocumentGate = {
  artifactName: string
  createFixture: (runtimeRoot: string) => LargeDocumentFixture
  expectedStats: LargeDocumentStats
  minimumSelectionLength: number
  name: string
  samplePlan: { measuredRuns: number; warmupRuns: number }
}

const documentGates: DocumentGate[] = [
  {
    artifactName: 'text-heavy-document-metrics.json',
    createFixture: writeLargeDocumentWorkspace,
    expectedStats: LARGE_DOCUMENT_EXPECTATIONS,
    minimumSelectionLength: 500_000,
    name: 'text-heavy 1.36MB document',
    samplePlan: PERFORMANCE_SAMPLE_PLAN,
  },
  {
    artifactName: 'block-heavy-document-metrics.json',
    createFixture: writeBlockHeavyDocumentWorkspace,
    expectedStats: BLOCK_HEAVY_DOCUMENT_EXPECTATIONS,
    minimumSelectionLength: 3_500,
    name: 'block-heavy 4,000-block document',
    samplePlan: { measuredRuns: 2, warmupRuns: 1 },
  },
]

const runDocumentGate = async (gate: DocumentGate, rendererUrl: string, testInfo: TestInfo) => {
  const graphicsMode = testInfo.project.name as GraphicsMode
  const budget = performanceBudgetForProject(testInfo.project.name)
  const samples: PerformanceSample[] = []
  let summary: Record<string, unknown> | null = null
  let failure: { message: string; stack?: string } | null = null
  try {
    const totalRuns = gate.samplePlan.warmupRuns + gate.samplePlan.measuredRuns
    for (let runIndex = 0; runIndex < totalRuns; runIndex += 1) {
      samples.push(
        await runLargeDocumentSample({
          createFixture: gate.createFixture,
          graphicsMode,
          rendererUrl,
          runIndex,
          testInfo,
          warmup: runIndex < gate.samplePlan.warmupRuns,
        }),
      )
    }
    const measured = samples.filter((sample) => !sample.warmup)
    const initialization = summarizeDurations(
      measured.map((sample) => sample.initialization.windowOpenToReadyMs),
    )
    const inputDurations = measured.flatMap((sample) => [
      ...sample.firstInput.samples.map((entry) => entry.inputToPaintMs),
      ...sample.continuousInput.samples.map((entry) => entry.inputToPaintMs),
    ])
    const input = summarizeDurations(inputDurations)
    const slowInputSampleCount = inputDurations.filter(
      (duration) => duration > budget.inputSlowSampleMs,
    ).length
    summary = { initialization, input, measuredRuns: measured.length, slowInputSampleCount }

    expect.soft(measured).toHaveLength(gate.samplePlan.measuredRuns)
    measured.forEach((sample) =>
      assertSample(sample, budget, gate.expectedStats, gate.minimumSelectionLength),
    )
    expect.soft(initialization.firstMs).toBeLessThanOrEqual(budget.windowOpenToReadyFirstMs)
    expect.soft(initialization.p95Ms).toBeLessThanOrEqual(budget.windowOpenToReadyP95Ms)
    expect.soft(initialization.maxMs).toBeLessThanOrEqual(budget.windowOpenToReadyMaxMs)
    expect.soft(input.firstMs).toBeLessThanOrEqual(budget.inputFirstMs)
    expect.soft(input.p95Ms).toBeLessThanOrEqual(budget.inputP95Ms)
    expect.soft(input.maxMs).toBeLessThanOrEqual(budget.inputCatastrophicMaxMs)
    expect.soft(slowInputSampleCount).toBeLessThanOrEqual(budget.inputMaxSlowSampleCount)
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error))
    failure = { message: normalized.message, stack: normalized.stack }
    throw error
  } finally {
    await writeArtifact(testInfo, gate.artifactName, {
      failure,
      graphicsMode,
      samplePlan: gate.samplePlan,
      samples,
      summary,
    })
    await writeArtifact(testInfo, 'performance-budget.json', budget)
    const logPath = testInfo.outputPath('electron-performance.log')
    const logs = samples.flatMap((sample) => sample.electronOutput)
    fs.writeFileSync(logPath, `${logs.join('\n') || '(no completed sample output)'}\n`, 'utf8')
    await testInfo.attach('electron-performance.log', {
      contentType: 'text/plain',
      path: logPath,
    })
  }
}

test.describe('large Markdown document @performance @blackbox', () => {
  let rendererServer: http.Server | undefined
  let rendererUrl = ''

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererServer = renderer.server
    rendererUrl = renderer.url
  })

  test.afterAll(async () => closeRendererServer(rendererServer))

  for (const gate of documentGates) {
    // eslint-disable-next-line no-empty-pattern -- Electron owns the browser lifecycle; Playwright still requires a destructured fixture argument.
    test(`gates Plate with ${gate.name}`, async ({}, testInfo) => {
      await runDocumentGate(gate, rendererUrl, testInfo)
    })
  }
})
