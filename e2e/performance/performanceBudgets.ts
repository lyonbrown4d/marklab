export type EditorPerformanceBudget = {
  focusMs: number
  loadMs: number
  maxLayoutShift: number
  maxFrameMs: number
  maxVisibleSurfaces: number
  p95FrameMs: number
  typingMs: number
}

const nativeGpu: EditorPerformanceBudget = {
  focusMs: 1_000,
  loadMs: 30_000,
  maxLayoutShift: 0.1,
  maxFrameMs: 500,
  maxVisibleSurfaces: 1,
  p95FrameMs: 50,
  typingMs: 1_000,
}

const softwareRendering: EditorPerformanceBudget = {
  focusMs: 2_000,
  loadMs: 45_000,
  maxLayoutShift: 0.25,
  maxFrameMs: 1_000,
  maxVisibleSurfaces: 1,
  p95FrameMs: 100,
  typingMs: 2_000,
}

export const performanceBudgetForProject = (projectName: string) =>
  projectName === 'software-rendering' ? softwareRendering : nativeGpu
