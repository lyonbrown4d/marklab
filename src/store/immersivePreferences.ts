import type { StateCreator } from 'zustand'
import type { PreferencesState } from '@/store/usePreferencesStore'

export type ImmersivePreferencesState = {
  immersiveZenMode: boolean
  immersiveFocusMode: boolean
  immersiveTypewriterMode: boolean
  editorReadOnlyMode: boolean
  setImmersiveZenMode: (enabled: boolean) => void
  setImmersiveFocusMode: (enabled: boolean) => void
  setImmersiveTypewriterMode: (enabled: boolean) => void
  setEditorReadOnlyMode: (enabled: boolean) => void
}

export const createImmersivePreferencesSlice: StateCreator<
  PreferencesState,
  [],
  [],
  ImmersivePreferencesState
> = (set) => ({
  immersiveZenMode: false,
  immersiveFocusMode: false,
  immersiveTypewriterMode: false,
  editorReadOnlyMode: false,
  setImmersiveZenMode: (immersiveZenMode) =>
    set((state) => (state.immersiveZenMode === immersiveZenMode ? state : { immersiveZenMode })),
  setImmersiveFocusMode: (immersiveFocusMode) =>
    set((state) =>
      state.immersiveFocusMode === immersiveFocusMode ? state : { immersiveFocusMode },
    ),
  setImmersiveTypewriterMode: (immersiveTypewriterMode) =>
    set((state) =>
      state.immersiveTypewriterMode === immersiveTypewriterMode
        ? state
        : { immersiveTypewriterMode },
    ),
  setEditorReadOnlyMode: (editorReadOnlyMode) =>
    set((state) =>
      state.editorReadOnlyMode === editorReadOnlyMode ? state : { editorReadOnlyMode },
    ),
})
