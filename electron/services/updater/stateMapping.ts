import type { ProgressInfo, UpdateInfo } from 'electron-updater'
import type { AppUpdateInfo, UpdateProgressInfo } from '@electron/types'
import { toPlainTextReleaseNotes } from '@electron/services/updater/releaseNotes'

export const toAppUpdateInfo = (info: UpdateInfo): AppUpdateInfo => ({
  releaseDate: info.releaseDate,
  releaseName: info.releaseName ?? undefined,
  releaseNotes: toPlainTextReleaseNotes(info.releaseNotes),
  version: info.version,
})

export const toUpdateProgressInfo = (progress: ProgressInfo): UpdateProgressInfo => ({
  bytesPerSecond: progress.bytesPerSecond,
  percent: progress.percent,
  transferred: progress.transferred,
  total: progress.total,
})
