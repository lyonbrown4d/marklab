import { create } from 'zustand'

export const vimTabKey = (workspaceKey: string, tabId: string): string =>
  JSON.stringify([workspaceKey, tabId])

type VimModeState = {
  perTabOverrides: Record<string, boolean>
  setTabOverride: (workspaceKey: string, tabId: string, enabled: boolean | undefined) => void
  pruneTabOverrides: (workspaceKey: string, openTabIds: string[]) => void
}

// Overrides belong to the open workspace session; only the global default is persisted.
export const useVimModeStore = create<VimModeState>()((set) => ({
  perTabOverrides: {},
  setTabOverride: (workspaceKey, tabId, enabled) =>
    set((state) => {
      const key = vimTabKey(workspaceKey, tabId)
      if (state.perTabOverrides[key] === enabled) return state
      const perTabOverrides = { ...state.perTabOverrides }
      if (enabled === undefined) delete perTabOverrides[key]
      else perTabOverrides[key] = enabled
      return { perTabOverrides }
    }),
  pruneTabOverrides: (workspaceKey, openTabIds) =>
    set((state) => {
      const openKeys = new Set(openTabIds.map((tabId) => vimTabKey(workspaceKey, tabId)))
      const entries = Object.entries(state.perTabOverrides)
      const retained = entries.filter(([key]) => openKeys.has(key))
      return retained.length === entries.length
        ? state
        : { perTabOverrides: Object.fromEntries(retained) }
    }),
}))
