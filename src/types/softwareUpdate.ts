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
  releaseNotes?: string
  version: string
}

export type ElectronUpdateProgress = {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

export type ElectronUpdateError = {
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

export type ElectronUpdateState = {
  currentVersion: string
  error?: ElectronUpdateError
  info?: ElectronUpdateInfo
  installOnQuit: boolean
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
    | 'install-on-quit-changed'
    | 'error'
    | 'unavailable'
}
