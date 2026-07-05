import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { createElectronContainer, type ElectronContainer } from '@electron/container.js'
import { configureAppIdentity } from '@electron/appIdentity.js'
import type { NativeIpcRegistration } from '@electron/ipc/index.js'
import {
  registerAssetProtocol,
  registerAssetProtocolPrivileges,
} from '@electron/main/assetProtocol.js'
import { installContentSecurityPolicy } from '@electron/main/contentSecurityPolicy.js'
import { getLaunchInfo } from '@electron/main/deepLinks.js'
import { installElectronE2eRuntimeFlags } from '@electron/main/e2eRuntime.js'
import { registerMainNativeIpc } from '@electron/main/ipcBootstrap.js'
import { createLegacyShellIpcRegistration } from '@electron/main/legacyShellIpc.js'
import { createRuntimeEventQueue } from '@electron/main/runtimeEvents.js'
import { installSingleInstanceAndDeepLinks } from '@electron/main/singleInstance.js'
import { createMainWindowSession } from '@electron/main/windowSession.js'
import { createWindowCommandSetup } from '@electron/main/windowCommandSetup.js'
import { createWindowLifecycle } from '@electron/main/windowLifecycle.js'
import type { MarklabWindows } from '@electron/window.js'
import { hideWindowWithMotion, showWindowWithMotion } from '@electron/windowMotion.js'

const APP_READY_FALLBACK_MS = 5000

let windows: MarklabWindows | null = null
let didShowMain = false
let rendererReady = false
let fallbackTimer: ReturnType<typeof setTimeout> | null = null
let nativeIpc: NativeIpcRegistration | null = null
let container: ElectronContainer | null = null

installElectronE2eRuntimeFlags()
configureAppIdentity(app)
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
  clearFallbackTimer()

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

const runtimeEvents = createRuntimeEventQueue(() => windows?.main ?? null)

const currentSystemThemePayload = () =>
  ({
    colorMode: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
  }) as const

nativeTheme.on('updated', () => {
  runtimeEvents.queueOrSendRuntimeEvent({
    eventName: 'system-theme-changed',
    payload: currentSystemThemePayload(),
  })
})

const windowLifecycle = createWindowLifecycle({
  getContainer,
  getNativeIpc: () => nativeIpc,
  getWindows: () => windows,
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

  const knowledgeEngine = await container.cradle.knowledgeEngineService.initialize()
  if (!knowledgeEngine.ok) {
    logger.error('knowledge engine startup failed', knowledgeEngine)
    throw new Error(knowledgeEngine.error ?? 'Knowledge engine startup failed')
  }

  installContentSecurityPolicy()
  registerAssetProtocol(() => nativeIpc)
  legacyShellIpc.register()

  didShowMain = false
  rendererReady = false
  if (!nativeIpc) {
    nativeIpc = registerMainNativeIpc({
      container,
      flushWorkspaceBuffers: windowLifecycle.flushWorkspaceBuffers,
      onRendererReady: handleRendererReady,
      windowCommandHandlers: windowCommandSetup.commandHandlers,
    })
  }

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
  openSystemPath: windowCommandSetup.openPathInNewWindow,
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
  container?.cradle.knowledgeEngineService.dispose()
  windowLifecycle.handleBeforeQuit(event, () => app.quit())
})
