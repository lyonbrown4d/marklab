import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { nativeIpcChannels } from './channels.js'
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
} from './types.js'

type MenuActionHandler = (id: string) => void
type RuntimeEventHandler<T = unknown> = (event: RuntimeEventPayload<T>) => void
type FileDropHandler = (event: {
  paths: string[]
  position: {
    x: number
    y: number
  }
}) => void

const allowedCommands = new Set([
  'app-ready',
  'app_get_platform',
  'menu_dispatch',
  'fs_get_root_info',
  'fs_get_snapshot',
  'fs_list_entries',
  'fs_set_root',
  'fs_set_single_file',
  'fs_open_file',
  'fs_read_file',
  'fs_get_workspace_index',
  'fs_get_workspace_graph',
  'fs_get_outline_graph',
  'fs_analyze_markdown_buffer',
  'fs_search_workspace',
  'fs_rebuild_search_index',
  'fs_update_buffer',
  'fs_write_file',
  'fs_flush_buffers',
  'fs_get_buffer_status',
  'fs_get_background_tasks',
  'fs_create_file',
  'fs_create_dir',
  'fs_rename_path',
  'fs_move_path',
  'fs_delete_path',
  'fs_get_path_metadata',
  'fs_open_path_in_system',
  'fs_import_markdown_asset',
  'fs_import_markdown_asset_base64',
  'fs_resolve_markdown_asset',
  'list_markdown_files',
  'read_markdown_file',
  'write_markdown_file',
  'git_discover_repo',
  'git_init_repo',
  'git_get_status',
  'git_get_file_diff',
  'git_commit_all',
  'terminal_create',
  'terminal_write',
  'terminal_resize',
  'terminal_close',
  'export_markdown',
  'export_open_output_path',
] as const)

const allowedEvents = new Set([
  'fs-changed',
  'fs-buffer-status',
  'export-task',
  'terminal-output',
  'terminal-exit',
  'menu-action',
  'single-instance',
  'deep-link',
  'app-ready',
] as const)

let nextRuntimeEventId = 1

function emitMenuAction(id: string) {
  window.dispatchEvent(new CustomEvent('marko:menu-action', { detail: id }))
}

function menuCommandFromPayload(payload: unknown) {
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

async function runWindowAction(channel: string) {
  const result = await ipcRenderer.invoke(channel)
  if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
    if ('supported' in result && result.supported === false) return
    throw new Error(String((result as WindowActionResult).error ?? 'Window action failed.'))
  }
}

function assertAllowedCommand(command: string): void {
  if (!allowedCommands.has(command as typeof allowedCommands extends Set<infer T> ? T : never)) {
    throw new Error(`Unsupported command: ${command}`)
  }
}

function assertAllowedEvent(eventName: string): void {
  if (!allowedEvents.has(eventName as typeof allowedEvents extends Set<infer T> ? T : never)) {
    throw new Error(`Unsupported event: ${eventName}`)
  }
}

function emitRuntimeEvent<T>(eventName: string, payload: T, handler: RuntimeEventHandler<T>): void {
  handler({
    event: eventName,
    id: nextRuntimeEventId,
    payload,
  })
  nextRuntimeEventId += 1
}

function listenToRuntimeEvent<T>(eventName: string, handler: RuntimeEventHandler<T>) {
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

function isFileDragEvent(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  return Boolean(types && Array.from(types).includes('Files'))
}

function getFilePath(file: File): string | null {
  try {
    const resolved = webUtils.getPathForFile(file)
    if (resolved) return resolved
  } catch {
    // Electron can deny path resolution for synthetic File objects.
  }

  const legacyPath = (file as File & { path?: unknown }).path
  return typeof legacyPath === 'string' && legacyPath ? legacyPath : null
}

function getDroppedFilePaths(files: FileList): string[] {
  const paths = new Set<string>()
  for (const file of Array.from(files)) {
    const filePath = getFilePath(file)
    if (filePath) paths.add(filePath)
  }
  return [...paths]
}

function getFileDropPosition(event: DragEvent) {
  const scale = window.devicePixelRatio || 1
  return {
    x: Math.round(event.clientX * scale),
    y: Math.round(event.clientY * scale),
  }
}

function onFileDrop(handler: FileDropHandler) {
  const dragOverListener = (event: DragEvent) => {
    if (!isFileDragEvent(event)) return
    event.preventDefault()
  }

  const dropListener = (event: DragEvent) => {
    if (!isFileDragEvent(event)) return
    event.preventDefault()
    event.stopPropagation()

    const files = event.dataTransfer?.files
    if (!files) return

    const paths = getDroppedFilePaths(files)
    if (paths.length === 0) return

    handler({
      paths,
      position: getFileDropPosition(event),
    })
  }

  window.addEventListener('dragover', dragOverListener, true)
  window.addEventListener('drop', dropListener, true)
  return () => {
    window.removeEventListener('dragover', dragOverListener, true)
    window.removeEventListener('drop', dropListener, true)
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
