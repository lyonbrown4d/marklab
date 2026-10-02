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
  observers: PerformanceObserver[]
  raf: number
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
    }
    const tick = (timestamp: number) => {
      const delta = timestamp - state.lastFrame
      state.lastFrame = timestamp
      state.deltas.push(delta)
      const visible = [
        ...document.querySelectorAll<HTMLElement>('.virtualized-markdown-segment'),
      ].filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.bottom > 0 && rect.top < innerHeight && rect.height > 0
      })
      const readySurfaceCount = visible.filter((element) =>
        element.querySelector('.ProseMirror'),
      ).length
      const loadingSurfaceCount = visible.filter((element) =>
        element.querySelector('.virtualized-markdown-readonly .milkdown[data-state="loading"]'),
      ).length
      state.minVisibleSurfaces = Math.min(state.minVisibleSurfaces, readySurfaceCount)
      state.maxVisibleSurfaces = Math.max(state.maxVisibleSurfaces, readySurfaceCount)
      if (readySurfaceCount === 0) state.blankFrames += 1
      if (loadingSurfaceCount > 0) state.loadingFrames += 1
      state.raf = requestAnimationFrame(tick)
    }
    if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      const layoutObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number }
          if (!shift.hadRecentInput) state.layoutShift += shift.value ?? 0
        }
      })
      layoutObserver.observe({ type: 'layout-shift' })
      state.observers.push(layoutObserver)
    }
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks += 1
          state.longTaskDuration += entry.duration
        }
      })
      longTaskObserver.observe({ type: 'longtask' })
      state.observers.push(longTaskObserver)
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
  } satisfies FrameMetrics
}

export const stopFrameProbe = async (page: Page): Promise<FrameMetrics> => {
  const state = await page.evaluate(() => {
    const holder = window as ProbeWindow
    const probe = holder.__marklabFrameProbe
    if (!probe) throw new Error('Frame probe was not started')
    cancelAnimationFrame(probe.raf)
    probe.observers.forEach((observer) => observer.disconnect())
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

export const measureFrames = async (page: Page, interaction: () => Promise<void>) => {
  await startFrameProbe(page)
  await interaction()
  await waitForAnimationFrames(page, 12)
  return stopFrameProbe(page)
}
