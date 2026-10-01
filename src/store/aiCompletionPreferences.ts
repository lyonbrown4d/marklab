import type { StateCreator } from 'zustand'
import type { PreferencesState } from '@/store/usePreferencesStore'

export type AiCompletionTriggerMode = 'fast' | 'balanced' | 'battery-saver'
export type AiCompletionLength = 'short' | 'medium' | 'long'

export type AiCompletionPreferencesState = {
  documentCompletionEnabled: boolean
  aiCompletionEnabled: boolean
  aiCompletionProviderId: string | null
  aiCompletionTriggerMode: AiCompletionTriggerMode
  aiCompletionLength: AiCompletionLength
  aiCompletionNearbyContextEnabled: boolean
  aiCompletionCloudContextConsent: boolean
  setDocumentCompletionEnabled: (enabled: boolean) => void
  setAiCompletionEnabled: (enabled: boolean) => void
  setAiCompletionProviderId: (providerId: string | null) => void
  setAiCompletionTriggerMode: (mode: AiCompletionTriggerMode) => void
  setAiCompletionLength: (length: AiCompletionLength) => void
  setAiCompletionNearbyContextEnabled: (enabled: boolean) => void
  setAiCompletionCloudContextConsent: (enabled: boolean) => void
}

export const createAiCompletionPreferencesSlice: StateCreator<
  PreferencesState,
  [],
  [],
  AiCompletionPreferencesState
> = (set) => ({
  documentCompletionEnabled: true,
  aiCompletionEnabled: false,
  aiCompletionProviderId: null,
  aiCompletionTriggerMode: 'balanced',
  aiCompletionLength: 'medium',
  aiCompletionNearbyContextEnabled: true,
  aiCompletionCloudContextConsent: false,
  setDocumentCompletionEnabled: (documentCompletionEnabled) =>
    set((state) =>
      state.documentCompletionEnabled === documentCompletionEnabled
        ? state
        : { documentCompletionEnabled },
    ),
  setAiCompletionEnabled: (aiCompletionEnabled) =>
    set((state) =>
      state.aiCompletionEnabled === aiCompletionEnabled ? state : { aiCompletionEnabled },
    ),
  setAiCompletionProviderId: (aiCompletionProviderId) =>
    set((state) =>
      state.aiCompletionProviderId === aiCompletionProviderId ? state : { aiCompletionProviderId },
    ),
  setAiCompletionTriggerMode: (aiCompletionTriggerMode) =>
    set((state) =>
      state.aiCompletionTriggerMode === aiCompletionTriggerMode
        ? state
        : { aiCompletionTriggerMode },
    ),
  setAiCompletionLength: (aiCompletionLength) =>
    set((state) =>
      state.aiCompletionLength === aiCompletionLength ? state : { aiCompletionLength },
    ),
  setAiCompletionNearbyContextEnabled: (aiCompletionNearbyContextEnabled) =>
    set((state) =>
      state.aiCompletionNearbyContextEnabled === aiCompletionNearbyContextEnabled
        ? state
        : { aiCompletionNearbyContextEnabled },
    ),
  setAiCompletionCloudContextConsent: (aiCompletionCloudContextConsent) =>
    set((state) =>
      state.aiCompletionCloudContextConsent === aiCompletionCloudContextConsent
        ? state
        : { aiCompletionCloudContextConsent },
    ),
})
