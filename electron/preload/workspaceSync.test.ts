import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels'
import { createWorkspaceSyncPreloadSurface } from '@electron/preload/workspaceSync'

describe('workspace sync preload surface', () => {
  it('uses only the named WebDAV sync IPC contract', async () => {
    const invoke = vi.fn(async () => ({ webdav: null }))
    const surface = createWorkspaceSyncPreloadSurface({
      invoke,
      on: vi.fn(),
      removeListener: vi.fn(),
    } as never)
    const channel = {
      provider: 'webdav' as const,
      profileId: 'cloud',
      remoteRoot: '/notes',
      autoSync: false,
    }

    await surface.channels.get()
    await surface.channels.set(channel)
    await surface.channels.remove()
    await surface.cancel('00000000-0000-4000-8000-000000000001')

    expect(invoke).toHaveBeenNthCalledWith(1, nativeIpcChannels.syncChannelsGet)
    expect(invoke).toHaveBeenNthCalledWith(2, nativeIpcChannels.syncChannelSet, channel)
    expect(invoke).toHaveBeenNthCalledWith(3, nativeIpcChannels.syncChannelRemove)
    expect(invoke).toHaveBeenNthCalledWith(4, nativeIpcChannels.syncCancel, {
      requestId: '00000000-0000-4000-8000-000000000001',
    })
    expect(surface).not.toHaveProperty('binding')
    expect(surface).not.toHaveProperty('gitSummary')
  })

  it('subscribes to progress and removes the exact listener', () => {
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const removeListener = vi.fn()
    const handler = vi.fn()
    const surface = createWorkspaceSyncPreloadSurface({
      invoke: vi.fn(),
      on: vi.fn((channel, listener) => listeners.set(channel, listener)),
      removeListener,
    } as never)
    const unsubscribe = surface.onProgress(handler)
    const listener = listeners.get(nativeIpcChannels.syncProgress)
    const event = {
      requestId: '00000000-0000-4000-8000-000000000001',
      progress: { stage: 'scanning', completed: 1, total: 2 },
    }

    listener?.({}, event)
    expect(handler).toHaveBeenCalledWith(event)
    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith(nativeIpcChannels.syncProgress, listener)
  })
})
