import type { BrowserWindow } from 'electron'

import type { UpdateEventPayload } from '@electron/types.js'

export const applyWindowUpdateProgress = (
  window: Pick<BrowserWindow, 'isDestroyed' | 'setProgressBar'>,
  update: UpdateEventPayload,
): void => {
  if (window.isDestroyed()) return

  if (update.status === 'error') {
    window.setProgressBar(1, { mode: 'error' })
    return
  }

  if (update.status === 'downloading') {
    const percent = update.progress?.percent
    if (typeof percent === 'number' && Number.isFinite(percent)) {
      window.setProgressBar(Math.min(Math.max(percent / 100, 0), 1))
      return
    }
    window.setProgressBar(2, { mode: 'indeterminate' })
    return
  }

  if (update.status === 'checking' || update.status === 'installing') {
    window.setProgressBar(2, { mode: 'indeterminate' })
    return
  }

  window.setProgressBar(-1)
}
