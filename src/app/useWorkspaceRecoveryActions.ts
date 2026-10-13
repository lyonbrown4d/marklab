import { useCallback, useEffect, useRef, useState } from 'react'
import { useLatest } from 'ahooks'
import { openDialog } from '@/runtime/dialog'
import { MARKLAB_DOCUMENT_EXTENSIONS } from '@/logic/fileTypes'
import { projectLoaderErrorMessage } from '@/app/projectLoaderUtils'
import type { WorkspaceRestoreFailure } from '@/app/workspaceRestoreTypes'
import { useI18n } from '@/i18n/useI18n'

export type WorkspaceRecoveryAction = 'retry' | 'relocate' | 'open' | 'internal'

type UseWorkspaceRecoveryActionsArgs = {
  failure: WorkspaceRestoreFailure | null
  retry: () => Promise<boolean>
  openFolder: (path: string, options?: { preserveTabs?: boolean }) => Promise<boolean>
  useInternalRoot: () => Promise<boolean>
  completeRecovery: () => Promise<void>
}

export const useWorkspaceRecoveryActions = ({
  failure,
  retry,
  openFolder,
  useInternalRoot: restoreInternalRoot,
  completeRecovery,
}: UseWorkspaceRecoveryActionsArgs) => {
  const { t } = useI18n()
  const [busyAction, setBusyAction] = useState<WorkspaceRecoveryAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(false)
  const mountedRef = useRef(true)
  const failureRef = useLatest(failure)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const recover = useCallback(
    async (action: WorkspaceRecoveryAction): Promise<void> => {
      if (!failure || pendingRef.current) return
      pendingRef.current = true
      setBusyAction(action)
      setError(null)
      try {
        let recovered: boolean
        if (action === 'retry') {
          recovered = await retry()
        } else if (action === 'internal') {
          recovered = await restoreInternalRoot()
        } else {
          const singleFile = action === 'relocate' && failure.rootKind === 'single'
          const selected = await openDialog({
            directory: !singleFile,
            multiple: false,
            title: t(
              action === 'relocate'
                ? 'app.workspaceRecoveryLocateTitle'
                : 'dialog.selectProjectTitle',
            ),
            ...(singleFile
              ? {
                  filters: [{ name: 'Marklab documents', extensions: MARKLAB_DOCUMENT_EXTENSIONS }],
                }
              : {}),
          })
          if (typeof selected !== 'string' || !mountedRef.current || failureRef.current !== failure)
            return
          recovered = await openFolder(selected, { preserveTabs: action === 'relocate' })
        }
        if (!mountedRef.current || failureRef.current !== failure) return
        if (recovered) {
          if (action !== 'retry') await completeRecovery()
        } else {
          setError(t('app.workspaceRecoveryActionFailed'))
        }
      } catch (cause) {
        if (mountedRef.current && failureRef.current === failure) {
          setError(projectLoaderErrorMessage(cause))
        }
      } finally {
        pendingRef.current = false
        if (mountedRef.current) setBusyAction(null)
      }
    },
    [completeRecovery, failure, failureRef, openFolder, restoreInternalRoot, retry, t],
  )

  return { busyAction, error, recover }
}
