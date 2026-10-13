import { describe, expect, it, vi } from 'vitest'
import { createRecentWorkspacesPreloadSurface } from '@electron/preload/recentWorkspaces'
import { nativeIpcChannels } from '@electron/channels'

vi.mock('electron', () => ({ ipcRenderer: { invoke: vi.fn() } }))

describe('recent workspace preload API', () => {
  it('subscribes before starting the watch and removes its listener and subscription on cleanup', async () => {
    const renderer = {
      invoke: vi.fn(async () => ({ ok: true })),
      on: vi.fn(),
      removeListener: vi.fn(),
      send: vi.fn(),
    }
    const handler = vi.fn()
    const stop = await createRecentWorkspacesPreloadSurface(renderer).watch(handler)
    const listener = renderer.on.mock.calls[0][1] as () => void
    listener()
    expect(handler).toHaveBeenCalledOnce()
    expect(renderer.invoke).toHaveBeenCalledWith(nativeIpcChannels.recentWorkspacesWatchStart, 1)
    stop()
    expect(renderer.removeListener).toHaveBeenCalledWith(
      nativeIpcChannels.recentWorkspacesChanged,
      listener,
    )
    expect(renderer.send).toHaveBeenCalledWith(nativeIpcChannels.recentWorkspacesWatchStop, 1)
  })

  it.each([null, { ok: false }])('cleans up a rejected watch subscription %j', async (response) => {
    const renderer = {
      invoke: vi.fn(async () => response),
      on: vi.fn(),
      removeListener: vi.fn(),
      send: vi.fn(),
    }
    await expect(createRecentWorkspacesPreloadSurface(renderer).watch(vi.fn())).rejects.toThrow(
      'Unable to watch workspace history',
    )
    expect(renderer.removeListener).toHaveBeenCalledOnce()
    expect(renderer.send).not.toHaveBeenCalled()
  })
  it('exposes named methods and validates history status responses', async () => {
    const entries = [
      { path: '/notes', status: 'available' },
      { path: '/missing', status: 'missing' },
      { path: '/private', status: 'unavailable' },
    ]
    const invoke = vi.fn().mockResolvedValueOnce(entries).mockResolvedValueOnce({ ok: true })
    const api = createRecentWorkspacesPreloadSurface({
      invoke,
      on: vi.fn(),
      removeListener: vi.fn(),
      send: vi.fn(),
    })
    await expect(api.list()).resolves.toEqual(entries)
    await expect(api.remove('/notes')).resolves.toBeUndefined()
    expect(invoke.mock.calls).toEqual([
      [nativeIpcChannels.recentWorkspacesList],
      [nativeIpcChannels.recentWorkspacesRemove, '/notes'],
    ])
  })
  it.each([
    null,
    {},
    [{ path: '/notes', status: 'bad' }],
    [{ path: 42, status: 'missing' }],
    [{ path: '/notes', status: 'available', extra: true }],
  ])('rejects malformed history %j', async (response) => {
    const api = createRecentWorkspacesPreloadSurface({
      invoke: vi.fn(async () => response),
      on: vi.fn(),
      removeListener: vi.fn(),
      send: vi.fn(),
    })
    await expect(api.list()).rejects.toThrow('Invalid recent workspace history response')
  })
  it.each([null, {}, { ok: 'yes' }])('rejects malformed removal %j', async (response) => {
    const api = createRecentWorkspacesPreloadSurface({
      invoke: vi.fn(async () => response),
      on: vi.fn(),
      removeListener: vi.fn(),
      send: vi.fn(),
    })
    await expect(api.remove('/notes')).rejects.toThrow('Invalid history removal response')
  })
  it.each([{ ok: false, error: 'database busy' }, { ok: false }])(
    'surfaces failed removals %j',
    async (response) => {
      const api = createRecentWorkspacesPreloadSurface({
        invoke: vi.fn(async () => response),
        on: vi.fn(),
        removeListener: vi.fn(),
        send: vi.fn(),
      })
      await expect(api.remove('/notes')).rejects.toThrow(
        response.error ?? 'Unable to remove workspace history',
      )
    },
  )
})
