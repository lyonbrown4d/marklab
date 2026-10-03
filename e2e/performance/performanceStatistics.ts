export const PERFORMANCE_SAMPLE_PLAN = Object.freeze({ measuredRuns: 3, warmupRuns: 1 })

export type DurationSummary = {
  firstMs: number
  maxMs: number
  p95Ms: number
  sampleCount: number
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

const roundMilliseconds = (value: number) => Number(value.toFixed(2))

export const summarizeDurations = (values: number[]): DurationSummary => {
  if (values.length === 0) throw new Error('At least one duration sample is required')
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Duration samples must be finite, non-negative numbers')
  }

  const sorted = [...values].sort((left, right) => left - right)
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  return {
    firstMs: roundMilliseconds(values[0]),
    maxMs: roundMilliseconds(sorted.at(-1) ?? 0),
    p95Ms: roundMilliseconds(sorted[p95Index] ?? 0),
    sampleCount: values.length,
  }
}
