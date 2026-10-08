import { EventEmitter } from 'node:events'
import type { App, BrowserWindow, Shell } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import { createWindowWorkspaceBinding } from '@electron/services/workspace/windowWorkspaceBinding'
import { flushWindowWorkspaceBindingForClose } from '@electron/services/workspace/windowWorkspaceClose'
import { activateWorkspaceWindowState } from '@electron/windowStateRestore'

const state = vi.hoisted(() => ({
  constructorArgs: [] as unknown[][],
  dirty: true,
  flush: vi.fn<() => Promise<void>>(),
  snapshotListener: null as
    ((snapshot: { root: { kind: 'external'; path: string } }) => void) | null,
}))
vi.mock('@electron/services/workspace/workspaceService', () => ({
  WorkspaceService: class {
    constructor(...args: unknown[]) {
      state.constructorArgs.push(args)
    }
    flushBuffers = state.flush
    bufferMutationEpoch = () => 1
    rootInfo = () => ({ kind: 'internal', path: '/workspace' })
    hasDirtyBuffers = () => state.dirty
    getBackgroundTasks = () => []
    onBufferStatus = () => vi.fn()
    onSnapshotChanged = (
      listener: (snapshot: { root: { kind: 'external'; path: string } }) => void,
    ) => {
      state.snapshotListener = listener
      return vi.fn()
    }
    onTreeChanged = () => vi.fn()
    onBackgroundTasksChanged = () => vi.fn()
    setAutoFlushMutationRunner = vi.fn()
    setRoot = vi.fn(async ({ path }: { path: string }) => ({
      kind: 'external' as const,
      path,
    }))
    setSingleFile = vi.fn(async ({ path }: { path: string }) => ({
      kind: 'single' as const,
      path,
    }))
    readFile = vi.fn()
    updateBuffer = vi.fn()
    writeFile = vi.fn()
    createFile = vi.fn()
    createDir = vi.fn()
    renamePath = vi.fn()
    movePath = vi.fn()
    deletePath = vi.fn()
    importMarkdownAsset = vi.fn()
    importMarkdownAssetBytes = vi.fn()
    dispose = vi.fn()
  },
}))
vi.mock('@electron/services/nativeWindowDocument', () => ({
  applyAppRecentDocument: vi.fn(),
  applyWindowDocumentStatus: vi.fn(),
  createNativeRecentDocumentState: () => ({}),
}))
vi.mock('@electron/services/nativeWindowStatus', () => ({
  applyWindowTaskAttention: vi.fn(),
  applyWindowTaskProgress: vi.fn(),
  clearWindowTaskAttention: vi.fn(),
  createNativeTaskAttentionState: () => ({}),
}))
vi.mock('@electron/windowStateRestore', () => ({
  activateWorkspaceWindowState: vi.fn(),
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
  const localHistoryService: LocalHistoryServiceContract = {
    capture: vi.fn(),
    clear: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
    read: vi.fn(),
    restore: vi.fn(),
  }
  const binding = createWindowWorkspaceBinding({
    app: {} as App,
    localHistoryService,
    logger,
    onReadyToFinalize: vi.fn(),
    onTaskStateChanged: vi.fn(),
    sessionKey: 'workspace-window-42',
    shell: {} as Shell,
    window: window as unknown as BrowserWindow,
  })
  return { binding, localHistoryService, logger, window }
}

beforeEach(() => {
  state.constructorArgs.length = 0
  state.dirty = true
  state.flush.mockReset().mockResolvedValue(undefined)
  state.snapshotListener = null
  vi.mocked(activateWorkspaceWindowState).mockReset()
})

describe('workspace window blur persistence', () => {
  it('switches native window state as soon as a root mutation succeeds', async () => {
    const { binding, logger, window } = createHarness()
    const root = { kind: 'external' as const, path: 'D:\\wiki' }

    await binding.service.setRoot({ path: root.path })

    expect(activateWorkspaceWindowState).toHaveBeenCalledWith(window, root, logger)
    binding.dispose()
  })

  it('switches native window state when the workspace root changes', () => {
    const { binding, logger, window } = createHarness()
    const root = { kind: 'external' as const, path: 'D:\\wiki' }

    state.snapshotListener?.({ root })

    expect(activateWorkspaceWindowState).toHaveBeenCalledWith(window, root, logger)
    binding.dispose()
  })

  it('injects shared local history into distinct per-window workspace services', () => {
    const first = createHarness()
    const second = createHarness()

    expect(first.binding.service).not.toBe(second.binding.service)
    expect(first.binding.mutationGate).not.toBe(second.binding.mutationGate)
    expect(state.constructorArgs[0]).toContain(first.localHistoryService)
    expect(state.constructorArgs[1]).toContain(second.localHistoryService)

    first.binding.dispose()
    second.binding.dispose()
  })

  it('freezes and flushes only the binding being closed', async () => {
    state.flush.mockImplementation(async () => {
      state.dirty = false
    })
    const closing = createHarness().binding
    const other = createHarness().binding

    await flushWindowWorkspaceBindingForClose(closing)

    expect(state.flush).toHaveBeenCalledOnce()
    expect(closing.mutationGate.reason).toBeNull()
    expect(other.mutationGate.reason).toBeNull()
    other.service.writeFile({ path: 'other.md', content: 'still writable' })
    closing.dispose()
    other.dispose()
  })

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
