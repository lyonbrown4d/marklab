import type { BrowserWindow } from 'electron'

import type { ExportTaskPayload } from '@electron/types.js'

export const applyWindowExportProgress = (
  window: Pick<BrowserWindow, 'isDestroyed' | 'setProgressBar'>,
  task: ExportTaskPayload,
): void => {
  if (window.isDestroyed()) return

  if (task.status === 'failed') {
    window.setProgressBar(1, { mode: 'error' })
    return
  }

  if (task.status === 'finished') {
    window.setProgressBar(-1)
    return
  }

  if (typeof task.progress === 'number' && Number.isFinite(task.progress)) {
    window.setProgressBar(Math.min(Math.max(task.progress, 0), 1))
    return
  }

  window.setProgressBar(2, { mode: 'indeterminate' })
}
