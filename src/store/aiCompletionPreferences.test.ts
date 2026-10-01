import { beforeEach, describe, expect, it, vi } from 'vitest'
import { selectPreferencesPersistedState } from '@/store/preferencesPersist'
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

describe('AI completion preferences', () => {
  it('uses privacy-preserving defaults and exposes typed setters', () => {
    const store = usePreferencesStore.getState()

    expect(store.documentCompletionEnabled).toBe(true)
    expect(store.aiCompletionEnabled).toBe(false)
    expect(store.aiCompletionProviderId).toBeNull()
    expect(store.aiCompletionTriggerMode).toBe('balanced')
    expect(store.aiCompletionLength).toBe('medium')
    expect(store.aiCompletionNearbyContextEnabled).toBe(true)
    expect(store.aiCompletionCloudContextConsent).toBe(false)

    store.setDocumentCompletionEnabled(false)
    store.setAiCompletionEnabled(true)
    store.setAiCompletionProviderId('ollama-local')
    store.setAiCompletionTriggerMode('fast')
    store.setAiCompletionLength('long')
    store.setAiCompletionNearbyContextEnabled(false)
    store.setAiCompletionCloudContextConsent(true)

    expect(usePreferencesStore.getState()).toMatchObject({
      documentCompletionEnabled: false,
      aiCompletionEnabled: true,
      aiCompletionProviderId: 'ollama-local',
      aiCompletionTriggerMode: 'fast',
      aiCompletionLength: 'long',
      aiCompletionNearbyContextEnabled: false,
      aiCompletionCloudContextConsent: true,
    })
  })

  it('includes every completion preference in persisted state', () => {
    usePreferencesStore.setState({
      documentCompletionEnabled: false,
      aiCompletionEnabled: true,
      aiCompletionProviderId: 'openai-main',
      aiCompletionTriggerMode: 'battery-saver',
      aiCompletionLength: 'short',
      aiCompletionNearbyContextEnabled: false,
      aiCompletionCloudContextConsent: true,
    })

    expect(selectPreferencesPersistedState(usePreferencesStore.getState())).toMatchObject({
      documentCompletionEnabled: false,
      aiCompletionEnabled: true,
      aiCompletionProviderId: 'openai-main',
      aiCompletionTriggerMode: 'battery-saver',
      aiCompletionLength: 'short',
      aiCompletionNearbyContextEnabled: false,
      aiCompletionCloudContextConsent: true,
    })
  })

  it('restores completion defaults when older persisted preferences omit them', async () => {
    storage.getItem.mockReturnValue({
      state: { aiDefaultProviderId: 'openai-main', sidebarCollapsed: false },
      version: 2,
    })

    await usePreferencesStore.persist.rehydrate()

    expect(usePreferencesStore.getState()).toMatchObject({
      aiDefaultProviderId: 'openai-main',
      sidebarCollapsed: false,
      documentCompletionEnabled: true,
      aiCompletionEnabled: false,
      aiCompletionProviderId: null,
      aiCompletionTriggerMode: 'balanced',
      aiCompletionLength: 'medium',
      aiCompletionNearbyContextEnabled: true,
      aiCompletionCloudContextConsent: false,
    })
  })
})
