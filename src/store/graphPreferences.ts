import type { StateCreator } from 'zustand'
import type { PreferencesState } from '@/store/usePreferencesStore'

export type GraphPreferencesState = {
  graphShowAttachments: boolean
  graphShowMissing: boolean
  setGraphShowAttachments: (enabled: boolean) => void
  setGraphShowMissing: (enabled: boolean) => void
}

export const createGraphPreferencesSlice: StateCreator<
  PreferencesState,
  [],
  [],
  GraphPreferencesState
> = (set) => ({
  graphShowAttachments: false,
  graphShowMissing: true,
  setGraphShowAttachments: (graphShowAttachments) => set({ graphShowAttachments }),
  setGraphShowMissing: (graphShowMissing) => set({ graphShowMissing }),
})
