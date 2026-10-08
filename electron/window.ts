import { BrowserWindow, app, nativeTheme } from 'electron'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { configureWindowAppIdentity, MARKLAB_APP_NAME } from '@electron/appIdentity'
import { isBackgroundElectronE2e } from '@electron/main/e2eRuntime'
import { noopLogger, type Logger } from '@electron/services/logger'
import { setWindowState } from '@electron/services/settingsStore'
import { MAIN_WINDOW_ID } from '@electron/services/settingsStoreValues'
import {
  resolveElectronProjectRoots,
  resolveWindowsTaskbarIconPath,
} from '@electron/windowIconPaths'
import { createWindowIcon } from '@electron/windowIcon'
import type { PersistedWindowState } from '@electron/types'
import { resolveNativeWindowBackground } from '@electron/windowTheme'
import type { WindowPoolAcquisition } from '@electron/windowPool'
import { installWindowNavigationGuard } from '@electron/windowNavigation'
import { showSplashWithoutActivation } from '@electron/splashLifecycle'
import {
  getInitialWindowState,
  MAIN_WINDOW_MIN_HEIGHT,
  MAIN_WINDOW_MIN_WIDTH,
  restoreMaximizedOnFirstShow,
} from '@electron/windowStateRestore'
import { installWindowStatePersistence } from '@electron/windowStatePersistence'
const DEV_SERVER_URL = 'http://localhost:5173'
const DEV_LOAD_RETRIES = 25
const DEV_LOAD_RETRY_MS = 200
const SPLASH_READY_FALLBACK_MS = 700
const WINDOW_STATE_SAVE_DELAY_MS = 250
const electronDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(electronDir, '..')
const preloadPath = path.join(electronDir, 'preload.cjs')
const appIconRoots = resolveElectronProjectRoots(electronDir)
const windowsTaskbarIconPath = resolveWindowsTaskbarIconPath(
  appIconRoots,
  app.isPackaged,
  process.execPath,
)
export const createAppWindowIcon = (dark = nativeTheme.shouldUseDarkColors) =>
  createWindowIcon(appIconRoots, dark ? 'dark' : 'light')
const appIcon = createAppWindowIcon()
let didInstallDevelopmentDockIcon = false
export type MarklabWindows = {
  splash: BrowserWindow
  main: BrowserWindow
}
export type MainWindowPool = {
  acquireMainWindow: () => Promise<WindowPoolAcquisition>
  activateMainWindow: (
    acquisition: WindowPoolAcquisition,
    options?: MainWindowLoadOptions,
  ) => Promise<void>
}
export type MainWindowLoadOptions = {
  standby?: boolean
}
const isDevMode = () => !app.isPackaged
const isMacOS = () => process.platform === 'darwin'
const installDevelopmentDockIcon = (): void => {
  if (!isDevMode() || !isMacOS() || didInstallDevelopmentDockIcon) return
  if (!appIcon || appIcon.isEmpty()) return
  if (!app.dock) return
  app.dock.setIcon(appIcon)
  didInstallDevelopmentDockIcon = true
}
const getRendererUrl = (page = '') => {
  if (isDevMode()) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? DEV_SERVER_URL
    return new URL(page, devServerUrl.endsWith('/') ? devServerUrl : `${devServerUrl}/`).toString()
  }
  return path.join(projectRoot, 'dist', page || 'index.html')
}
const getRendererNavigationUrl = (page = '') => {
  const rendererUrl = getRendererUrl(page)
  return isDevMode() ? rendererUrl : pathToFileURL(rendererUrl).toString()
}
const getMainRendererNavigationUrl = (standby = false): string => {
  const rendererUrl = new URL(getRendererNavigationUrl())
  if (standby) rendererUrl.searchParams.set('marklab-standby', '1')
  return rendererUrl.toString()
}
const mainWindowChromeOptions = (): Pick<
  Electron.BrowserWindowConstructorOptions,
  'frame' | 'titleBarStyle' | 'trafficLightPosition'
> => {
  if (isMacOS()) {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
    }
  }
  return { frame: false }
}
const secureWebPreferences = () => {
  return {
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: !isBackgroundElectronE2e(),
    sandbox: false,
    preload: preloadPath,
  } satisfies Electron.WebPreferences
}
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const loadDevUrl = async (window: BrowserWindow, url: string) => {
  let lastError: unknown
  for (let attempt = 0; attempt < DEV_LOAD_RETRIES; attempt += 1) {
    try {
      await window.loadURL(url)
      return
    } catch (error) {
      lastError = error
      await delay(DEV_LOAD_RETRY_MS)
    }
  }
  throw lastError
}
const writeWindowState = (window: BrowserWindow, logger: Logger, stateKey: string): void => {
  try {
    const bounds = window.getNormalBounds()
    const state: PersistedWindowState = {
      width: Math.max(MAIN_WINDOW_MIN_WIDTH, Math.round(bounds.width)),
      height: Math.max(MAIN_WINDOW_MIN_HEIGHT, Math.round(bounds.height)),
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      isMaximized: window.isMaximized(),
    }
    setWindowState(state, stateKey)
  } catch (error) {
    logger.warn('unable to persist window state', { error })
  }
}
export const createSplashWindow = () => {
  installDevelopmentDockIcon()
  const splash = new BrowserWindow({
    width: 360,
    height: 220,
    title: MARKLAB_APP_NAME,
    icon: appIcon,
    resizable: false,
    fullscreen: false,
    frame: false,
    center: true,
    show: false,
    skipTaskbar: true,
    backgroundColor: resolveNativeWindowBackground(nativeTheme.shouldUseDarkColors),
    webPreferences: secureWebPreferences(),
  })
  installWindowNavigationGuard(splash, [getRendererNavigationUrl('splashscreen.html')])

  const showSplash = () => {
    if (isBackgroundElectronE2e()) return
    if (splash.isDestroyed() || splash.isVisible()) return
    showSplashWithoutActivation(splash)
  }
  const showFallbackTimer = setTimeout(showSplash, SPLASH_READY_FALLBACK_MS)
  const clearShowFallbackTimer = () => clearTimeout(showFallbackTimer)
  splash.once('ready-to-show', showSplash)
  splash.webContents.once('did-finish-load', showSplash)
  splash.once('show', clearShowFallbackTimer)
  splash.once('closed', clearShowFallbackTimer)
  return splash
}
export const createMainWindow = (logger: Logger = noopLogger) => {
  installDevelopmentDockIcon()
  const restored = getInitialWindowState(MAIN_WINDOW_ID, logger)
  const main = new BrowserWindow({
    ...restored.bounds,
    minWidth: MAIN_WINDOW_MIN_WIDTH,
    minHeight: MAIN_WINDOW_MIN_HEIGHT,
    title: MARKLAB_APP_NAME,
    icon: appIcon,
    resizable: true,
    fullscreen: false,
    ...mainWindowChromeOptions(),
    show: false,
    backgroundColor: resolveNativeWindowBackground(nativeTheme.shouldUseDarkColors),
    webPreferences: secureWebPreferences(),
  })
  configureWindowAppIdentity(main, windowsTaskbarIconPath)
  if (isMacOS()) {
    main.setWindowButtonVisibility(true)
  }
  installWindowNavigationGuard(main, [
    getMainRendererNavigationUrl(),
    getMainRendererNavigationUrl(true),
    getRendererNavigationUrl('window-opening.html'),
  ])
  installWindowStatePersistence(
    main,
    (stateKey) => writeWindowState(main, logger, stateKey),
    WINDOW_STATE_SAVE_DELAY_MS,
  )
  restoreMaximizedOnFirstShow(main, restored.isMaximized)
  return main
}
export const loadSplashWindow = async (splash: BrowserWindow) => {
  const splashPage = getRendererUrl('splashscreen.html')
  if (isDevMode()) {
    await loadDevUrl(splash, splashPage)
    return
  }
  await splash.loadFile(splashPage)
}
export const loadMainWindow = async (main: BrowserWindow, options: MainWindowLoadOptions = {}) => {
  if (isDevMode()) {
    await loadDevUrl(main, getMainRendererNavigationUrl(options.standby))
    return
  }
  await main.loadFile(
    getRendererUrl(),
    options.standby ? { query: { 'marklab-standby': '1' } } : {},
  )
}
export const loadWindowOpeningShell = async (main: BrowserWindow) => {
  const openingPage = getRendererUrl('window-opening.html')
  if (isDevMode()) {
    await loadDevUrl(main, openingPage)
    return
  }
  await main.loadFile(openingPage)
}
export const createLoadedMainWindow = async (logger: Logger = noopLogger) => {
  const main = createMainWindow(logger)
  await loadMainWindow(main)
  return main
}
export const createMarklabWindows = async (
  logger: Logger = noopLogger,
  mainWindowPool?: MainWindowPool,
): Promise<MarklabWindows> => {
  const splash = createSplashWindow()
  const mainWindow = mainWindowPool
    ? mainWindowPool.acquireMainWindow().then(async (acquisition) => {
        await mainWindowPool.activateMainWindow(acquisition)
        return acquisition.window
      })
    : createLoadedMainWindow(logger)
  const [main] = await Promise.all([mainWindow, loadSplashWindow(splash)])
  return { splash, main }
}
