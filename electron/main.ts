import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeTheme,
  safeStorage,
  shell,
  WebContentsView,
} from 'electron'
import {
  createElectronContainer,
  shutdownElectronContainer,
  type ElectronContainer,
} from '@electron/container'
import { configureAppIdentity } from '@electron/appIdentity'
import type { NativeIpcRegistration } from '@electron/ipc'
import {
  registerAssetProtocol,
  registerAssetProtocolPrivileges,
} from '@electron/main/assetProtocol'
import { installContentSecurityPolicy } from '@electron/main/contentSecurityPolicy'
import { getLaunchInfo } from '@electron/main/deepLinks'
import { configureDevUserDataPath } from '@electron/main/devUserData'
import { installElectronE2eRuntimeFlags } from '@electron/main/e2eRuntime'
import { registerMainNativeIpc } from '@electron/main/ipcBootstrap'
import { createLegacyShellIpcRegistration } from '@electron/main/legacyShellIpc'
import { createRuntimeLifecycleTasks } from '@electron/main/lifecycle/runtimeLifecycleTasks'
import { createRuntimeEventQueue } from '@electron/main/runtimeEvents'
import { installSingleInstanceAndDeepLinks } from '@electron/main/singleInstance'
import { createMainWindowSession } from '@electron/main/windowSession'
import { createWindowCommandSetup } from '@electron/main/windowCommandSetup'
import { createWindowLifecycle } from '@electron/main/windowLifecycle'
import type { MarklabWindows } from '@electron/window'
import { flushPersistedWindowState } from '@electron/windowStatePersistence'
import { hideWindowWithMotion, showWindowWithMotion } from '@electron/windowMotion'
import { dismissSplashWindow } from '@electron/splashLifecycle'
import { syncNativeWindowBackgrounds } from '@electron/windowTheme'
import { createSystemThemeMonitor } from '@electron/main/systemThemeMonitor'

const APP_READY_FALLBACK_MS = 5000

let windows: MarklabWindows | null = null
let didShowMain = false
let rendererReady = false
let fallbackTimer: ReturnType<typeof setTimeout> | null = null
let nativeIpc: NativeIpcRegistration | null = null
let container: ElectronContainer | null = null

installElectronE2eRuntimeFlags()
configureAppIdentity(app)
configureDevUserDataPath(app)
registerAssetProtocolPrivileges()

const clearFallbackTimer = (): void => {
  if (!fallbackTimer) return
  clearTimeout(fallbackTimer)
  fallbackTimer = null
}

const getContainer = (): ElectronContainer => {
  container ??= createElectronContainer({
    app,
    BrowserWindow,
    WebContentsView,
    clipboard,
    dialog,
    getLaunchInfo,
    ipcMain,
    lifecycleTasks: createRuntimeLifecycleTasks({
      disposeSystemThemeMonitor: systemThemeMonitor.dispose,
      registerNativeRuntime: () => {
        installContentSecurityPolicy()
        registerAssetProtocol(
          () => container?.cradle.workspaceRegistry ?? null,
          () => container?.cradle.linkPreviewService ?? null,
        )
        legacyShellIpc.register()
        nativeIpc ??= registerMainNativeIpc({
          container: getContainer(),
          flushWorkspaceBuffers: windowLifecycle.flushWorkspaceBuffers,
          onRendererReady: handleRendererReady,
          windowCommandHandlers: windowCommandSetup.commandHandlers,
        })
      },
      startSystemThemeMonitor: systemThemeMonitor.start,
    }),
    onRendererReady: handleRendererReady,
    safeStorage,
    shell,
  })
  return container
}

const showMainWindow = (): void => {
  if (didShowMain || !windows) return

  didShowMain = true
  clearFallbackTimer()

  if (!windows.main.isDestroyed()) {
    showWindowWithMotion(windows.main, { focus: true })
  }
  if (!windows.splash.isDestroyed()) {
    dismissSplashWindow(windows.splash, hideWindowWithMotion)
  }
}

const handleRendererReady = (): void => {
  rendererReady = true
  showMainWindow()
  systemThemeMonitor.announceCurrent()
}

const runtimeEvents = createRuntimeEventQueue(() => windows?.main ?? null)

const systemThemeMonitor = createSystemThemeMonitor({
  nativeTheme,
  onChange: (payload) => {
    syncNativeWindowBackgrounds(windows, payload.colorMode === 'dark')
    runtimeEvents.queueOrSendRuntimeEvent({
      eventName: 'system-theme-changed',
      payload,
    })
  },
})

const windowLifecycle = createWindowLifecycle({
  getContainer,
  getNativeIpc: () => nativeIpc,
  getWindows: () => windows,
  persistWindowState: flushPersistedWindowState,
  setWindows: (nextWindows) => {
    windows = nextWindows
  },
})

const windowCommandSetup = createWindowCommandSetup({
  getContainer,
  getNativeIpc: () => nativeIpc,
  getPrimaryWindow: () => windows?.main ?? null,
  getWindowPool: windowLifecycle.ensureWindowPool,
  installManagedMainWindowLifecycle: windowLifecycle.installManagedMainWindowLifecycle,
})

const legacyShellIpc = createLegacyShellIpcRegistration({
  getMainWindow: () => windows?.main ?? null,
  getNativeIpc: () => nativeIpc,
  onRendererReady: handleRendererReady,
})

const bootstrap = async (): Promise<void> => {
  container = getContainer()
  const logger = container.cradle.logger
  logger.info('bootstrap started')

  await container.cradle.lifecycleCoordinator.startup()

  didShowMain = false
  rendererReady = false

  try {
    windows = await createMainWindowSession({
      dispatchNativeMenuAction: windowCommandSetup.dispatchMenuAction,
      ensureWindowPool: windowLifecycle.ensureWindowPool,
      installManagedMainWindowLifecycle: windowLifecycle.installManagedMainWindowLifecycle,
      logger,
    })
  } catch (error) {
    logger.error('window creation failed', { error })
    throw error
  }

  clearFallbackTimer()
  fallbackTimer = setTimeout(showMainWindow, APP_READY_FALLBACK_MS)
  if (rendererReady) showMainWindow()
  runtimeEvents.flushPendingRuntimeEvents()
  logger.info('bootstrap finished')
}

installSingleInstanceAndDeepLinks({
  bootstrap,
  getContainer,
  getMainWindow: () => windows?.main ?? null,
  openSystemPath: windowCommandSetup.openSystemPath,
  queueDeepLinkPayload: runtimeEvents.queueDeepLinkPayload,
  queueOrSendRuntimeEvent: runtimeEvents.queueOrSendRuntimeEvent,
  showMainWindow,
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  windowLifecycle.handleBeforeQuit(
    event,
    () => app.quit(),
    async () => {
      clearFallbackTimer()
      if (container) await shutdownElectronContainer(container)
    },
  )
})
