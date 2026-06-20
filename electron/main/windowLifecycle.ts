import type { BrowserWindow } from 'electron'
import type { ElectronContainer } from '@electron/container.js'
import type { NativeIpcRegistration } from '@electron/ipc/index.js'
import type { MarklabWindows } from '@electron/window.js'
import { createMarklabWindowPool, type MarklabWindowPool } from '@electron/windowPool.js'

type Logger = ElectronContainer['cradle']['logger']

type PreventableEvent = {
  preventDefault: () => void
}

type WindowLifecycleOptions = {
  getContainer: () => ElectronContainer
  getNativeIpc: () => NativeIpcRegistration | null
  getWindows: () => MarklabWindows | null
  setWindows: (windows: MarklabWindows | null) => void
}

export type WindowLifecycle = {
  ensureWindowPool: () => MarklabWindowPool
  flushWorkspaceBuffers: (reason: string) => Promise<void>
  handleBeforeQuit: (event: PreventableEvent, continueQuit: () => void) => void
  installManagedMainWindowLifecycle: (main: BrowserWindow, logger?: Logger) => void
}

export const createWindowLifecycle = (options: WindowLifecycleOptions): WindowLifecycle => {
  let windowPool: MarklabWindowPool | null = null
  let allowAppQuit = false
  let allowAllMainWindowClose = false
  let quitFlushInProgress = false

  const managedMainWindows = new WeakSet<BrowserWindow>()
  const windowsAllowedToClose = new WeakSet<BrowserWindow>()
  const windowsFlushingBeforeClose = new WeakSet<BrowserWindow>()

  const flushWorkspaceBuffers = async (reason: string): Promise<void> => {
    const container = options.getContainer()
    try {
      const flushed = await options.getNativeIpc()?.commands.workspace.flushBuffers()
      container.cradle.logger.info('workspace buffers flushed', { flushed, reason })
    } catch (error) {
      container.cradle.logger.warn('workspace buffer flush failed before lifecycle transition', {
        error,
        reason,
      })
    }
  }

  const installMainWindowCloseFlush = (main: BrowserWindow): void => {
    main.on('close', (event) => {
      if (allowAllMainWindowClose || windowsAllowedToClose.has(main)) return
      event.preventDefault()
      if (windowsFlushingBeforeClose.has(main)) return

      windowsFlushingBeforeClose.add(main)
      void (async () => {
        await flushWorkspaceBuffers('window close')
        windowsAllowedToClose.add(main)
        try {
          if (!main.isDestroyed()) main.close()
        } finally {
          windowsAllowedToClose.delete(main)
          windowsFlushingBeforeClose.delete(main)
        }
      })()
    })
  }

  const installManagedMainWindowLifecycle = (
    main: BrowserWindow,
    logger = options.getContainer().cradle.logger,
  ): void => {
    if (managedMainWindows.has(main)) return
    managedMainWindows.add(main)
    options.getContainer().cradle.workspaceRegistry.registerWindow(main)
    installMainWindowCloseFlush(main)
    main.on('closed', () => {
      if (options.getWindows()?.main === main) options.setWindows(null)
      logger.info('main window closed', { windowId: main.id })
    })
  }

  const ensureWindowPool = (): MarklabWindowPool => {
    const logger = options.getContainer().cradle.logger
    windowPool ??= createMarklabWindowPool(logger.child('window-pool'))
    return windowPool
  }

  const handleBeforeQuit = (event: PreventableEvent, continueQuit: () => void): void => {
    if (allowAppQuit || !options.getNativeIpc()) return
    event.preventDefault()
    if (quitFlushInProgress) return

    quitFlushInProgress = true
    void (async () => {
      await flushWorkspaceBuffers('quit')
      allowAppQuit = true
      allowAllMainWindowClose = true
      windowPool?.destroyIdleWindows()
      options.getContainer().cradle.logger.info('app quit continuing after flush')
      continueQuit()
    })()
  }

  return {
    ensureWindowPool,
    flushWorkspaceBuffers,
    handleBeforeQuit,
    installManagedMainWindowLifecycle,
  }
}
