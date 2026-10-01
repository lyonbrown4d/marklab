import type { AssetApi } from '@/types/workspaceSession'
import type { WindowOpeningProgress, WindowOpeningRetryResult } from '@/types/windowOpening'
import type {
  AiInlineCompletionEvent,
  AiInlineCompletionRequest,
  AiInlineCompletionStartResult,
} from '@/types/aiCompletion'
import type {
  WebDavProfile,
  WebDavProfileInput,
  WorkspaceSyncBinding,
  WorkspaceSyncProgressEvent,
  WorkspaceSyncResult,
} from '@/types/workspaceSync'

type ElectronPlatformInfo = {
  platform: 'windows' | 'macos' | 'linux' | 'unknown'
}

export type ElectronWorkspacePathApi = {
  copyAbsolutePathToClipboard: (path: string) => Promise<void>
  openPathInSystem: (path: string) => Promise<void>
  revealPathInSystem: (path: string) => Promise<void>
}

export type ElectronCommandArguments = Record<string, unknown> | undefined

export type ElectronGitApi = {
  commitAll: (message: string) => Promise<unknown>
  discover: () => Promise<unknown>
  fetch: (remote?: string) => Promise<unknown>
  fileDiff: (
    path: string,
    section: 'staged' | 'unstaged' | 'untracked' | 'conflicts',
  ) => Promise<unknown>
  init: () => Promise<unknown>
  pull: () => Promise<unknown>
  push: (options?: { remote?: string; setUpstream?: boolean }) => Promise<unknown>
  removeRemote: (name: string) => Promise<unknown>
  remoteStatus: () => Promise<unknown>
  setRemote: (name: string, url: string) => Promise<unknown>
  status: () => Promise<unknown>
}

export type ElectronOpenDialogOptions = {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: Array<{
    name: string
    extensions: string[]
  }>
  multiple?: boolean
  directory?: boolean
  file?: boolean
}

export type ElectronSaveDialogOptions = {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: Array<{
    name: string
    extensions: string[]
  }>
}

export type ElectronFileDropEvent = {
  paths: string[]
  position: {
    x: number
    y: number
  }
}

export type ElectronLaunchSource = 'startup' | 'second-instance' | 'open-url'

export type ElectronSingleInstanceEvent = {
  args: string[]
  cwd: string
}

export type ElectronDeepLinkEvent = {
  url: string
  source: ElectronLaunchSource
  receivedAt: number
}

export type ElectronLaunchInfo = ElectronSingleInstanceEvent & {
  deepLinks: ElectronDeepLinkEvent[]
}

export type ElectronUserThemeInfo = {
  createdAt: number
  id: string
  name: string
}

export type ElectronUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'
  | 'unavailable'

export type ElectronUpdateInfo = {
  releaseDate?: string
  releaseName?: string
  version: string
}

export type ElectronUpdateProgress = {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

export type ElectronUpdateState = {
  error?: string
  info?: ElectronUpdateInfo
  progress?: ElectronUpdateProgress
  status: ElectronUpdateStatus
}

export type ElectronUpdateResult = ElectronUpdateState & {
  ok: boolean
}

export type ElectronUpdateEvent = ElectronUpdateState & {
  event:
    | 'checking'
    | 'available'
    | 'not-available'
    | 'download-progress'
    | 'downloaded'
    | 'installing'
    | 'error'
    | 'unavailable'
}

export type ElectronRuntimeEventEnvelope<T = unknown> = {
  event: string
  id: number
  payload: T
}

export type ElectronCommandBridgeApi = {
  invoke: <T = unknown>(command: string, args?: ElectronCommandArguments) => Promise<T>
}

export type ElectronEventBridgeApi = {
  listen: <T = unknown>(
    eventName: string,
    handler: (event: ElectronRuntimeEventEnvelope<T>) => void,
  ) => (() => void) | Promise<() => void>
  emit?: <T = unknown>(eventName: string, payload?: T) => Promise<void> | void
}

export type RendererSafeElectronApi = {
  aiCompletion: {
    cancel: (requestId: string) => Promise<{ ok: true }>
    onEvent: (handler: (event: AiInlineCompletionEvent) => void) => () => void
    start: (input: AiInlineCompletionRequest) => Promise<AiInlineCompletionStartResult>
  }
  appReady: () => Promise<{ ok: boolean }>
  assets: AssetApi
  lifecycle: {
    getLaunchInfo: () => Promise<ElectronLaunchInfo>
  }
  commands: ElectronCommandBridgeApi
  events: ElectronEventBridgeApi
  git: ElectronGitApi
  platform: {
    get: () => Promise<ElectronPlatformInfo>
  }
  menu: {
    dispatch: (id: string) => Promise<{ ok: boolean }>
    onCommand: (handler: (id: string) => void) => () => void
  }
  opening: {
    onProgress: (handler: (progress: WindowOpeningProgress) => void) => () => void
    retry: () => Promise<WindowOpeningRetryResult>
  }
  dialog: {
    open: (options?: ElectronOpenDialogOptions) => Promise<string | string[] | null>
    save: (options?: ElectronSaveDialogOptions) => Promise<string | null>
  }
  clipboard: {
    readText: () => Promise<string>
    writeText: (text: string) => Promise<{ ok: boolean }>
    readImage: () => Promise<{
      dataUrl: string
      width: number
      height: number
    } | null>
  }
  shell: {
    openPath: (path: string) => Promise<{
      ok: boolean
      path?: string
      error?: string
    }>
    revealPath: (path: string) => Promise<{
      ok: boolean
      path?: string
      error?: string
    }>
  }
  settings: {
    persist: {
      getItem: (key: string) => Promise<unknown>
      setItem: (
        key: string,
        value: unknown,
      ) => Promise<{
        ok: boolean
        error?: string
      }>
      removeItem: (key: string) => Promise<{
        ok: boolean
        error?: string
      }>
    }
  }
  themes: {
    importCss: (path: string) => Promise<{
      error?: string
      ok: boolean
      theme?: ElectronUserThemeInfo
    }>
    list: () => Promise<{
      error?: string
      ok: boolean
      themes: ElectronUserThemeInfo[]
    }>
    openFolder: () => Promise<{ error?: string; ok: boolean }>
    readCss: (id: string | null) => Promise<{
      css?: string
      error?: string
      ok: boolean
    }>
    remove: (id: string) => Promise<{ error?: string; ok: boolean }>
  }
  updates: {
    check: () => Promise<ElectronUpdateResult>
    download: () => Promise<ElectronUpdateResult>
    getState: () => Promise<ElectronUpdateState>
    install: () => Promise<ElectronUpdateResult>
    onEvent: (handler: (payload: ElectronUpdateEvent) => void) => () => void
  }
  workspaceSync: {
    binding: {
      get: () => Promise<WorkspaceSyncBinding | null>
      remove: () => Promise<{ ok: true }>
      set: (binding: WorkspaceSyncBinding) => Promise<WorkspaceSyncBinding>
    }
    cancel: () => Promise<{ ok: true; cancelled: boolean }>
    onProgress: (handler: (event: WorkspaceSyncProgressEvent) => void) => () => void
    start: (requestId: string) => Promise<WorkspaceSyncResult>
    webDavProfiles: {
      delete: (id: string) => Promise<{ ok: true }>
      list: () => Promise<WebDavProfile[]>
      test: (id: string) => Promise<{ ok: true } | { ok: false; code: string; message: string }>
      update: (input: WebDavProfileInput) => Promise<WebDavProfile>
    }
  }
  webview: {
    onFileDrop: (handler: (event: ElectronFileDropEvent) => void) => () => void
  }
  workspace: ElectronWorkspacePathApi
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    unmaximize: () => Promise<void>
    isMaximized: () => Promise<boolean>
    close: () => Promise<void>
    startDragging: () => Promise<void>
  }
}

export type ElectronRuntimeApi = RendererSafeElectronApi

declare global {
  interface Window {
    marklabElectron?: RendererSafeElectronApi
  }
}

export const getElectronRuntime = (): RendererSafeElectronApi => {
  if (typeof window === 'undefined' || !window.marklabElectron) {
    throw new Error('Electron runtime API is unavailable.')
  }
  return window.marklabElectron
}

export const isElectronRuntime = () =>
  typeof window !== 'undefined' && window.marklabElectron !== undefined
