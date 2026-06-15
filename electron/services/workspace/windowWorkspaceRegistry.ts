import { BrowserWindow, type App, type Shell, type WebContents } from 'electron'
import { noopLogger, type Logger } from '@electron/services/logger.js'
import { WorkspaceService } from '@electron/services/workspace/workspaceService.js'
import type { WorkspaceSearchIndexFactory } from '@electron/services/workspace/workspaceAnalysisService.js'
import type { FsRootInfo } from '@electron/services/workspace/types.js'

type WorkspaceBinding = {
  dispose: () => void
  sessionKey: string
  service: WorkspaceService
}

type WindowWorkspaceRegistryOptions = {
  onSessionDisposed?: (sessionKey: string) => void
  workspaceSearchIndexFactory?: WorkspaceSearchIndexFactory
}

export class WindowWorkspaceRegistry {
  private readonly bindings = new Map<number, WorkspaceBinding>()
  private nextSessionId = 1

  constructor(
    private readonly app: App,
    private readonly shell: Shell,
    private readonly logger: Logger = noopLogger,
    private readonly options: WindowWorkspaceRegistryOptions = {},
  ) {}

  registerWindow(window: BrowserWindow): WorkspaceService {
    return this.bindingForWindow(window).service
  }

  sessionKeyForWebContents(webContents: WebContents): string {
    const window = BrowserWindow.fromWebContents(webContents)
    if (!window) throw new Error('Unable to resolve session window.')
    return this.bindingForWindow(window).sessionKey
  }

  sessionKeyForWindow(window: BrowserWindow): string {
    return this.bindingForWindow(window).sessionKey
  }

  private bindingForWindow(window: BrowserWindow): WorkspaceBinding {
    const current = this.bindings.get(window.id)
    if (current) return current

    const workspace = new WorkspaceService(
      this.app,
      this.shell,
      this.logger.child(`window-${window.id}`),
      this.options.workspaceSearchIndexFactory,
    )
    const disposeBufferStatus = workspace.onBufferStatus((status) => {
      if (!window.isDestroyed()) window.webContents.send('fs-buffer-status', status)
    })
    const disposeSnapshot = workspace.onSnapshotChanged((snapshot) => {
      if (!window.isDestroyed()) window.webContents.send('fs-changed', snapshot)
    })
    const dispose = () => {
      disposeBufferStatus()
      disposeSnapshot()
      workspace.dispose()
    }
    const sessionKey = this.createSessionKey()

    const binding = { dispose, service: workspace, sessionKey }
    this.bindings.set(window.id, binding)
    window.once('closed', () => this.disposeWindow(window.id))
    this.logger.info('window workspace registered', { sessionKey, windowId: window.id })
    return binding
  }

  serviceForWebContents(webContents: WebContents): WorkspaceService {
    const window = BrowserWindow.fromWebContents(webContents)
    if (!window) throw new Error('Unable to resolve workspace window.')
    return this.registerWindow(window)
  }

  rootInfoForWindow(window: BrowserWindow | null): FsRootInfo {
    const service = window ? this.registerWindow(window) : this.firstService()
    if (!service) throw new Error('No workspace window is available.')
    return service.rootInfo()
  }

  terminalCwdForWebContents(webContents?: WebContents | null): string | null {
    if (webContents) return this.serviceForWebContents(webContents).terminalCwd()
    const focused = BrowserWindow.getFocusedWindow()
    const service = focused ? this.registerWindow(focused) : this.firstService()
    return service?.terminalCwd() ?? null
  }

  isAssetPathAllowed(assetPath: string): boolean {
    for (const binding of this.bindings.values()) {
      if (binding.service.isAssetPathAllowed(assetPath)) return true
    }
    return false
  }

  async flushBuffers(): Promise<number> {
    let flushed = 0
    for (const binding of this.bindings.values()) {
      flushed += await binding.service.flushBuffers()
    }
    return flushed
  }

  disposeAll(): void {
    for (const windowId of [...this.bindings.keys()]) this.disposeWindow(windowId)
  }

  private firstService(): WorkspaceService | null {
    return this.bindings.values().next().value?.service ?? null
  }

  private createSessionKey(): string {
    if (this.bindings.size === 0) return 'main'
    const sessionKey = `window-${this.nextSessionId}`
    this.nextSessionId += 1
    return sessionKey
  }

  private disposeWindow(windowId: number): void {
    const binding = this.bindings.get(windowId)
    if (!binding) return
    this.bindings.delete(windowId)
    binding.dispose()
    this.options.onSessionDisposed?.(binding.sessionKey)
    this.logger.info('window workspace disposed', { windowId })
  }
}
