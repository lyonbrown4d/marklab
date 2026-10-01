import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels.js'
import { registerWorkspaceSyncIpc } from '@electron/ipc/workspaceSync.js'

describe('workspace sync IPC', () => {
  it('stores bindings only for the workspace owned by the sender', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)
    const binding = {
      provider: 'webdav',
      profileId: 'dav-main',
      remoteRoot: '/notes',
      autoSync: true,
    }

    await handlers.get(nativeIpcChannels.syncBindingSet)?.(fixture.event, binding)
    await handlers.get(nativeIpcChannels.syncBindingGet)?.(fixture.event)

    expect(fixture.configStore.set).toHaveBeenCalledWith('D:/notes', binding)
    expect(fixture.configStore.get).toHaveBeenCalledWith('D:/notes')
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

  it('streams progress to the requesting window and supports cancellation', async () => {
    const fixture = createFixture()
    const handlers = register(fixture)
    fixture.syncService.sync.mockImplementationOnce(async (_workspace, options) => {
      options?.onProgress({ stage: 'scanning', completed: 1, total: 2 })
      return { ok: true }
    })

    await handlers.get(nativeIpcChannels.syncStart)?.(fixture.event, {
      requestId: '00000000-0000-4000-8000-000000000001',
    })
    await handlers.get(nativeIpcChannels.syncCancel)?.(fixture.event)

    expect(fixture.event.sender.send).toHaveBeenCalledWith(nativeIpcChannels.syncProgress, {
      requestId: '00000000-0000-4000-8000-000000000001',
      progress: { stage: 'scanning', completed: 1, total: 2 },
    })
    expect(fixture.syncService.cancel).toHaveBeenCalledWith(fixture.workspace)
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
      get: vi.fn(async () => null),
      remove: vi.fn(async () => ({ ok: true as const })),
      set: vi.fn(async (_root, binding) => binding),
    },
    event: {
      sender: { id: 7, isDestroyed: vi.fn(() => false), once: vi.fn(), send: vi.fn() },
    },
    profileStore: {
      delete: vi.fn(async () => ({ ok: true as const })),
      list: vi.fn(async () => []),
      update: vi.fn(async (input) => ({ ...input, password: undefined })),
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
    workspace,
    workspaceRegistry: { serviceForWebContents: vi.fn(() => workspace) },
  }
}
