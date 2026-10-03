export type LongAnimationFrameMetric = {
  blockingDurationMs: number
  durationMs: number
  renderStartMs: number
  startMs: number
  styleAndLayoutStartMs: number
}

export type LongAnimationFrameEntry = PerformanceEntry & {
  blockingDuration?: number
  renderStart?: number
  styleAndLayoutStart?: number
}
