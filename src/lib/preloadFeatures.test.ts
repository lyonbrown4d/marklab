import { afterEach, expect, it, vi } from 'vitest'

const { loadGraphPage, preloadFailure, layout } = vi.hoisted(() => ({
  loadGraphPage: vi.fn(),
  preloadFailure: vi.fn(),
  layout: vi.fn(),
}))

vi.mock('@/pages/WorkspaceGraphPage', () => {
  loadGraphPage()
  return { default: () => null }
})

vi.mock('@/services/graphComputeApi', () => ({
  graphComputeApi: { layout },
}))

vi.mock('@/services/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: preloadFailure },
}))

afterEach(() => {
  vi.clearAllMocks()
})

it('preloads the graph page once without starting native layout', async () => {
  const { preloadGraphView } = await import('@/lib/preloadFeatures')

  preloadGraphView()
  preloadGraphView()
  await vi.dynamicImportSettled()

  expect(loadGraphPage).toHaveBeenCalledOnce()
  expect(layout).not.toHaveBeenCalled()
  expect(preloadFailure).not.toHaveBeenCalled()
})
