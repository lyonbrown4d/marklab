import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels.js'
import { registerWorkspaceSyncIpc } from '@electron/ipc/workspaceSync.js'
import type { WorkspaceSyncChannelsRecord } from '@electron/services/sync/workspaceSyncConfig.js'

describe('workspace sync IPC', () => {
  it('stores and removes one channel without replacing the other channel', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)
    const gitChannel = {
      provider: 'git',
      remote: 'origin',
      branch: 'main',
      autoFetch: true,
    }

    await handlers.get(nativeIpcChannels.syncChannelsGet)?.(fixture.event)
    await handlers.get(nativeIpcChannels.syncChannelSet)?.(fixture.event, gitChannel)
    await handlers.get(nativeIpcChannels.syncChannelRemove)?.(fixture.event, {
      provider: 'git',
    })

    expect(fixture.configStore.getChannels).toHaveBeenCalledWith('D:/notes')
    expect(fixture.configStore.setChannel).toHaveBeenCalledWith('D:/notes', gitChannel)
    expect(fixture.configStore.removeChannel).toHaveBeenCalledWith('D:/notes', 'git')
  })

  it('returns structured Git auto-discovery for the sender workspace', async () => {
    const fixture = createFixture()
    fixture.gitService.discover.mockResolvedValueOnce({ is_repository: false })
    const handlers = register(fixture)

    await expect(handlers.get(nativeIpcChannels.syncGitSummary)?.(fixture.event)).resolves.toEqual({
      status: 'not_repository',
    })
    expect(fixture.gitService.discover).toHaveBeenCalledWith('D:/notes')
  })

  it('rejects a WebDAV channel that references a missing global profile', async () => {
    const fixture = createFixture()
    fixture.profileStore.get.mockResolvedValueOnce(null)
    const handlers = register(fixture)

    await expect(
      handlers.get(nativeIpcChannels.syncChannelSet)?.(fixture.event, {
        provider: 'webdav',
        profileId: 'missing-dav',
        remoteRoot: '/notes',
        autoSync: false,
      }),
    ).rejects.toThrow('not found')
    expect(fixture.configStore.setChannel).not.toHaveBeenCalled()
  })

  it('keeps passwords inside named profile IPC and exposes only public profiles', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)
    const input = {
      id: 'dav-main',
      label: 'Personal',
      endpoint: 'https://dav.example.test',
      username: 'user',
      password: 'secret',
    }

    await handlers.get(nativeIpcChannels.webDavProfileUpdate)?.(fixture.event, input)
    await handlers.get(nativeIpcChannels.webDavProfileList)?.(fixture.event)

    expect(fixture.profileStore.update).toHaveBeenCalledWith(input)
    expect(fixture.profileStore.list).toHaveBeenCalledOnce()
  })

  it('refuses to delete a WebDAV profile while a workspace still references it', async () => {
    const fixture = createFixture()
    fixture.configStore.listChannels.mockResolvedValueOnce([
      {
        workspacePath: 'D:/notes',
        channels: {
          git: null,
          webdav: {
            provider: 'webdav',
            profileId: 'dav-main',
            remoteRoot: '/notes',
            autoSync: false,
          },
        },
      },
    ])
    const handlers = register(fixture)

    await expect(
      handlers.get(nativeIpcChannels.webDavProfileDelete)?.(fixture.event, { id: 'dav-main' }),
    ).rejects.toThrow('still bound')
    expect(fixture.profileStore.delete).not.toHaveBeenCalled()
  })

  it('streams progress to the requesting window and supports cancellation', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)
    let finishSync!: () => void
    fixture.syncService.sync.mockImplementationOnce(async (_workspace, options) => {
      options?.onProgress({ stage: 'scanning', completed: 1, total: 2 })
      await new Promise<void>((resolve) => {
        finishSync = resolve
      })
      return { ok: true }
    })

    const requestId = '00000000-0000-4000-8000-000000000001'
    const sync = handlers.get(nativeIpcChannels.syncStart)?.(fixture.event, {
      requestId,
    })
    await vi.waitFor(() => expect(fixture.event.sender.send).toHaveBeenCalledOnce())
    fixture.workspace.rootInfo.mockReturnValue({ kind: 'external', path: 'D:/other' })
    await handlers.get(nativeIpcChannels.syncCancel)?.(fixture.event, { requestId })
    finishSync()
    await expect(sync).resolves.toEqual({
      status: 'completed',
      result: { ok: true },
    })

    expect(fixture.event.sender.send).toHaveBeenCalledWith(nativeIpcChannels.syncProgress, {
      requestId,
      progress: { stage: 'scanning', completed: 1, total: 2 },
    })
    expect(fixture.syncService.cancel).toHaveBeenCalledWith('D:/notes')
  })

  it('returns busy and cancelled outcomes without relying on serialized Error fields', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)
    fixture.syncService.sync
      .mockRejectedValueOnce(
        Object.assign(new Error('already running'), { code: 'workspace_sync_busy' }),
      )
      .mockRejectedValueOnce(Object.assign(new Error('stopped'), { name: 'AbortError' }))

    await expect(
      handlers.get(nativeIpcChannels.syncStart)?.(fixture.event, {
        requestId: '00000000-0000-4000-8000-000000000002',
      }),
    ).resolves.toEqual({ status: 'busy' })
    await expect(
      handlers.get(nativeIpcChannels.syncStart)?.(fixture.event, {
        requestId: '00000000-0000-4000-8000-000000000003',
      }),
    ).resolves.toEqual({ status: 'cancelled' })
  })

  it('returns a safe failed outcome for other sync failures', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)
    fixture.syncService.sync.mockRejectedValueOnce(new Error('remote unavailable'))

    await expect(
      handlers.get(nativeIpcChannels.syncStart)?.(fixture.event, {
        requestId: '00000000-0000-4000-8000-000000000004',
      }),
    ).resolves.toEqual({ status: 'failed', message: 'remote unavailable' })
  })

  it('rejects cancellation without an explicit request id', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)

    await expect(
      handlers.get(nativeIpcChannels.syncCancel)?.(fixture.event, undefined),
    ).rejects.toThrow()
    expect(fixture.syncService.cancel).not.toHaveBeenCalled()
  })

  it('serializes profile deletion and WebDAV channel binding through one boundary', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)

    await handlers.get(nativeIpcChannels.webDavProfileDelete)?.(fixture.event, {
      id: 'dav-main',
    })
    await handlers.get(nativeIpcChannels.syncChannelSet)?.(fixture.event, {
      provider: 'webdav',
      profileId: 'dav-main',
      remoteRoot: '/notes',
      autoSync: false,
    })

    expect(fixture.workspaceMutationCoordinator.runConfigurationMutation).toHaveBeenCalledTimes(2)
  })
})

type Handler = (event: unknown, payload?: unknown) => unknown

const register = (fixture: ReturnType<typeof createFixture>) => {
  const handlers = new Map<string, Handler>()
  registerWorkspaceSyncIpc(
    { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) } as never,
    fixture as never,
  )
  return handlers
}

const createFixture = () => {
  const workspace = { rootInfo: vi.fn(() => ({ kind: 'external', path: 'D:/notes' })) }
  return {
    configStore: {
      getChannels: vi.fn(async () => ({ git: null, webdav: null })),
      listChannels: vi.fn(async (): Promise<WorkspaceSyncChannelsRecord[]> => []),
      removeChannel: vi.fn(async () => ({ git: null, webdav: null })),
      setChannel: vi.fn(async (_root, channel) => ({
        git: channel.provider === 'git' ? channel : null,
        webdav: channel.provider === 'webdav' ? channel : null,
      })),
    },
    event: {
      sender: { id: 7, isDestroyed: vi.fn(() => false), once: vi.fn(), send: vi.fn() },
    },
    profileStore: {
      delete: vi.fn(async () => ({ ok: true as const })),
      get: vi.fn(async (): Promise<{ id: string } | null> => ({ id: 'dav-main' })),
      list: vi.fn(async () => []),
      update: vi.fn(async (input) => ({ ...input, password: undefined })),
    },
    gitService: {
      discover: vi.fn(async () => ({ is_repository: false })),
      remoteStatus: vi.fn(async () => ({
        remotes: [],
        branch: null,
        upstream: null,
        ahead: 0,
        behind: 0,
        detached: false,
      })),
      status: vi.fn(async () => ({
        repo: { is_repository: false },
        staged: [],
        unstaged: [],
        untracked: [],
        conflicts: [],
      })),
    },
    syncService: {
      cancel: vi.fn(() => true),
      sync: vi.fn(
        async (
          _workspace: unknown,
          _options?: { onProgress: (progress: Record<string, unknown>) => void },
        ) => {
          void _workspace
          void _options
          return { ok: true }
        },
      ),
      testConnection: vi.fn(async () => ({ ok: true as const })),
    },
    workspaceMutationCoordinator: {
      runConfigurationMutation: vi.fn(async (work: () => Promise<unknown>) => work()),
    },
    workspace,
    workspaceRegistry: { serviceForWebContents: vi.fn(() => workspace) },
  }
}
