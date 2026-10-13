import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getElectronRuntime,
  isElectronRuntime,
  type RendererSafeElectronApi,
} from '@/runtime/electron'
import { recentWorkspaceApi } from '@/services/recentWorkspaceApi'

vi.mock('@/runtime/electron', () => ({ getElectronRuntime: vi.fn(), isElectronRuntime: vi.fn() }))

describe('recent workspace runtime adapter', () => {
  beforeEach(() => vi.resetAllMocks())

  it('does not request Electron APIs outside the desktop runtime', () => {
    vi.mocked(isElectronRuntime).mockReturnValue(false)
    expect(recentWorkspaceApi.isAvailable()).toBe(false)
    expect(getElectronRuntime).not.toHaveBeenCalled()
  })

  it('handles a runtime without the named history surface', () => {
    vi.mocked(isElectronRuntime).mockReturnValue(true)
    vi.mocked(getElectronRuntime).mockReturnValue({ settings: {} } as RendererSafeElectronApi)
    expect(recentWorkspaceApi.isAvailable()).toBe(false)
    expect(() => recentWorkspaceApi.list()).toThrow('Recent workspace history API is unavailable')
    expect(() => recentWorkspaceApi.remove('/notes')).toThrow(
      'Recent workspace history API is unavailable',
    )
  })

  it('delegates typed history operations to the narrow preload API', async () => {
    const entries = [{ path: '/notes', status: 'available' as const }]
    const list = vi.fn(async () => entries)
    const remove = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined)
    const stop = vi.fn()
    const watch = vi.fn<(handler: () => void) => Promise<() => void>>().mockResolvedValue(stop)
    vi.mocked(isElectronRuntime).mockReturnValue(true)
    vi.mocked(getElectronRuntime).mockReturnValue({
      settings: { recentWorkspaces: { list, remove, watch } },
    } as unknown as RendererSafeElectronApi)
    expect(recentWorkspaceApi.isAvailable()).toBe(true)
    await expect(recentWorkspaceApi.list()).resolves.toEqual(entries)
    await recentWorkspaceApi.remove('/notes')
    expect(remove).toHaveBeenCalledWith('/notes')
    const handler = vi.fn()
    expect(await recentWorkspaceApi.watch(handler)).toBe(stop)
    expect(watch).toHaveBeenCalledWith(handler)
  })
})
