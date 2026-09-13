import { BrowserWindow, type App, type Shell, type WebContents } from 'electron'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service.js'
import type { Logger } from '@electron/services/logger.js'
import { applyAppTaskBadge } from '@electron/services/nativeWindowStatus.js'
import type { WorkspaceSearchIndexFactory } from '@electron/services/workspace/workspaceAnalysisService.js'
import {
  createWindowWorkspaceBinding,
  detachWindowWorkspaceBinding,
  disposeWindowWorkspaceBinding,
  type WindowWorkspaceBinding,
} from '@electron/services/workspace/windowWorkspaceBinding.js'
import {
  WorkspaceShutdownBarrier,
  type WorkspaceShutdownParticipant,
} from '@electron/services/workspace/workspaceShutdownBarrier.js'
import type { WorkspaceOpenedAsset } from '@electron/services/workspace/workspaceOpenedAsset.js'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService.js'
import type { BackgroundTaskStatus, FsRootInfo } from '@electron/services/workspace/types.js'

type WindowWorkspaceRegistryOptions = {
  knowledgeEngineService?: KnowledgeEngineService
  onSessionDisposed?: (sessionKey: string) => void
  workspaceSearchIndexFactory?: WorkspaceSearchIndexFactory
}

export class WindowWorkspaceRegistry {
  private readonly bindings = new Map<number, WindowWorkspaceBinding>()
  private readonly shutdownBarrier = new WorkspaceShutdownBarrier()

  constructor(
    private readonly app: App,
    private readonly shell: Shell,
    private readonly logger: Logger,
    private readonly options: WindowWorkspaceRegistryOptions = {},
  ) {}

  registerWindow(window: BrowserWindow): WorkspaceService {
    return this.bindingForWindow(window).service
  }

  serviceForWebContents(webContents: WebContents): WorkspaceService {
    return this.bindingForWebContents(webContents).service
  }

  async resolveAssetCapability(token: string): Promise<WorkspaceOpenedAsset | null> {
    for (const binding of this.bindings.values()) {
      if (binding.detached || binding.pendingDisposal) continue
      const opened = await binding.service.resolveAssetCapabilityToken(token)
      if (opened) return opened
    }
    return null
  }

  sessionKeyForWebContents(webContents: WebContents): string {
    return this.bindingForWebContents(webContents).sessionKey
  }

  sessionKeyForWindow(window: BrowserWindow): string {
    return this.bindingForWindow(window).sessionKey
  }

  rootInfoForWindow(window: BrowserWindow): FsRootInfo {
    return this.bindingForWindow(window).service.rootInfo()
  }

  terminalCwdForWebContents(webContents: WebContents): string | null {
    const window = BrowserWindow.fromWebContents(webContents)
    if (!window) return null
    return this.bindingForWindow(window).service.terminalCwd()
  }

  beginShutdownBarrier(reason: string): Promise<number> {
    return this.shutdownBarrier.begin(reason, this.shutdownParticipants())
  }

  cancelShutdownBarrier(barrierId: number): void {
    this.shutdownBarrier.cancel(barrierId)
    for (const binding of [...this.bindings.values()]) this.tryFinalizeWindow(binding)
  }

  async flushBuffersForShutdown(barrierId: number): Promise<number> {
    const bindings = [...this.bindings.values()]
    const results = await Promise.allSettled(bindings.map((binding) => binding.flushForShutdown()))
    const errors: Error[] = []
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return
      errors.push(
        new Error(
          'Window ' +
            bindings[index].window.id +
            ' failed to flush: ' +
            this.errorMessage(result.reason),
          { cause: result.reason },
        ),
      )
    })
    try {
      this.shutdownBarrier.review(barrierId, this.shutdownParticipants())
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)))
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Workspace shutdown flush did not reach a stable state')
    }
    return bindings.length
  }

  async disposeAll(): Promise<void> {
    const barrierId = await this.beginShutdownBarrier('dispose all workspace sessions')
    for (const binding of this.bindings.values()) {
      binding.service.revokeAssetCapabilities()
    }
    const errors: unknown[] = []
    let phaseTwoStarted = false
    try {
      try {
        await this.flushBuffersForShutdown(barrierId)
        phaseTwoStarted = true
      } catch (error) {
        errors.push(error)
      }
      if (phaseTwoStarted) {
        const bindings = [...this.bindings.entries()]
        const results = await Promise.allSettled(
          bindings.map(([windowId, binding]) =>
            Promise.resolve().then(() => {
              binding.pendingDisposal = true
              this.finalizeWindow(windowId, binding)
            }),
          ),
        )
        for (const result of results) {
          if (result.status === 'rejected') errors.push(result.reason)
        }
      }
    } finally {
      try {
        if (phaseTwoStarted) this.shutdownBarrier.complete(barrierId)
        else this.cancelShutdownBarrier(barrierId)
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Failed to dispose all workspace windows safely')
    }
  }

  private bindingForWebContents(webContents: WebContents): WindowWorkspaceBinding {
    const window = BrowserWindow.fromWebContents(webContents)
    if (!window) throw new Error('No BrowserWindow owns the requesting WebContents')
    return this.bindingForWindow(window)
  }

  private bindingForWindow(window: BrowserWindow): WindowWorkspaceBinding {
    const current = this.bindings.get(window.id)
    if (current) return current
    if (this.shutdownBarrier.reason) {
      throw new Error('Cannot create a workspace session during ' + this.shutdownBarrier.reason)
    }

    const sessionKey = 'workspace-window-' + window.webContents.id
    const binding = createWindowWorkspaceBinding({
      app: this.app,
      knowledgeEngineService: this.options.knowledgeEngineService,
      logger: this.logger.child('window-' + window.id),
      onReadyToFinalize: (candidate) => this.tryFinalizeWindow(candidate),
      onTaskStateChanged: () => this.updateAppTaskBadge(),
      sessionKey,
      shell: this.shell,
      window,
      workspaceSearchIndexFactory: this.options.workspaceSearchIndexFactory,
    })
    this.bindings.set(window.id, binding)
    window.once('closed', () => this.disposeWindow(window.id))
    this.updateAppTaskBadge()
    this.logger.info('workspace window registered', { sessionKey, windowId: window.id })
    return binding
  }

  private disposeWindow(windowId: number): void {
    const binding = this.bindings.get(windowId)
    if (!binding) return
    binding.service.revokeAssetCapabilities()
    if (!binding.service.hasDirtyBuffers()) {
      this.finalizeWindow(windowId, binding)
      return
    }

    binding.pendingDisposal = true
    detachWindowWorkspaceBinding(binding)
    void binding
      .flushForShutdown()
      .then(() => {
        if (binding.service.hasDirtyBuffers()) {
          throw new Error('Workspace buffers remained dirty after window disposal flush')
        }
        this.finalizeWindow(windowId, binding)
      })
      .catch((error) => {
        this.logger.error('workspace window disposal is waiting for a safe retry', {
          error,
          sessionKey: binding.sessionKey,
          windowId,
        })
      })
  }

  private tryFinalizeWindow(binding: WindowWorkspaceBinding): void {
    if (this.shutdownBarrier.reason) return
    if (
      this.bindings.get(binding.window.id) !== binding ||
      !binding.pendingDisposal ||
      binding.service.hasDirtyBuffers()
    ) {
      return
    }
    try {
      this.finalizeWindow(binding.window.id, binding)
    } catch (error) {
      this.logger.error('workspace pending disposal finalization failed', {
        error,
        sessionKey: binding.sessionKey,
        windowId: binding.window.id,
      })
    }
  }

  private finalizeWindow(windowId: number, binding: WindowWorkspaceBinding): void {
    if (this.bindings.get(windowId) !== binding) return
    if (binding.service.hasDirtyBuffers()) {
      throw new Error('Cannot finalize a workspace session with unsaved buffers')
    }
    const errors: unknown[] = []
    const settle = (work: () => void): void => {
      try {
        work()
      } catch (error) {
        errors.push(error)
      }
    }
    settle(() => disposeWindowWorkspaceBinding(binding))
    this.bindings.delete(windowId)
    settle(() => this.options.onSessionDisposed?.(binding.sessionKey))
    settle(() => this.updateAppTaskBadge())
    settle(() =>
      this.logger.info('workspace window disposed', {
        sessionKey: binding.sessionKey,
        windowId,
      }),
    )
    if (errors.length > 0) {
      throw new AggregateError(errors, 'Workspace session cleanup completed with errors')
    }
  }

  private shutdownParticipants(): WorkspaceShutdownParticipant[] {
    return [...this.bindings].map(([id, binding]) => ({
      currentEpoch: () => binding.service.bufferMutationEpoch(),
      gate: binding.mutationGate,
      hasDirtyBuffers: () => binding.service.hasDirtyBuffers(),
      id,
    }))
  }

  private updateAppTaskBadge(): void {
    const tasks: BackgroundTaskStatus[] = []
    for (const binding of this.bindings.values()) {
      tasks.push(...binding.service.getBackgroundTasks())
    }
    applyAppTaskBadge(this.app, tasks)
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
