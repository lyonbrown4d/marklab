import type { StateCreator } from 'zustand'
import type { PreferencesState } from '@/store/usePreferencesStore'

export type TerminalPreferencesState = {
  terminalShellPath: string | null
  setTerminalShellPath: (path: string | null) => void
}

export const createTerminalPreferencesSlice: StateCreator<
  PreferencesState,
  [],
  [],
  TerminalPreferencesState
> = (set) => ({
  terminalShellPath: null,
  setTerminalShellPath: (terminalShellPath) =>
    set((state) => (state.terminalShellPath === terminalShellPath ? state : { terminalShellPath })),
})
