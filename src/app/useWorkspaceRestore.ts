import { useCallback, useEffect, useRef, useState } from 'react'
import { fsApi, type FsSnapshot } from '@/services/fsApi'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { getWorkspaceTabId, normalizeWorkspaceTabId, normalizeWorkspaceTabs } from '@/logic/tabs'
import type { RootKind, WorkspaceTab } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useI18n } from '@/i18n/useI18n'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'

type LoadWorkspace = (options?: {
  activeTabId?: string | null
  preserveCurrentRoute?: boolean
  snapshot?: FsSnapshot
  tabs?: WorkspaceTab[]
}) => Promise<void>

type UseWorkspaceRestoreArgs = {
  hasHydrated: boolean
  rootPath: string
  rootKind: RootKind
  loadWorkspace: LoadWorkspace
  dirtyPaths?: Record<string, true>
  onTreeActiveTabChanged?: (tab: WorkspaceTab | null) => void
}

type UseWorkspaceRestoreResult = {
  isSessionRestored: boolean
  restoreStatusMessage: string | null
  isRestoringSession: boolean
  restoreWorkspaceSession: () => Promise<boolean>
}

type WorkspaceSessionSeedPayload = {
  state?: Record<string, unknown>
  version?: number
}

type ParsedWorkspaceSessionSeed = {
  activeTabId?: string | null
  tabs?: WorkspaceTab[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

const hasOwn = (value: Record<string, unknown>, key: string): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key)
}

const isRootKind = (value: unknown): value is RootKind => {
  return value === 'internal' || value === 'external' || value === 'single'
}

const applyWorkspaceSessionSeed = (payload: unknown): ParsedWorkspaceSessionSeed => {
  if (!isRecord(payload) || !isRecord(payload.state)) return {}
  const seed = payload.state
  const tabs = Array.isArray(seed.tabs) ? normalizeWorkspaceTabs(seed.tabs) : undefined
  const activeTabId =
    hasOwn(seed, 'activeTabId') && typeof seed.activeTabId === 'string'
      ? normalizeWorkspaceTabId(seed.activeTabId, tabs ?? [])
      : hasOwn(seed, 'activeTabId')
        ? null
        : undefined

  const workspacePatch: {
    activeTabId?: string | null
    rootKind?: RootKind
    rootPath?: string
    tabs?: WorkspaceTab[]
  } = {}
  const preferencesPatch: {
    rightSidebarCollapsed?: boolean
    sidebarCollapsed?: boolean
  } = {}

  if (typeof seed.rootPath === 'string') workspacePatch.rootPath = seed.rootPath
  if (isRootKind(seed.rootKind)) workspacePatch.rootKind = seed.rootKind
  if (tabs) workspacePatch.tabs = tabs
  if (activeTabId !== undefined) workspacePatch.activeTabId = activeTabId
  if (typeof seed.sidebarCollapsed === 'boolean') {
    preferencesPatch.sidebarCollapsed = seed.sidebarCollapsed
  }
  if (typeof seed.rightSidebarCollapsed === 'boolean') {
    preferencesPatch.rightSidebarCollapsed = seed.rightSidebarCollapsed
  }

  if (Object.keys(workspacePatch).length > 0) {
    useWorkspaceStore.setState(workspacePatch)
  }
  if (Object.keys(preferencesPatch).length > 0) {
    usePreferencesStore.setState(preferencesPatch)
  }

  return {
    ...(tabs ? { tabs } : {}),
    ...(activeTabId !== undefined ? { activeTabId } : {}),
  }
}

export const useWorkspaceRestore = ({
  hasHydrated,
  rootPath,
  rootKind,
  loadWorkspace,
  dirtyPaths = {},
  onTreeActiveTabChanged,
}: UseWorkspaceRestoreArgs): UseWorkspaceRestoreResult => {
  const { t } = useI18n()
  const [restoreStatusMessage, setRestoreStatusMessage] = useState<string | null>(null)
  const [isRestoringSession, setIsRestoringSession] = useState(false)
  const [isSessionRestored, setIsSessionRestored] = useState(false)
  const sessionRestoreStartedRef = useRef(false)
  const restoreInProgressRef = useRef(false)

  const restoreWorkspaceSession = useCallback(async () => {
    if (restoreInProgressRef.current) return false
    restoreInProgressRef.current = true
    setIsRestoringSession(true)
    try {
      if (isDesktopRuntime() && rootPath) {
        try {
          await flushEditorChanges()
          if (rootKind === 'single') {
            await fsApi.setSingleFile(rootPath)
          } else if (rootKind === 'external') {
            await fsApi.setRoot(rootPath)
          }
        } catch (error) {
          setRestoreStatusMessage(t('app.restoreRootFailed'))
          void error
          return false
        }
      }
      await loadWorkspace()
      setRestoreStatusMessage(null)
      return true
    } catch (error) {
      setRestoreStatusMessage(t('app.restoreSessionFailed'))
      void error
      return false
    } finally {
      setIsRestoringSession(false)
      restoreInProgressRef.current = false
    }
  }, [loadWorkspace, rootKind, rootPath, t])

  useEffect(() => {
    if (!hasHydrated || sessionRestoreStartedRef.current) return
    sessionRestoreStartedRef.current = true

    let cancelled = false
    void (async () => {
      const restored = await restoreWorkspaceSession()
      if (!cancelled && restored) setIsSessionRestored(true)
    })()

    return () => {
      cancelled = true
    }
  }, [hasHydrated, restoreWorkspaceSession])

  useEffect(() => {
    if (!isDesktopRuntime()) return

    let unlistenWorkspaceSeed: (() => void) | undefined
    void listen<WorkspaceSessionSeedPayload>('workspace-session-seed', (event) => {
      const seed = applyWorkspaceSessionSeed(event.payload)
      void loadWorkspace({
        activeTabId: seed.activeTabId,
        preserveCurrentRoute: false,
        tabs: seed.tabs,
      })
    }).then((fn) => {
      unlistenWorkspaceSeed = fn
    })

    return () => {
      if (unlistenWorkspaceSeed) {
        unlistenWorkspaceSeed()
      }
    }
  }, [loadWorkspace])

  useEffect(() => {
    if (!isDesktopRuntime()) return
    return workspaceTreeApi.onChanged((event) => {
      const state = useWorkspaceStore.getState()
      if (
        state.rootPath &&
        `${state.rootKind}:${state.rootPath}` !== `${event.root.kind}:${event.root.path}`
      ) {
        return
      }
      const previousActiveTabId = state.activeTabId
      if (!state.applyTreeDelta(event, dirtyPaths)) {
        const next = useWorkspaceStore.getState()
        if (next.activeTabId !== previousActiveTabId) {
          const activeTab = next.tabs.find((tab) => getWorkspaceTabId(tab) === next.activeTabId)
          onTreeActiveTabChanged?.(activeTab ?? null)
        }
        return
      }
      void loadWorkspace({ preserveCurrentRoute: true }).catch((error: unknown) => {
        useWorkspaceStore.getState().failTreeLoad(error)
      })
    })
  }, [dirtyPaths, loadWorkspace, onTreeActiveTabChanged])

  return {
    isSessionRestored,
    restoreStatusMessage,
    isRestoringSession,
    restoreWorkspaceSession,
  }
}
