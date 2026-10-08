import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  diagnosticsError: vi.fn(),
  listen: vi.fn(),
  signalAppReady: vi.fn(async () => undefined),
}))

vi.mock('@/runtime/events', () => ({ listen: mocks.listen }))
vi.mock('@/runtime/app', () => ({ signalAppReady: mocks.signalAppReady }))
vi.mock('@/services/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: mocks.diagnosticsError },
}))

describe('renderer lifecycle initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('reports a seed bridge installation failure through diagnostics and workspace readiness', async () => {
    const error = new Error('seed listener unavailable')
    mocks.listen.mockRejectedValueOnce(error)
    const { initializeRendererLifecycle } = await import('@/runtime/rendererLifecycle')

    await initializeRendererLifecycle()

    expect(mocks.diagnosticsError).toHaveBeenCalledWith(
      'app.lifecycle',
      'workspace-seed-bridge-install-failed',
      error,
    )
    expect(mocks.signalAppReady).toHaveBeenCalledWith({
      error: 'seed listener unavailable',
      phase: 'workspace-error',
    })
  })

  it('does not report a workspace error when the seed bridge installs', async () => {
    mocks.listen.mockResolvedValueOnce(() => undefined)
    const { initializeRendererLifecycle } = await import('@/runtime/rendererLifecycle')

    await initializeRendererLifecycle()

    expect(mocks.diagnosticsError).not.toHaveBeenCalled()
    expect(mocks.signalAppReady).not.toHaveBeenCalled()
  })

  it('keeps a readiness reporting failure contained and diagnostic', async () => {
    const installError = new Error('seed listener unavailable')
    const reportError = new Error('readiness IPC unavailable')
    mocks.listen.mockRejectedValueOnce(installError)
    mocks.signalAppReady.mockRejectedValueOnce(reportError)
    const { initializeRendererLifecycle } = await import('@/runtime/rendererLifecycle')

    await expect(initializeRendererLifecycle()).resolves.toBeUndefined()

    expect(mocks.diagnosticsError).toHaveBeenLastCalledWith(
      'app.lifecycle',
      'workspace-seed-bridge-failure-report-failed',
      reportError,
    )
  })
})
