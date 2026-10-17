import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDesktopRuntime, isDesktopRuntime, type DesktopRuntimeApi } from '@/runtime/desktop'
import { recentWorkspaceApi } from '@/services/recentWorkspaceApi'

vi.mock('@/runtime/desktop', () => ({ getDesktopRuntime: vi.fn(), isDesktopRuntime: vi.fn() }))

describe('recent workspace runtime adapter', () => {
  beforeEach(() => vi.resetAllMocks())

  it('does not request native APIs outside the desktop runtime', () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(false)
    expect(recentWorkspaceApi.isAvailable()).toBe(false)
    expect(getDesktopRuntime).not.toHaveBeenCalled()
  })

  it('rejects history operations when the native runtime is unavailable', () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(false)
    vi.mocked(getDesktopRuntime).mockImplementation(() => {
      throw new Error('Desktop runtime API is unavailable.')
    })
    expect(() => recentWorkspaceApi.list()).toThrow('Desktop runtime API is unavailable.')
    expect(() => recentWorkspaceApi.remove('/notes')).toThrow('Desktop runtime API is unavailable.')
  })

  it('delegates typed history operations to the named native API', async () => {
    const entries = [{ path: '/notes', status: 'available' as const }]
    const list = vi.fn(async () => entries)
    const remove = vi.fn<(path: string) => Promise<void>>().mockResolvedValue(undefined)
    const stop = vi.fn()
    const watch = vi.fn<(handler: () => void) => Promise<() => void>>().mockResolvedValue(stop)
    vi.mocked(isDesktopRuntime).mockReturnValue(true)
    vi.mocked(getDesktopRuntime).mockReturnValue({
      settings: { recentWorkspaces: { list, remove, watch } },
    } as unknown as DesktopRuntimeApi)
    expect(recentWorkspaceApi.isAvailable()).toBe(true)
    await expect(recentWorkspaceApi.list()).resolves.toEqual(entries)
    await recentWorkspaceApi.remove('/notes')
    expect(remove).toHaveBeenCalledWith('/notes')
    const handler = vi.fn()
    expect(await recentWorkspaceApi.watch(handler)).toBe(stop)
    expect(watch).toHaveBeenCalledWith(handler)
  })
})
