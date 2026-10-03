import { beforeEach, describe, expect, it, vi } from 'vitest'

const persist = vi.hoisted(() => ({
  getItem: vi.fn(async () => null),
  removeItem: vi.fn(async () => ({ ok: true as const })),
  setItem: vi.fn(async () => ({ ok: true as const })),
}))

vi.mock('@/runtime/electron', () => ({
  getElectronRuntime: () => ({ settings: { persist } }),
  isElectronRuntime: () => true,
}))

import { createElectronSettingsJsonStorage } from '@/store/persistStorage'

describe('createElectronSettingsJsonStorage', () => {
  beforeEach(() => {
    persist.getItem.mockClear()
    persist.removeItem.mockClear()
    persist.setItem.mockClear()
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
})
