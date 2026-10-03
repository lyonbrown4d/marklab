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
  inputFirstMs: number
  inputMaxMs: number
  inputP95Ms: number
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
  inputFirstMs: 500,
  inputMaxMs: 500,
  inputP95Ms: 250,
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
  inputFirstMs: 60,
  inputMaxMs: 100,
  inputP95Ms: 75,
  p95FrameMs: 80,
  windowOpenToReadyFirstMs: 6_500,
  windowOpenToReadyMaxMs: 7_500,
  windowOpenToReadyP95Ms: 7_000,
}

export const performanceBudgetForProject = (projectName: string) =>
  projectName === 'software-rendering' ? softwareRendering : nativeGpu
