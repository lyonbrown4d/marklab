import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPlateReadyProbeInPage } from '@/../e2e/performance/plateReadyProbeBrowser'

type ProbeState = {
  lastLoadingFrameAt: number | null
  loadingFrameCount: number
  loadingFrameDeltas: number[]
  loadingMaxFrameMs: number
  loadingStartedAt: number | null
}

describe('Plate ready probe', () => {
  afterEach(() => {
    delete (window as Window & { __marklabPlateReadyProbe?: unknown }).__marklabPlateReadyProbe
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('measures the first loading interval from the initial observation', () => {
    let nextFrame: FrameRequestCallback | undefined
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        nextFrame = callback
        return 1
      }),
    )
    vi.stubGlobal(
      'PerformanceObserver',
      class {
        static supportedEntryTypes: string[] = []
      },
    )
    document.body.innerHTML =
      '<div data-testid="markdown-editor" data-editor-engine="plate" data-state="loading"></div>'

    installPlateReadyProbeInPage()
    const probe = (window as Window & { __marklabPlateReadyProbe?: ProbeState })
      .__marklabPlateReadyProbe
    expect(probe?.lastLoadingFrameAt).toBe(probe?.loadingStartedAt)

    nextFrame?.((probe?.loadingStartedAt ?? 0) + 40)

    expect(probe?.loadingFrameCount).toBe(1)
    expect(probe?.loadingFrameDeltas[0]).toBeCloseTo(40)
    expect(probe?.loadingMaxFrameMs).toBeCloseTo(40)
  })
})
