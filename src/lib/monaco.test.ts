import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  configured: vi.fn(),
  loadWorker: vi.fn(),
  error: vi.fn(),
  loaded: vi.fn(),
  monaco: { editor: {}, languages: {}, css: {}, html: {}, json: {}, typescript: {} },
}))

vi.mock('@monaco-editor/react', () => ({ loader: { config: runtime.configured } }))
vi.mock('@/lib/monacoRuntime', () => {
  runtime.loaded()
  return runtime.monaco
})
vi.mock('@/lib/monacoWorkers', () => ({ loadMonacoWorker: runtime.loadWorker }))
vi.mock('@/services/rendererDiagnostics', () => ({ rendererDiagnostics: { error: runtime.error } }))

describe('configureMonaco', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    Reflect.deleteProperty(globalThis, 'MonacoEnvironment')
    Reflect.deleteProperty(globalThis, 'monaco')
  })

  it('shares initialization and configures the local API without starting workers', async () => {
    const { configureMonaco } = await import('@/lib/monaco')
    expect(runtime.loaded).not.toHaveBeenCalled()
    const first = configureMonaco()
    expect(configureMonaco()).toBe(first)
    const monaco = await first
    expect(runtime.configured).toHaveBeenCalledExactlyOnceWith({ monaco })
    expect(runtime.loadWorker).not.toHaveBeenCalled()
    expect(runtime.loaded).toHaveBeenCalledOnce()
    expect(monaco.typescript).toBe(runtime.monaco.typescript)
  })

  it('reports setup errors and permits a later retry', async () => {
    const { configureMonaco } = await import('@/lib/monaco')
    const error = new Error('Setup failed')
    runtime.configured.mockImplementationOnce(() => {
      throw error
    })
    await expect(configureMonaco()).rejects.toThrow('Setup failed')
    expect(runtime.error).toHaveBeenCalledWith('editor.monaco', 'runtime-load-failed', error)
    await expect(configureMonaco()).resolves.toBeDefined()
    expect(runtime.configured).toHaveBeenCalledTimes(2)
  })

  it('passes worker requests through and reports rejection without caching failed worker creation', async () => {
    const { configureMonaco } = await import('@/lib/monaco')
    await configureMonaco()
    const error = new Error('Worker failed')
    const worker = {} as Worker
    runtime.loadWorker.mockRejectedValueOnce(error).mockResolvedValueOnce(worker)
    const getWorker = globalThis.MonacoEnvironment?.getWorker
    await expect(getWorker?.('id', 'json')).rejects.toThrow('Worker failed')
    expect(runtime.error).toHaveBeenCalledWith('editor.monaco', 'worker-load-failed', error)
    await expect(getWorker?.('id', 'json')).resolves.toBe(worker)
    expect(runtime.loadWorker).toHaveBeenLastCalledWith('id', 'json')
  })
})
