import { app, BrowserWindow, nativeTheme, safeStorage, shell, WebContentsView } from 'electron'
import {
  createElectronRuntime,
  type ElectronRuntime,
  type ElectronServices,
} from '@electron/container'
import { configureAppIdentity } from '@electron/appIdentity'
import type { NativeIpcRegistration } from '@electron/ipc'
import {
  registerAssetProtocol,
  registerAssetProtocolPrivileges,
} from '@electron/main/assetProtocol'
import { installContentSecurityPolicy } from '@electron/main/contentSecurityPolicy'
import { configureDevUserDataPath } from '@electron/main/devUserData'
import { installElectronE2eRuntimeFlags } from '@electron/main/e2eRuntime'
import { registerMainNativeIpc } from '@electron/main/ipcBootstrap'
import { createLegacyShellIpcRegistration } from '@electron/main/legacyShellIpc'
import { createRuntimeLifecycleTasks } from '@electron/main/lifecycle/runtimeLifecycleTasks'
import { createRuntimeEventQueue } from '@electron/main/runtimeEvents'
import {
  createInitialNativeOpenPresentationGate,
  installSingleInstanceAndDeepLinks,
} from '@electron/main/singleInstance'
import { createMainWindowSession } from '@electron/main/windowSession'
import { createWindowCommandSetup } from '@electron/main/windowCommandSetup'
import { createWindowLifecycle } from '@electron/main/windowLifecycle'
import { continueAppQuit } from '@electron/main/updateQuit'
import { createAppWindowIcon, type MarklabWindows } from '@electron/window'
import {
  flushPersistedWindowState,
  releasePersistedWindowState,
} from '@electron/windowStatePersistence'
import { hideWindowWithMotion, showWindowWithMotion } from '@electron/windowMotion'
import { dismissSplashWindow } from '@electron/splashLifecycle'
import { syncNativeWindowBackgrounds, syncNativeWindowIcons } from '@electron/windowTheme'
import { createSystemThemeMonitor } from '@electron/main/systemThemeMonitor'
import { createRendererReadyCoordinator } from '@electron/main/rendererReady'
import type { RendererReadySignal } from '@/types/rendererReady'

const APP_READY_FALLBACK_MS = 5000

let windows: MarklabWindows | null = null
let didShowMain = false
let rendererReady = false
let fallbackTimer: ReturnType<typeof setTimeout> | null = null
let nativeIpc: NativeIpcRegistration | null = null
let runtime: ElectronRuntime | null = null

installElectronE2eRuntimeFlags()
configureAppIdentity(app)
configureDevUserDataPath(app)
registerAssetProtocolPrivileges()

const clearFallbackTimer = (): void => {
  if (!fallbackTimer) return
  clearTimeout(fallbackTimer)
  fallbackTimer = null
}

const getRuntime = (): ElectronRuntime => {
  runtime ??= createElectronRuntime({
    app,
    BrowserWindow,
    WebContentsView,
    lifecycleTasks: createRuntimeLifecycleTasks({
      disposeSystemThemeMonitor: systemThemeMonitor.dispose,
      registerNativeRuntime: () => {
        installContentSecurityPolicy()
        registerAssetProtocol(
          () => runtime?.services.workspaceRegistry ?? null,
          () => runtime?.services.linkPreviewService ?? null,
        )
        legacyShellIpc.register()
        nativeIpc ??= registerMainNativeIpc({
          flushWorkspaceBuffers: windowLifecycle.flushWorkspaceBuffers,
          onRendererReady: handleRendererReady,
          services: getServices(),
          windowCommandHandlers: windowCommandSetup.commandHandlers,
        })
      },
      startSystemThemeMonitor: systemThemeMonitor.start,
    }),
    safeStorage,
    shell,
  })
  return runtime
}

const getServices = (): ElectronServices => getRuntime().services

const presentMainWindow = (): void => {
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

const initialPresentationGate = createInitialNativeOpenPresentationGate(presentMainWindow)
const showMainWindow = initialPresentationGate.requestPresentation

const handlePrimaryRendererShellReady = (): void => {
  rendererReady = true
  showMainWindow()
  systemThemeMonitor.announceCurrent()
}

const handleRendererReady = (
  event: Electron.IpcMainInvokeEvent,
  signal: RendererReadySignal,
): void => {
  rendererReadyCoordinator.handle(event, signal)
}

const runtimeEvents = createRuntimeEventQueue(() => windows?.main ?? null)

const systemThemeMonitor = createSystemThemeMonitor({
  nativeTheme,
  onChange: (payload) => {
    const dark = payload.colorMode === 'dark'
    syncNativeWindowBackgrounds(windows, dark)
    if (process.platform === 'win32' || process.platform === 'linux') {
      syncNativeWindowIcons(windows, createAppWindowIcon(dark))
    }
    runtimeEvents.queueOrSendRuntimeEvent({
      eventName: 'system-theme-changed',
      payload,
    })
  },
})

const windowLifecycle = createWindowLifecycle({
  finalizeWindowState: releasePersistedWindowState,
  flushWindowState: flushPersistedWindowState,
  getServices,
  getNativeIpc: () => nativeIpc,
  getWindows: () => windows,
  setWindows: (nextWindows) => {
    windows = nextWindows
    rendererReadyCoordinator.flushPrimaryInteractive()
  },
})

const windowCommandSetup = createWindowCommandSetup({
  getServices,
  getNativeIpc: () => nativeIpc,
  getPrimaryWindow: () => windows?.main ?? null,
  getWindowPool: windowLifecycle.ensureWindowPool,
  installManagedMainWindowLifecycle: windowLifecycle.installManagedMainWindowLifecycle,
  isPrimaryWindowBootstrapping: (window) =>
    windows?.main === window && !didShowMain && !rendererReady,
  presentPrimaryWindow: (window) => {
    if (windows?.main === window) showMainWindow()
  },
})

const rendererReadyCoordinator = createRendererReadyCoordinator({
  fromWebContents: (contents) => BrowserWindow.fromWebContents(contents),
  getPrimaryWindow: () => windows?.main ?? null,
  getWindowPool: windowLifecycle.ensureWindowPool,
  getWorkspaceServiceForWindow: (window) => getServices().workspaceRegistry.registerWindow(window),
  isPrimaryBootstrapping: () => windows === null && !didShowMain,
  logger: {
    warn: (message, context) => getServices().logger.warn(message, context),
  },
  onPrimaryShellReady: handlePrimaryRendererShellReady,
})

const legacyShellIpc = createLegacyShellIpcRegistration({
  getMainWindow: () => windows?.main ?? null,
  getNativeIpc: () => nativeIpc,
  onRendererReady: handleRendererReady,
})

const bootstrap = async (): Promise<void> => {
  runtime = getRuntime()
  const logger = runtime.services.logger
  logger.info('bootstrap started')

  await runtime.startup()

  didShowMain = false
  rendererReady = false

  try {
    windows = await createMainWindowSession({
      dispatchNativeMenuAction: windowCommandSetup.dispatchMenuAction,
      ensureWindowPool: windowLifecycle.ensureWindowPool,
      installManagedMainWindowLifecycle: windowLifecycle.installManagedMainWindowLifecycle,
      logger,
    })
    rendererReadyCoordinator.flushPrimaryInteractive()
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
  getLogger: () => getServices().logger,
  getMainWindow: () => windows?.main ?? null,
  holdInitialPresentationUntil: initialPresentationGate.holdUntil,
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
    () => continueAppQuit(app, nativeIpc?.updates ?? null),
    async () => {
      clearFallbackTimer()
      if (runtime) await runtime.shutdown()
    },
  )
})
