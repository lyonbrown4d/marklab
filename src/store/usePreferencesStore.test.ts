import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
}))

vi.mock('@/store/persistStorage', () => ({
  createElectronSettingsJsonStorage: () => storage,
}))

beforeEach(() => {
  storage.getItem.mockReturnValue(null)
  usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
})

describe('writing-first layout preferences', () => {
  it('keeps navigation visible and the inspector collapsed for new users', () => {
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(false)
    expect(usePreferencesStore.getState().rightSidebarCollapsed).toBe(true)
  })

  it('preserves an existing preference to keep the inspector open', async () => {
    storage.getItem.mockReturnValue({ state: { rightSidebarCollapsed: false }, version: 2 })
    await usePreferencesStore.persist.rehydrate()
    expect(usePreferencesStore.getState().rightSidebarCollapsed).toBe(false)
  })

  it('uses the collapsed default when older preferences omit the inspector state', async () => {
    storage.getItem.mockReturnValue({ state: { sidebarCollapsed: false }, version: 2 })
    await usePreferencesStore.persist.rehydrate()
    expect(usePreferencesStore.getState().rightSidebarCollapsed).toBe(true)
  })
})
