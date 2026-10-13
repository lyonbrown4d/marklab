import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  alignWorkspaceSessionBackendRoot,
  createWorkspaceRestoreBackendBarrier,
  restoreDefaultWorkspace,
} from '@/app/workspaceRestoreBackend'

const mocks = vi.hoisted(() => ({
  desktop: true,
  flush: vi.fn(),
  setRoot: vi.fn(),
  setSingleFile: vi.fn(),
}))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => mocks.desktop }))
vi.mock('@/services/fsApi', () => ({
  fsApi: { setRoot: mocks.setRoot, setSingleFile: mocks.setSingleFile },
}))
vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: mocks.flush }))

describe('workspace restore backend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.desktop = true
    mocks.flush.mockResolvedValue(undefined)
    mocks.setRoot.mockResolvedValue(undefined)
    mocks.setSingleFile.mockResolvedValue(undefined)
  })

  it.each(['external', 'single'] as const)(
    'restores a %s root before loading',
    async (rootKind) => {
      const loadWorkspace = vi.fn(async () => undefined)
      expect(
        await restoreDefaultWorkspace({
          isCurrent: () => true,
          loadWorkspace,
          rootKind,
          rootPath: '/workspace',
        }),
      ).toEqual({ ok: true })
      expect(rootKind === 'single' ? mocks.setSingleFile : mocks.setRoot).toHaveBeenCalledWith(
        '/workspace',
      )
      expect(loadWorkspace).toHaveBeenCalledOnce()
    },
  )

  it('does not switch the backend for an internal root', async () => {
    const loadWorkspace = vi.fn(async () => undefined)
    await restoreDefaultWorkspace({
      isCurrent: () => true,
      loadWorkspace,
      rootKind: 'internal',
      rootPath: '/internal',
    })
    expect(mocks.setRoot).not.toHaveBeenCalled()
    expect(mocks.setSingleFile).not.toHaveBeenCalled()
    expect(loadWorkspace).toHaveBeenCalledOnce()
  })

  it.each([false, true])(
    'skips root restore when desktop=%s and no path is persisted',
    async (desktop) => {
      mocks.desktop = desktop
      const loadWorkspace = vi.fn(async () => undefined)
      await restoreDefaultWorkspace({
        isCurrent: () => true,
        loadWorkspace,
        rootKind: 'internal',
        rootPath: '',
      })
      expect(mocks.flush).not.toHaveBeenCalled()
      expect(loadWorkspace).toHaveBeenCalledOnce()
    },
  )

  it('preserves the current root when flushing unsaved edits fails', async () => {
    const error = new Error('save failed')
    mocks.flush.mockRejectedValueOnce(error)
    const loadWorkspace = vi.fn(async () => undefined)
    expect(
      await restoreDefaultWorkspace({
        isCurrent: () => true,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '/missing',
      }),
    ).toEqual({ error, failure: 'root', ok: false })
    expect(mocks.setRoot).not.toHaveBeenCalled()
    expect(loadWorkspace).not.toHaveBeenCalled()
  })

  it('does not restore or load a root superseded during the editor flush', async () => {
    const loadWorkspace = vi.fn(async () => undefined)
    await restoreDefaultWorkspace({
      isCurrent: () => false,
      loadWorkspace,
      rootKind: 'external',
      rootPath: '/old',
    })
    expect(mocks.setRoot).not.toHaveBeenCalled()
    expect(loadWorkspace).not.toHaveBeenCalled()
  })

  it('does not load a root superseded during the backend switch', async () => {
    const loadWorkspace = vi.fn(async () => undefined)
    const isCurrent = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(false)
    await restoreDefaultWorkspace({
      isCurrent,
      loadWorkspace,
      rootKind: 'external',
      rootPath: '/old',
    })
    expect(mocks.setRoot).toHaveBeenCalledOnce()
    expect(loadWorkspace).not.toHaveBeenCalled()
  })

  it('reports a session failure after a successful root switch', async () => {
    const error = new Error('tree failed')
    const loadWorkspace = vi.fn(async () => {
      throw error
    })
    expect(
      await restoreDefaultWorkspace({
        isCurrent: () => true,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    ).toEqual({ error, failure: 'session', ok: false })
  })

  it('aligns native-open roots including the internal workspace', async () => {
    await alignWorkspaceSessionBackendRoot({ rootKind: 'single', rootPath: '/file.md' })
    expect(mocks.setSingleFile).toHaveBeenCalledWith('/file.md')
    await alignWorkspaceSessionBackendRoot({ rootKind: 'external', rootPath: '/folder' })
    expect(mocks.setRoot).toHaveBeenCalledWith('/folder')
    await alignWorkspaceSessionBackendRoot({ rootKind: 'internal' })
    expect(mocks.setRoot).toHaveBeenLastCalledWith(null)
  })

  it('does not align incomplete seeds or seeds outside the desktop runtime', async () => {
    await alignWorkspaceSessionBackendRoot({})
    await alignWorkspaceSessionBackendRoot({ rootKind: 'single' })
    await alignWorkspaceSessionBackendRoot({ rootKind: 'external' })
    mocks.desktop = false
    await alignWorkspaceSessionBackendRoot({ rootKind: 'internal' })
    expect(mocks.setRoot).not.toHaveBeenCalled()
    expect(mocks.setSingleFile).not.toHaveBeenCalled()
  })

  it('propagates backend alignment failure', async () => {
    mocks.setRoot.mockRejectedValueOnce(new Error('missing'))
    await expect(
      alignWorkspaceSessionBackendRoot({ rootKind: 'external', rootPath: '/missing' }),
    ).rejects.toThrow('missing')
  })

  it('settles a backend barrier only once', async () => {
    const barrier = createWorkspaceRestoreBackendBarrier()
    expect(barrier.settled).toBe(false)
    barrier.settle()
    barrier.settle()
    await expect(barrier.promise).resolves.toBeUndefined()
    expect(barrier.settled).toBe(true)
  })
})
