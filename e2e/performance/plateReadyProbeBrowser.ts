export type PlateReadyProbe = {
  installedAtEpochMs: number
  installedBeforeReady: boolean
  lastLoadingFrameAt: number | null
  loadingFrameCount: number
  loadingFrameDeltas: number[]
  loadingLongTasks: Array<{ duration: number; startTime: number }>
  loadingMaxFrameMs: number
  loadingObserved: boolean
  loadingStartedAt: number | null
  observer: MutationObserver | null
  performanceObserver: PerformanceObserver | null
  raf: number
  readyAtEpochMs: number | null
  readyAtPerformanceMs: number | null
  supportsLongTask: boolean
}

export type ProbeWindow = Window & { __marklabPlateReadyProbe?: PlateReadyProbe }

export const installPlateReadyProbeInPage = () => {
  const holder = window as ProbeWindow
  if (holder.__marklabPlateReadyProbe) return
  const readySelector =
    '[data-testid="markdown-editor"][data-editor-engine="plate"][data-state="ready"][data-slate-editor="true"]'
  const initialReady = document.querySelector(readySelector) !== null
  const probe: PlateReadyProbe = {
    installedAtEpochMs: Date.now(),
    installedBeforeReady: !initialReady,
    lastLoadingFrameAt: null,
    loadingFrameCount: 0,
    loadingFrameDeltas: [],
    loadingLongTasks: [],
    loadingMaxFrameMs: 0,
    loadingObserved: false,
    loadingStartedAt: null,
    observer: null,
    performanceObserver: null,
    raf: 0,
    readyAtEpochMs: initialReady ? Date.now() : null,
    readyAtPerformanceMs: initialReady ? performance.now() : null,
    supportsLongTask: PerformanceObserver.supportedEntryTypes.includes('longtask'),
  }
  const stopDomObserver = () => {
    probe.observer?.disconnect()
    probe.observer = null
  }
  const inspect = () => {
    const editor = document.querySelector<HTMLElement>(
      '[data-testid="markdown-editor"][data-editor-engine="plate"]',
    )
    if (editor?.dataset.state === 'loading') {
      probe.loadingObserved = true
      const observedAt = performance.now()
      probe.loadingStartedAt ??= observedAt
      probe.lastLoadingFrameAt ??= observedAt
    }
    if (!probe.readyAtEpochMs && editor?.matches(readySelector)) {
      probe.readyAtEpochMs = Date.now()
      probe.readyAtPerformanceMs = performance.now()
      stopDomObserver()
    }
  }
  const tick = (timestamp: number) => {
    inspect()
    if (probe.loadingStartedAt !== null) {
      if (probe.lastLoadingFrameAt !== null) {
        const delta = timestamp - probe.lastLoadingFrameAt
        probe.loadingFrameCount += 1
        probe.loadingFrameDeltas.push(delta)
        probe.loadingMaxFrameMs = Math.max(probe.loadingMaxFrameMs, delta)
      }
      probe.lastLoadingFrameAt = timestamp
    }
    if (!probe.readyAtEpochMs) probe.raf = requestAnimationFrame(tick)
    else probe.raf = 0
  }
  const observe = () => {
    inspect()
    if (probe.readyAtEpochMs || !document.documentElement) return
    probe.observer = new MutationObserver(inspect)
    probe.observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    })
    if (probe.supportsLongTask) {
      probe.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          probe.loadingLongTasks.push({ duration: entry.duration, startTime: entry.startTime })
        }
      })
      probe.performanceObserver.observe({ type: 'longtask' })
    }
    probe.raf = requestAnimationFrame(tick)
  }
  holder.__marklabPlateReadyProbe = probe
  if (document.documentElement) observe()
  else document.addEventListener('DOMContentLoaded', observe, { once: true })
}
