export type EditorPerformanceBudget = {
  activationMs: number
  loadMs: number
  maxLayoutShift: number
  maxFrameMs: number
  maxVisibleSurfaces: number
  p95FrameMs: number
  typingMs: number
}

const nativeGpu: EditorPerformanceBudget = {
  activationMs: 1_000,
  loadMs: 30_000,
  maxLayoutShift: 0.1,
  maxFrameMs: 500,
  maxVisibleSurfaces: 8,
  p95FrameMs: 50,
  typingMs: 1_000,
}

const softwareRendering: EditorPerformanceBudget = {
  activationMs: 2_000,
  loadMs: 45_000,
  maxLayoutShift: 0.25,
  maxFrameMs: 1_000,
  maxVisibleSurfaces: 12,
  p95FrameMs: 100,
  typingMs: 2_000,
}

export const performanceBudgetForProject = (projectName: string) =>
  projectName === 'software-rendering' ? softwareRendering : nativeGpu
