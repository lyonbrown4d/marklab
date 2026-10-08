import { normalizeWorkspaceTabId, normalizeWorkspaceTabs } from '@/logic/tabs'
import type { WorkspaceSessionSeedPayload } from '@/runtime/rendererLifecycle'
import type { RootKind, WorkspaceTab } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

export type ParsedWorkspaceSessionSeed = {
  activeTabId?: string | null
  rootKind?: RootKind
  rootPath?: string
  tabs?: WorkspaceTab[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key)

const isRootKind = (value: unknown): value is RootKind =>
  value === 'internal' || value === 'external' || value === 'single'

export const applyWorkspaceSessionSeed = (
  payload: WorkspaceSessionSeedPayload,
): ParsedWorkspaceSessionSeed => {
  if (!isRecord(payload.state)) return {}
  const seed = payload.state
  const currentWorkspace = useWorkspaceStore.getState()
  const tabs = Array.isArray(seed.tabs) ? normalizeWorkspaceTabs(seed.tabs) : undefined
  const activeTabId =
    hasOwn(seed, 'activeTabId') && typeof seed.activeTabId === 'string'
      ? normalizeWorkspaceTabId(seed.activeTabId, tabs ?? [])
      : hasOwn(seed, 'activeTabId')
        ? null
        : undefined
  const workspacePatch = {
    ...(typeof seed.rootPath === 'string' ? { rootPath: seed.rootPath } : {}),
    ...(isRootKind(seed.rootKind) ? { rootKind: seed.rootKind } : {}),
    ...(tabs ? { tabs } : {}),
    ...(activeTabId !== undefined ? { activeTabId } : {}),
    ...((typeof seed.rootPath === 'string' && seed.rootPath !== currentWorkspace.rootPath) ||
    (isRootKind(seed.rootKind) && seed.rootKind !== currentWorkspace.rootKind)
      ? {
          entries: [],
          loadedTreeParents: [],
          treeError: null,
          treeNextCursors: {},
          treeStatus: 'idle' as const,
          unavailableTreePaths: [],
        }
      : {}),
  }
  const preferencesPatch = {
    ...(typeof seed.sidebarCollapsed === 'boolean'
      ? { sidebarCollapsed: seed.sidebarCollapsed }
      : {}),
    ...(typeof seed.rightSidebarCollapsed === 'boolean'
      ? { rightSidebarCollapsed: seed.rightSidebarCollapsed }
      : {}),
  }
  if (Object.keys(workspacePatch).length > 0) useWorkspaceStore.setState(workspacePatch)
  if (Object.keys(preferencesPatch).length > 0) usePreferencesStore.setState(preferencesPatch)
  return {
    ...(tabs ? { tabs } : {}),
    ...(activeTabId !== undefined ? { activeTabId } : {}),
    ...(isRootKind(seed.rootKind) ? { rootKind: seed.rootKind } : {}),
    ...(typeof seed.rootPath === 'string' ? { rootPath: seed.rootPath } : {}),
  }
}
