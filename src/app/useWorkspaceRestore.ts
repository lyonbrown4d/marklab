import { useCallback, useEffect, useRef, useState } from 'react'
import { fsApi, fsSnapshotSchema, type FsSnapshot } from '@/services/fsApi'
import { appApi } from '@/services/appApi'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/useI18n'

type LoadWorkspace = (options?: {
  preserveCurrentRoute?: boolean
  snapshot?: FsSnapshot
}) => Promise<void>

type UseWorkspaceRestoreArgs = {
  hasHydrated: boolean
  rootPath: string
  rootKind: 'internal' | 'external' | 'single'
  openFolder: (path: string) => Promise<void>
  loadWorkspace: LoadWorkspace
}

type UseWorkspaceRestoreResult = {
  isSessionRestored: boolean
  restoreStatusMessage: string | null
  isRestoringSession: boolean
  restoreWorkspaceSession: () => Promise<void>
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
