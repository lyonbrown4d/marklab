import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { createElectronContainer, type ElectronContainer } from '@electron/container.js'
import { registerNativeIpc, type NativeIpcRegistration } from '@electron/ipc/index.js'
import { installNativeMenu } from '@electron/menu.js'
import {
  registerAssetProtocol,
  registerAssetProtocolPrivileges,
} from '@electron/main/assetProtocol.js'
import { installContentSecurityPolicy } from '@electron/main/contentSecurityPolicy.js'
import { installElectronE2eRuntimeFlags } from '@electron/main/e2eRuntime.js'
import {
  createSingleInstancePayload,
  getLaunchInfo,
  launchInfo,
  publishDeepLinksFromArgs,
  publishDeepLinkUrl,
  registerDeepLinkProtocol,
} from '@electron/main/deepLinks.js'
import { createWindowCommandSetup } from '@electron/main/windowCommandSetup.js'
import type { DeepLinkPayload, SingleInstancePayload } from '@electron/types.js'
import { createMarklabWindows, type MarklabWindows } from '@electron/window.js'
import { hideWindowWithMotion, showWindowWithMotion } from '@electron/windowMotion.js'
import { createMarklabWindowPool, type MarklabWindowPool } from '@electron/windowPool.js'

const APP_READY_FALLBACK_MS = 5000
let windows: MarklabWindows | null = null
let didShowMain = false
let rendererReady = false
let fallbackTimer: ReturnType<typeof setTimeout> | null = null
let nativeIpc: NativeIpcRegistration | null = null
let container: ElectronContainer | null = null
let windowPool: MarklabWindowPool | null = null
let legacyIpcRegistered = false
let allowAppQuit = false
let allowAllMainWindowClose = false
let quitFlushInProgress = false

type PendingRuntimeEvent =
  | { eventName: 'single-instance'; payload: SingleInstancePayload }
  | { eventName: 'deep-link'; payload: DeepLinkPayload }

const pendingRuntimeEvents: PendingRuntimeEvent[] = []
const managedMainWindows = new WeakSet<BrowserWindow>()
const windowsAllowedToClose = new WeakSet<BrowserWindow>()
const windowsFlushingBeforeClose = new WeakSet<BrowserWindow>()

installElectronE2eRuntimeFlags()
registerAssetProtocolPrivileges()

const getContainer = (): ElectronContainer => {
  container ??= createElectronContainer({
    app,
    BrowserWindow,
    clipboard,
    dialog,
    getLaunchInfo,
    ipcMain,
    onRendererReady: handleRendererReady,
    shell,
  })
  return container
}

const showMainWindow = (): void => {
  if (didShowMain || !windows) return

  didShowMain = true
  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }

  if (!windows.main.isDestroyed()) {
    showWindowWithMotion(windows.main, { focus: true })
  }
  if (!windows.splash.isDestroyed()) {
    const splash = windows.splash
    hideWindowWithMotion(splash, () => {
      if (!splash.isDestroyed()) splash.close()
    })
  }
}

const handleRendererReady = (): void => {
  rendererReady = true
  showMainWindow()
}

const sendRendererEvent = (eventName: string, payload: unknown): boolean => {
  if (!windows?.main || windows.main.isDestroyed()) return false
  windows.main.webContents.send(eventName, payload)
  return true
}

const queueOrSendRuntimeEvent = (event: PendingRuntimeEvent): void => {
  if (sendRendererEvent(event.eventName, event.payload)) return
  pendingRuntimeEvents.push(event)
}

const queueDeepLinkPayload = (payload: DeepLinkPayload): void => {
  queueOrSendRuntimeEvent({ eventName: 'deep-link', payload })
}

const flushPendingRuntimeEvents = (): void => {
  while (pendingRuntimeEvents.length > 0) {
    const event = pendingRuntimeEvents[0]
    if (!event || !sendRendererEvent(event.eventName, event.payload)) return
    pendingRuntimeEvents.shift()
  }
}

const flushWorkspaceBuffers = async (reason: string): Promise<void> => {
  try {
    const flushed = await nativeIpc?.commands.workspace.flushBuffers()
    container?.cradle.logger.info('workspace buffers flushed', { flushed, reason })
  } catch (error) {
    container?.cradle.logger.warn('workspace buffer flush failed before lifecycle transition', {
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
  logger = getContainer().cradle.logger,
): void => {
  if (managedMainWindows.has(main)) return
  managedMainWindows.add(main)
  getContainer().cradle.workspaceRegistry.registerWindow(main)
  installMainWindowCloseFlush(main)
  main.on('closed', () => {
    if (windows?.main === main) windows = null
    logger.info('main window closed', { windowId: main.id })
  })
}

const ensureWindowPool = (): MarklabWindowPool => {
  const logger = getContainer().cradle.logger
  windowPool ??= createMarklabWindowPool(logger.child('window-pool'))
  return windowPool
}

const windowCommandSetup = createWindowCommandSetup({
  getContainer,
  getNativeIpc: () => nativeIpc,
  getPrimaryWindow: () => windows?.main ?? null,
  getWindowPool: ensureWindowPool,
  installManagedMainWindowLifecycle,
})
const appWindowCommandHandlers = windowCommandSetup.commandHandlers
const dispatchNativeMenuAction = windowCommandSetup.dispatchMenuAction

const registerLegacyShellIpc = (): void => {
  if (legacyIpcRegistered) return
  legacyIpcRegistered = true

  ipcMain.handle('app-ready', () => {
    handleRendererReady()
    return { ok: true }
  })

  ipcMain.handle('app_get_platform', () => {
    if (process.platform === 'win32') return 'windows'
    if (process.platform === 'darwin') return 'macos'
    if (process.platform === 'linux') return 'linux'
    return 'unknown'
  })

  ipcMain.handle('menu_dispatch', (_event, payload: { id?: unknown }) => {
    if (typeof payload?.id !== 'string') {
      throw new Error('menu_dispatch requires an id string')
    }
    const target = BrowserWindow.getFocusedWindow() ?? windows?.main ?? null
    if (target && nativeIpc?.menu.dispatchToWindow(target, payload.id)) return { ok: true }
    target?.webContents.send('menu-action', payload.id)
    return { ok: true }
  })
}

const bootstrap = async (): Promise<void> => {
  container = getContainer()
  const logger = container.cradle.logger
  logger.info('bootstrap started')
  installContentSecurityPolicy()
  registerAssetProtocol(() => nativeIpc)
  registerLegacyShellIpc()
  didShowMain = false
  rendererReady = false
  if (!nativeIpc) {
    nativeIpc = registerNativeIpc({
      app,
      BrowserWindow,
      clipboard,
      dialog,
      exportService: container.cradle.exportService,
      gitService: container.cradle.gitService,
      getLaunchInfo,
      ipcMain,
      logger,
      onRendererReady: handleRendererReady,
      shell,
      terminalService: container.cradle.terminalService,
      updates: {
        onBeforeInstall: () => flushWorkspaceBuffers('update install'),
      },
      workspaceRegistry: container.cradle.workspaceRegistry,
      windowCommandHandlers: appWindowCommandHandlers,
    })
  }
  try {
    windows = await createMarklabWindows(logger.child('window'), ensureWindowPool())
  } catch (error) {
    logger.error('window creation failed', { error })
    throw error
  }
  installNativeMenu(windows.main, dispatchNativeMenuAction)
  installManagedMainWindowLifecycle(windows.main, logger)

  fallbackTimer = setTimeout(showMainWindow, APP_READY_FALLBACK_MS)
  if (rendererReady) showMainWindow()
  flushPendingRuntimeEvents()
  logger.info('bootstrap finished')
}

publishDeepLinksFromArgs(launchInfo.args, 'startup', queueDeepLinkPayload)

app.on('open-url', (event, url) => {
  event.preventDefault()
  container?.cradle.logger.info('deep link received from open-url')
  publishDeepLinkUrl(url, 'open-url', queueDeepLinkPayload)
  if (windows?.main && !windows.main.isDestroyed()) {
    showMainWindow()
    if (windows.main.isMinimized()) windows.main.restore()
    windows.main.focus()
  } else if (app.isReady()) {
    void bootstrap().catch((error) => {
      container?.cradle.logger.error('bootstrap failed after open-url', { error })
      throw error
    })
  }
})

const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  getContainer().cradle.logger.warn('single instance lock unavailable, quitting')
  app.quit()
} else {
  registerDeepLinkProtocol(getContainer().cradle.logger.child('deep-link'))

  app.on('second-instance', (_event, commandLine, workingDirectory) => {
    container?.cradle.logger.info('second instance received')
    const payload = createSingleInstancePayload(commandLine, workingDirectory)
    if (windows?.main && !windows.main.isDestroyed()) {
      showMainWindow()
      if (windows.main.isMinimized()) windows.main.restore()
      windows.main.focus()
    } else {
      void bootstrap().catch((error) => {
        container?.cradle.logger.error('bootstrap failed after second-instance', { error })
        throw error
      })
    }
    queueOrSendRuntimeEvent({ eventName: 'single-instance', payload })
    publishDeepLinksFromArgs(payload.args, 'second-instance', queueDeepLinkPayload)
  })

  app.whenReady().then(() => {
    void bootstrap().catch((error) => {
      container?.cradle.logger.error('bootstrap failed', { error })
      throw error
    })
  })

  app.on('activate', () => {
    if (windows?.main && !windows.main.isDestroyed()) {
      showMainWindow()
      return
    }

    void bootstrap().catch((error) => {
      container?.cradle.logger.error('bootstrap failed during activate', { error })
      throw error
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (allowAppQuit || !nativeIpc) return
  event.preventDefault()
  if (quitFlushInProgress) return

  quitFlushInProgress = true
  void (async () => {
    await flushWorkspaceBuffers('quit')
    allowAppQuit = true
    allowAllMainWindowClose = true
    windowPool?.destroyIdleWindows()
    container?.cradle.logger.info('app quit continuing after flush')
    app.quit()
  })()
})
