import { afterEach, expect, it, vi } from 'vitest'

const { loadGraphPage, preloadFailure, warmup } = vi.hoisted(() => ({
  loadGraphPage: vi.fn(),
  preloadFailure: vi.fn(),
  warmup: vi.fn(),
}))

vi.mock('@/pages/WorkspaceGraphPage', () => {
  loadGraphPage()
  return { default: () => null }
})

vi.mock('@/logic/graphLayoutWorkerClient', () => ({
  graphLayoutWorkerClient: { warmup },
}))

vi.mock('@/services/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: preloadFailure },
}))

afterEach(() => {
  vi.clearAllMocks()
})

it('preloads the graph page once without creating a layout worker', async () => {
  const { preloadGraphView } = await import('@/lib/preloadFeatures')

  preloadGraphView()
  preloadGraphView()
  await vi.dynamicImportSettled()

  expect(loadGraphPage).toHaveBeenCalledOnce()
  expect(warmup).not.toHaveBeenCalled()
  expect(preloadFailure).not.toHaveBeenCalled()
})
