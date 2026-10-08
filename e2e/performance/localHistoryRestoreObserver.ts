import type { Page } from '@playwright/test'

export type LocalHistoryRestoreObservation = {
  durationMs: number
  finalState: string | null
  initialState: string | null
  markerObserved: true
  markerObservedAtPerformanceMs: number
  mutationBatchCount: number
  startedAtPerformanceMs: number
  stateMutationCount: number
}

type BrowserRestoreProbe = {
  observer: MutationObserver
  promise: Promise<LocalHistoryRestoreObservation>
  timeout: number
}

type RestoreProbeWindow = Window & {
  __marklabLocalHistoryRestoreProbe?: BrowserRestoreProbe
}

const armRestoreProbe = async (page: Page, marker: string, selector: string, timeoutMs: number) => {
  await page.evaluate(
    ({ expectedMarker, surfaceSelector, timeout }) => {
      const holder = window as RestoreProbeWindow
      const previous = holder.__marklabLocalHistoryRestoreProbe
      if (previous) {
        previous.observer.disconnect()
        window.clearTimeout(previous.timeout)
        delete holder.__marklabLocalHistoryRestoreProbe
      }

      const surface = document.querySelector<HTMLElement>(surfaceSelector)
      if (!surface) throw new Error(`Restore surface was not found: ${surfaceSelector}`)
      if (surface.textContent?.includes(expectedMarker)) {
        throw new Error(`Restore marker was present before observation: ${expectedMarker}`)
      }

      const startedAtPerformanceMs = performance.now()
      const initialState = surface.dataset.state ?? null
      let mutationBatchCount = 0
      let stateMutationCount = 0
      let timeoutHandle = 0
      let resolveObservation: (observation: LocalHistoryRestoreObservation) => void = () => {}
      let rejectObservation: (error: Error) => void = () => {}
      const promise = new Promise<LocalHistoryRestoreObservation>((resolve, reject) => {
        resolveObservation = resolve
        rejectObservation = reject
      })

      const nodeContainsMarker = (node: Node) => node.textContent?.includes(expectedMarker) ?? false
      const finish = () => {
        const markerObservedAtPerformanceMs = performance.now()
        observer.disconnect()
        window.clearTimeout(timeoutHandle)
        resolveObservation({
          durationMs: Number((markerObservedAtPerformanceMs - startedAtPerformanceMs).toFixed(2)),
          finalState: surface.dataset.state ?? null,
          initialState,
          markerObserved: true,
          markerObservedAtPerformanceMs: Number(markerObservedAtPerformanceMs.toFixed(2)),
          mutationBatchCount,
          startedAtPerformanceMs: Number(startedAtPerformanceMs.toFixed(2)),
          stateMutationCount,
        })
      }
      const observer = new MutationObserver((records) => {
        mutationBatchCount += 1
        stateMutationCount += records.filter((record) => record.type === 'attributes').length
        for (const record of records) {
          if (record.type === 'attributes') continue
          if (record.type === 'characterData' && nodeContainsMarker(record.target)) {
            finish()
            return
          }
          if (record.type === 'childList' && [...record.addedNodes].some(nodeContainsMarker)) {
            finish()
            return
          }
        }
      })
      observer.observe(surface, {
        attributeFilter: ['data-state'],
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      })
      timeoutHandle = window.setTimeout(() => {
        observer.disconnect()
        rejectObservation(
          new Error(`Timed out waiting ${String(timeout)}ms for restore marker: ${expectedMarker}`),
        )
      }, timeout)
      holder.__marklabLocalHistoryRestoreProbe = {
        observer,
        promise,
        timeout: timeoutHandle,
      }
    },
    { expectedMarker: marker, surfaceSelector: selector, timeout: timeoutMs },
  )
}

const collectRestoreProbe = async (page: Page) =>
  page.evaluate(async () => {
    const holder = window as RestoreProbeWindow
    const probe = holder.__marklabLocalHistoryRestoreProbe
    if (!probe) throw new Error('Local-history restore probe was not armed')
    try {
      return await probe.promise
    } finally {
      probe.observer.disconnect()
      window.clearTimeout(probe.timeout)
      delete holder.__marklabLocalHistoryRestoreProbe
    }
  })

const cancelRestoreProbe = async (page: Page) => {
  await page.evaluate(() => {
    const holder = window as RestoreProbeWindow
    const probe = holder.__marklabLocalHistoryRestoreProbe
    if (!probe) return
    probe.observer.disconnect()
    window.clearTimeout(probe.timeout)
    delete holder.__marklabLocalHistoryRestoreProbe
  })
}

export const observeLocalHistoryRestore = async ({
  action,
  marker,
  page,
  selector,
  timeoutMs,
}: {
  action: () => Promise<void>
  marker: string
  page: Page
  selector: string
  timeoutMs: number
}) => {
  await armRestoreProbe(page, marker, selector, timeoutMs)
  try {
    await action()
    return await collectRestoreProbe(page)
  } catch (error) {
    await cancelRestoreProbe(page).catch(() => undefined)
    throw error
  }
}
