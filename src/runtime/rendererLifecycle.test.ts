import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  diagnosticsError: vi.fn(),
  tauri: false,
  listen: vi.fn(),
  signalAppReady: vi.fn(async () => undefined),
}))

vi.mock('@/runtime/environment', () => ({ isTauriRuntime: () => mocks.tauri }))
vi.mock('@/runtime/tauri/window', () => ({ isTauriWindowVisible: async () => false }))

vi.mock('@/runtime/events', () => ({ listen: mocks.listen }))
vi.mock('@/runtime/app', () => ({ signalAppReady: mocks.signalAppReady }))
vi.mock('@/services/rendererDiagnostics', () => ({
  rendererDiagnostics: { error: mocks.diagnosticsError },
}))

describe('renderer lifecycle initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tauri = false
    vi.resetModules()
  })

  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('waits for the initial Markdown surface to finish hydration before becoming interactive', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    const editor = document.createElement('div')
    editor.dataset.state = 'loading'
    editor.dataset.testid = 'markdown-editor'
    document.body.append(editor)
    const { waitForWorkspaceInteractivePaint } = await import('@/runtime/rendererLifecycle')
    let resolved = false

    const pending = waitForWorkspaceInteractivePaint().then(() => {
      resolved = true
    })
    await Promise.resolve()
    await Promise.resolve()
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))

    expect(resolved).toBe(false)

    editor.dataset.state = 'ready'
    await pending
    expect(resolved).toBe(true)
  })

  it('yields hidden native frames while still waiting for the initial editor DOM to become ready', async () => {
    mocks.tauri = true
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    const editor = document.createElement('div')
    editor.dataset.state = 'loading'
    editor.dataset.testid = 'markdown-editor'
    document.body.append(editor)
    const { waitForWorkspaceInteractivePaint } = await import('@/runtime/rendererLifecycle')
    let resolved = false
    const pending = waitForWorkspaceInteractivePaint().then(() => {
      resolved = true
    })
    await vi.advanceTimersByTimeAsync(100)
    expect(resolved).toBe(false)
    editor.dataset.state = 'ready'
    await vi.advanceTimersByTimeAsync(50)
    await pending
    expect(resolved).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
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
  it('shares bridge installation and replays only the unconsumed latest workspace seed', async () => {
    let receive: (event: { payload: { state: { rootPath: string } } }) => void = () => undefined
    mocks.listen.mockImplementation(async (_name, handler) => {
      receive = handler
      return vi.fn()
    })
    const lifecycle = await import('@/runtime/rendererLifecycle')
    const first = lifecycle.installWorkspaceSessionSeedBridge()
    expect(lifecycle.installWorkspaceSessionSeedBridge()).toBe(first)
    await first
    expect(mocks.listen).toHaveBeenCalledOnce()
    const old = { state: { rootPath: '/old' } }
    const current = { state: { rootPath: '/current' } }
    receive({ payload: old })
    receive({ payload: current })
    const listener = vi.fn()
    const stop = lifecycle.onWorkspaceSessionSeed(listener)
    expect(listener).toHaveBeenCalledExactlyOnceWith(current)
    lifecycle.consumeWorkspaceSessionSeed(old)
    expect(lifecycle.hasPendingWorkspaceSessionSeed()).toBe(true)
    lifecycle.consumeWorkspaceSessionSeed(current)
    expect(lifecycle.hasPendingWorkspaceSessionSeed()).toBe(false)
    const late = vi.fn()
    const stopLate = lifecycle.onWorkspaceSessionSeed(late)
    expect(late).not.toHaveBeenCalled()
    stop()
    receive({ payload: old })
    expect(listener).toHaveBeenCalledOnce()
    expect(late).toHaveBeenCalledExactlyOnceWith(old)
    stopLate()
  })

  it('retries a failed bridge rather than caching the rejection', async () => {
    mocks.listen
      .mockRejectedValueOnce(new Error('Permission unavailable'))
      .mockResolvedValue(vi.fn())
    const lifecycle = await import('@/runtime/rendererLifecycle')
    await expect(lifecycle.installWorkspaceSessionSeedBridge()).rejects.toThrow(
      'Permission unavailable',
    )
    await lifecycle.installWorkspaceSessionSeedBridge()
    expect(mocks.listen).toHaveBeenCalledTimes(2)
  })

  it('notifies interactive subscribers only after native readiness succeeds', async () => {
    const lifecycle = await import('@/runtime/rendererLifecycle')
    const listener = vi.fn()
    const stop = lifecycle.onRendererInteractive(listener)
    mocks.signalAppReady.mockRejectedValueOnce(new Error('Stale attempt'))
    await expect(lifecycle.signalRendererReady({ phase: 'workspace-interactive' })).rejects.toThrow(
      'Stale attempt',
    )
    expect(listener).not.toHaveBeenCalled()
    await lifecycle.signalRendererReady({ phase: 'shell' })
    expect(listener).not.toHaveBeenCalled()
    await lifecycle.signalRendererReady({ phase: 'workspace-interactive' })
    expect(listener).toHaveBeenCalledOnce()
    stop()
    lifecycle.notifyRendererInteractive()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('contains unprintable startup failures and reports an actionable readiness error', async () => {
    mocks.listen.mockRejectedValueOnce({
      toString: () => {
        throw new Error('Cannot stringify')
      },
    })
    const lifecycle = await import('@/runtime/rendererLifecycle')
    await lifecycle.initializeRendererLifecycle()
    expect(mocks.signalAppReady).toHaveBeenCalledWith({
      phase: 'workspace-error',
      error: 'Workspace seed bridge installation failed.',
    })
  })

  it('keeps the existing bounded loading fallback when an editor never leaves loading', async () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    const editor = document.createElement('div')
    editor.dataset.editorLoading = 'true'
    document.body.append(editor)
    const lifecycle = await import('@/runtime/rendererLifecycle')
    const pending = lifecycle.waitForWorkspaceInteractivePaint()
    await vi.advanceTimersByTimeAsync(30_000)
    await pending
    expect(editor.dataset.editorLoading).toBe('true')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('recognizes the explicit standby query without assuming a browser global', async () => {
    const lifecycle = await import('@/runtime/rendererLifecycle')
    const original = window
    vi.stubGlobal('window', { location: { search: '?marklab-standby=1' } })
    expect(lifecycle.isStandbyRenderer()).toBe(true)
    vi.stubGlobal('window', { location: { search: '?marklab-standby=0' } })
    expect(lifecycle.isStandbyRenderer()).toBe(false)
    vi.stubGlobal('window', undefined)
    expect(lifecycle.isStandbyRenderer()).toBe(false)
    vi.stubGlobal('window', original)
  })
})
