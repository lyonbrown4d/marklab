export type DesktopUpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'
  | 'unavailable'

export type DesktopUpdateInfo = {
  releaseDate?: string
  releaseName?: string
  releaseNotes?: string
  version: string
}

export type DesktopUpdateProgress = {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

export type DesktopUpdateError = {
  code:
    | 'CHECK_FAILED'
    | 'DOWNLOAD_FAILED'
    | 'INSTALL_FAILED'
    | 'INVALID_REQUEST'
    | 'NOT_READY'
    | 'UNAVAILABLE'
  message: string
  operation: 'availability' | 'check' | 'download' | 'install' | 'install-on-quit'
}

export type DesktopUpdateState = {
  currentVersion: string
  error?: DesktopUpdateError
  info?: DesktopUpdateInfo
  installOnQuit: boolean
  progress?: DesktopUpdateProgress
  status: DesktopUpdateStatus
}

export type DesktopUpdateResult = DesktopUpdateState & {
  ok: boolean
}

export type DesktopUpdateEvent = DesktopUpdateState & {
  event:
    | 'checking'
    | 'available'
    | 'not-available'
    | 'download-progress'
    | 'downloaded'
    | 'installing'
    | 'install-on-quit-changed'
    | 'error'
    | 'unavailable'
}
