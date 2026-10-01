import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { nativeIpcChannels } from '@electron/channels.js'
import { allowedCommands, allowedEvents } from '@electron/preload/allowlists.js'
import { onFileDrop } from '@electron/preload/fileDrop.js'
import { createWorkspacePreloadSurfaces } from '@electron/preload/workspaceApi.js'
import { createWindowOpeningPreloadSurface } from '@electron/preload/windowOpening.js'
import type {
  AppLaunchInfo,
  ClipboardImage,
  DialogFilter,
  OpenDialogOptions,
  PlatformInfo,
  RuntimeEventEnvelope,
  SaveDialogOptions,
  SettingsPersistResult,
  UserThemeCssResult,
  UserThemeImportResult,
  UserThemeListResult,
  UpdateEventPayload,
  UpdateResult,
  UpdateState,
  WindowActionResult,
} from '@electron/types.js'
import type { RendererSafeElectronApi } from '@/runtime/electron'
import type {
  AiInlineCompletionEvent,
  AiInlineCompletionRequest,
  AiInlineCompletionStartResult,
} from '@/types/aiCompletion'
import type { WorkspaceSyncProgressEvent } from '@/types/workspaceSync'

type MenuActionHandler = (id: string) => void
type RuntimeEventHandler<T = unknown> = (event: RuntimeEventEnvelope<T>) => void

let nextRuntimeEventId = 1

const emitMenuAction = (id: string): void => {
  window.dispatchEvent(new CustomEvent('marklab:menu-action', { detail: id }))
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
    throw new Error('Unsupported command: ' + command)
  }
}

const assertAllowedEvent = (eventName: string): void => {
  if (!allowedEvents.has(eventName)) {
    throw new Error('Unsupported event: ' + eventName)
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

const workspacePreloadSurfaces = createWorkspacePreloadSurfaces()
const windowOpeningSurface = createWindowOpeningPreloadSurface(ipcRenderer)

const desktopApi: RendererSafeElectronApi = {
  aiCompletion: {
    cancel: (requestId: string) =>
      ipcRenderer.invoke(nativeIpcChannels.aiCompletionCancel, requestId) as Promise<{ ok: true }>,
    onEvent: (handler: (event: AiInlineCompletionEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: AiInlineCompletionEvent) => {
        handler(payload)
      }
      ipcRenderer.on(nativeIpcChannels.aiCompletionEvent, listener)
      return () => ipcRenderer.removeListener(nativeIpcChannels.aiCompletionEvent, listener)
    },
    start: (input: AiInlineCompletionRequest) =>
      ipcRenderer.invoke(
        nativeIpcChannels.aiCompletionStart,
        input,
      ) as Promise<AiInlineCompletionStartResult>,
  },
  appReady: () => ipcRenderer.invoke(nativeIpcChannels.appReadySignal) as Promise<{ ok: boolean }>,
  lifecycle: {
    getLaunchInfo: () =>
      ipcRenderer.invoke(nativeIpcChannels.lifecycleGetLaunchInfo) as Promise<AppLaunchInfo>,
  },
  opening: windowOpeningSurface,
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
  themes: {
    list: () => ipcRenderer.invoke(nativeIpcChannels.themeList) as Promise<UserThemeListResult>,
    importCss: (path: string) =>
      ipcRenderer.invoke(nativeIpcChannels.themeImportCss, path) as Promise<UserThemeImportResult>,
    readCss: (id: string | null) =>
      ipcRenderer.invoke(nativeIpcChannels.themeReadCss, id) as Promise<UserThemeCssResult>,
    remove: (id: string) =>
      ipcRenderer.invoke(nativeIpcChannels.themeRemove, id) as Promise<SettingsPersistResult>,
    openFolder: () =>
      ipcRenderer.invoke(nativeIpcChannels.themeOpenFolder) as Promise<SettingsPersistResult>,
  },
  updates: {
    getState: () => ipcRenderer.invoke(nativeIpcChannels.updatesGetState) as Promise<UpdateState>,
    check: () => ipcRenderer.invoke(nativeIpcChannels.updatesCheck) as Promise<UpdateResult>,
    download: () => ipcRenderer.invoke(nativeIpcChannels.updatesDownload) as Promise<UpdateResult>,
    install: () => ipcRenderer.invoke(nativeIpcChannels.updatesInstall) as Promise<UpdateResult>,
    onEvent: (handler: (payload: UpdateEventPayload) => void) => {
      const listener = (_event: IpcRendererEvent, payload: UpdateEventPayload) => {
        handler(payload)
      }
      ipcRenderer.on(nativeIpcChannels.updatesEvent, listener)
      return () => {
        ipcRenderer.removeListener(nativeIpcChannels.updatesEvent, listener)
      }
    },
  },
  workspaceSync: {
    binding: {
      get: () => ipcRenderer.invoke(nativeIpcChannels.syncBindingGet),
      remove: () => ipcRenderer.invoke(nativeIpcChannels.syncBindingRemove),
      set: (binding) => ipcRenderer.invoke(nativeIpcChannels.syncBindingSet, binding),
    },
    cancel: () => ipcRenderer.invoke(nativeIpcChannels.syncCancel),
    onProgress: (handler) => {
      const listener = (_event: IpcRendererEvent, payload: WorkspaceSyncProgressEvent) => {
        handler(payload)
      }
      ipcRenderer.on(nativeIpcChannels.syncProgress, listener)
      return () => ipcRenderer.removeListener(nativeIpcChannels.syncProgress, listener)
    },
    start: (requestId) => ipcRenderer.invoke(nativeIpcChannels.syncStart, { requestId }),
    webDavProfiles: {
      delete: (id) => ipcRenderer.invoke(nativeIpcChannels.webDavProfileDelete, { id }),
      list: () => ipcRenderer.invoke(nativeIpcChannels.webDavProfileList),
      test: (id) => ipcRenderer.invoke(nativeIpcChannels.webDavProfileTest, { id }),
      update: (input) => ipcRenderer.invoke(nativeIpcChannels.webDavProfileUpdate, input),
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
    invoke: <T = unknown>(command: string, args?: Record<string, unknown>) => {
      assertAllowedCommand(command)
      return ipcRenderer.invoke(nativeIpcChannels.commandInvoke, { command, args }) as Promise<T>
    },
  },
  events: {
    listen: listenToRuntimeEvent,
  },
  git: {
    commitAll: (message) => ipcRenderer.invoke(nativeIpcChannels.gitCommitAll, { message }),
    discover: () => ipcRenderer.invoke(nativeIpcChannels.gitDiscover),
    fetch: (remote) => ipcRenderer.invoke(nativeIpcChannels.gitFetch, remote ? { remote } : {}),
    fileDiff: (path, section) =>
      ipcRenderer.invoke(nativeIpcChannels.gitFileDiff, { path, section }),
    init: () => ipcRenderer.invoke(nativeIpcChannels.gitInit),
    pull: () => ipcRenderer.invoke(nativeIpcChannels.gitPull),
    push: (options) => ipcRenderer.invoke(nativeIpcChannels.gitPush, options ?? {}),
    removeRemote: (name) => ipcRenderer.invoke(nativeIpcChannels.gitRemoteRemove, { name }),
    remoteStatus: () => ipcRenderer.invoke(nativeIpcChannels.gitRemoteStatus),
    setRemote: (name, url) => ipcRenderer.invoke(nativeIpcChannels.gitRemoteSet, { name, url }),
    status: () => ipcRenderer.invoke(nativeIpcChannels.gitStatus),
  },
  assets: workspacePreloadSurfaces.assets,
  workspace: workspacePreloadSurfaces.workspace,
  webview: {
    onFileDrop,
  },
}

contextBridge.exposeInMainWorld('marklabElectron', desktopApi)

desktopApi.menu.onCommand(() => {})

export type ElectronPreloadApi = RendererSafeElectronApi
export type { DialogFilter }
