import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'

import type { RendererReadySignal } from '@/types/rendererReady'

type RendererReadyWindowPool = {
  markRendererInteractive: (window: BrowserWindow, error?: Error) => void
  prewarmMainWindow: () => Promise<void>
}

type RendererReadyWorkspace = {
  markRendererInteractive: () => void
}

type RendererReadyCoordinatorOptions = {
  fromWebContents: (contents: WebContents) => BrowserWindow | null
  getPrimaryWindow: () => BrowserWindow | null
  getWindowPool: () => RendererReadyWindowPool
  getWorkspaceServiceForWindow: (window: BrowserWindow) => RendererReadyWorkspace
  isPrimaryBootstrapping: () => boolean
  logger: { warn: (message: string, context?: Record<string, unknown>) => void }
  onPrimaryWorkspaceSettled: () => void
}

export const createRendererReadyCoordinator = (options: RendererReadyCoordinatorOptions) => {
  let pendingPrimaryInteractive: BrowserWindow | null = null
  const handledPrimaryWindows = new WeakSet<BrowserWindow>()

  const flushPrimaryInteractive = (): void => {
    if (!pendingPrimaryInteractive) return
    const primary = options.getPrimaryWindow()
    if (!primary || primary !== pendingPrimaryInteractive) return
    if (handledPrimaryWindows.has(primary)) return
    handledPrimaryWindows.add(primary)
    void options
      .getWindowPool()
      .prewarmMainWindow()
      .catch((error) => options.logger.warn('unable to prewarm standby main renderer', { error }))
  }

  const handle = (event: IpcMainInvokeEvent, signal: RendererReadySignal): void => {
    const target = options.fromWebContents(event.sender)
    if (!target || target.isDestroyed()) return
    const primary = options.getPrimaryWindow()
    const isPrimary = primary ? target === primary : options.isPrimaryBootstrapping()

    if (signal.phase === 'shell') return

    const error =
      signal.phase === 'workspace-error'
        ? new Error(signal.error ?? 'Renderer workspace hydration failed.')
        : undefined
    options.getWindowPool().markRendererInteractive(target, error)
    if (signal.phase !== 'workspace-interactive') {
      if (isPrimary) options.onPrimaryWorkspaceSettled()
      return
    }
    options.getWorkspaceServiceForWindow(target).markRendererInteractive()
    if (!isPrimary) return
    pendingPrimaryInteractive = target
    options.onPrimaryWorkspaceSettled()
    flushPrimaryInteractive()
  }

  return { flushPrimaryInteractive, handle }
}
