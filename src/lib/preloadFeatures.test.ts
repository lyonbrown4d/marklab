import { afterEach, expect, it, vi } from 'vitest'

const { loadGraphPage, preloadFailure } = vi.hoisted(() => ({
  loadGraphPage: vi.fn(),
  preloadFailure: vi.fn(),
}))

vi.mock('@/pages/WorkspaceGraphPage', () => {
  loadGraphPage()
  return { default: () => null }
})

vi.mock('@/services/rendererDiagnostics', () => ({
  rendererDiagnostics: { warn: preloadFailure },
}))

afterEach(() => {
  vi.clearAllMocks()
})

it('preloads the graph page once without constructing a graph renderer', async () => {
  const { preloadGraphView } = await import('@/lib/preloadFeatures')

  preloadGraphView()
  preloadGraphView()
  await vi.dynamicImportSettled()

  expect(loadGraphPage).toHaveBeenCalledOnce()
  expect(preloadFailure).not.toHaveBeenCalled()
})
