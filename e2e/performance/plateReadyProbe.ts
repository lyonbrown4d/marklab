import type { Page } from '@playwright/test'

export type PageTracking = {
  installTask: Promise<void>
  windowOpenedAtEpochMs: number
}

export type PlateInitializationMetrics = {
  installedAtEpochMs: number
  installedBeforeReady: boolean
  loadingObserved: boolean
  openRequestToReadyMs: number
  readyAtEpochMs: number
  windowOpenToReadyMs: number
}

type PlateReadyProbe = {
  installedAtEpochMs: number
  installedBeforeReady: boolean
  loadingObserved: boolean
  observer: MutationObserver | null
  readyAtEpochMs: number | null
}

type ProbeWindow = Window & { __marklabPlateReadyProbe?: PlateReadyProbe }

const installPlateReadyProbeInPage = () => {
  const holder = window as ProbeWindow
  if (holder.__marklabPlateReadyProbe) return
  const readySelector =
    '[data-testid="markdown-editor"][data-editor-engine="plate"][data-state="ready"][data-slate-editor="true"]'
  const initialReady = document.querySelector(readySelector) !== null
  const probe: PlateReadyProbe = {
    installedAtEpochMs: Date.now(),
    installedBeforeReady: !initialReady,
    loadingObserved: false,
    observer: null,
    readyAtEpochMs: initialReady ? Date.now() : null,
  }
  const inspect = () => {
    const editor = document.querySelector<HTMLElement>(
      '[data-testid="markdown-editor"][data-editor-engine="plate"]',
    )
    if (editor?.dataset.state === 'loading') probe.loadingObserved = true
    if (!probe.readyAtEpochMs && editor?.matches(readySelector)) {
      probe.readyAtEpochMs = Date.now()
      probe.observer?.disconnect()
      probe.observer = null
    }
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
  }
  holder.__marklabPlateReadyProbe = probe
  if (document.documentElement) observe()
  else document.addEventListener('DOMContentLoaded', observe, { once: true })
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
    () => (window as ProbeWindow).__marklabPlateReadyProbe?.readyAtEpochMs != null,
    undefined,
    { timeout },
  )
  return page.evaluate(() => {
    const state = (window as ProbeWindow).__marklabPlateReadyProbe
    if (!state?.readyAtEpochMs) throw new Error('Plate ready probe did not capture readiness')
    return {
      installedAtEpochMs: state.installedAtEpochMs,
      installedBeforeReady: state.installedBeforeReady,
      loadingObserved: state.loadingObserved,
      readyAtEpochMs: state.readyAtEpochMs,
    }
  })
}
