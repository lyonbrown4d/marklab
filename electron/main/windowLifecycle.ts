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

  const flushWorkspaceBuffersWithBarrier = async (reason: string): Promise<() => void> => {
    const container = options.getContainer()
    const nativeIpc = options.getNativeIpc()
    if (!nativeIpc) {
      throw new Error(`Workspace flush is unavailable during ${reason}`)
    }

    const workspaceRegistry = nativeIpc.commands.workspace
    const barrierId = await workspaceRegistry.beginShutdownBarrier(reason)
    try {
      const flushed = await workspaceRegistry.flushBuffersForShutdown(barrierId)
      container.cradle.logger.info('workspace buffers flushed behind shutdown barrier', {
        barrierId,
        flushed,
        reason,
      })
    } catch (error) {
      workspaceRegistry.cancelShutdownBarrier(barrierId)
      throw error
    }
    return () => workspaceRegistry.cancelShutdownBarrier(barrierId)
  }

  const flushWorkspaceBuffers = async (reason: string): Promise<void> => {
    const releaseBarrier = await flushWorkspaceBuffersWithBarrier(reason)
    releaseBarrier()
  }

  const installMainWindowCloseFlush = (main: BrowserWindow): void => {
    main.on('close', (event) => {
      if (allowAllMainWindowClose || windowsAllowedToClose.has(main)) return
      event.preventDefault()
      if (windowsFlushingBeforeClose.has(main)) return

      windowsFlushingBeforeClose.add(main)
      void (async () => {
        let releaseBarrier: (() => void) | null = null
        try {
          releaseBarrier = await flushWorkspaceBuffersWithBarrier('window close')
          windowsAllowedToClose.add(main)
          if (!main.isDestroyed()) main.close()
        } catch (error) {
          options
            .getContainer()
            .cradle.logger.error(
              'window close cancelled because workspace buffers could not be saved',
              { error, windowId: main.id },
            )
        } finally {
          releaseBarrier?.()
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
      try {
        await flushWorkspaceBuffersWithBarrier('quit')
      } catch (error) {
        quitFlushInProgress = false
        options
          .getContainer()
          .cradle.logger.error('app quit cancelled because workspace buffers could not be saved', {
            error,
          })
        return
      }

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
