import { expect, type Locator, type Page } from '@playwright/test'
/* eslint-disable no-restricted-imports -- Performance E2E helpers are Node-run sibling modules. */
import {
  inputProbeHasMissingMutation,
  inputProbeSettled,
  summarizeDurations,
} from './performanceStatistics.js'
import { EDITABLE_PLATE_EDITOR_SELECTOR } from './platePerformanceMetrics.js'
/* eslint-enable no-restricted-imports */

type InputLatencySample = {
  inputToPaintMs: number
  inputType: string
}

type InputLatencyProbe = {
  beforeInput: (event: Event) => void
  finalizedAfterMarkerPaintCount: number
  inputCount: number
  mutationBatchCount: number
  observer: MutationObserver
  paintScheduled: boolean
  pending: Array<{ inputType: string; startedAt: number }>
  samples: InputLatencySample[]
}

type PerformanceWindow = Window & {
  __marklabInputLatencyProbe?: InputLatencyProbe
}

const waitForPaints = (page: Page, count: number) =>
  page.evaluate(
    (paintCount) =>
      new Promise<void>((resolve) => {
        let remaining = paintCount
        const afterPaint = () => {
          remaining -= 1
          if (remaining === 0) resolve()
          else requestAnimationFrame(afterPaint)
        }
        requestAnimationFrame(afterPaint)
      }),
    count,
  )

const installInputLatencyProbe = (page: Page) =>
  page.evaluate((selector) => {
    const target = document.querySelector<HTMLElement>(selector)
    if (!target) throw new Error('Plate editor is unavailable for the input probe')
    const holder = window as PerformanceWindow
    if (holder.__marklabInputLatencyProbe) {
      throw new Error('An input latency probe is already active')
    }
    const pending: InputLatencyProbe['pending'] = []
    const samples: InputLatencySample[] = []
    const beforeInput = (event: Event) => {
      if (!target.contains(event.target as Node)) return
      const probe = holder.__marklabInputLatencyProbe
      if (probe) probe.inputCount += 1
      pending.push({
        inputType: (event as InputEvent).inputType || 'unknown',
        startedAt: performance.now(),
      })
    }
    const observer = new MutationObserver(() => {
      if (pending.length === 0) return
      const probe = holder.__marklabInputLatencyProbe
      if (probe) probe.mutationBatchCount += 1
      if (!probe || probe.paintScheduled) return
      probe.paintScheduled = true
      requestAnimationFrame(() => {
        const paintObservedAt = performance.now()
        const mutatedInputs = pending.splice(0)
        for (const input of mutatedInputs) {
          samples.push({
            inputToPaintMs: paintObservedAt - input.startedAt,
            inputType: input.inputType,
          })
        }
        probe.paintScheduled = false
      })
    })
    target.addEventListener('beforeinput', beforeInput)
    observer.observe(target, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    holder.__marklabInputLatencyProbe = {
      beforeInput,
      finalizedAfterMarkerPaintCount: 0,
      inputCount: 0,
      mutationBatchCount: 0,
      observer,
      paintScheduled: false,
      pending,
      samples,
    }
  }, EDITABLE_PLATE_EDITOR_SELECTOR)

const finalizeCoalescedInput = (page: Page, marker: string) =>
  page.evaluate(
    async ({ expectedMarker, selector }) => {
      const holder = window as PerformanceWindow
      const target = document.querySelector<HTMLElement>(selector)
      const probe = holder.__marklabInputLatencyProbe
      if (
        !target ||
        !probe ||
        !target.textContent?.includes(expectedMarker) ||
        probe.pending.length === 0 ||
        probe.samples.length + probe.pending.length !== probe.inputCount
      ) {
        return
      }
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          const paintObservedAt = performance.now()
          const markerBoundInputs = probe.pending.splice(0)
          for (const input of markerBoundInputs) {
            probe.samples.push({
              inputToPaintMs: paintObservedAt - input.startedAt,
              inputType: input.inputType,
            })
          }
          probe.finalizedAfterMarkerPaintCount += markerBoundInputs.length
          resolve()
        })
      })
    },
    { expectedMarker: marker, selector: EDITABLE_PLATE_EDITOR_SELECTOR },
  )

const waitForInputProbe = async (page: Page, marker: string) => {
  try {
    await page.waitForFunction(
      () => {
        const probe = (window as PerformanceWindow).__marklabInputLatencyProbe
        return Boolean(
          probe &&
          probe.inputCount > 0 &&
          probe.pending.length === 0 &&
          probe.samples.length === probe.inputCount,
        )
      },
      undefined,
      { timeout: 10_000 },
    )
  } catch (error) {
    const diagnostics = await page.evaluate(
      ({ expectedMarker, selector }) => {
        const probe = (window as PerformanceWindow).__marklabInputLatencyProbe
        const editor = document.querySelector<HTMLElement>(selector)
        return {
          finalizedAfterMarkerPaintCount: probe?.finalizedAfterMarkerPaintCount ?? null,
          inputCount: probe?.inputCount ?? null,
          markerApplied: editor?.textContent?.includes(expectedMarker) ?? false,
          mutationBatchCount: probe?.mutationBatchCount ?? null,
          pendingCount: probe?.pending.length ?? null,
          sampleCount: probe?.samples.length ?? null,
        }
      },
      { expectedMarker: marker, selector: EDITABLE_PLATE_EDITOR_SELECTOR },
    )
    throw new Error(`Input probe timed out: ${JSON.stringify(diagnostics)}`, { cause: error })
  }
}

const removeInputLatencyProbe = (page: Page) =>
  page.evaluate((selector) => {
    const holder = window as PerformanceWindow
    const target = document.querySelector<HTMLElement>(selector)
    const probe = holder.__marklabInputLatencyProbe
    if (!target || !probe) throw new Error('Input latency probe was not available for cleanup')
    target.removeEventListener('beforeinput', probe.beforeInput)
    probe.observer.takeRecords()
    probe.observer.disconnect()
    delete holder.__marklabInputLatencyProbe
    return {
      finalizedAfterMarkerPaintCount: probe.finalizedAfterMarkerPaintCount,
      inputCount: probe.inputCount,
      mutationBatchCount: probe.mutationBatchCount,
      pendingCount: probe.pending.length,
      samples: probe.samples,
    }
  }, EDITABLE_PLATE_EDITOR_SELECTOR)

export const measureInputLatency = async (
  page: Page,
  editor: Locator,
  marker: string,
  { allowUnapplied = false }: { allowUnapplied?: boolean } = {},
) => {
  await installInputLatencyProbe(page)
  await editor.pressSequentially(marker)
  if (allowUnapplied) {
    await waitForPaints(page, 2)
  } else {
    await expect
      .poll(
        () =>
          editor.evaluate((element, expected) => element.textContent?.includes(expected), marker),
        { message: `Plate did not render the input marker ${JSON.stringify(marker)}` },
      )
      .toBe(true)
  }
  const markerApplied = await editor.evaluate(
    (element, expected) => element.textContent?.includes(expected),
    marker,
  )
  await finalizeCoalescedInput(page, marker)
  if (markerApplied) await waitForInputProbe(page, marker)

  const result = await removeInputLatencyProbe(page)
  const probeCounts = {
    inputCount: result.inputCount,
    pendingCount: result.pendingCount,
    sampleCount: result.samples.length,
  }
  const missingMutation = inputProbeHasMissingMutation(probeCounts)
  if (!inputProbeSettled(probeCounts) && !(allowUnapplied && !markerApplied && missingMutation)) {
    throw new Error(`Input probe did not settle: ${JSON.stringify(result)}`)
  }
  const samples = result.samples
  const summary =
    samples.length > 0 ? summarizeDurations(samples.map((sample) => sample.inputToPaintMs)) : null
  return {
    applied: markerApplied,
    finalizedAfterMarkerPaintCount: result.finalizedAfterMarkerPaintCount,
    inputTypes: [...new Set(samples.map((sample) => sample.inputType))],
    missingMutationCount: missingMutation ? result.pendingCount : 0,
    mutationBatchCount: result.mutationBatchCount,
    samples: samples.map((sample) => ({
      ...sample,
      inputToPaintMs: Number(sample.inputToPaintMs.toFixed(2)),
    })),
    summary,
  }
}
