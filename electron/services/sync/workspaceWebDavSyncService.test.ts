import { describe, expect, it, vi } from 'vitest'

import type { WebDavSyncEngineOptions } from '@electron/services/sync/webdavSync/engine'
import { WorkspaceWebDavSyncService } from '@electron/services/sync/workspaceWebDavSyncService'
import type { WorkspaceSyncChannels } from '@/types/workspaceSync'

const emptyResult = {
  changedPaths: [],
  conflicts: [],
  skipped: [],
  uploaded: 0,
  downloaded: 0,
  deleted: 0,
  retries: 0,
}

describe('WorkspaceWebDavSyncService', () => {
  it('resolves backend-only configuration and wires the active workspace boundaries', async () => {
    const fixture = createFixture()
    let engineOptions: WebDavSyncEngineOptions | undefined
    fixture.dependencies.createEngine = vi.fn((options) => {
      engineOptions = options
      return {
        sync: vi.fn(async (root, runOptions) => {
          await options.flushWorkspace(root, 'webdav-sync', new AbortController().signal)
          await options.mutationBoundary({
            root,
            relativePaths: ['note.md'],
            work: async () => undefined,
          })
          await options.invalidateWorkspace(root, ['note.md'])
          runOptions?.onProgress?.({ stage: 'completed', completed: 1, total: 1 })
          return emptyResult
        }),
      }
    })
    const service = new WorkspaceWebDavSyncService(fixture.dependencies as never)
    const progress = vi.fn()

    await expect(
      service.sync(fixture.workspace as never, { onProgress: progress }),
    ).resolves.toEqual(emptyResult)

    expect(fixture.dependencies.createRemoteClient).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dav-main' }),
      'secret',
    )
    expect(fixture.dependencies.createRemoteStore).toHaveBeenCalledWith(
      expect.anything(),
      '/documents',
    )
    expect(engineOptions?.deviceId).toBe('device-1')
    expect(fixture.workspace.flushBuffers).toHaveBeenCalledOnce()
    expect(fixture.workspace.runExternalWorkspaceMutation).not.toHaveBeenCalled()
    expect(fixture.workspace.runExternalPathMutation).toHaveBeenCalledWith(
      ['note.md'],
      expect.any(Function),
    )
    expect(fixture.workspace.invalidateExternalPaths).toHaveBeenCalledWith(['note.md'])
    expect(progress).toHaveBeenCalledWith({ stage: 'completed', completed: 1, total: 1 })
  })

  it('fails before network access when the workspace has no WebDAV binding', async () => {
    const fixture = createFixture()
    fixture.dependencies.configStore.getChannels.mockResolvedValueOnce({
      webdav: null,
    })

    await expect(fixture.service.sync(fixture.workspace as never)).rejects.toThrow('not configured')
    expect(fixture.dependencies.createRemoteClient).not.toHaveBeenCalled()
  })

  it('tests a stored profile without returning its password', async () => {
    const fixture = createFixture()
    const testConnection = vi.fn(async () => ({ ok: true as const }))
    fixture.dependencies.createRemoteClient.mockReturnValueOnce({ testConnection })

    await expect(fixture.service.testConnection('dav-main')).resolves.toEqual({ ok: true })
    expect(testConnection).toHaveBeenCalledOnce()
  })

  it('rejects before flushing when the workspace changes during sync setup', async () => {
    const fixture = createFixture()
    fixture.dependencies.createRemoteClient.mockImplementationOnce(() => {
      fixture.workspace.rootInfo.mockReturnValue({ kind: 'external', path: 'D:/other' })
      return { testConnection: vi.fn() }
    })

    await expect(fixture.service.sync(fixture.workspace as never)).rejects.toThrow(
      'Workspace sync root changed',
    )

    expect(fixture.workspace.flushBuffers).not.toHaveBeenCalled()
    expect(fixture.dependencies.createEngine).not.toHaveBeenCalled()
  })

  it('does not apply a local mutation after the workspace changes', async () => {
    const fixture = createFixture()
    fixture.dependencies.createEngine = vi.fn((options: WebDavSyncEngineOptions) => ({
      sync: vi.fn(async (root: string) => {
        fixture.workspace.rootInfo.mockReturnValue({ kind: 'external', path: 'D:/other' })
        await options.mutationBoundary({
          root,
          relativePaths: ['note.md'],
          work: async () => undefined,
        })
        return emptyResult
      }),
    }))
    const service = new WorkspaceWebDavSyncService(fixture.dependencies as never)

    await expect(service.sync(fixture.workspace as never)).rejects.toThrow(
      'Workspace sync root changed',
    )
    expect(fixture.workspace.runExternalPathMutation).not.toHaveBeenCalled()
    expect(fixture.workspace.invalidateExternalPaths).not.toHaveBeenCalled()
  })

  it('rejects a completed sync result when the workspace changed during remote work', async () => {
    const fixture = createFixture()
    fixture.dependencies.createEngine = vi.fn(() => ({
      sync: vi.fn(async () => {
        fixture.workspace.rootInfo.mockReturnValue({ kind: 'external', path: 'D:/other' })
        return emptyResult
      }),
    }))
    const service = new WorkspaceWebDavSyncService(fixture.dependencies as never)

    await expect(service.sync(fixture.workspace as never)).rejects.toThrow(
      'Workspace sync root changed',
    )
  })

  it('cancels by the initiating root rather than the mutable workspace root', () => {
    const fixture = createFixture()
    const cancel = vi.fn(() => true)
    const service = new WorkspaceWebDavSyncService({
      ...fixture.dependencies,
      coordinator: { cancel } as never,
    } as never)

    expect(service.cancel('D:/notes')).toBe(true)
    expect(cancel).toHaveBeenCalledWith('D:/notes')
  })
})

const createFixture = () => {
  const workspace = {
    flushBuffers: vi.fn(async () => undefined),
    invalidateExternalPaths: vi.fn(),
    rootInfo: vi.fn(() => ({ kind: 'external' as const, path: 'D:/notes' })),
    runExternalPathMutation: vi.fn(async (_paths: string[], work: () => Promise<unknown>) =>
      work(),
    ),
    runExternalWorkspaceMutation: vi.fn(async (work: () => Promise<unknown>) => work()),
  }
  const profile = {
    id: 'dav-main',
    label: 'Personal',
    endpoint: 'https://dav.example.test',
    basePath: '/marklab',
    username: 'user',
    allowInsecureLocal: false,
    sessionOnly: false,
    hasPassword: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const dependencies = {
    configStore: {
      getChannels: vi.fn(async (): Promise<WorkspaceSyncChannels> => ({
        webdav: {
          provider: 'webdav' as const,
          profileId: 'dav-main',
          remoteRoot: '/documents',
          autoSync: true,
        },
      })),
      getOrCreateDeviceId: vi.fn(async () => 'device-1'),
    },
    createEngine: vi.fn(),
    createRemoteClient: vi.fn(() => ({ testConnection: vi.fn() })),
    createRemoteStore: vi.fn(() => ({})),
    profileStore: {
      get: vi.fn(async () => profile),
      resolvePassword: vi.fn(async () => 'secret'),
    },
    stateStore: {},
  }
  return {
    dependencies,
    service: new WorkspaceWebDavSyncService(dependencies as never),
    workspace,
  }
}
