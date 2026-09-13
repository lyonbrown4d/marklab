import { EventEmitter } from 'node:events'
import type { App, BrowserWindow, Shell } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWindowWorkspaceBinding } from '@electron/services/workspace/windowWorkspaceBinding.js'

const state = vi.hoisted(() => ({
  dirty: true,
  flush: vi.fn<() => Promise<void>>(),
}))
vi.mock('@electron/services/workspace/workspaceService.js', () => ({
  WorkspaceService: class {
    flushBuffers = state.flush
    rootInfo = () => ({ kind: 'internal', path: '/workspace' })
    hasDirtyBuffers = () => state.dirty
    getBackgroundTasks = () => []
    onBufferStatus = () => vi.fn()
    onSnapshotChanged = () => vi.fn()
    onBackgroundTasksChanged = () => vi.fn()
    setAutoFlushMutationRunner = vi.fn()
    setRoot = vi.fn()
    setSingleFile = vi.fn()
    readFile = vi.fn()
    updateBuffer = vi.fn()
    writeFile = vi.fn()
    createFile = vi.fn()
    createDir = vi.fn()
    renamePath = vi.fn()
    movePath = vi.fn()
    deletePath = vi.fn()
    importMarkdownAsset = vi.fn()
    importMarkdownAssetBase64 = vi.fn()
    dispose = vi.fn()
  },
}))
vi.mock('@electron/services/nativeWindowDocument.js', () => ({
  applyAppRecentDocument: vi.fn(),
  applyWindowDocumentStatus: vi.fn(),
  createNativeRecentDocumentState: () => ({}),
}))
vi.mock('@electron/services/nativeWindowStatus.js', () => ({
  applyWindowTaskAttention: vi.fn(),
  applyWindowTaskProgress: vi.fn(),
  clearWindowTaskAttention: vi.fn(),
  createNativeTaskAttentionState: () => ({}),
}))

const createHarness = () => {
  const window = Object.assign(new EventEmitter(), {
    id: 42,
    isDestroyed: () => false,
    setProgressBar: vi.fn(),
  })
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  const binding = createWindowWorkspaceBinding({
    app: {} as App,
    logger,
    onReadyToFinalize: vi.fn(),
    onTaskStateChanged: vi.fn(),
    sessionKey: 'workspace-window-42',
    shell: {} as Shell,
    window: window as unknown as BrowserWindow,
  })
  return { binding, logger, window }
}

beforeEach(() => {
  state.dirty = true
  state.flush.mockReset().mockResolvedValue(undefined)
})

describe('workspace window blur persistence', () => {
  it('keeps synchronous writes synchronous and rejects them while frozen', async () => {
    const { binding } = createHarness()
    expect(binding.service.writeFile({ path: 'note.md', content: '# Note' })).toBeUndefined()
    await binding.mutationGate.freezeAndDrain('quit')
    expect(() => binding.service.writeFile({ path: 'note.md', content: '# Changed' })).toThrow(
      'Cannot write workspace file while workspace mutations are frozen for quit',
    )
    binding.dispose()
  })

  it('flushes dirty buffers when its native window loses focus', async () => {
    const { binding, window } = createHarness()
    window.emit('blur')
    expect(state.flush).toHaveBeenCalledTimes(1)
    await binding.mutationGate.freezeAndDrain('quit')
    binding.dispose()
  })

  it('does not flush a clean workspace', () => {
    state.dirty = false
    const { binding, window } = createHarness()
    window.emit('blur')
    expect(state.flush).not.toHaveBeenCalled()
    binding.dispose()
  })

  it('leaves frozen saves to shutdown without weakening the public mutation gate', async () => {
    const { binding, logger, window } = createHarness()
    await binding.mutationGate.freezeAndDrain('quit')
    window.emit('blur')
    expect(state.flush).not.toHaveBeenCalled()
    await expect(binding.service.flushBuffers()).rejects.toMatchObject({
      code: 'workspace_mutation_frozen',
    })
    await expect(binding.flushForShutdown()).resolves.toBeUndefined()
    expect(state.flush).toHaveBeenCalledTimes(1)
    expect(binding.mutationGate.reason).toBe('quit')
    expect(logger.error).not.toHaveBeenCalled()
    binding.dispose()
  })

  it('makes shutdown wait for an already admitted blur save', async () => {
    let finishSave!: () => void
    const pending = new Promise<void>((resolve) => {
      finishSave = resolve
    })
    state.flush.mockReturnValue(pending)
    const { binding, window } = createHarness()
    window.emit('blur')
    let drained = false
    const drain = binding.mutationGate.freezeAndDrain('quit').then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)
    finishSave()
    await drain
    expect(drained).toBe(true)
    binding.dispose()
  })

  it('reports real save failures and preserves them for shutdown retry', async () => {
    const error = new Error('ENOSPC: disk full')
    state.flush.mockRejectedValue(error)
    const { binding, logger, window } = createHarness()
    window.emit('blur')
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        'workspace buffers could not be saved on window blur',
        { error, sessionKey: 'workspace-window-42', windowId: 42 },
      )
    })
    expect(binding.service.hasDirtyBuffers()).toBe(true)
    await binding.mutationGate.freezeAndDrain('quit')
    await expect(binding.flushForShutdown()).rejects.toBe(error)
    binding.dispose()
  })

  it('stops native blur saves after detach', () => {
    const { binding, window } = createHarness()
    binding.detach()
    window.emit('blur')
    expect(state.flush).not.toHaveBeenCalled()
    expect(window.listenerCount('blur')).toBe(0)
    binding.dispose()
  })
})
