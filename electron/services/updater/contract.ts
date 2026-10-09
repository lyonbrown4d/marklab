import type { Logger } from '@electron/services/logger'
import type { UpdateEventPayload, UpdateResult, UpdateState } from '@electron/types'
import type { UpdateCapability } from '@electron/services/updater/capability'

export type UpdateServiceOptions = {
  capability?: UpdateCapability
  currentVersion?: string
  isPackaged: boolean
  logger: Logger
  onBeforeInstall?: () => Promise<void>
  onEvent?: (payload: UpdateEventPayload) => void
}

export type UpdateService = {
  checkForUpdates: () => Promise<UpdateResult>
  dispose: () => void
  downloadUpdate: () => Promise<UpdateResult>
  getState: () => UpdateState
  installUpdate: () => Promise<UpdateResult>
  quitAndInstallIfScheduled: (onFailure?: () => void) => boolean
  setInstallOnQuit: (enabled: boolean) => Promise<UpdateResult>
  startAutomaticChecks: () => void
}
