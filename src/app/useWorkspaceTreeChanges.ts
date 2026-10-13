import { useCallback, useEffect, useRef } from 'react'

import type { LoadWorkspace } from '@/app/workspaceRestoreTypes'
import { getWorkspaceTabId } from '@/logic/tabs'
import { isDesktopRuntime } from '@/runtime/environment'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import type { WorkspaceTab } from '@/store/appTypes'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import type { WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'

type WorkspaceTreeChangesOptions = {
  dirtyPaths: Record<string, true>
  isRestorePending: () => boolean
  loadWorkspace: LoadWorkspace
  onTreeActiveTabChanged?: (tab: WorkspaceTab | null) => void
}

const matchesCurrentRoot = (root: WorkspaceTreeDeltaEvent['root']): boolean => {
  const state = useWorkspaceStore.getState()
  return !state.rootPath || (state.rootKind === root.kind && state.rootPath === root.path)
}

export const useWorkspaceTreeChanges = ({
  dirtyPaths,
  isRestorePending,
  loadWorkspace,
  onTreeActiveTabChanged,
}: WorkspaceTreeChangesOptions) => {
  const queuedRoots = useRef(new Map<string, WorkspaceTreeDeltaEvent['root']>())
  const mounted = useRef(false)

  const refresh = useCallback(
    (root: WorkspaceTreeDeltaEvent['root']) => {
      void loadWorkspace({ preserveCurrentRoute: true }).catch((error: unknown) => {
        if (mounted.current && matchesCurrentRoot(root)) {
          useWorkspaceStore.getState().failTreeLoad(error)
        }
      })
    },
    [loadWorkspace],
  )

  const flushQueuedRefresh = useCallback(() => {
    if (!mounted.current || isRestorePending()) return
    const state = useWorkspaceStore.getState()
    const root = queuedRoots.current.get(`${state.rootKind}:${state.rootPath}`)
    queuedRoots.current.clear()
    if (root && matchesCurrentRoot(root)) refresh(root)
  }, [isRestorePending, refresh])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    mounted.current = true
    const unlisten = workspaceTreeApi.onChanged((event) => {
      // A preserve-route refresh must not supersede the load that selects the
      // initial file route. Re-read once restoration and its paint have settled.
      if (isRestorePending()) {
        queuedRoots.current.set(`${event.root.kind}:${event.root.path}`, event.root)
        return
      }
      if (!matchesCurrentRoot(event.root)) return
      const state = useWorkspaceStore.getState()
      const previousActiveTabId = state.activeTabId
      if (state.applyTreeDelta(event, dirtyPaths)) {
        refresh(event.root)
        return
      }
      const next = useWorkspaceStore.getState()
      if (next.activeTabId !== previousActiveTabId) {
        const activeTab = next.tabs.find((tab) => getWorkspaceTabId(tab) === next.activeTabId)
        onTreeActiveTabChanged?.(activeTab ?? null)
      }
    })
    return () => {
      mounted.current = false
      unlisten()
    }
  }, [dirtyPaths, isRestorePending, onTreeActiveTabChanged, refresh])

  return flushQueuedRefresh
}
