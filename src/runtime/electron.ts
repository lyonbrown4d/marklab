import type { AssetApi } from '@/types/workspaceSession'
import type { WindowOpeningProgress, WindowOpeningRetryResult } from '@/types/windowOpening'
import type { FocusedEditAction } from '@/types/editCommand'
import type {
  AiInlineCompletionEvent,
  AiInlineCompletionRequest,
  AiInlineCompletionStartResult,
} from '@/types/aiCompletion'
import type { WorkspaceSyncApi } from '@/runtime/workspaceSync'
import type { LanguageIntelligenceApi } from '@/types/languageIntelligence'
import type { WorkspaceTextPreview } from '@/types/workspaceTextPreview'
import type { LinkPreviewCapture, LinkPreviewResult } from '@/types/linkPreview'
import type { WebTabsApi } from '@/types/webTabs'
import type { WorkspaceTreeApi } from '@/types/workspaceTree'
import type { RendererReadySignal } from '@/types/rendererReady'
import type {
  ElectronUpdateEvent,
  ElectronUpdateResult,
  ElectronUpdateState,
} from '@/types/softwareUpdate'

export type {
  ElectronUpdateError,
  ElectronUpdateEvent,
  ElectronUpdateInfo,
  ElectronUpdateProgress,
  ElectronUpdateResult,
  ElectronUpdateState,
  ElectronUpdateStatus,
} from '@/types/softwareUpdate'

type ElectronPlatformInfo = {
  platform: 'windows' | 'macos' | 'linux' | 'unknown'
}

export type ElectronWorkspacePathApi = {
  copyAbsolutePathToClipboard: (path: string) => Promise<void>
  openPathInSystem: (path: string) => Promise<void>
  readTextPreview: (path: string, limitBytes: number) => Promise<WorkspaceTextPreview>
  revealPathInSystem: (path: string) => Promise<void>
}

export type ElectronLinkPreviewApi = {
  capture: (url: string) => Promise<LinkPreviewCapture>
  fetch: (url: string) => Promise<LinkPreviewResult>
}

export type ElectronClipboardContent = {
  html?: string
  markdown: string
  text: string
}

export type ElectronClipboardApi = {
  readImage: () => Promise<{
    dataUrl: string
    width: number
    height: number
  } | null>
  readText: () => Promise<string>
  write: (content: ElectronClipboardContent) => Promise<{ ok: boolean }>
  writeText: (text: string) => Promise<{ ok: boolean }>
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
  appReady: (signal?: RendererReadySignal) => Promise<{ ok: boolean }>
  assets: AssetApi
  lifecycle: {
    getLaunchInfo: () => Promise<ElectronLaunchInfo>
  }
  languageIntelligence: LanguageIntelligenceApi
  linkPreview: ElectronLinkPreviewApi
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
  edit: {
    execute: (action: FocusedEditAction) => Promise<{ ok: true }>
  }
  clipboard: ElectronClipboardApi
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
    setInstallOnQuit: (enabled: boolean) => Promise<ElectronUpdateResult>
    onEvent: (handler: (payload: ElectronUpdateEvent) => void) => () => void
  }
  webTabs: WebTabsApi
  workspaceSync: WorkspaceSyncApi
  webview: {
    onFileDrop: (handler: (event: ElectronFileDropEvent) => void) => () => void
  }
  workspace: ElectronWorkspacePathApi
  workspaceTree: WorkspaceTreeApi
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    unmaximize: () => Promise<void>
    isMaximized: () => Promise<boolean>
    close: () => Promise<void>
    onCloseRequested: (handler: () => Promise<void> | void) => () => void
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
