import {
  runWorkspacePathMutation,
  type WorkspaceMutationPath,
} from '@electron/services/workspace/workspaceWriteCoordinator.js'
import type { App, BrowserWindow, Shell } from 'electron'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { Logger } from '@electron/services/logger.js'
import {
  applyAppRecentDocument,
  applyWindowDocumentStatus,
  createNativeRecentDocumentState,
} from '@electron/services/nativeWindowDocument.js'
import {
  applyWindowTaskAttention,
  applyWindowTaskProgress,
  clearWindowTaskAttention,
  createNativeTaskAttentionState,
} from '@electron/services/nativeWindowStatus.js'
import type { WorkspaceSearchIndexFactory } from '@electron/services/workspace/workspaceAnalysisService.js'
import { WorkspaceMutationGate } from '@electron/services/workspace/workspaceShutdownBarrier.js'
import { WorkspaceService } from '@electron/services/workspace/workspaceService.js'
import { bindWorkspaceRendererEvents } from '@electron/services/workspace/workspaceRendererEvents.js'

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
  logger: Logger
  onReadyToFinalize: (binding: WindowWorkspaceBinding) => void
  onTaskStateChanged: () => void
  sessionKey: string
  shell: Shell
  window: BrowserWindow
  workspaceSearchIndexFactory?: WorkspaceSearchIndexFactory
}

const installMutationGate = (
  service: WorkspaceService,
  gate: WorkspaceMutationGate,
): (() => Promise<void>) => {
  const mutationPath = (
    value: unknown,
    field: 'path' | 'from' | 'to',
    includeDescendants = false,
  ): WorkspaceMutationPath => {
    const candidate = (value as Record<string, unknown> | null)?.[field]
    if (typeof candidate !== 'string') {
      throw new Error('Workspace mutation requires a string "' + field + '" path')
    }
    return {
      absolutePath: service.resolveCoordinatorPath(candidate),
      includeDescendants,
    }
  }
  const coordinatedMutation = <T>(
    operation: string,
    paths: () => WorkspaceMutationPath[],
    work: () => Promise<T>,
  ): Promise<T> =>
    gate.runAsync(operation, () =>
      runWorkspacePathMutation({
        ownerId: service.writeCoordinatorOwnerId(),
        paths: paths(),
        work,
      }),
    )
  const flushForShutdown = service.flushBuffers.bind(service)
  const setRoot = service.setRoot.bind(service)
  const setSingleFile = service.setSingleFile.bind(service)
  const readFile = service.readFile.bind(service)
  const updateBuffer = service.updateBuffer.bind(service)
  const writeFile = service.writeFile.bind(service)
  const flushBuffers = service.flushBuffers.bind(service)
  const createFile = service.createFile.bind(service)
  const createDir = service.createDir.bind(service)
  const renamePath = service.renamePath.bind(service)
  const movePath = service.movePath.bind(service)
  const deletePath = service.deletePath.bind(service)
  const importAsset = service.importMarkdownAsset.bind(service)
  const importAssetBase64 = service.importMarkdownAssetBase64.bind(service)

  service.setRoot = (value) => gate.runAsync('switch workspace root', () => setRoot(value))
  service.setSingleFile = (value) =>
    gate.runAsync('switch single-file workspace', () => setSingleFile(value))
  service.readFile = (value) => gate.runAsync('complete workspace file read', () => readFile(value))
  service.updateBuffer = (value) =>
    gate.runSync('update workspace buffer', () => updateBuffer(value))
  service.writeFile = (value) => gate.runSync('write workspace file', () => writeFile(value))
  service.flushBuffers = () => gate.runAsync('flush workspace buffers', () => flushBuffers())
  service.createFile = (value) =>
    coordinatedMutation(
      'create workspace file',
      () => [mutationPath(value, 'path')],
      () => createFile(value),
    )
  service.createDir = (value) =>
    coordinatedMutation(
      'create workspace directory',
      () => [mutationPath(value, 'path', true)],
      () => createDir(value),
    )
  service.renamePath = (value) =>
    coordinatedMutation(
      'rename workspace path',
      () => [mutationPath(value, 'from', true), mutationPath(value, 'to', true)],
      () => renamePath(value),
    )
  service.movePath = (value) =>
    coordinatedMutation(
      'move workspace path',
      () => [mutationPath(value, 'from', true), mutationPath(value, 'to', true)],
      () => movePath(value),
    )
  service.deletePath = (value) =>
    coordinatedMutation(
      'delete workspace path',
      () => [mutationPath(value, 'path', true)],
      () => deletePath(value),
    )
  service.importMarkdownAsset = (value) =>
    gate.runAsync('import markdown asset', () => importAsset(value))
  service.importMarkdownAssetBase64 = (value) =>
    gate.runAsync('import base64 markdown asset', () => importAssetBase64(value))
  return flushForShutdown
}

export const createWindowWorkspaceBinding = (
  options: CreateWindowWorkspaceBindingOptions,
): WindowWorkspaceBinding => {
  const service = new WorkspaceService(
    options.app,
    options.shell,
    options.logger,
    options.workspaceSearchIndexFactory,
    options.knowledgeEngineService,
  )
  const mutationGate = new WorkspaceMutationGate()
  service.setAutoFlushMutationRunner((work) =>
    mutationGate.runAsync('auto-flush workspace buffers', work),
  )
  const flushForShutdown = installMutationGate(service, mutationGate)
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
