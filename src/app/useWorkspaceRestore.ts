import { useCallback, useEffect, useRef, useState } from 'react'
import { isDesktopRuntime } from '@/runtime/environment'
import {
  consumeWorkspaceSessionSeed,
  hasPendingWorkspaceSessionSeed,
  onWorkspaceSessionSeed,
  waitForWorkspaceInteractivePaint,
} from '@/runtime/rendererLifecycle'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useI18n } from '@/i18n/useI18n'
import { useWorkspaceTreeChanges } from '@/app/useWorkspaceTreeChanges'
import { applyWorkspaceSessionSeed } from '@/app/workspaceSessionSeed'
import {
  alignWorkspaceSessionBackendRoot,
  createWorkspaceRestoreBackendBarrier,
  restoreDefaultWorkspace,
  type WorkspaceRestoreBackendBarrier,
} from '@/app/workspaceRestoreBackend'
import { reportWorkspaceRendererReady } from '@/app/workspaceRestoreReady'
import type {
  QueuedSeed,
  RestoreOperation,
  RestoreResult,
  UseWorkspaceRestoreArgs,
  UseWorkspaceRestoreResult,
  WorkspaceRestoreFailure,
} from '@/app/workspaceRestoreTypes'

export const useWorkspaceRestore = ({
  hasHydrated,
  rootPath,
  rootKind,
  loadWorkspace,
  dirtyPaths = {},
  onTreeActiveTabChanged,
  rootSwitchingRef,
}: UseWorkspaceRestoreArgs): UseWorkspaceRestoreResult => {
  const { t } = useI18n()
  const [restoreStatusMessage, setRestoreStatusMessage] = useState<string | null>(null)
  const [restoreFailure, setRestoreFailure] = useState<WorkspaceRestoreFailure | null>(null)
  const [isRestoringSession, setIsRestoringSession] = useState(false)
  const [isSessionRestored, setIsSessionRestored] = useState(false)
  const [queuedSeed, setQueuedSeed] = useState<QueuedSeed | null>(null)
  const activeOperationRef = useRef<RestoreOperation | null>(null)
  const defaultRestorePromiseRef = useRef<Promise<RestoreResult> | null>(null)
  const automaticRestoreCompletedRef = useRef(false)
  const generationRef = useRef(0)
  const pendingRestoreGenerationRef = useRef<number | null>(null)
  const latestSeedRef = useRef<Parameters<typeof applyWorkspaceSessionSeed>[0] | null>(null)
  const mountedRef = useRef(true)
  const translateRef = useRef(t)
  const isRestorePending = useCallback(
    () =>
      pendingRestoreGenerationRef.current !== null ||
      hasPendingWorkspaceSessionSeed() ||
      (hasHydrated && !automaticRestoreCompletedRef.current),
    [hasHydrated],
  )
  const flushQueuedTreeRefresh = useWorkspaceTreeChanges({
    dirtyPaths,
    isRestorePending,
    loadWorkspace,
    onTreeActiveTabChanged,
  })

  useEffect(() => {
    translateRef.current = t
  }, [t])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const runDefaultRestore = useCallback(
    (generation: number): Promise<RestoreResult> =>
      restoreDefaultWorkspace({
        isCurrent: () => generationRef.current === generation,
        loadWorkspace,
        rootKind,
        rootPath,
      }),
    [loadWorkspace, rootKind, rootPath],
  )

  const runSeedRestore = useCallback(
    async (
      payload: Parameters<typeof applyWorkspaceSessionSeed>[0],
      generation: number,
      previous: Promise<unknown> | null,
      backendAlignment: WorkspaceRestoreBackendBarrier,
    ): Promise<RestoreResult> => {
      let seed: ReturnType<typeof applyWorkspaceSessionSeed>
      try {
        seed = applyWorkspaceSessionSeed(payload)
      } catch (error) {
        backendAlignment.settle()
        return { error, failure: 'session', ok: false }
      }
      try {
        const requiresBackendAlignment = previous !== null
        if (previous) await previous
        if (generationRef.current !== generation) return { ok: true }
        if (requiresBackendAlignment) await alignWorkspaceSessionBackendRoot(seed)
        if (generationRef.current !== generation) return { ok: true }
      } catch (error) {
        return { error, failure: 'root', ok: false }
      } finally {
        backendAlignment.settle()
      }
      try {
        await loadWorkspace({
          activeTabId: seed.activeTabId,
          preserveCurrentRoute: false,
          tabs: seed.tabs,
        })
        return { ok: true }
      } catch (error) {
        return { error, failure: 'session', ok: false }
      }
    },
    [loadWorkspace],
  )

  const observeOperation = useCallback(
    (operation: RestoreOperation): void => {
      void operation.promise.then(async (result) => {
        operation.settled = true
        if (defaultRestorePromiseRef.current === operation.promise) {
          defaultRestorePromiseRef.current = null
        }
        if (result.ok) await waitForWorkspaceInteractivePaint()
        if (!mountedRef.current || generationRef.current !== operation.generation) return
        automaticRestoreCompletedRef.current = true
        if (operation.payload) {
          setQueuedSeed((current) =>
            current?.generation === operation.generation ? null : current,
          )
        }
        setIsRestoringSession(false)
        if (!result.ok) {
          const messageKey =
            result.failure === 'root' ? 'app.restoreRootFailed' : 'app.restoreSessionFailed'
          setRestoreStatusMessage(translateRef.current(messageKey))
          setRestoreFailure({
            phase: result.failure,
            rootKind: operation.rootKind,
            rootPath: operation.rootPath,
            message: translateRef.current(messageKey),
            detail: result.error instanceof Error ? result.error.message : String(result.error),
          })
          await reportWorkspaceRendererReady({
            error: result.error instanceof Error ? result.error.message : String(result.error),
            phase: 'workspace-error',
          })
          if (generationRef.current === operation.generation) {
            pendingRestoreGenerationRef.current = null
          }
          return
        }
        if (operation.payload) consumeWorkspaceSessionSeed(operation.payload)
        else if (latestSeedRef.current) consumeWorkspaceSessionSeed(latestSeedRef.current)
        setRestoreFailure(null)
        setRestoreStatusMessage(null)
        setIsSessionRestored(true)
        await reportWorkspaceRendererReady({ phase: 'workspace-interactive' })
        if (!mountedRef.current || generationRef.current !== operation.generation) return
        pendingRestoreGenerationRef.current = null
        flushQueuedTreeRefresh()
      })
    },
    [flushQueuedTreeRefresh],
  )

  const beginDefaultRestore = useCallback((): RestoreOperation => {
    const current = activeOperationRef.current
    if (current?.kind === 'default' && !current.settled) return current
    const generation = ++generationRef.current
    pendingRestoreGenerationRef.current = generation
    const operation: RestoreOperation = {
      generation,
      kind: 'default',
      rootKind,
      rootPath,
      promise: runDefaultRestore(generation),
      settled: false,
    }
    defaultRestorePromiseRef.current = operation.promise
    activeOperationRef.current = operation
    setIsRestoringSession(true)
    setIsSessionRestored(false)
    observeOperation(operation)
    return operation
  }, [observeOperation, rootKind, rootPath, runDefaultRestore])

  const beginSeedRestore = useCallback(
    (seed: QueuedSeed): RestoreOperation => {
      const current = activeOperationRef.current
      if (current?.kind === 'seed' && current.generation === seed.generation) return current
      const pendingSeedAlignment =
        current?.kind === 'seed' && current.backendAlignment && !current.backendAlignment.settled
          ? current.backendAlignment.promise
          : null
      const previousBackendWork = pendingSeedAlignment ?? defaultRestorePromiseRef.current
      const backendAlignment = createWorkspaceRestoreBackendBarrier()
      pendingRestoreGenerationRef.current = seed.generation
      const promise = runSeedRestore(
        seed.payload,
        seed.generation,
        previousBackendWork,
        backendAlignment,
      )
      const operation: RestoreOperation = {
        backendAlignment,
        generation: seed.generation,
        kind: 'seed',
        rootKind: useWorkspaceStore.getState().rootKind,
        rootPath: useWorkspaceStore.getState().rootPath,
        payload: seed.payload,
        promise,
        settled: false,
      }
      activeOperationRef.current = operation
      setIsRestoringSession(true)
      setIsSessionRestored(false)
      observeOperation(operation)
      return operation
    },
    [observeOperation, runSeedRestore],
  )

  const restoreWorkspaceSession = useCallback(async (): Promise<boolean> => {
    if (rootSwitchingRef?.current) return false
    const operation = beginDefaultRestore()
    const result = await operation.promise
    return result.ok && operation.generation === generationRef.current
  }, [beginDefaultRestore, rootSwitchingRef])

  const completeWorkspaceRecovery = useCallback(async () => {
    if (automaticRestoreCompletedRef.current && activeOperationRef.current === null) return
    const generation = ++generationRef.current
    pendingRestoreGenerationRef.current = generation
    activeOperationRef.current = null
    automaticRestoreCompletedRef.current = true
    if (latestSeedRef.current) consumeWorkspaceSessionSeed(latestSeedRef.current)
    setQueuedSeed(null)
    setRestoreFailure(null)
    setRestoreStatusMessage(null)
    setIsRestoringSession(false)
    setIsSessionRestored(true)
    await waitForWorkspaceInteractivePaint()
    if (!mountedRef.current || generationRef.current !== generation) return
    await reportWorkspaceRendererReady({ phase: 'workspace-interactive' })
    if (!mountedRef.current || generationRef.current !== generation) return
    pendingRestoreGenerationRef.current = null
    flushQueuedTreeRefresh()
  }, [flushQueuedTreeRefresh])

  const waitForWorkspaceRestore = useCallback(async () => {
    await activeOperationRef.current?.promise
  }, [])

  useEffect(() => {
    if (!hasHydrated) return
    if (queuedSeed) {
      beginSeedRestore(queuedSeed)
      return
    }
    if (!automaticRestoreCompletedRef.current && !hasPendingWorkspaceSessionSeed()) {
      beginDefaultRestore()
    }
  }, [beginDefaultRestore, beginSeedRestore, hasHydrated, queuedSeed])

  useEffect(() => {
    if (!isDesktopRuntime()) return

    const unlistenWorkspaceSeed = onWorkspaceSessionSeed((payload) => {
      if (latestSeedRef.current === payload) return
      latestSeedRef.current = payload
      const generation = ++generationRef.current
      pendingRestoreGenerationRef.current = generation
      automaticRestoreCompletedRef.current = false
      setQueuedSeed({ generation, payload })
      setRestoreFailure(null)
      setRestoreStatusMessage(null)
      setIsSessionRestored(false)
    })

    return unlistenWorkspaceSeed
  }, [])

  return {
    isSessionRestored,
    restoreStatusMessage,
    isRestoringSession,
    restoreWorkspaceSession,
    restoreFailure,
    completeWorkspaceRecovery,
    waitForWorkspaceRestore,
  }
}
