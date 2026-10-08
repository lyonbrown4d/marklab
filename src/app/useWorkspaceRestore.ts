import { useCallback, useEffect, useRef, useState } from 'react'
import { fsApi, type FsSnapshot } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import {
  consumeWorkspaceSessionSeed,
  hasPendingWorkspaceSessionSeed,
  onWorkspaceSessionSeed,
  waitForWorkspaceInteractivePaint,
} from '@/runtime/rendererLifecycle'
import { getWorkspaceTabId } from '@/logic/tabs'
import type { RootKind, WorkspaceTab } from '@/store/appTypes'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useI18n } from '@/i18n/useI18n'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import { applyWorkspaceSessionSeed } from '@/app/workspaceSessionSeed'
import {
  alignWorkspaceSessionBackendRoot,
  createWorkspaceRestoreBackendBarrier,
  type WorkspaceRestoreBackendBarrier,
} from '@/app/workspaceRestoreBackend'
import { reportWorkspaceRendererReady } from '@/app/workspaceRestoreReady'

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

type RestoreFailure = 'root' | 'session'
type RestoreResult = { ok: true } | { error: unknown; failure: RestoreFailure; ok: false }
type RestoreOperation = {
  backendAlignment?: WorkspaceRestoreBackendBarrier
  generation: number
  kind: 'default' | 'seed'
  payload?: Parameters<typeof applyWorkspaceSessionSeed>[0]
  promise: Promise<RestoreResult>
  settled: boolean
}
type QueuedSeed = {
  generation: number
  payload: Parameters<typeof applyWorkspaceSessionSeed>[0]
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
  const [queuedSeed, setQueuedSeed] = useState<QueuedSeed | null>(null)
  const activeOperationRef = useRef<RestoreOperation | null>(null)
  const defaultRestorePromiseRef = useRef<Promise<RestoreResult> | null>(null)
  const automaticRestoreCompletedRef = useRef(false)
  const generationRef = useRef(0)
  const latestSeedRef = useRef<Parameters<typeof applyWorkspaceSessionSeed>[0] | null>(null)
  const mountedRef = useRef(true)
  const translateRef = useRef(t)

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
    async (generation: number): Promise<RestoreResult> => {
      if (isDesktopRuntime() && rootPath) {
        try {
          await flushEditorChanges()
          if (generationRef.current !== generation) return { ok: true }
          if (rootKind === 'single') await fsApi.setSingleFile(rootPath)
          else if (rootKind === 'external') await fsApi.setRoot(rootPath)
          if (generationRef.current !== generation) return { ok: true }
        } catch (error) {
          return { error, failure: 'root', ok: false }
        }
      }
      if (generationRef.current !== generation) return { ok: true }
      try {
        await loadWorkspace()
        return { ok: true }
      } catch (error) {
        return { error, failure: 'session', ok: false }
      }
    },
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

  const observeOperation = useCallback((operation: RestoreOperation): void => {
    void operation.promise.then(async (result) => {
      operation.settled = true
      if (defaultRestorePromiseRef.current === operation.promise) {
        defaultRestorePromiseRef.current = null
      }
      if (result.ok) await waitForWorkspaceInteractivePaint()
      if (!mountedRef.current || generationRef.current !== operation.generation) return
      automaticRestoreCompletedRef.current = true
      if (operation.payload) {
        setQueuedSeed((current) => (current?.generation === operation.generation ? null : current))
      }
      setIsRestoringSession(false)
      if (!result.ok) {
        const messageKey =
          result.failure === 'root' ? 'app.restoreRootFailed' : 'app.restoreSessionFailed'
        setRestoreStatusMessage(translateRef.current(messageKey))
        await reportWorkspaceRendererReady({
          error: result.error instanceof Error ? result.error.message : String(result.error),
          phase: 'workspace-error',
        })
        return
      }
      if (operation.payload) consumeWorkspaceSessionSeed(operation.payload)
      setRestoreStatusMessage(null)
      setIsSessionRestored(true)
      await reportWorkspaceRendererReady({ phase: 'workspace-interactive' })
    })
  }, [])

  const beginDefaultRestore = useCallback((): RestoreOperation => {
    const current = activeOperationRef.current
    if (current?.kind === 'default' && !current.settled) return current
    const generation = ++generationRef.current
    const operation: RestoreOperation = {
      generation,
      kind: 'default',
      promise: runDefaultRestore(generation),
      settled: false,
    }
    defaultRestorePromiseRef.current = operation.promise
    activeOperationRef.current = operation
    setIsRestoringSession(true)
    observeOperation(operation)
    return operation
  }, [observeOperation, runDefaultRestore])

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
      const operation: RestoreOperation = {
        backendAlignment,
        generation: seed.generation,
        kind: 'seed',
        payload: seed.payload,
        promise: runSeedRestore(
          seed.payload,
          seed.generation,
          previousBackendWork,
          backendAlignment,
        ),
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
    const operation = beginDefaultRestore()
    const result = await operation.promise
    return result.ok && operation.generation === generationRef.current
  }, [beginDefaultRestore])

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
      automaticRestoreCompletedRef.current = false
      setQueuedSeed({ generation, payload })
      setIsSessionRestored(false)
    })

    return unlistenWorkspaceSeed
  }, [])

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
