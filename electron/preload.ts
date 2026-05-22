import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { nativeIpcChannels } from '@electron/channels.js'
import { allowedCommands, allowedEvents } from '@electron/preload/allowlists.js'
import { onFileDrop } from '@electron/preload/fileDrop.js'
import type {
  AppLaunchInfo,
  ClipboardImage,
  DialogFilter,
  OpenDialogOptions,
  PlatformInfo,
  RuntimeEventPayload,
  SaveDialogOptions,
  SettingsPersistResult,
  WindowActionResult,
} from '@electron/types.js'

type MenuActionHandler = (id: string) => void
type RuntimeEventHandler<T = unknown> = (event: RuntimeEventPayload<T>) => void

let nextRuntimeEventId = 1

const emitMenuAction = (id: string): void => {
  window.dispatchEvent(new CustomEvent('marko:menu-action', { detail: id }))
}

const menuCommandFromPayload = (payload: unknown): string | null => {
  if (typeof payload === 'string') return payload
  if (
    payload &&
    typeof payload === 'object' &&
    'command' in payload &&
    typeof payload.command === 'string'
  ) {
    return payload.command
  }
  return null
}

const runWindowAction = async (channel: string): Promise<void> => {
  const result = await ipcRenderer.invoke(channel)
  if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
    if ('supported' in result && result.supported === false) return
    throw new Error(String((result as WindowActionResult).error ?? 'Window action failed.'))
  }
}

const assertAllowedCommand = (command: string): void => {
  if (!allowedCommands.has(command)) {
    throw new Error(`Unsupported command: ${command}`)
  }
}

const assertAllowedEvent = (eventName: string): void => {
  if (!allowedEvents.has(eventName)) {
    throw new Error(`Unsupported event: ${eventName}`)
  }
}

const emitRuntimeEvent = <T>(
  eventName: string,
  payload: T,
  handler: RuntimeEventHandler<T>,
): void => {
  handler({
    event: eventName,
    id: nextRuntimeEventId,
    payload,
  })
  nextRuntimeEventId += 1
}

const listenToRuntimeEvent = <T>(
  eventName: string,
  handler: RuntimeEventHandler<T>,
): (() => void) => {
  assertAllowedEvent(eventName)

  if (eventName === 'menu-action') {
    const menuCommandListener = (_event: IpcRendererEvent, payload: unknown) => {
      const command = menuCommandFromPayload(payload)
      if (command) emitRuntimeEvent(eventName, command as T, handler)
    }
    const legacyMenuListener = (_event: IpcRendererEvent, id: unknown) => {
      if (typeof id === 'string') emitRuntimeEvent(eventName, id as T, handler)
    }

    ipcRenderer.on(nativeIpcChannels.menuCommand, menuCommandListener)
    ipcRenderer.on('menu-action', legacyMenuListener)
    return () => {
      ipcRenderer.removeListener(nativeIpcChannels.menuCommand, menuCommandListener)
      ipcRenderer.removeListener('menu-action', legacyMenuListener)
    }
  }

  const listener = (_event: IpcRendererEvent, payload: T) => {
    emitRuntimeEvent(eventName, payload, handler)
  }
  ipcRenderer.on(eventName, listener)
  return () => {
    ipcRenderer.removeListener(eventName, listener)
  }
}

const desktopApi = {
  appReady: () => ipcRenderer.invoke(nativeIpcChannels.appReadySignal) as Promise<{ ok: boolean }>,
  lifecycle: {
    getLaunchInfo: () =>
      ipcRenderer.invoke(nativeIpcChannels.lifecycleGetLaunchInfo) as Promise<AppLaunchInfo>,
  },
  platform: {
    get: () => ipcRenderer.invoke(nativeIpcChannels.platformGet) as Promise<PlatformInfo>,
  },
  menu: {
    dispatch: async (id: string) => {
      emitMenuAction(id)
      return { ok: true }
    },
    onCommand: (handler: MenuActionHandler) => {
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        const command = menuCommandFromPayload(payload)
        if (!command) return
        handler(command)
        emitMenuAction(command)
      }

      const legacyListener = (_event: IpcRendererEvent, id: string) => {
        handler(id)
        emitMenuAction(id)
      }

      ipcRenderer.on(nativeIpcChannels.menuCommand, listener)
      ipcRenderer.on('menu-action', legacyListener)
      return () => {
        ipcRenderer.removeListener(nativeIpcChannels.menuCommand, listener)
        ipcRenderer.removeListener('menu-action', legacyListener)
      }
    },
  },
  dialog: {
    open: (options?: OpenDialogOptions) =>
      ipcRenderer.invoke(nativeIpcChannels.dialogOpen, options) as Promise<
        string | string[] | null
      >,
    save: (options?: SaveDialogOptions) =>
      ipcRenderer.invoke(nativeIpcChannels.dialogSave, options) as Promise<string | null>,
  },
  clipboard: {
    readText: () => ipcRenderer.invoke(nativeIpcChannels.clipboardReadText) as Promise<string>,
    writeText: (text: string) =>
      ipcRenderer.invoke(nativeIpcChannels.clipboardWriteText, text) as Promise<{ ok: boolean }>,
    readImage: () =>
      ipcRenderer.invoke(nativeIpcChannels.clipboardReadImage) as Promise<ClipboardImage | null>,
  },
  shell: {
    openPath: (path: string) => ipcRenderer.invoke(nativeIpcChannels.shellOpenPath, path),
    revealPath: (path: string) => ipcRenderer.invoke(nativeIpcChannels.shellRevealPath, path),
  },
  settings: {
    persist: {
      getItem: (key: string) => ipcRenderer.invoke(nativeIpcChannels.settingsPersistGet, key),
      setItem: (key: string, value: unknown) =>
        ipcRenderer.invoke(
          nativeIpcChannels.settingsPersistSet,
          key,
          value,
        ) as Promise<SettingsPersistResult>,
      removeItem: (key: string) =>
        ipcRenderer.invoke(
          nativeIpcChannels.settingsPersistRemove,
          key,
        ) as Promise<SettingsPersistResult>,
    },
  },
  window: {
    minimize: () => runWindowAction(nativeIpcChannels.windowMinimize),
    maximize: () => runWindowAction(nativeIpcChannels.windowMaximize),
    unmaximize: () => runWindowAction(nativeIpcChannels.windowUnmaximize),
    isMaximized: () => ipcRenderer.invoke(nativeIpcChannels.windowIsMaximized) as Promise<boolean>,
    close: () => runWindowAction(nativeIpcChannels.windowClose),
    startDragging: () => runWindowAction(nativeIpcChannels.windowStartDrag),
  },
  commands: {
    invoke: (command: string, args?: Record<string, unknown>) => {
      assertAllowedCommand(command)
      return ipcRenderer.invoke(nativeIpcChannels.commandInvoke, { command, args })
    },
  },
  events: {
    listen: listenToRuntimeEvent,
  },
  assets: {
    convertFileSrc: (filePath: string) => {
      if (typeof filePath !== 'string' || !filePath) return ''
      return `marko-asset://local/?path=${encodeURIComponent(filePath)}`
    },
  },
  webview: {
    onFileDrop,
  },
}

contextBridge.exposeInMainWorld('markoElectron', desktopApi)

desktopApi.menu.onCommand(() => {})

export type ElectronPreloadApi = typeof desktopApi

declare global {
  interface Window {
    markoElectron: ElectronPreloadApi
  }
}

export type { DialogFilter }
