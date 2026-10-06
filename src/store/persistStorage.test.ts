import { beforeEach, describe, expect, it, vi } from 'vitest'

const persist = vi.hoisted(() => ({
  getItem: vi.fn<(key: string) => Promise<unknown>>(),
  removeItem: vi.fn<(key: string) => Promise<{ ok: true }>>(),
  setItem: vi.fn<(key: string, value: unknown) => Promise<{ ok: true }>>(),
}))

vi.mock('@/runtime/electron', () => ({
  getElectronRuntime: () => ({ settings: { persist } }),
  isElectronRuntime: () => true,
}))

import { createElectronSettingsJsonStorage } from '@/store/persistStorage'

describe('createElectronSettingsJsonStorage', () => {
  beforeEach(() => {
    persist.getItem.mockReset().mockResolvedValue(null)
    persist.removeItem.mockReset().mockResolvedValue({ ok: true })
    persist.setItem.mockReset().mockResolvedValue({ ok: true })
  })

  it('does not repeat native writes when the partialized value is unchanged', async () => {
    const storage = createElectronSettingsJsonStorage<{ count: number }>()
    const value = { state: { count: 1 }, version: 0 }

    await storage?.setItem('workspace', value)
    await storage?.setItem('workspace', { state: { count: 1 }, version: 0 })
    await storage?.setItem('workspace', { state: { count: 2 }, version: 0 })

    expect(persist.setItem).toHaveBeenCalledTimes(2)
  })

  it('allows the same value to be written again after removal', async () => {
    const storage = createElectronSettingsJsonStorage<{ count: number }>()
    const value = { state: { count: 1 }, version: 0 }

    await storage?.setItem('workspace', value)
    await storage?.removeItem('workspace')
    await storage?.setItem('workspace', value)

    expect(persist.setItem).toHaveBeenCalledTimes(2)
  })

  it('rewrites restored state when hydration overlaps a premature write', async () => {
    let resolveHydration: ((value: unknown) => void) | undefined
    persist.getItem.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHydration = resolve
        }),
    )
    const storage = createElectronSettingsJsonStorage<{ recentProjects: string[] }>()
    const restored = { state: { recentProjects: ['D:/workspace'] }, version: 1 }
    const premature = { state: { recentProjects: [] }, version: 1 }
    let persisted: unknown = restored
    persist.setItem.mockImplementation(async (_key, value) => {
      persisted = value
      return { ok: true }
    })

    const hydration = storage?.getItem('marklab.workspace')
    await storage?.setItem('marklab.workspace', premature)
    resolveHydration?.(restored)
    await expect(hydration).resolves.toEqual(restored)
    await storage?.setItem('marklab.workspace', restored)

    expect(persist.setItem).toHaveBeenCalledTimes(2)
    expect(persist.setItem).toHaveBeenLastCalledWith('marklab.workspace', restored)
    expect(persisted).toEqual(restored)
  })
})
