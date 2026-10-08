import type { App, BrowserWindow, Shell } from 'electron'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import {
  applyAppRecentDocument,
  applyWindowDocumentStatus,
  createNativeRecentDocumentState,
} from '@electron/services/nativeWindowDocument'
import {
  applyWindowTaskAttention,
  applyWindowTaskProgress,
  clearWindowTaskAttention,
  createNativeTaskAttentionState,
} from '@electron/services/nativeWindowStatus'
import type { WorkspaceSearchIndexFactory } from '@electron/services/workspace/workspaceAnalysisServiceTypes'
import type { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'
import type { WorkspaceGraphComputationScheduler } from '@electron/services/workspace/workspaceGraphComputationScheduler'
import type { WorkspaceGraphStore } from '@electron/services/workspace/workspaceGraphStore'
import { activateWorkspaceWindowState } from '@electron/windowStateRestore'
import { WorkspaceMutationGate } from '@electron/services/workspace/workspaceShutdownBarrier'
import { WorkspaceService } from '@electron/services/workspace/workspaceService'
import { bindWorkspaceRendererEvents } from '@electron/services/workspace/workspaceRendererEvents'
import { installWindowWorkspaceMutationGate } from '@electron/services/workspace/windowWorkspaceMutationGate'

export type WindowWorkspaceBinding = {
  detach: () => void
  detached: boolean
  dispose: () => void
  flushForShutdown: () => Promise<void>
  mutationGate: WorkspaceMutationGate
  pendingDisposal: boolean
  service: WorkspaceService
  sessionKey: string
  window: BrowserWindow
}

type CreateWindowWorkspaceBindingOptions = {
  app: App
  knowledgeEngineService?: KnowledgeEngineService
  localHistoryService: LocalHistoryServiceContract
  logger: Logger
  onReadyToFinalize: (binding: WindowWorkspaceBinding) => void
  onTaskStateChanged: () => void
  sessionKey: string
  shell: Shell
  window: BrowserWindow
  workspaceAnalysisScheduler?: WorkspaceAnalysisScheduler
  workspaceGraphScheduler?: WorkspaceGraphComputationScheduler
  workspaceGraphStore?: WorkspaceGraphStore
  workspaceSearchIndexFactory?: WorkspaceSearchIndexFactory
}

export const createWindowWorkspaceBinding = (
  options: CreateWindowWorkspaceBindingOptions,
): WindowWorkspaceBinding => {
  const service = new WorkspaceService(
    options.app,
    options.shell,
    options.logger,
    options.localHistoryService,
    options.workspaceSearchIndexFactory,
    options.knowledgeEngineService,
    {
      workspaceAnalysisScheduler: options.workspaceAnalysisScheduler,
      workspaceGraphScheduler: options.workspaceGraphScheduler,
      workspaceGraphStore: options.workspaceGraphStore,
    },
  )
  const mutationGate = new WorkspaceMutationGate()
  service.setAutoFlushMutationRunner((work) =>
    mutationGate.runAsync('auto-flush workspace buffers', work),
  )
  const flushForShutdown = installWindowWorkspaceMutationGate(service, mutationGate, (root) =>
    activateWorkspaceWindowState(options.window, root, options.logger),
  )
  const recentDocumentState = createNativeRecentDocumentState()
  const taskAttentionState = createNativeTaskAttentionState()
  const nativeDisposers: Array<() => void> = []
  const persistenceDisposers: Array<() => void> = []
  let finalizeScheduled = false

  const updateDocumentStatus = (): void => {
    applyWindowDocumentStatus(options.window, service.rootInfo(), service.hasDirtyBuffers())
  }
  const requestFinalize = (): void => {
    const flushTask = service.getBackgroundTasks().find((task) => task.id === 'buffer-flush')
    if (
      !binding?.pendingDisposal ||
      service.hasDirtyBuffers() ||
      flushTask?.status === 'running' ||
      finalizeScheduled
    )
      return
    finalizeScheduled = true
    queueMicrotask(() => {
      finalizeScheduled = false
      if (binding.pendingDisposal && !service.hasDirtyBuffers()) {
        options.onReadyToFinalize(binding)
      }
    })
  }
  const detach = (): void => {
    if (binding.detached) return
    binding.detached = true
    const errors: unknown[] = []
    const settle = (work: () => void): void => {
      try {
        work()
      } catch (error) {
        errors.push(error)
      }
    }
    for (const dispose of nativeDisposers.splice(0)) settle(dispose)
    settle(() => clearWindowTaskAttention(options.window))
    settle(() => {
      if (!options.window.isDestroyed()) options.window.setProgressBar(-1)
    })
    settle(() => options.onTaskStateChanged())
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to detach workspace window cleanly')
    }
  }
  const dispose = (): void => {
    const errors: unknown[] = []
    try {
      detach()
    } catch (error) {
      errors.push(error)
    }
    for (const unsubscribe of persistenceDisposers.splice(0)) {
      try {
        unsubscribe()
      } catch (error) {
        errors.push(error)
      }
    }
    try {
      service.dispose()
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to dispose workspace window cleanly')
    }
  }

  const binding: WindowWorkspaceBinding = {
    detach,
    detached: false,
    dispose,
    flushForShutdown,
    mutationGate,
    pendingDisposal: false,
    service,
    sessionKey: options.sessionKey,
    window: options.window,
  }

  const flushOnBlur = (): void => {
    // Closing windows can blur after shutdown has already frozen and flushed this session.
    // An earlier blur save enters the gate, so shutdown waits for it to settle.
    if (
      binding.detached ||
      binding.pendingDisposal ||
      mutationGate.reason !== null ||
      !service.hasDirtyBuffers()
    )
      return
    void service.flushBuffers().catch((error: unknown) => {
      options.logger.error('workspace buffers could not be saved on window blur', {
        error,
        sessionKey: binding.sessionKey,
        windowId: options.window.id,
      })
    })
  }
  options.window.on('blur', flushOnBlur)
  nativeDisposers.push(
    bindWorkspaceRendererEvents({ window: options.window, service, logger: options.logger }),
  )
  nativeDisposers.push(() => options.window.removeListener('blur', flushOnBlur))

  updateDocumentStatus()
  applyAppRecentDocument(options.app, service.rootInfo(), recentDocumentState)
  nativeDisposers.push(
    service.onBufferStatus(updateDocumentStatus),
    service.onSnapshotChanged((snapshot) => {
      activateWorkspaceWindowState(options.window, snapshot.root, options.logger)
      applyWindowDocumentStatus(options.window, snapshot.root, service.hasDirtyBuffers())
      applyAppRecentDocument(options.app, snapshot.root, recentDocumentState)
    }),
    service.onBackgroundTasksChanged((tasks) => {
      applyWindowTaskProgress(options.window, tasks)
      applyWindowTaskAttention(options.window, tasks, taskAttentionState)
      options.onTaskStateChanged()
    }),
  )
  persistenceDisposers.push(
    service.onBufferStatus(requestFinalize),
    service.onBackgroundTasksChanged(requestFinalize),
  )
  return binding
}

export const detachWindowWorkspaceBinding = (binding: WindowWorkspaceBinding): void => {
  binding.detach()
}

export const disposeWindowWorkspaceBinding = (binding: WindowWorkspaceBinding): void => {
  binding.dispose()
}
