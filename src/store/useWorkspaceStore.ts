import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createElectronSettingsJsonStorage } from '@/store/persistStorage'
import { RENDERER_PERSIST_KEYS } from '@/types/persistenceKeys'
import {
  areWorkspaceTabsEqual,
  getPersistableWorkspaceTabs,
  getWorkspaceTabId,
  normalizeRuntimeWorkspaceTabs,
  normalizeWorkspaceTabId,
  normalizeWorkspaceTabs,
} from '@/logic/tabs'
import type { FileEntry, RootKind, WorkspaceTab } from '@/store/appTypes'
import { applyWorkspaceTreeDelta } from '@/logic/workspaceTreeProjection'
import type { WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'
import { reconcileLoadedTreeState } from '@/store/workspaceTreeLoadedState'
import { reconcileTabsForTreeDelta } from '@/store/workspaceTreeTabReconciliation'

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
  loadedTreeParents: string[]
  treeNextCursors: Record<string, string | null>
  treeError: string | null
  treeGeneration: number
  treeRevision: number
  treeStatus: 'idle' | 'loading' | 'ready' | 'error'
  unavailableTreePaths: string[]
  setRootPath: (path: string) => void
  setRootKind: (kind: RootKind) => void
  setEntries: (entries: FileEntry[]) => void
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setHasHydrated: (hydrated: boolean) => void
  touchRecentProject: (path: string) => void
  applyTreeDelta: (event: WorkspaceTreeDeltaEvent, dirtyPaths?: Record<string, true>) => boolean
  beginTreeLoad: () => void
  failTreeLoad: (error: unknown) => void
  mergeTreeChildren: (
    parent: string,
    entries: FileEntry[],
    generation: number,
    revision: number,
    nextCursor?: string | null,
    append?: boolean,
  ) => void
  replaceTreeProjection: (
    entries: FileEntry[],
    generation: number,
    revision: number,
    parent: string,
    nextCursor?: string | null,
  ) => void
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
      loadedTreeParents: [],
      treeNextCursors: {},
      treeError: null,
      treeGeneration: 0,
      treeRevision: 0,
      treeStatus: 'idle',
      unavailableTreePaths: [],
      setRootPath: (rootPath) =>
        set((state) =>
          state.rootPath === rootPath ? state : { rootPath, unavailableTreePaths: [] },
        ),
      setRootKind: (rootKind) =>
        set((state) =>
          state.rootKind === rootKind ? state : { rootKind, unavailableTreePaths: [] },
        ),
      setEntries: (entries) =>
        set((state) => (areFileEntriesEqual(state.entries, entries) ? state : { entries })),
      setTabs: (tabs) =>
        set((state) => {
          const normalizedTabs = normalizeRuntimeWorkspaceTabs(tabs)
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
      beginTreeLoad: () => set({ treeError: null, treeStatus: 'loading' }),
      failTreeLoad: (error) =>
        set({
          treeError: error instanceof Error ? error.message : String(error),
          treeStatus: 'error',
        }),
      replaceTreeProjection: (entries, treeGeneration, treeRevision, parent, nextCursor = null) =>
        set({
          entries,
          loadedTreeParents: [parent],
          treeNextCursors: { [parent]: nextCursor },
          treeError: null,
          treeGeneration,
          treeRevision,
          treeStatus: 'ready',
        }),
      mergeTreeChildren: (
        parent,
        children,
        treeGeneration,
        treeRevision,
        nextCursor = null,
        append = false,
      ) =>
        set((state) => {
          if (treeGeneration !== state.treeGeneration) return state
          const childPrefix = parent ? `${parent}/` : ''
          const retained = state.entries.filter((entry) => {
            if (!entry.path.startsWith(childPrefix)) return true
            const rest = entry.path.slice(childPrefix.length)
            return append || !rest
          })
          const byPath = new Map(retained.map((entry) => [entry.path, entry]))
          const parentEntry = byPath.get(parent)
          if (parentEntry?.kind === 'folder') {
            byPath.set(parent, {
              ...parentEntry,
              childrenLoaded: true,
              hasChildren: children.length > 0,
            })
          }
          for (const entry of children) byPath.set(entry.path, entry)
          return {
            entries: [...byPath.values()].sort((left, right) =>
              left.path.localeCompare(right.path),
            ),
            loadedTreeParents: state.loadedTreeParents.includes(parent)
              ? state.loadedTreeParents.filter(
                  (loaded) => loaded === parent || !loaded.startsWith(parent ? `${parent}/` : ''),
                )
              : [...state.loadedTreeParents, parent],
            treeNextCursors: Object.fromEntries([
              ...Object.entries(state.treeNextCursors).filter(
                ([loaded]) =>
                  append || loaded === parent || !loaded.startsWith(parent ? `${parent}/` : ''),
              ),
              [parent, nextCursor],
            ]),
            treeError: null,
            treeRevision,
            treeStatus: 'ready',
          }
        }),
      applyTreeDelta: (event, dirtyPaths = {}) => {
        let refreshRequired = false
        set((state) => {
          if (event.generation !== state.treeGeneration) {
            refreshRequired = true
            return state
          }
          const loaded = reconcileLoadedTreeState(
            state.loadedTreeParents,
            state.treeNextCursors,
            event,
          )
          if (loaded.rootCursorStale) {
            refreshRequired = true
            return state
          }
          const result = applyWorkspaceTreeDelta(state.entries, state.treeRevision, event)
          refreshRequired = result.refreshRequired
          if (result.refreshRequired) return state
          const reconciled = reconcileTabsForTreeDelta(
            state.tabs,
            state.activeTabId,
            state.unavailableTreePaths,
            event,
            dirtyPaths,
          )
          return {
            entries: result.entries,
            loadedTreeParents: loaded.loadedTreeParents,
            treeNextCursors: loaded.treeNextCursors,
            treeRevision: result.revision,
            ...reconciled,
          }
        })
        return refreshRequired
      },
    }),
    {
      name: RENDERER_PERSIST_KEYS.workspace,
      storage: createElectronSettingsJsonStorage<WorkspacePersistedState>(
        RENDERER_PERSIST_KEYS.workspace,
      ),
      version: 1,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
      merge: (persisted, current) => {
        const restored = (persisted ?? {}) as Partial<WorkspacePersistedState>
        const tabs = normalizeWorkspaceTabs(restored.tabs)
        return {
          ...current,
          ...restored,
          tabs,
          activeTabId: normalizeWorkspaceTabId(restored.activeTabId, tabs),
        }
      },
      partialize: (state): WorkspacePersistedState => {
        const tabs = getPersistableWorkspaceTabs(state.tabs)
        const activeTabId = tabs.some((tab) => getWorkspaceTabId(tab) === state.activeTabId)
          ? state.activeTabId
          : tabs[0]
            ? getWorkspaceTabId(tabs[0])
            : null
        return {
          rootPath: state.rootPath,
          rootKind: state.rootKind,
          recentProjects: state.recentProjects,
          tabs,
          activeTabId,
        }
      },
    },
  ),
)

const areFileEntriesEqual = (left: FileEntry[], right: FileEntry[]) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((entry, index) => {
    const next = right[index]
    return (
      Boolean(next) &&
      entry.path === next.path &&
      entry.kind === next.kind &&
      entry.hasChildren === next.hasChildren &&
      entry.childrenLoaded === next.childrenLoaded
    )
  })
}
