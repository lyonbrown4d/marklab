import { describe, expect, it } from 'vitest'
import { performanceBudgetForProject } from '@/../e2e/performance/performanceBudgets'
import {
  PERFORMANCE_SAMPLE_PLAN,
  collectPerformanceSamples,
  inputProbeCanFinalizeAfterMarkerPaint,
  inputProbeHasMissingMutation,
  inputProbeSettled,
  summarizeDurations,
  summarizeOptionalMeasurements,
} from '@/../e2e/performance/performanceStatistics'

describe('Plate performance budgets', () => {
  it.each(['native-gpu', 'software-rendering'])('%s gates long tasks', (project) => {
    const budget = performanceBudgetForProject(project) as ReturnType<
      typeof performanceBudgetForProject
    > & {
      maxLongTaskCount?: number
      maxLongTaskDurationMs?: number
    }

    expect(budget.maxLongTaskCount).toBeTypeOf('number')
    expect(budget.maxLongTaskDurationMs).toBeTypeOf('number')
    expect(budget.maxLongTaskCount).toBeGreaterThanOrEqual(0)
    expect(budget.maxLongTaskDurationMs).toBeGreaterThan(0)
    expect(budget.maxLongTaskDurationMs).toBeLessThanOrEqual(1_000)
    expect(budget.maxFrameMs).toBeLessThanOrEqual(500)
  })

  it.each(['native-gpu', 'software-rendering'])(
    '%s gates every measured latency shape',
    (project) => {
      const budget = performanceBudgetForProject(project) as Record<string, number>

      expect(budget.windowOpenToReadyFirstMs).toBeGreaterThan(0)
      expect(budget.windowOpenToReadyP95Ms).toBeGreaterThan(0)
      expect(budget.windowOpenToReadyMaxMs).toBeGreaterThan(0)
      expect(budget.inputFirstMs).toBeGreaterThan(0)
      expect(budget.inputP95Ms).toBeGreaterThan(0)
      expect(budget.inputCatastrophicMaxMs).toBeGreaterThan(budget.inputSlowSampleMs)
      expect(budget.inputMaxSlowSampleCount).toBe(1)
      expect(budget.loadingP95FrameMs).toBeLessThanOrEqual(60)
      expect(budget.loadingMaxFrameMs).toBeLessThanOrEqual(120)
      expect(budget.minFrameCount).toBeGreaterThanOrEqual(2)
    },
  )

  it('uses one warmup and five measured runs', () => {
    expect(PERFORMANCE_SAMPLE_PLAN).toEqual({ measuredRuns: 5, warmupRuns: 1 })
  })

  it('summarizes a multi-run duration distribution without adding settle time', () => {
    expect(summarizeDurations([10, 20, 30, 40, 50])).toEqual({
      coefficientOfVariation: 0.4714,
      firstMs: 10,
      maxMs: 50,
      meanMs: 30,
      medianMs: 30,
      minMs: 10,
      p95Ms: 50,
      sampleCount: 5,
      standardDeviationMs: 14.14,
    })
  })

  it('reports nullable measurement coverage alongside its distribution', () => {
    expect(summarizeOptionalMeasurements([100, null, 120, 110])).toEqual({
      availableSampleCount: 3,
      distribution: {
        coefficientOfVariation: 0.0742,
        max: 120,
        mean: 110,
        median: 110,
        min: 100,
        p95: 120,
        sampleCount: 3,
        standardDeviation: 8.16,
      },
      missingSampleCount: 1,
      totalSampleCount: 4,
    })
  })

  it('continues after a failed attempt until the requested successful samples are collected', async () => {
    const result = await collectPerformanceSamples({
      maxAttempts: 5,
      plan: { measuredRuns: 2, warmupRuns: 1 },
      runSample: async ({ attemptIndex, warmup }) => {
        if (attemptIndex === 1) throw new Error('transient input probe failure')
        return { attemptIndex, warmup }
      },
    })

    expect(result.samples).toEqual([
      { attemptIndex: 0, warmup: true },
      { attemptIndex: 2, warmup: false },
      { attemptIndex: 3, warmup: false },
    ])
    expect(result.failures).toMatchObject([
      { attemptIndex: 1, message: 'transient input probe failure', warmup: false },
    ])
    expect(result.attemptCount).toBe(4)
  })

  it('settles from observed inputs instead of assuming one event per marker character', () => {
    expect(inputProbeSettled({ inputCount: 1, pendingCount: 0, sampleCount: 1 })).toBe(true)
    expect(inputProbeSettled({ inputCount: 2, pendingCount: 1, sampleCount: 1 })).toBe(false)
    expect(inputProbeSettled({ inputCount: 0, pendingCount: 0, sampleCount: 0 })).toBe(false)
  })

  it('allows a rendered marker to bind a coalesced final input to the next paint', () => {
    expect(
      inputProbeCanFinalizeAfterMarkerPaint({
        inputCount: 27,
        markerApplied: true,
        pendingCount: 1,
        sampleCount: 26,
      }),
    ).toBe(true)
    expect(
      inputProbeCanFinalizeAfterMarkerPaint({
        inputCount: 27,
        markerApplied: false,
        pendingCount: 1,
        sampleCount: 26,
      }),
    ).toBe(false)
    expect(
      inputProbeCanFinalizeAfterMarkerPaint({
        inputCount: 27,
        markerApplied: true,
        pendingCount: 2,
        sampleCount: 26,
      }),
    ).toBe(false)
  })

  it('reports an observed input that never produced a DOM mutation', () => {
    expect(inputProbeHasMissingMutation({ inputCount: 1, pendingCount: 1, sampleCount: 0 })).toBe(
      true,
    )
    expect(inputProbeHasMissingMutation({ inputCount: 1, pendingCount: 0, sampleCount: 1 })).toBe(
      false,
    )
  })
})
