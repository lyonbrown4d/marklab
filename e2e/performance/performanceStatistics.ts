export const PERFORMANCE_SAMPLE_PLAN = Object.freeze({ measuredRuns: 5, warmupRuns: 1 })

export type PerformanceSamplePlan = {
  measuredRuns: number
  warmupRuns: number
}

export type PerformanceSampleFailure = {
  attemptIndex: number
  message: string
  stack?: string
  warmup: boolean
}

export type MeasurementSummary = {
  coefficientOfVariation: number
  max: number
  mean: number
  median: number
  min: number
  p95: number
  sampleCount: number
  standardDeviation: number
}

export type DurationSummary = {
  coefficientOfVariation: number
  firstMs: number
  maxMs: number
  meanMs: number
  medianMs: number
  minMs: number
  p95Ms: number
  sampleCount: number
  standardDeviationMs: number
}

export const inputProbeSettled = ({
  inputCount,
  pendingCount,
  sampleCount,
}: {
  inputCount: number
  pendingCount: number
  sampleCount: number
}) => inputCount > 0 && pendingCount === 0 && sampleCount === inputCount

export const inputProbeCanFinalizeAfterMarkerPaint = ({
  inputCount,
  markerApplied,
  pendingCount,
  sampleCount,
}: {
  inputCount: number
  markerApplied: boolean
  pendingCount: number
  sampleCount: number
}) => markerApplied && pendingCount > 0 && sampleCount + pendingCount === inputCount

export const inputProbeHasMissingMutation = ({
  inputCount,
  pendingCount,
  sampleCount,
}: {
  inputCount: number
  pendingCount: number
  sampleCount: number
}) => inputCount > 0 && pendingCount > 0 && sampleCount + pendingCount === inputCount

const roundMeasurement = (value: number) => Number(value.toFixed(2))
const roundRatio = (value: number) => Number(value.toFixed(4))

export const summarizeMeasurements = (values: number[]): MeasurementSummary => {
  if (values.length === 0) throw new Error('At least one measurement sample is required')
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error('Measurement samples must be finite numbers')
  }

  const sorted = [...values].sort((left, right) => left - right)
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const medianIndex = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0
      ? ((sorted[medianIndex - 1] ?? 0) + (sorted[medianIndex] ?? 0)) / 2
      : (sorted[medianIndex] ?? 0)
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
  const standardDeviation = Math.sqrt(variance)
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  return {
    coefficientOfVariation: mean === 0 ? 0 : roundRatio(standardDeviation / Math.abs(mean)),
    max: roundMeasurement(sorted.at(-1) ?? 0),
    mean: roundMeasurement(mean),
    median: roundMeasurement(median),
    min: roundMeasurement(sorted[0] ?? 0),
    p95: roundMeasurement(sorted[p95Index] ?? 0),
    sampleCount: values.length,
    standardDeviation: roundMeasurement(standardDeviation),
  }
}

export const summarizeOptionalMeasurements = (values: Array<number | null>) => {
  const available = values.filter((value): value is number => value !== null)
  return {
    availableSampleCount: available.length,
    distribution: available.length > 0 ? summarizeMeasurements(available) : null,
    missingSampleCount: values.length - available.length,
    totalSampleCount: values.length,
  }
}

export const summarizeDurations = (values: number[]): DurationSummary => {
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Duration samples must be finite, non-negative numbers')
  }
  const distribution = summarizeMeasurements(values)
  return {
    coefficientOfVariation: distribution.coefficientOfVariation,
    firstMs: roundMeasurement(values[0] ?? 0),
    maxMs: distribution.max,
    meanMs: distribution.mean,
    medianMs: distribution.median,
    minMs: distribution.min,
    p95Ms: distribution.p95,
    sampleCount: distribution.sampleCount,
    standardDeviationMs: distribution.standardDeviation,
  }
}

export const collectPerformanceSamples = async <Sample>({
  maxAttempts,
  plan,
  runSample,
}: {
  maxAttempts: number
  plan: PerformanceSamplePlan
  runSample: (attempt: { attemptIndex: number; warmup: boolean }) => Promise<Sample>
}) => {
  const failures: PerformanceSampleFailure[] = []
  const samples: Sample[] = []
  let measuredCount = 0
  let warmupCount = 0
  let attemptIndex = 0
  while (
    attemptIndex < maxAttempts &&
    (warmupCount < plan.warmupRuns || measuredCount < plan.measuredRuns)
  ) {
    const warmup = warmupCount < plan.warmupRuns
    try {
      samples.push(await runSample({ attemptIndex, warmup }))
      if (warmup) warmupCount += 1
      else measuredCount += 1
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      failures.push({
        attemptIndex,
        message: normalized.message,
        stack: normalized.stack,
        warmup,
      })
    }
    attemptIndex += 1
  }
  return { attemptCount: attemptIndex, failures, samples }
}
