import { useEffect } from 'react'
import { useWorkspaceRestore } from '@/app/useWorkspaceRestore'
import { useWorkspaceRecoveryActions } from '@/app/useWorkspaceRecoveryActions'
import type { useWorkspaceRecoveryBridge } from '@/app/useWorkspaceRecoveryBridge'

type RestoreArgs = Parameters<typeof useWorkspaceRestore>[0]
type RecoveryArgs = Parameters<typeof useWorkspaceRecoveryActions>[0]

type WorkspaceRestoreRecoveryArgs = RestoreArgs & {
  openFolder: RecoveryArgs['openFolder']
  onUseInternalRoot: RecoveryArgs['useInternalRoot']
  recoveryBridge: ReturnType<typeof useWorkspaceRecoveryBridge>
}

export const useWorkspaceRestoreRecovery = ({
  openFolder,
  onUseInternalRoot,
  recoveryBridge,
  ...restoreArgs
}: WorkspaceRestoreRecoveryArgs) => {
  const restoration = useWorkspaceRestore({
    ...restoreArgs,
    rootSwitchingRef: recoveryBridge.rootSwitchingRef,
  })
  const { restoreFailure, completeWorkspaceRecovery, waitForWorkspaceRestore } = restoration
  const { handlersRef } = recoveryBridge
  useEffect(() => {
    handlersRef.current = {
      waitForRestore: waitForWorkspaceRestore,
      completeRecovery: restoreFailure ? completeWorkspaceRecovery : null,
    }
    return () => {
      handlersRef.current = null
    }
  }, [completeWorkspaceRecovery, handlersRef, restoreFailure, waitForWorkspaceRestore])
  const workspaceRecovery = useWorkspaceRecoveryActions({
    failure: restoreFailure,
    retry: restoration.restoreWorkspaceSession,
    openFolder,
    useInternalRoot: onUseInternalRoot,
    completeRecovery: completeWorkspaceRecovery,
  })
  return { ...restoration, workspaceRecovery }
}
