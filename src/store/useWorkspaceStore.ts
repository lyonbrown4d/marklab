import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createElectronSettingsJsonStorage } from '@/store/persistStorage'
import {
  areWorkspaceTabsEqual,
  normalizeWorkspaceTabId,
  normalizeWorkspaceTabs,
} from '@/logic/tabs'
import type { FileEntry, RootKind, WorkspaceTab } from '@/store/appTypes'

type WorkspacePersistedState = Pick<
  WorkspaceState,
  'activeTabId' | 'recentProjects' | 'rootKind' | 'rootPath' | 'tabs'
>

export type WorkspaceState = {
  rootPath: string
  rootKind: RootKind
  recentProjects: string[]
  entries: FileEntry[]
  tabs: WorkspaceTab[]
  activeTabId: string | null
  hasHydrated: boolean
  setRootPath: (path: string) => void
  setRootKind: (kind: RootKind) => void
  setEntries: (entries: FileEntry[]) => void
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setHasHydrated: (hydrated: boolean) => void
  touchRecentProject: (path: string) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      rootPath: '',
      rootKind: 'internal',
      recentProjects: [],
      entries: [],
      tabs: [],
      activeTabId: null,
      hasHydrated: false,
      setRootPath: (rootPath) =>
        set((state) => (state.rootPath === rootPath ? state : { rootPath })),
      setRootKind: (rootKind) =>
        set((state) => (state.rootKind === rootKind ? state : { rootKind })),
      setEntries: (entries) =>
        set((state) => (areFileEntriesEqual(state.entries, entries) ? state : { entries })),
      setTabs: (tabs) =>
        set((state) => {
          const normalizedTabs = normalizeWorkspaceTabs(tabs)
          const activeTabId = normalizeWorkspaceTabId(state.activeTabId, normalizedTabs)
          return areWorkspaceTabsEqual(state.tabs, normalizedTabs) &&
            state.activeTabId === activeTabId
            ? state
            : { tabs: normalizedTabs, activeTabId }
        }),
      setActiveTabId: (activeTabId) =>
        set((state) => (state.activeTabId === activeTabId ? state : { activeTabId })),
      setHasHydrated: (hasHydrated) =>
        set((state) => (state.hasHydrated === hasHydrated ? state : { hasHydrated })),
      touchRecentProject: (path) =>
        set((state) => {
          if (state.recentProjects[0] === path) return state
          const next = [path, ...state.recentProjects.filter((p) => p !== path)]
          return { recentProjects: next.slice(0, 8) }
        }),
    }),
    {
      name: 'marklab.workspace',
      storage: createElectronSettingsJsonStorage<WorkspacePersistedState>('marklab.workspace'),
      version: 1,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
      partialize: (state): WorkspacePersistedState => ({
        rootPath: state.rootPath,
        rootKind: state.rootKind,
        recentProjects: state.recentProjects,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
      }),
    },
  ),
)

const areFileEntriesEqual = (left: FileEntry[], right: FileEntry[]) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((entry, index) => {
    const next = right[index]
    return Boolean(next) && entry.path === next.path && entry.kind === next.kind
  })
}
