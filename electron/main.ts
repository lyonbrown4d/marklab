import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
} from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { registerNativeIpc, type NativeIpcRegistration } from './ipc/index.js'
import { installNativeMenu } from './menu.js'
import type {
  AppLaunchInfo,
  AppLaunchSource,
  DeepLinkPayload,
  SingleInstancePayload,
} from './types.js'
import { createMarkoWindows, type MarkoWindows } from './window.js'

const APP_READY_FALLBACK_MS = 5000
const DEEP_LINK_SCHEME = 'marko'
const ASSET_PROTOCOL = 'marko-asset'
const MAX_DEEP_LINK_URL_LENGTH = 4096
const MAX_STORED_DEEP_LINKS = 20
let windows: MarkoWindows | null = null
let didShowMain = false
let fallbackTimer: ReturnType<typeof setTimeout> | null = null
let nativeIpc: NativeIpcRegistration | null = null
let legacyIpcRegistered = false
let assetProtocolRegistered = false
let allowAppQuit = false
let allowMainWindowClose = false
let closeFlushInProgress = false
let quitFlushInProgress = false
let cspInstalled = false

type PendingRuntimeEvent =
  | { eventName: 'single-instance'; payload: SingleInstancePayload }
  | { eventName: 'deep-link'; payload: DeepLinkPayload }

const launchInfo: AppLaunchInfo = {
  args: getProcessArgs(),
  cwd: getProcessCwd(),
  deepLinks: [],
}
const pendingRuntimeEvents: PendingRuntimeEvent[] = []

protocol.registerSchemesAsPrivileged([
  {
    scheme: ASSET_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
])

function showMainWindow() {
  if (didShowMain || !windows) return

  didShowMain = true
  if (fallbackTimer) {
    clearTimeout(fallbackTimer)
    fallbackTimer = null
  }

  if (!windows.main.isDestroyed()) {
    windows.main.show()
    windows.main.focus()
  }
  if (!windows.splash.isDestroyed()) {
    windows.splash.close()
  }
}

function getProcessArgs(): string[] {
  const processWithArgs = process as typeof process & { argv?: readonly unknown[] }
  return userArgsFromCommandLine(processWithArgs.argv ?? [])
}

function getProcessCwd(): string {
  try {
    return process.cwd()
  } catch (error) {
    console.warn('Unable to resolve process cwd.', error)
    return ''
  }
}

function normalizeArgs(args: readonly unknown[]): string[] {
  return args.filter((arg): arg is string => typeof arg === 'string')
}

function userArgsFromCommandLine(args: readonly unknown[]): string[] {
  const normalized = normalizeArgs(args)
  return normalized.slice(app.isPackaged ? 1 : 2)
}

function getLaunchInfo(): AppLaunchInfo {
  return {
    args: [...launchInfo.args],
    cwd: launchInfo.cwd,
    deepLinks: launchInfo.deepLinks.map((entry) => ({ ...entry })),
  }
}

function sendRendererEvent(eventName: string, payload: unknown): boolean {
  if (!windows?.main || windows.main.isDestroyed()) return false
  windows.main.webContents.send(eventName, payload)
  return true
}

function queueOrSendRuntimeEvent(event: PendingRuntimeEvent): void {
  if (sendRendererEvent(event.eventName, event.payload)) return
  pendingRuntimeEvents.push(event)
}

function flushPendingRuntimeEvents(): void {
  while (pendingRuntimeEvents.length > 0) {
    const event = pendingRuntimeEvents[0]
    if (!event || !sendRendererEvent(event.eventName, event.payload)) return
    pendingRuntimeEvents.shift()
  }
}

function createSingleInstancePayload(
  args: readonly unknown[],
  cwd: unknown,
): SingleInstancePayload {
  return {
    args: userArgsFromCommandLine(args),
    cwd: typeof cwd === 'string' ? cwd : '',
  }
}

function parseDeepLinkUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const rawUrl = value.trim()
  if (!rawUrl || rawUrl.length > MAX_DEEP_LINK_URL_LENGTH) return null

  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol.toLowerCase() !== `${DEEP_LINK_SCHEME}:`) return null
    if (parsed.username || parsed.password) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function createDeepLinkPayload(url: string, source: AppLaunchSource): DeepLinkPayload {
  return {
    url,
    source,
    receivedAt: Date.now(),
  }
}

function collectDeepLinkPayloads(
  values: readonly unknown[],
  source: AppLaunchSource,
): DeepLinkPayload[] {
  return values
    .map(parseDeepLinkUrl)
    .filter((url): url is string => url !== null)
    .map((url) => createDeepLinkPayload(url, source))
}

function storeDeepLink(payload: DeepLinkPayload): void {
  launchInfo.deepLinks.push(payload)
  if (launchInfo.deepLinks.length > MAX_STORED_DEEP_LINKS) {
    launchInfo.deepLinks.splice(0, launchInfo.deepLinks.length - MAX_STORED_DEEP_LINKS)
  }
}

function publishDeepLink(payload: DeepLinkPayload): void {
  storeDeepLink(payload)
  queueOrSendRuntimeEvent({ eventName: 'deep-link', payload })
}

function publishDeepLinksFromArgs(values: readonly unknown[], source: AppLaunchSource): void {
  for (const payload of collectDeepLinkPayloads(values, source)) {
    publishDeepLink(payload)
  }
}

function publishDeepLinkUrl(url: unknown, source: AppLaunchSource): void {
  const parsed = parseDeepLinkUrl(url)
  if (!parsed) return
  publishDeepLink(createDeepLinkPayload(parsed, source))
}

function registerDeepLinkProtocol(): void {
  try {
    const processWithLaunchPath = process as typeof process & {
      argv?: readonly unknown[]
      execPath?: string
    }
    const entryPath = normalizeArgs(processWithLaunchPath.argv ?? [])[1]
    if (!app.isPackaged && processWithLaunchPath.execPath && entryPath) {
      app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, processWithLaunchPath.execPath, [entryPath])
      return
    }

    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)
  } catch (error) {
    console.warn(`Unable to register ${DEEP_LINK_SCHEME}: deep link protocol.`, error)
  }
}

function registerAssetProtocol(): void {
  if (assetProtocolRegistered) return
  assetProtocolRegistered = true

  protocol.handle(ASSET_PROTOCOL, async (request) => {
    const assetPath = assetPathFromRequest(request.url)
    if (!assetPath) return new Response('Invalid asset URL', { status: 400 })
    if (!isAllowedAssetPath(assetPath))
      return new Response('Asset path is not allowed', { status: 403 })
    return net.fetch(pathToFileURL(assetPath).toString())
  })
}

function assetPathFromRequest(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${ASSET_PROTOCOL}:` || parsed.hostname !== 'local') return null
    const value = parsed.searchParams.get('path')
    if (!value || value.includes('\0')) return null
    if (!path.isAbsolute(value)) return null
    const resolved = path.resolve(value)
    return path.isAbsolute(resolved) ? resolved : null
  } catch {
    return null
  }
}

function isAllowedAssetPath(assetPath: string): boolean {
  if (nativeIpc?.commands.workspace.isAssetPathAllowed(assetPath)) return true

  return defaultAssetRoots().some((root) => isPathInsideOrEqual(root, assetPath))
}

function defaultAssetRoots(): string[] {
  const roots = [
    safeAppPath('home'),
    safeAppPath('temp'),
    safeAppPath('appData'),
    safeAppPath('userData'),
    process.resourcesPath,
  ].filter((root): root is string => Boolean(root))
  return [...new Set(roots.map((root) => path.resolve(root)))]
}

function safeAppPath(name: Parameters<typeof app.getPath>[0]): string | null {
  try {
    return app.getPath(name)
  } catch {
    return null
  }
}

function isPathInsideOrEqual(root: string, assetPath: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(assetPath)).replace(/\\/g, '/')
  return (
    relative === '' ||
    relative === '.' ||
    (!relative.startsWith('../') && relative !== '..' && !path.isAbsolute(relative))
  )
}

async function flushWorkspaceBuffers(reason: string): Promise<void> {
  try {
    await nativeIpc?.commands.workspace.flushBuffers()
  } catch (error) {
    console.warn(`Failed to flush workspace buffers before ${reason}.`, error)
  }
}

function installMainWindowCloseFlush(main: BrowserWindow): void {
  main.on('close', (event) => {
    if (allowMainWindowClose) return
    event.preventDefault()
    if (closeFlushInProgress) return

    closeFlushInProgress = true
    void (async () => {
      await flushWorkspaceBuffers('window close')
      allowMainWindowClose = true
      try {
        if (!main.isDestroyed()) main.close()
      } finally {
        allowMainWindowClose = false
        closeFlushInProgress = false
      }
    })()
  })
}

function registerLegacyShellIpc() {
  if (legacyIpcRegistered) return
  legacyIpcRegistered = true

  ipcMain.handle('app-ready', () => {
    showMainWindow()
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
    windows?.main.webContents.send('menu-action', payload.id)
    return { ok: true }
  })
}

function createContentSecurityPolicy(): string {
  const scriptSources = ["'self'", 'blob:']
  if (!app.isPackaged && process.env.VITE_REACT_DEVTOOLS === 'true') {
    scriptSources.push('http://localhost:8097')
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: file: marko-asset: http: https:",
    "font-src 'self' data:",
    "connect-src 'self' marko-asset: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
    "media-src 'self' data: blob: file: marko-asset:",
    "worker-src 'self' blob:",
  ].join('; ')
}

function installContentSecurityPolicy(): void {
  if (cspInstalled) return
  cspInstalled = true
  const contentSecurityPolicy = createContentSecurityPolicy()

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    for (const headerName of Object.keys(responseHeaders)) {
      if (headerName.toLowerCase() === 'content-security-policy') {
        delete responseHeaders[headerName]
      }
    }
    responseHeaders['Content-Security-Policy'] = [contentSecurityPolicy]
    callback({ responseHeaders })
  })
}

async function bootstrap() {
  installContentSecurityPolicy()
  registerAssetProtocol()
  registerLegacyShellIpc()
  didShowMain = false
  windows = await createMarkoWindows()
  if (!nativeIpc) {
    nativeIpc = registerNativeIpc({
      app,
      BrowserWindow,
      clipboard,
      dialog,
      getLaunchInfo,
      ipcMain,
      onRendererReady: showMainWindow,
      shell,
    })
  }
  installNativeMenu(windows.main, (id) => {
    if (windows?.main && nativeIpc?.menu.dispatchToWindow(windows.main, id)) return
    windows?.main.webContents.send('menu-action', id)
  })
  installMainWindowCloseFlush(windows.main)

  fallbackTimer = setTimeout(showMainWindow, APP_READY_FALLBACK_MS)
  flushPendingRuntimeEvents()

  windows.main.on('closed', () => {
    windows = null
  })
}

publishDeepLinksFromArgs(launchInfo.args, 'startup')

app.on('open-url', (event, url) => {
  event.preventDefault()
  publishDeepLinkUrl(url, 'open-url')
  if (windows?.main && !windows.main.isDestroyed()) {
    showMainWindow()
    if (windows.main.isMinimized()) windows.main.restore()
    windows.main.focus()
  } else if (app.isReady()) {
    void bootstrap()
  }
})

const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  app.quit()
} else {
  registerDeepLinkProtocol()

  app.on('second-instance', (_event, commandLine, workingDirectory) => {
    const payload = createSingleInstancePayload(commandLine, workingDirectory)
    if (windows?.main && !windows.main.isDestroyed()) {
      showMainWindow()
      if (windows.main.isMinimized()) windows.main.restore()
      windows.main.focus()
    } else {
      void bootstrap()
    }
    queueOrSendRuntimeEvent({ eventName: 'single-instance', payload })
    publishDeepLinksFromArgs(payload.args, 'second-instance')
  })

  app.whenReady().then(() => {
    void bootstrap()
  })

  app.on('activate', () => {
    if (windows?.main && !windows.main.isDestroyed()) {
      showMainWindow()
      return
    }

    void bootstrap()
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
    allowMainWindowClose = true
    app.quit()
  })()
})
