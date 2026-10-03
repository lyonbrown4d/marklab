import type { Page } from '@playwright/test'
/* eslint-disable-next-line no-restricted-imports -- Performance E2E helpers are Node-run siblings. */
import type {
  LongAnimationFrameEntry,
  LongAnimationFrameMetric,
} from './longAnimationFrameMetrics.js'

type FrameProbeState = {
  blankFrames: number
  deltas: number[]
  lastFrame: number
  layoutShift: number
  loadingFrames: number
  longTaskDuration: number
  longTaskEntries: Array<{ durationMs: number; startMs: number }>
  longTasks: number
  longAnimationFrameEntries: LongAnimationFrameMetric[]
  maxVisibleSurfaces: number
  maxFrame: {
    deltaMs: number
    documentFocused: boolean
    loading: boolean
    ready: boolean
    timestampMs: number
    visibilityState: DocumentVisibilityState
  } | null
  minVisibleSurfaces: number
  observers: Array<{
    kind: 'layout-shift' | 'long-animation-frame' | 'longtask'
    observer: PerformanceObserver
  }>
  raf: number
  readySeen: boolean
  readyToLoadingTransitions: number
  supportsLayoutShift: boolean
  supportsLongAnimationFrame: boolean
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
  longTaskEntries: Array<{ durationMs: number; startMs: number }>
  longTaskCount: number
  longAnimationFrameEntries: LongAnimationFrameMetric[]
  maxFrameMs: number
  maxFrameState: FrameProbeState['maxFrame']
  maxVisibleSurfaces: number
  minVisibleSurfaces: number
  p95FrameMs: number
  readyToLoadingTransitions: number
  supportsLayoutShift: boolean
  supportsLongAnimationFrame: boolean
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
      longTaskEntries: [],
      longTasks: 0,
      longAnimationFrameEntries: [],
      maxVisibleSurfaces: 0,
      maxFrame: null,
      minVisibleSurfaces: Number.POSITIVE_INFINITY,
      observers: [],
      raf: 0,
      readySeen: false,
      readyToLoadingTransitions: 0,
      supportsLayoutShift: PerformanceObserver.supportedEntryTypes.includes('layout-shift'),
      supportsLongAnimationFrame:
        PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'),
      supportsLongTask: PerformanceObserver.supportedEntryTypes.includes('longtask'),
      wasReady: false,
    }
    const consumeEntries = (
      kind: 'layout-shift' | 'long-animation-frame' | 'longtask',
      entries: PerformanceEntryList,
    ) => {
      for (const entry of entries) {
        if (kind === 'layout-shift') {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
          if (!shift.hadRecentInput) state.layoutShift += shift.value ?? 0
        } else if (kind === 'long-animation-frame') {
          const frame = entry as LongAnimationFrameEntry
          state.longAnimationFrameEntries.push({
            blockingDurationMs: frame.blockingDuration ?? 0,
            durationMs: frame.duration,
            renderStartMs: frame.renderStart ?? 0,
            startMs: frame.startTime,
            styleAndLayoutStartMs: frame.styleAndLayoutStart ?? 0,
          })
        } else {
          state.longTasks += 1
          state.longTaskDuration += entry.duration
          state.longTaskEntries.push({ durationMs: entry.duration, startMs: entry.startTime })
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
          element.firstElementChild !== null,
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
      if (!state.maxFrame || delta > state.maxFrame.deltaMs) {
        state.maxFrame = {
          deltaMs: delta,
          documentFocused: document.hasFocus(),
          loading: loadingSurfaceCount > 0,
          ready: readySurfaceCount > 0,
          timestampMs: timestamp,
          visibilityState: document.visibilityState,
        }
      }
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
    if (state.supportsLongAnimationFrame) {
      const longAnimationFrameObserver = new PerformanceObserver((list) => {
        consumeEntries('long-animation-frame', list.getEntries())
      })
      longAnimationFrameObserver.observe({ type: 'long-animation-frame' })
      state.observers.push({
        kind: 'long-animation-frame',
        observer: longAnimationFrameObserver,
      })
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
    longTaskEntries: state.longTaskEntries.map((entry) => ({
      durationMs: Number(entry.durationMs.toFixed(2)),
      startMs: Number(entry.startMs.toFixed(2)),
    })),
    longAnimationFrameEntries: state.longAnimationFrameEntries.map((entry) => ({
      blockingDurationMs: Number(entry.blockingDurationMs.toFixed(2)),
      durationMs: Number(entry.durationMs.toFixed(2)),
      renderStartMs: Number(entry.renderStartMs.toFixed(2)),
      startMs: Number(entry.startMs.toFixed(2)),
      styleAndLayoutStartMs: Number(entry.styleAndLayoutStartMs.toFixed(2)),
    })),
    maxFrameMs: Number((sorted.at(-1) ?? 0).toFixed(2)),
    maxFrameState: state.maxFrame,
    maxVisibleSurfaces: state.maxVisibleSurfaces,
    minVisibleSurfaces: Number.isFinite(state.minVisibleSurfaces) ? state.minVisibleSurfaces : 0,
    p95FrameMs: Number((sorted[percentileIndex] ?? 0).toFixed(2)),
    readyToLoadingTransitions: state.readyToLoadingTransitions,
    supportsLayoutShift: state.supportsLayoutShift,
    supportsLongAnimationFrame: state.supportsLongAnimationFrame,
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
        } else if (kind === 'long-animation-frame') {
          const frame = entry as LongAnimationFrameEntry
          probe.longAnimationFrameEntries.push({
            blockingDurationMs: frame.blockingDuration ?? 0,
            durationMs: frame.duration,
            renderStartMs: frame.renderStart ?? 0,
            startMs: frame.startTime,
            styleAndLayoutStartMs: frame.styleAndLayoutStart ?? 0,
          })
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
      longTaskEntries: probe.longTaskEntries,
      longTasks: probe.longTasks,
      longAnimationFrameEntries: probe.longAnimationFrameEntries,
      maxVisibleSurfaces: probe.maxVisibleSurfaces,
      maxFrame: probe.maxFrame,
      minVisibleSurfaces: probe.minVisibleSurfaces,
      readySeen: probe.readySeen,
      readyToLoadingTransitions: probe.readyToLoadingTransitions,
      supportsLayoutShift: probe.supportsLayoutShift,
      supportsLongAnimationFrame: probe.supportsLongAnimationFrame,
      supportsLongTask: probe.supportsLongTask,
      wasReady: probe.wasReady,
    }
  })
  return summarize(state)
}
