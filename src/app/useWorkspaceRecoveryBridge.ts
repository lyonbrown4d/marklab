import { useCallback, useRef } from 'react'

type RecoveryHandlers = {
  waitForRestore: () => Promise<void>
  completeRecovery: (() => Promise<void>) | null
}

// The loader is created before restoration; callbacks read the connected handlers at action time.
export const useWorkspaceRecoveryBridge = () => {
  const handlersRef = useRef<RecoveryHandlers | null>(null)
  const rootSwitchingRef = useRef(false)
  const onBeforeWorkspaceOpen = useCallback(async () => {
    await handlersRef.current?.waitForRestore()
  }, [])
  const onWorkspaceOpened = useCallback(async () => {
    await handlersRef.current?.completeRecovery?.()
  }, [])
  return { handlersRef, rootSwitchingRef, onBeforeWorkspaceOpen, onWorkspaceOpened }
}
