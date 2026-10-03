import { describe, expect, it } from 'vitest'
import { performanceBudgetForProject } from '@/../e2e/performance/performanceBudgets'
import {
  PERFORMANCE_SAMPLE_PLAN,
  inputProbeCanFinalizeAfterMarkerPaint,
  inputProbeHasMissingMutation,
  inputProbeSettled,
  summarizeDurations,
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

  it('uses one warmup and three measured runs', () => {
    expect(PERFORMANCE_SAMPLE_PLAN).toEqual({ measuredRuns: 3, warmupRuns: 1 })
  })

  it('summarizes first, p95, max, and sample count without adding settle time', () => {
    expect(summarizeDurations([12.345, 2, 8, 20])).toEqual({
      firstMs: 12.35,
      maxMs: 20,
      p95Ms: 20,
      sampleCount: 4,
    })
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
