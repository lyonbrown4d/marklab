import type { DesktopGitApi } from '@/runtime/git'
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
import type {
  LinkPreviewCapture,
  LinkPreviewCaptureOptions,
  LinkPreviewResult,
} from '@/types/linkPreview'
import type { WebTabsApi } from '@/types/webTabs'
import type { WorkspaceTreeApi } from '@/types/workspaceTree'
import type { RendererReadySignal } from '@/types/rendererReady'
import type { RecentWorkspacesApi } from '@/types/recentWorkspaces'
import type {
  DesktopUpdateEvent,
  DesktopUpdateResult,
  DesktopUpdateState,
} from '@/types/softwareUpdate'

export type {
  DesktopUpdateError,
  DesktopUpdateEvent,
  DesktopUpdateInfo,
  DesktopUpdateProgress,
  DesktopUpdateResult,
  DesktopUpdateState,
  DesktopUpdateStatus,
} from '@/types/softwareUpdate'

type DesktopPlatformInfo = {
  platform: 'windows' | 'macos' | 'linux' | 'unknown'
}

export type DesktopWorkspacePathApi = {
  copyAbsolutePathToClipboard: (path: string) => Promise<void>
  openPathInSystem: (path: string) => Promise<void>
  readTextPreview: (path: string, limitBytes: number) => Promise<WorkspaceTextPreview>
  revealPathInSystem: (path: string) => Promise<void>
}

export type DesktopLinkPreviewApi = {
  capture: (url: string, options: LinkPreviewCaptureOptions) => Promise<LinkPreviewCapture>
  cancel: (requestId: string) => Promise<void>
  promote: (requestId: string) => Promise<void>
  fetch: (url: string) => Promise<LinkPreviewResult>
}

export type DesktopClipboardContent = {
  html?: string
  markdown: string
  text: string
}

export type DesktopClipboardApi = {
  readImage: () => Promise<{
    dataUrl: string
    width: number
    height: number
  } | null>
  readText: () => Promise<string>
  write: (content: DesktopClipboardContent) => Promise<{ ok: boolean }>
  writeText: (text: string) => Promise<{ ok: boolean }>
}

export type DesktopCommandArguments = Record<string, unknown> | undefined

export type { DesktopGitApi } from '@/runtime/git'

export type DesktopOpenDialogOptions = {
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

export type DesktopSaveDialogOptions = {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: Array<{
    name: string
    extensions: string[]
  }>
}

export type DesktopFileDropEvent = {
  paths: string[]
  position: {
    x: number
    y: number
  }
}

export type DesktopLaunchSource = 'startup' | 'second-instance' | 'open-url'

export type DesktopSingleInstanceEvent = {
  args: string[]
  cwd: string
}

export type DesktopDeepLinkEvent = {
  url: string
  source: DesktopLaunchSource
  receivedAt: number
}

export type DesktopLaunchInfo = DesktopSingleInstanceEvent & {
  deepLinks: DesktopDeepLinkEvent[]
}

export type DesktopUserThemeInfo = {
  createdAt: number
  id: string
  name: string
}

export type DesktopRuntimeEventEnvelope<T = unknown> = {
  event: string
  id: number
  payload: T
}

export type DesktopCommandBridgeApi = {
  invoke: <T = unknown>(command: string, args?: DesktopCommandArguments) => Promise<T>
}

export type DesktopEventBridgeApi = {
  listen: <T = unknown>(
    eventName: string,
    handler: (event: DesktopRuntimeEventEnvelope<T>) => void,
  ) => (() => void) | Promise<() => void>
}

export type DesktopRuntimeApi = {
  aiCompletion: {
    cancel: (requestId: string) => Promise<{ ok: true }>
    onEvent: (handler: (event: AiInlineCompletionEvent) => void) => () => void
    start: (input: AiInlineCompletionRequest) => Promise<AiInlineCompletionStartResult>
  }
  appReady: (signal?: RendererReadySignal) => Promise<{ ok: boolean }>
  assets: AssetApi
  lifecycle: {
    getLaunchInfo: () => Promise<DesktopLaunchInfo>
  }
  languageIntelligence: LanguageIntelligenceApi
  linkPreview: DesktopLinkPreviewApi
  commands: DesktopCommandBridgeApi
  events: DesktopEventBridgeApi
  git: DesktopGitApi
  platform: {
    get: () => Promise<DesktopPlatformInfo>
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
    createWorkspace: (options: { name: string; title?: string }) => Promise<string | null>
    open: (options?: DesktopOpenDialogOptions) => Promise<string | string[] | null>
    save: (options?: DesktopSaveDialogOptions) => Promise<string | null>
  }
  edit: {
    execute: (action: FocusedEditAction) => Promise<{ ok: true }>
  }
  clipboard: DesktopClipboardApi
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
    recentWorkspaces: RecentWorkspacesApi
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
      theme?: DesktopUserThemeInfo
    }>
    list: () => Promise<{
      error?: string
      ok: boolean
      themes: DesktopUserThemeInfo[]
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
    check: () => Promise<DesktopUpdateResult>
    download: () => Promise<DesktopUpdateResult>
    getState: () => Promise<DesktopUpdateState>
    install: () => Promise<DesktopUpdateResult>
    setInstallOnQuit: (enabled: boolean) => Promise<DesktopUpdateResult>
    onEvent: (handler: (payload: DesktopUpdateEvent) => void) => () => void
  }
  webTabs: WebTabsApi
  workspaceSync: WorkspaceSyncApi
  webview: {
    onFileDrop: (handler: (event: DesktopFileDropEvent) => void) => () => void
  }
  workspace: DesktopWorkspacePathApi
  workspaceTree: WorkspaceTreeApi
  window: {
    setVimKeyboardOwnership: (active: boolean) => Promise<void>
    onPresented: (handler: () => void) => () => void
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    unmaximize: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximizedChanged: (handler: (maximized: boolean) => void) => Promise<() => void>
    close: () => Promise<void>
    onCloseRequested: (handler: () => Promise<void> | void) => () => void
    startDragging: () => Promise<void>
  }
}

declare global {
  interface Window {
    marklabTauri?: DesktopRuntimeApi
  }
}

export const getDesktopRuntime = (): DesktopRuntimeApi => {
  const api = typeof window === 'undefined' ? undefined : window.marklabTauri
  if (!api) throw new Error('Desktop runtime API is unavailable.')
  return api
}

export const isDesktopRuntime = (): boolean =>
  typeof window !== 'undefined' && window.marklabTauri !== undefined
