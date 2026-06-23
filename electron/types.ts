export type MarklabPlatform = 'windows' | 'macos' | 'linux' | 'unknown'

export type PlatformInfo = {
  platform: MarklabPlatform
  arch: string
  nodePlatform: string
}

export type DialogFilter = {
  name: string
  extensions: string[]
}

export type OpenDialogOptions = {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: DialogFilter[]
  multiple?: boolean
  directory?: boolean
  file?: boolean
}

export type SaveDialogOptions = {
  title?: string
  defaultPath?: string
  buttonLabel?: string
  filters?: DialogFilter[]
}

export type ClipboardImage = {
  dataUrl: string
  width: number
  height: number
}

export type ShellPathResult = {
  ok: boolean
  path?: string
  error?: string
}

export type WindowActionResult = {
  ok: boolean
  error?: string
}

export type PersistedWindowState = {
  height: number
  isMaximized: boolean
  width: number
  x?: number
  y?: number
}

export type RendererPersistKey = 'marklab.drawio' | 'marklab.preferences' | 'marklab.workspace'

export type SettingsPersistResult = {
  ok: boolean
  error?: string
}

export type UserThemeInfo = {
  createdAt: number
  id: string
  name: string
}

export type UserThemeListResult = {
  error?: string
  ok: boolean
  themes: UserThemeInfo[]
}

export type UserThemeImportResult = {
  error?: string
  ok: boolean
  theme?: UserThemeInfo
}

export type UserThemeCssResult = {
  css?: string
  error?: string
  ok: boolean
}

export type StartDragResult = WindowActionResult & {
  supported: boolean
}

export type MenuCommandPayload = {
  command: string
  payload?: unknown
}

export type AppLaunchSource = 'startup' | 'second-instance' | 'open-url'

export type SingleInstancePayload = {
  args: string[]
  cwd: string
}

export type DeepLinkPayload = {
  url: string
  source: AppLaunchSource
  receivedAt: number
}

export type AppLaunchInfo = SingleInstancePayload & {
  deepLinks: DeepLinkPayload[]
}

export type RuntimeCommandPayload = {
  command: string
  args?: unknown
}

export type SystemThemePayload = {
  colorMode: 'light' | 'dark'
}

export type RuntimeEventPayload<T = unknown> = {
  event: string
  id: number
  payload: T
}

export type ExportTaskStatus = 'started' | 'finished' | 'failed'

export type ExportTaskPayload = {
  id: string
  format: string
  output_path: string
  status: ExportTaskStatus
  progress?: number | null
  message?: string | null
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'
  | 'unavailable'

export type AppUpdateInfo = {
  releaseDate?: string
  releaseName?: string
  version: string
}

export type UpdateProgressInfo = {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

export type UpdateState = {
  error?: string
  info?: AppUpdateInfo
  progress?: UpdateProgressInfo
  status: UpdateStatus
}

export type UpdateResult = UpdateState & {
  ok: boolean
}

export type UpdateEventPayload = UpdateState & {
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
