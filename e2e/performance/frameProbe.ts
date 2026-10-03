import type { Page } from '@playwright/test'

type FrameProbeState = {
  blankFrames: number
  deltas: number[]
  lastFrame: number
  layoutShift: number
  loadingFrames: number
  longTaskDuration: number
  longTasks: number
  maxVisibleSurfaces: number
  minVisibleSurfaces: number
  observers: Array<{ kind: 'layout-shift' | 'longtask'; observer: PerformanceObserver }>
  raf: number
  readySeen: boolean
  readyToLoadingTransitions: number
  supportsLayoutShift: boolean
  supportsLongTask: boolean
  wasReady: boolean
}

export type FrameMetrics = {
  averageFrameMs: number
  blankFrames: number
  frameCount: number
  layoutShift: number
  loadingFrames: number
  longFrameCount: number
  longTaskDurationMs: number
  longTaskCount: number
  maxFrameMs: number
  maxVisibleSurfaces: number
  minVisibleSurfaces: number
  p95FrameMs: number
  readyToLoadingTransitions: number
  supportsLayoutShift: boolean
  supportsLongTask: boolean
}

type ProbeWindow = Window & { __marklabFrameProbe?: FrameProbeState }

export const startFrameProbe = async (page: Page) => {
  await page.evaluate(() => {
    const state: FrameProbeState = {
      blankFrames: 0,
      deltas: [],
      lastFrame: performance.now(),
      layoutShift: 0,
      loadingFrames: 0,
      longTaskDuration: 0,
      longTasks: 0,
      maxVisibleSurfaces: 0,
      minVisibleSurfaces: Number.POSITIVE_INFINITY,
      observers: [],
      raf: 0,
      readySeen: false,
      readyToLoadingTransitions: 0,
      supportsLayoutShift: PerformanceObserver.supportedEntryTypes.includes('layout-shift'),
      supportsLongTask: PerformanceObserver.supportedEntryTypes.includes('longtask'),
      wasReady: false,
    }
    const consumeEntries = (kind: 'layout-shift' | 'longtask', entries: PerformanceEntryList) => {
      for (const entry of entries) {
        if (kind === 'layout-shift') {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
          if (!shift.hadRecentInput) state.layoutShift += shift.value ?? 0
        } else {
          state.longTasks += 1
          state.longTaskDuration += entry.duration
        }
      }
    }
    const tick = (timestamp: number) => {
      const delta = timestamp - state.lastFrame
      state.lastFrame = timestamp
      state.deltas.push(delta)
      const visibleSurfaces = [
        ...document.querySelectorAll<HTMLElement>(
          '[data-testid="markdown-editor"][data-editor-engine="plate"]',
        ),
      ].filter((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return (
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < innerHeight &&
          rect.left < innerWidth &&
          rect.height > 0 &&
          rect.width > 0 &&
          style.display !== 'none' &&
          style.visibility === 'visible' &&
          Number.parseFloat(style.opacity || '1') > 0
        )
      })
      const readySurfaceCount = visibleSurfaces.filter(
        (element) =>
          element.dataset.state === 'ready' &&
          element.dataset.slateEditor === 'true' &&
          element.querySelector('[data-slate-node="element"]') !== null &&
          Boolean(element.textContent?.trim()),
      ).length
      const loadingSurfaceCount = visibleSurfaces.filter(
        (element) => element.dataset.state === 'loading',
      ).length
      if (state.wasReady && loadingSurfaceCount > 0) state.readyToLoadingTransitions += 1
      if (readySurfaceCount > 0) state.readySeen = true
      state.wasReady = readySurfaceCount > 0
      state.minVisibleSurfaces = Math.min(state.minVisibleSurfaces, readySurfaceCount)
      state.maxVisibleSurfaces = Math.max(state.maxVisibleSurfaces, readySurfaceCount)
      if (readySurfaceCount === 0) state.blankFrames += 1
      if (loadingSurfaceCount > 0) state.loadingFrames += 1
      state.raf = requestAnimationFrame(tick)
    }
    if (state.supportsLayoutShift) {
      const layoutObserver = new PerformanceObserver((list) => {
        consumeEntries('layout-shift', list.getEntries())
      })
      layoutObserver.observe({ type: 'layout-shift' })
      state.observers.push({ kind: 'layout-shift', observer: layoutObserver })
    }
    if (state.supportsLongTask) {
      const longTaskObserver = new PerformanceObserver((list) => {
        consumeEntries('longtask', list.getEntries())
      })
      longTaskObserver.observe({ type: 'longtask' })
      state.observers.push({ kind: 'longtask', observer: longTaskObserver })
    }
    state.raf = requestAnimationFrame(tick)
    ;(window as ProbeWindow).__marklabFrameProbe = state
  })
}

const summarize = (state: Omit<FrameProbeState, 'lastFrame' | 'observers' | 'raf'>) => {
  const sorted = [...state.deltas].sort((left, right) => left - right)
  const percentileIndex = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))
  const average = sorted.length
    ? sorted.reduce((total, value) => total + value, 0) / sorted.length
    : 0
  return {
    averageFrameMs: Number(average.toFixed(2)),
    blankFrames: state.blankFrames,
    frameCount: sorted.length,
    layoutShift: Number(state.layoutShift.toFixed(4)),
    loadingFrames: state.loadingFrames,
    longFrameCount: sorted.filter((value) => value > 50).length,
    longTaskCount: state.longTasks,
    longTaskDurationMs: Number(state.longTaskDuration.toFixed(2)),
    maxFrameMs: Number((sorted.at(-1) ?? 0).toFixed(2)),
    maxVisibleSurfaces: state.maxVisibleSurfaces,
    minVisibleSurfaces: Number.isFinite(state.minVisibleSurfaces) ? state.minVisibleSurfaces : 0,
    p95FrameMs: Number((sorted[percentileIndex] ?? 0).toFixed(2)),
    readyToLoadingTransitions: state.readyToLoadingTransitions,
    supportsLayoutShift: state.supportsLayoutShift,
    supportsLongTask: state.supportsLongTask,
  } satisfies FrameMetrics
}

export const stopFrameProbe = async (page: Page): Promise<FrameMetrics> => {
  const state = await page.evaluate(() => {
    const holder = window as ProbeWindow
    const probe = holder.__marklabFrameProbe
    if (!probe) throw new Error('Frame probe was not started')
    cancelAnimationFrame(probe.raf)
    for (const { kind, observer } of probe.observers) {
      for (const entry of observer.takeRecords()) {
        if (kind === 'layout-shift') {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
          if (!shift.hadRecentInput) probe.layoutShift += shift.value ?? 0
        } else {
          probe.longTasks += 1
          probe.longTaskDuration += entry.duration
        }
      }
      observer.disconnect()
    }
    delete holder.__marklabFrameProbe
    return {
      blankFrames: probe.blankFrames,
      deltas: probe.deltas,
      layoutShift: probe.layoutShift,
      loadingFrames: probe.loadingFrames,
      longTaskDuration: probe.longTaskDuration,
      longTasks: probe.longTasks,
      maxVisibleSurfaces: probe.maxVisibleSurfaces,
      minVisibleSurfaces: probe.minVisibleSurfaces,
      readySeen: probe.readySeen,
      readyToLoadingTransitions: probe.readyToLoadingTransitions,
      supportsLayoutShift: probe.supportsLayoutShift,
      supportsLongTask: probe.supportsLongTask,
      wasReady: probe.wasReady,
    }
  })
  return summarize(state)
}

export const waitForAnimationFrames = async (page: Page, count: number) => {
  await page.evaluate(
    (frameCount) =>
      new Promise<void>((resolve) => {
        let remaining = frameCount
        const tick = () => {
          remaining -= 1
          if (remaining <= 0) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    count,
  )
}

export const measureFrames = async (
  page: Page,
  interaction: () => Promise<void>,
  minimumFrameCount = 12,
) => {
  await startFrameProbe(page)
  await interaction()
  await waitForAnimationFrames(page, minimumFrameCount)
  return stopFrameProbe(page)
}
