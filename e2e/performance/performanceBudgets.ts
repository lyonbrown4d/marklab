export type EditorPerformanceBudget = {
  focusMs: number
  maxChunkCount: number
  maxDomNodeCount: number
  maxLayoutShift: number
  maxLongTaskCount: number
  maxLongTaskDurationMs: number
  maxFrameMs: number
  maxRenderedElementCount: number
  maxVisibleSurfaces: number
  minFrameCount: number
  minChunkCount: number
  inputCatastrophicMaxMs: number
  inputFirstMs: number
  inputMaxSlowSampleCount: number
  inputP95Ms: number
  inputSlowSampleMs: number
  loadingMaxFrameMs: number
  loadingMaxLongTaskCount: number
  loadingMaxLongTaskDurationMs: number
  loadingMinFrameCount: number
  loadingP95FrameMs: number
  p95FrameMs: number
  windowOpenToReadyFirstMs: number
  windowOpenToReadyMaxMs: number
  windowOpenToReadyP95Ms: number
}

const nativeGpu: EditorPerformanceBudget = {
  focusMs: 1_000,
  maxChunkCount: 200,
  maxDomNodeCount: 120_000,
  maxLayoutShift: 0.1,
  maxLongTaskCount: 8,
  maxLongTaskDurationMs: 500,
  maxFrameMs: 500,
  maxRenderedElementCount: 35_000,
  maxVisibleSurfaces: 1,
  minFrameCount: 12,
  minChunkCount: 2,
  inputCatastrophicMaxMs: 750,
  inputFirstMs: 500,
  inputMaxSlowSampleCount: 1,
  inputP95Ms: 250,
  inputSlowSampleMs: 500,
  loadingMaxFrameMs: 120,
  loadingMaxLongTaskCount: 3,
  loadingMaxLongTaskDurationMs: 500,
  loadingMinFrameCount: 4,
  loadingP95FrameMs: 50,
  p95FrameMs: 50,
  windowOpenToReadyFirstMs: 30_000,
  windowOpenToReadyMaxMs: 30_000,
  windowOpenToReadyP95Ms: 30_000,
}

const softwareRendering: EditorPerformanceBudget = {
  focusMs: 2_000,
  maxChunkCount: 200,
  maxDomNodeCount: 120_000,
  maxLayoutShift: 0.25,
  maxLongTaskCount: 3,
  maxLongTaskDurationMs: 1_000,
  maxFrameMs: 500,
  maxRenderedElementCount: 35_000,
  maxVisibleSurfaces: 1,
  minFrameCount: 12,
  minChunkCount: 2,
  // One noisy sample may exceed 100 ms; repeated stalls or a single 175 ms stall fail.
  inputCatastrophicMaxMs: 175,
  inputFirstMs: 60,
  inputMaxSlowSampleCount: 1,
  inputP95Ms: 75,
  inputSlowSampleMs: 100,
  loadingMaxFrameMs: 120,
  loadingMaxLongTaskCount: 3,
  loadingMaxLongTaskDurationMs: 500,
  loadingMinFrameCount: 4,
  loadingP95FrameMs: 60,
  p95FrameMs: 80,
  windowOpenToReadyFirstMs: 6_500,
  windowOpenToReadyMaxMs: 7_500,
  windowOpenToReadyP95Ms: 7_000,
}

export const performanceBudgetForProject = (projectName: string) =>
  projectName === 'software-rendering' ? softwareRendering : nativeGpu
