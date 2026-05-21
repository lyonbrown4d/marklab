import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { registerNativeIpc, type NativeIpcRegistration } from './ipc/index.js'
import { installNativeMenu } from './menu.js'
import { registerAssetProtocol, registerAssetProtocolPrivileges } from './main/assetProtocol.js'
import { installContentSecurityPolicy } from './main/contentSecurityPolicy.js'
import {
  createSingleInstancePayload,
  getLaunchInfo,
  launchInfo,
  publishDeepLinksFromArgs,
  publishDeepLinkUrl,
  registerDeepLinkProtocol,
} from './main/deepLinks.js'
import type { DeepLinkPayload, SingleInstancePayload } from './types.js'
import { createMarklabWindows, type MarklabWindows } from './window.js'

const APP_READY_FALLBACK_MS = 5000
let windows: MarklabWindows | null = null
let didShowMain = false
let fallbackTimer: ReturnType<typeof setTimeout> | null = null
let nativeIpc: NativeIpcRegistration | null = null
let legacyIpcRegistered = false
let allowAppQuit = false
let allowMainWindowClose = false
let closeFlushInProgress = false
let quitFlushInProgress = false

type PendingRuntimeEvent =
  | { eventName: 'single-instance'; payload: SingleInstancePayload }
  | { eventName: 'deep-link'; payload: DeepLinkPayload }

const pendingRuntimeEvents: PendingRuntimeEvent[] = []

registerAssetProtocolPrivileges()

const showMainWindow = (): void => {
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
    await nativeIpc?.commands.workspace.flushBuffers()
  } catch (error) {
    console.warn(`Failed to flush workspace buffers before ${reason}.`, error)
  }
}

const installMainWindowCloseFlush = (main: BrowserWindow): void => {
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

const registerLegacyShellIpc = (): void => {
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

const bootstrap = async (): Promise<void> => {
  installContentSecurityPolicy()
  registerAssetProtocol(() => nativeIpc)
  registerLegacyShellIpc()
  didShowMain = false
  windows = await createMarklabWindows()
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

publishDeepLinksFromArgs(launchInfo.args, 'startup', queueDeepLinkPayload)

app.on('open-url', (event, url) => {
  event.preventDefault()
  publishDeepLinkUrl(url, 'open-url', queueDeepLinkPayload)
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
    publishDeepLinksFromArgs(payload.args, 'second-instance', queueDeepLinkPayload)
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
