import type {
  DesktopCommandArgs,
  DesktopCommandResults,
  DesktopEventPayloads,
} from '@/generated/desktop/bindings'
import type {
  RuntimeCommandName,
  RuntimeCommandParameters,
  RuntimeCommandResult,
  RuntimeEventName,
  RuntimeEventPayloads,
} from '@/runtime/tauri/contract'
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

type DesktopPlatformInfo = DesktopCommandResults['app_get_platform']

export type DesktopWorkspacePathApi = {
  copyAbsolutePathToClipboard: (
    path: string,
  ) => Promise<DesktopCommandResults['workspace_copy_absolute_path']>
  openPathInSystem: (
    path: string,
  ) => Promise<DesktopCommandResults['workspace_open_path_in_system']>
  readTextPreview: (path: string, limitBytes: number) => Promise<WorkspaceTextPreview>
  revealPathInSystem: (
    path: string,
  ) => Promise<DesktopCommandResults['workspace_reveal_path_in_system']>
}

export type DesktopLinkPreviewApi = {
  capture: (url: string, options: LinkPreviewCaptureOptions) => Promise<LinkPreviewCapture>
  cancel: (requestId: string) => Promise<DesktopCommandResults['link_preview_cancel']>
  promote: (requestId: string) => Promise<DesktopCommandResults['link_preview_promote']>
  fetch: (url: string) => Promise<LinkPreviewResult>
}

export type DesktopClipboardContent = DesktopCommandArgs['clipboard_write']['request']

export type DesktopClipboardApi = {
  readImage: () => Promise<DesktopCommandResults['clipboard_read_image']>
  readText: () => Promise<string>
  write: (content: DesktopClipboardContent) => Promise<DesktopCommandResults['clipboard_write']>
  writeText: (text: string) => Promise<DesktopCommandResults['clipboard_write_text']>
}

export type { DesktopGitApi } from '@/runtime/git'

export type DesktopOpenDialogOptions = DesktopCommandArgs['dialog_open']['request']

export type DesktopSaveDialogOptions = DesktopCommandArgs['dialog_save']['request']

export type DesktopFileDropEvent = {
  paths: string[]
  position: {
    x: number
    y: number
  }
}

export type DesktopLaunchSource = DesktopDeepLinkEvent['source']

export type DesktopSingleInstanceEvent = DesktopEventPayloads['single-instance']

export type DesktopDeepLinkEvent = DesktopEventPayloads['deep-link']

export type DesktopLaunchInfo = DesktopCommandResults['lifecycle_get_launch_info']

export type DesktopUserThemeInfo = DesktopCommandResults['themes_list']['themes'][number]

export type DesktopRuntimeEventEnvelope<T = unknown> = {
  event: string
  id: number
  payload: T
}

export type DesktopCommandBridgeApi = {
  invoke: <C extends RuntimeCommandName>(
    command: C,
    ...args: RuntimeCommandParameters<C>
  ) => Promise<RuntimeCommandResult<C>>
}

export type DesktopEventBridgeApi = {
  listen: <E extends RuntimeEventName>(
    eventName: E,
    handler: (event: DesktopRuntimeEventEnvelope<RuntimeEventPayloads[E]>) => void,
  ) => (() => void) | Promise<() => void>
}

export type DesktopRuntimeApi = {
  aiCompletion: {
    cancel: (requestId: string) => Promise<DesktopCommandResults['ai_completion_cancel']>
    onEvent: (handler: (event: AiInlineCompletionEvent) => void) => () => void
    start: (input: AiInlineCompletionRequest) => Promise<AiInlineCompletionStartResult>
  }
  appReady: (signal?: RendererReadySignal) => Promise<DesktopCommandResults['app_ready']>
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
    dispatch: (id: string) => Promise<DesktopCommandResults['menu_dispatch']>
    onCommand: (handler: (id: string) => void) => () => void
  }
  opening: {
    onProgress: (handler: (progress: WindowOpeningProgress) => void) => () => void
    retry: () => Promise<WindowOpeningRetryResult>
  }
  dialog: {
    createWorkspace: (
      options: DesktopCommandArgs['dialog_create_workspace']['request'],
    ) => Promise<DesktopCommandResults['dialog_create_workspace']>
    open: (options?: DesktopOpenDialogOptions) => Promise<string | string[] | null>
    save: (options?: DesktopSaveDialogOptions) => Promise<string | null>
  }
  edit: {
    execute: (action: FocusedEditAction) => Promise<DesktopCommandResults['edit_execute']>
  }
  clipboard: DesktopClipboardApi
  shell: {
    openPath: (path: string) => Promise<DesktopCommandResults['shell_open_path']>
    revealPath: (path: string) => Promise<DesktopCommandResults['shell_reveal_path']>
  }
  settings: {
    recentWorkspaces: RecentWorkspacesApi
    persist: {
      getItem: (key: string) => Promise<DesktopCommandResults['settings_persist_get']>
      setItem: (
        key: string,
        value: DesktopCommandArgs['settings_persist_set']['request']['value'],
      ) => Promise<DesktopCommandResults['settings_persist_set']>
      removeItem: (key: string) => Promise<DesktopCommandResults['settings_persist_remove']>
    }
  }
  themes: {
    importCss: (path: string) => Promise<DesktopCommandResults['themes_import_css']>
    list: () => Promise<DesktopCommandResults['themes_list']>
    openFolder: () => Promise<DesktopCommandResults['themes_open_folder']>
    readCss: (
      id: DesktopCommandArgs['themes_read_css']['request']['id'],
    ) => Promise<DesktopCommandResults['themes_read_css']>
    remove: (id: string) => Promise<DesktopCommandResults['themes_remove']>
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
    setVimKeyboardOwnership: (
      active: boolean,
    ) => Promise<DesktopCommandResults['window_set_vim_keyboard_ownership']>
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
