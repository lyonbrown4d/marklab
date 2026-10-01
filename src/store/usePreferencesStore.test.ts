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
  it('stores the default AI provider as an optional persisted preference', () => {
    const store = usePreferencesStore.getState()

    expect(store.aiDefaultProviderId).toBeNull()
    store.setAiDefaultProviderId('marklab-local')

    expect(usePreferencesStore.getState().aiDefaultProviderId).toBe('marklab-local')
  })

  it('stores an opt-in custom AI model directory without losing the selected path', () => {
    const store = usePreferencesStore.getState()

    expect(store.aiCustomModelDirectoryEnabled).toBe(false)
    expect(store.aiModelDirectory).toBeNull()
    store.setAiModelDirectory('D:\\MarkLab Models')
    store.setAiCustomModelDirectoryEnabled(true)
    store.setAiCustomModelDirectoryEnabled(false)

    expect(usePreferencesStore.getState().aiCustomModelDirectoryEnabled).toBe(false)
    expect(usePreferencesStore.getState().aiModelDirectory).toBe('D:\\MarkLab Models')
  })

  it('toggles the editor read-only browsing mode', () => {
    const store = usePreferencesStore.getState()

    expect(store.editorReadOnlyMode).toBe(false)
    store.setEditorReadOnlyMode(true)

    expect(usePreferencesStore.getState().editorReadOnlyMode).toBe(true)
  })

  it('starts new users on a distraction-free canvas', () => {
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(true)
    expect(usePreferencesStore.getState().rightSidebarCollapsed).toBe(true)
    expect(usePreferencesStore.getState().showEditorStatusBar).toBe(true)
    expect(usePreferencesStore.getState().immersiveFocusMode).toBe(true)
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
