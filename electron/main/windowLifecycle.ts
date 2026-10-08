import type { BrowserWindow } from 'electron'
import type { NativeIpcRegistration } from '@electron/ipc'
import type { Logger } from '@electron/services/logger'
import type { WebTabManager } from '@electron/services/webTabs/webTabManager'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'
import type { MarklabWindows } from '@electron/window'
import { createMarklabWindowPool, type MarklabWindowPool } from '@electron/windowPool'

type PreventableEvent = {
  preventDefault: () => void
}

type WindowLifecycleIpc = {
  commands: {
    workspace: Pick<
      NativeIpcRegistration['commands']['workspace'],
      | 'beginShutdownBarrier'
      | 'cancelShutdownBarrier'
      | 'completeShutdownBarrier'
      | 'flushBuffersForShutdown'
      | 'flushWindowForClose'
    >
  }
  windowClose: Pick<NativeIpcRegistration['windowClose'], 'requestRendererFlush'>
}

type WindowLifecycleServices = {
  logger: Logger
  webTabManager: Pick<WebTabManager, 'registerWindow'>
  workspaceRegistry: Pick<WindowWorkspaceRegistry, 'registerWindow'>
}

type ShutdownBarrierHandle = {
  cancel: () => void
  complete: () => void
}

type WindowLifecycleOptions = {
  finalizeWindowState: (window: BrowserWindow) => Promise<void> | void
  flushWindowState: (window: BrowserWindow) => Promise<void> | void
  getServices: () => WindowLifecycleServices
  getNativeIpc: () => WindowLifecycleIpc | null
  getWindows: () => MarklabWindows | null
  setWindows: (windows: MarklabWindows | null) => void
}

export type WindowLifecycle = {
  ensureWindowPool: () => MarklabWindowPool
  flushWorkspaceBuffers: (reason: string) => Promise<void>
  handleBeforeQuit: (
    event: PreventableEvent,
    continueQuit: () => void,
    shutdownApplication?: () => Promise<void>,
  ) => void
  installManagedMainWindowLifecycle: (
    main: BrowserWindow,
    logger?: Logger,
    sessionKey?: string,
  ) => void
}

export const createWindowLifecycle = (options: WindowLifecycleOptions): WindowLifecycle => {
  let windowPool: MarklabWindowPool | null = null
  let allowAppQuit = false
  let allowAllMainWindowClose = false
  let quitFlushInProgress = false

  const managedMainWindows = new Set<BrowserWindow>()
  const windowsAllowedToClose = new WeakSet<BrowserWindow>()
  const windowsFlushingBeforeClose = new WeakSet<BrowserWindow>()

  const flushWorkspaceBuffersWithBarrier = async (
    reason: string,
  ): Promise<ShutdownBarrierHandle> => {
    const services = options.getServices()
    const nativeIpc = options.getNativeIpc()
    if (!nativeIpc) {
      throw new Error(`Workspace flush is unavailable during ${reason}`)
    }

    await Promise.all(
      Array.from(managedMainWindows, (window) =>
        window.isDestroyed()
          ? Promise.resolve()
          : nativeIpc.windowClose.requestRendererFlush(window),
      ),
    )

    const workspaceRegistry = nativeIpc.commands.workspace
    const barrierId = await workspaceRegistry.beginShutdownBarrier(reason)
    try {
      const flushed = await workspaceRegistry.flushBuffersForShutdown(barrierId)
      services.logger.info('workspace buffers flushed behind shutdown barrier', {
        barrierId,
        flushed,
        reason,
      })
    } catch (error) {
      workspaceRegistry.cancelShutdownBarrier(barrierId)
      throw error
    }
    return {
      cancel: () => workspaceRegistry.cancelShutdownBarrier(barrierId),
      complete: () => workspaceRegistry.completeShutdownBarrier(barrierId),
    }
  }

  const flushWorkspaceBuffers = async (reason: string): Promise<void> => {
    const barrier = await flushWorkspaceBuffersWithBarrier(reason)
    barrier.cancel()
  }

  const installMainWindowCloseFlush = (main: BrowserWindow): void => {
    main.on('close', (event) => {
      if (allowAllMainWindowClose || windowsAllowedToClose.has(main)) return
      event.preventDefault()
      if (windowsFlushingBeforeClose.has(main)) return

      windowsFlushingBeforeClose.add(main)
      void (async () => {
        try {
          const workspaceRegistry = options.getNativeIpc()?.commands.workspace
          if (!workspaceRegistry) {
            throw new Error('Workspace flush is unavailable during window close')
          }
          await options.getNativeIpc()?.windowClose.requestRendererFlush(main)
          await workspaceRegistry.flushWindowForClose(main)
          windowsAllowedToClose.add(main)
          if (!main.isDestroyed()) main.close()
        } catch (error) {
          options
            .getServices()
            .logger.error('window close cancelled because workspace buffers could not be saved', {
              error,
              windowId: main.id,
            })
        } finally {
          windowsAllowedToClose.delete(main)
          windowsFlushingBeforeClose.delete(main)
        }
      })()
    })
  }

  const installManagedMainWindowLifecycle = (
    main: BrowserWindow,
    logger = options.getServices().logger,
    sessionKey?: string,
  ): void => {
    if (managedMainWindows.has(main)) return
    managedMainWindows.add(main)
    options.getServices().workspaceRegistry.registerWindow(main, sessionKey)
    options.getServices().webTabManager.registerWindow(main)
    installMainWindowCloseFlush(main)
    main.on('closed', () => {
      managedMainWindows.delete(main)
      if (options.getWindows()?.main === main) options.setWindows(null)
      logger.info('main window closed', { windowId: main.id })
    })
  }

  const ensureWindowPool = (): MarklabWindowPool => {
    const logger = options.getServices().logger
    windowPool ??= createMarklabWindowPool(logger.child('window-pool'))
    return windowPool
  }

  const handleBeforeQuit = (
    event: PreventableEvent,
    continueQuit: () => void,
    shutdownApplication: () => Promise<void> = () => Promise.resolve(),
  ): void => {
    if (allowAppQuit || !options.getNativeIpc()) return
    event.preventDefault()
    if (quitFlushInProgress) return

    const logger = options.getServices().logger
    quitFlushInProgress = true
    void (async () => {
      let barrier: ShutdownBarrierHandle
      try {
        barrier = await flushWorkspaceBuffersWithBarrier('quit')
      } catch (error) {
        quitFlushInProgress = false
        logger.error('app quit cancelled because workspace buffers could not be saved', { error })
        return
      }

      try {
        await Promise.all(
          Array.from(managedMainWindows, (window) =>
            window.isDestroyed() ? Promise.resolve() : options.flushWindowState(window),
          ),
        )
        await shutdownApplication()
        await Promise.all(
          Array.from(managedMainWindows, (window) =>
            window.isDestroyed() ? Promise.resolve() : options.finalizeWindowState(window),
          ),
        )
        await windowPool?.dispose()
        barrier.complete()
      } catch (error) {
        barrier.cancel()
        quitFlushInProgress = false
        logger.error('app quit cancelled because application shutdown failed', { error })
        return
      }

      allowAppQuit = true
      allowAllMainWindowClose = true
      logger.info('app quit continuing after flush')
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
