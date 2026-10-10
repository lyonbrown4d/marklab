import type { StateCreator } from 'zustand'
import type { PreferencesState } from '@/store/usePreferencesStore'

export type ImmersiveFocusScope = 'block' | 'section'
export type ImmersiveFocusIntensity = 'soft' | 'standard' | 'strong'

export type ImmersivePreferencesState = {
  immersiveZenMode: boolean
  immersiveFocusMode: boolean
  immersiveFocusScope: ImmersiveFocusScope
  immersiveFocusIntensity: ImmersiveFocusIntensity
  immersiveTypewriterMode: boolean
  editorReadOnlyMode: boolean
  setImmersiveZenMode: (enabled: boolean) => void
  setImmersiveFocusMode: (enabled: boolean) => void
  setImmersiveFocusScope: (scope: ImmersiveFocusScope) => void
  setImmersiveFocusIntensity: (intensity: ImmersiveFocusIntensity) => void
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
  immersiveFocusScope: 'block',
  immersiveFocusIntensity: 'standard',
  immersiveTypewriterMode: false,
  editorReadOnlyMode: false,
  setImmersiveZenMode: (immersiveZenMode) =>
    set((state) => (state.immersiveZenMode === immersiveZenMode ? state : { immersiveZenMode })),
  setImmersiveFocusMode: (immersiveFocusMode) =>
    set((state) =>
      state.immersiveFocusMode === immersiveFocusMode ? state : { immersiveFocusMode },
    ),
  setImmersiveFocusScope: (immersiveFocusScope) =>
    set((state) =>
      state.immersiveFocusScope === immersiveFocusScope ? state : { immersiveFocusScope },
    ),
  setImmersiveFocusIntensity: (immersiveFocusIntensity) =>
    set((state) =>
      state.immersiveFocusIntensity === immersiveFocusIntensity
        ? state
        : { immersiveFocusIntensity },
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
