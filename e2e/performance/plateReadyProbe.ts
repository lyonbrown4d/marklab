import type { Page } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Browser probe is serialized into Playwright pages.
import { installPlateReadyProbeInPage, type ProbeWindow } from './plateReadyProbeBrowser.js'

export type PageTracking = {
  installTask: Promise<void>
  windowOpenedAtEpochMs: number
}

export type PlateInitializationMetrics = {
  installedAtEpochMs: number
  installedBeforeReady: boolean
  loadingFrameCount: number
  loadingLongTaskCount: number
  loadingLongTaskDurationMs: number
  loadingLongTasks: Array<{ durationMs: number; startAfterLoadingMs: number }>
  loadingMaxFrameMs: number
  loadingP95FrameMs: number
  loadingObserved: boolean
  openRequestToReadyMs: number
  readyAtEpochMs: number
  supportsLongTask: boolean
  windowOpenToReadyMs: number
}

export const trackPerformancePage = (
  pageTracking: Map<Page, PageTracking>,
  page: Page,
  windowOpenedAtEpochMs = Date.now(),
) => {
  const existing = pageTracking.get(page)
  if (existing) return existing.installTask
  const installTask = page
    .addInitScript(installPlateReadyProbeInPage)
    .then(() => page.evaluate(installPlateReadyProbeInPage))
    .catch(() => undefined)
  pageTracking.set(page, { installTask, windowOpenedAtEpochMs })
  return installTask
}

export const waitForPlateReadyProbe = async (page: Page, timeout: number) => {
  await page.waitForFunction(
    () => {
      const probe = (window as ProbeWindow).__marklabPlateReadyProbe
      return probe?.readyAtEpochMs != null && probe.raf === 0
    },
    undefined,
    { timeout },
  )
  return page.evaluate(() => {
    const state = (window as ProbeWindow).__marklabPlateReadyProbe
    if (!state?.readyAtEpochMs) throw new Error('Plate ready probe did not capture readiness')
    for (const entry of state.performanceObserver?.takeRecords() ?? []) {
      state.loadingLongTasks.push({ duration: entry.duration, startTime: entry.startTime })
    }
    state.performanceObserver?.disconnect()
    state.performanceObserver = null
    const loadingLongTasks = state.loadingLongTasks.filter(
      (entry) =>
        state.loadingStartedAt !== null &&
        entry.startTime >= state.loadingStartedAt &&
        (state.readyAtPerformanceMs === null || entry.startTime < state.readyAtPerformanceMs),
    )
    const loadingFrameDeltas = [...state.loadingFrameDeltas].sort((left, right) => left - right)
    const p95Index = Math.max(0, Math.ceil(loadingFrameDeltas.length * 0.95) - 1)
    return {
      installedAtEpochMs: state.installedAtEpochMs,
      installedBeforeReady: state.installedBeforeReady,
      loadingFrameCount: state.loadingFrameCount,
      loadingLongTaskCount: loadingLongTasks.length,
      loadingLongTaskDurationMs: Number(
        loadingLongTasks.reduce((total, entry) => total + entry.duration, 0).toFixed(2),
      ),
      loadingLongTasks: loadingLongTasks.map((entry) => ({
        durationMs: Number(entry.duration.toFixed(2)),
        startAfterLoadingMs: Number(
          (entry.startTime - (state.loadingStartedAt ?? entry.startTime)).toFixed(2),
        ),
      })),
      loadingMaxFrameMs: Number(state.loadingMaxFrameMs.toFixed(2)),
      loadingP95FrameMs: Number((loadingFrameDeltas[p95Index] ?? 0).toFixed(2)),
      loadingObserved: state.loadingObserved,
      readyAtEpochMs: state.readyAtEpochMs,
      supportsLongTask: state.supportsLongTask,
    }
  })
}
