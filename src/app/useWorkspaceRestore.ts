import { useCallback, useEffect, useRef, useState } from 'react'
import { fsApi, fsSnapshotSchema, type FsSnapshot } from '@/services/fsApi'
import { appApi } from '@/services/appApi'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { normalizeWorkspaceTabId, normalizeWorkspaceTabs } from '@/logic/tabs'
import type { RootKind, WorkspaceTab } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/useI18n'

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
  openFolder: (path: string) => Promise<void>
  loadWorkspace: LoadWorkspace
}

type UseWorkspaceRestoreResult = {
  isSessionRestored: boolean
  restoreStatusMessage: string | null
  isRestoringSession: boolean
  restoreWorkspaceSession: () => Promise<void>
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
  openFolder,
  loadWorkspace,
}: UseWorkspaceRestoreArgs): UseWorkspaceRestoreResult => {
  const { t } = useI18n()
  const [restoreStatusMessage, setRestoreStatusMessage] = useState<string | null>(null)
  const [isRestoringSession, setIsRestoringSession] = useState(false)
  const [isSessionRestored, setIsSessionRestored] = useState(false)
  const sessionRestoreStartedRef = useRef(false)
  const restoreInProgressRef = useRef(false)

  const restoreWorkspaceSession = useCallback(async () => {
    if (restoreInProgressRef.current) return
    restoreInProgressRef.current = true
    setIsRestoringSession(true)
    try {
      if (isDesktopRuntime() && rootPath) {
        try {
          if (rootKind === 'single') {
            await fsApi.setSingleFile(rootPath)
          } else if (rootKind === 'external') {
            await fsApi.setRoot(rootPath)
          }
        } catch (error) {
          setRestoreStatusMessage(t('app.restoreRootFailed'))
          void error
        }
      }
      await loadWorkspace()
      setRestoreStatusMessage(null)
    } catch (error) {
      setRestoreStatusMessage(t('app.restoreSessionFailed'))
      void error
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
      await restoreWorkspaceSession()
      if (!cancelled) setIsSessionRestored(true)
    })()

    return () => {
      cancelled = true
    }
  }, [hasHydrated, restoreWorkspaceSession])

  useEffect(() => {
    if (!isDesktopRuntime()) return

    const openArgs = (args: string[]) => {
      const paths = args.filter((arg) => arg && !arg.startsWith('-') && !arg.startsWith('marklab:'))
      for (const path of paths) {
        void openFolder(path).catch((error) => {
          toast.error(t('app.openPathFromArgumentsFailed'), {
            description: `${path}\n${String(error)}`,
          })
        })
      }
    }

    let unlistenSingleInstance: (() => void) | undefined
    void appApi.getLaunchInfo().then((info) => {
      openArgs(info.args)
    })
    void listen<{ args: string[]; cwd: string }>('single-instance', (event) => {
      openArgs(event.payload.args)
    }).then((fn) => {
      unlistenSingleInstance = fn
    })

    return () => {
      if (unlistenSingleInstance) {
        unlistenSingleInstance()
      }
    }
  }, [openFolder, t])

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

    let unlisten: (() => void) | undefined
    const setup = async () => {
      unlisten = await listen<unknown>('fs-changed', (event) => {
        const parsed = fsSnapshotSchema.safeParse(event.payload)
        if (!parsed.success) return
        void loadWorkspace({
          snapshot: parsed.data,
        })
      })
    }
    void setup()
    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [loadWorkspace])

  return {
    isSessionRestored,
    restoreStatusMessage,
    isRestoringSession,
    restoreWorkspaceSession,
  }
}
