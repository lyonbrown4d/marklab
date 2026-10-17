import { expect } from '@playwright/test'
/* eslint-disable no-restricted-imports -- Reuse unchanged pure metric/budget contracts. */
import type { FrameMetrics } from '../performance/frameProbe.js'
import type { LargeDocumentStats } from '../performance/largeDocumentFixtureContract.js'
import { performanceBudgetForProject } from '../performance/performanceBudgets.js'
import type { RendererPerformanceSample } from './rendererPerformanceScenario.js'
/* eslint-enable no-restricted-imports */

type Budget = ReturnType<typeof performanceBudgetForProject>
const frames = (name: string, metrics: FrameMetrics, budget: Budget) => {
  expect.soft(metrics.blankFrames, `${name}: blank editor frames`).toBe(0)
  expect.soft(metrics.loadingFrames, `${name}: exposed loading surface`).toBe(0)
  expect.soft(metrics.readyToLoadingTransitions, `${name}: reverted to loading`).toBe(0)
  expect
    .soft(metrics.frameCount, `${name}: frame count`)
    .toBeGreaterThanOrEqual(budget.minFrameCount)
  expect
    .soft(metrics.maxVisibleSurfaces, `${name}: visible editor surfaces`)
    .toBeLessThanOrEqual(budget.maxVisibleSurfaces)
  expect.soft(metrics.supportsLayoutShift, `${name}: layout shift observer unsupported`).toBe(true)
  expect
    .soft(metrics.layoutShift, `${name}: layout shift`)
    .toBeLessThanOrEqual(budget.maxLayoutShift)
  expect.soft(metrics.supportsLongTask, `${name}: long task observer unsupported`).toBe(true)
  expect
    .soft(metrics.longTaskCount, `${name}: long task count`)
    .toBeLessThanOrEqual(budget.maxLongTaskCount)
  expect
    .soft(metrics.longTaskDurationMs, `${name}: cumulative long tasks`)
    .toBeLessThanOrEqual(budget.maxLongTaskDurationMs)
  expect.soft(metrics.p95FrameMs, `${name}: p95 frame`).toBeLessThanOrEqual(budget.p95FrameMs)
  expect.soft(metrics.maxFrameMs, `${name}: maximum frame`).toBeLessThanOrEqual(budget.maxFrameMs)
}

export const assertRendererSample = (
  sample: RendererPerformanceSample,
  budget: Budget,
  stats: LargeDocumentStats,
  minimumSelection: number,
) => {
  const init = sample.initialization
  expect.soft(init.installedBeforeReady, 'ready probe installed before hydration').toBe(true)
  expect.soft(init.loadingObserved, 'observed actual loading state').toBe(true)
  expect.soft(init.loadingFrameCount).toBeGreaterThanOrEqual(budget.loadingMinFrameCount)
  expect.soft(init.loadingMaxFrameMs).toBeLessThanOrEqual(budget.loadingMaxFrameMs)
  expect.soft(init.loadingP95FrameMs).toBeLessThanOrEqual(budget.loadingP95FrameMs)
  expect.soft(init.supportsLongTask).toBe(true)
  expect.soft(init.loadingLongTaskCount).toBeLessThanOrEqual(budget.loadingMaxLongTaskCount)
  expect
    .soft(init.loadingLongTaskDurationMs)
    .toBeLessThanOrEqual(budget.loadingMaxLongTaskDurationMs)
  expect.soft(sample.sourceStats, 'fixed source fixture shape').toEqual(stats)
  expect.soft(sample.hydration.allPresent, 'hydration preserved all sentinels').toBe(true)
  expect.soft(sample.hydration.ordered, 'hydration preserved sentinel ordering').toBe(true)
  expect.soft(sample.initial.activeEditors).toBe(1)
  expect.soft(sample.finalState.activeEditors).toBe(1)
  expect.soft(sample.firstInput.applied).toBe(true)
  expect.soft(sample.continuousInput.applied).toBe(true)
  expect.soft(sample.persistence.flushCompleted).toBe(true)
  expect.soft(sample.persistence.firstMarkerPersisted).toBe(true)
  expect.soft(sample.persistence.markerPersisted).toBe(true)
  expect.soft(sample.persistence.sentinels.allPresent).toBe(true)
  expect.soft(sample.persistence.sentinels.ordered).toBe(true)
  expect.soft(sample.selectAll.insideEditor).toBe(true)
  expect.soft(sample.selectAll.textLength).toBeGreaterThan(minimumSelection)
  expect.soft(sample.wheel.distance).toBeGreaterThan(0)
  expect
    .soft(
      sample.scrollbar.browser?.supported,
      sample.scrollbar.browser?.reason ?? 'browser scrollbar',
    )
    .toBe(true)
  expect
    .soft(sample.scrollbar.browser?.moved, 'dragged the actual browser scrollbar gutter')
    .toBe(true)
  expect.soft(sample.focusMs).toBeLessThanOrEqual(budget.focusMs)
  expect.soft(sample.initial.domNodeCount).toBeLessThanOrEqual(budget.maxDomNodeCount)
  expect
    .soft(sample.initial.renderedElementCount)
    .toBeLessThanOrEqual(budget.maxRenderedElementCount)
  expect.soft(sample.initial.renderedElementCount).toBe(stats.blockCount)
  expect.soft(sample.initial.chunkCount).toBeGreaterThanOrEqual(budget.minChunkCount)
  expect.soft(sample.initial.chunkCount).toBeLessThanOrEqual(budget.maxChunkCount)
  frames('wheel', sample.wheel, budget)
  frames('browser scrollbar', sample.scrollbar, budget)
  frames('typing', sample.typing, budget)
}
