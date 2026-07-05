import type { BrowserWindow } from 'electron'

import type { BackgroundTaskStatus } from '@electron/services/workspace/types.js'

const PROGRESS_TASK_IDS = new Set(['buffer-flush', 'search-index'])

export type NativeTaskSummary = {
  activeCount: number
  errorCount: number
}

export type NativeTaskAttentionState = {
  errorTaskIds: Set<string>
}

type NativeBadgeApp = {
  dock?: {
    setBadge: (text: string) => void
  }
  setBadgeCount: (count?: number) => boolean
}

type NativeAttentionWindow = Pick<BrowserWindow, 'flashFrame' | 'isDestroyed' | 'isFocused'> & {
  requestUserAttention?: (type: 'critical' | 'informational') => number
}

export const summarizeNativeTasks = (tasks: BackgroundTaskStatus[]): NativeTaskSummary => {
  return tasks.reduce(
    (summary, task) => {
      if (task.status === 'error') {
        summary.errorCount += 1
      } else if (task.status === 'running' && PROGRESS_TASK_IDS.has(task.id)) {
        summary.activeCount += 1
      }
      return summary
    },
    { activeCount: 0, errorCount: 0 },
  )
}

export const applyWindowTaskProgress = (
  window: Pick<BrowserWindow, 'isDestroyed' | 'setProgressBar'>,
  tasks: BackgroundTaskStatus[],
): void => {
  if (window.isDestroyed()) return

  const summary = summarizeNativeTasks(tasks)
  if (summary.errorCount > 0) {
    window.setProgressBar(1, { mode: 'error' })
  } else if (summary.activeCount > 0) {
    window.setProgressBar(2, { mode: 'indeterminate' })
  } else {
    window.setProgressBar(-1)
  }
}

export const applyAppTaskBadge = (app: NativeBadgeApp, tasks: BackgroundTaskStatus[]): void => {
  const summary = summarizeNativeTasks(tasks)
  const badgeCount = summary.errorCount || summary.activeCount

  app.setBadgeCount(badgeCount)
  app.dock?.setBadge(badgeCount > 0 ? String(badgeCount) : '')
}

export const createNativeTaskAttentionState = (): NativeTaskAttentionState => ({
  errorTaskIds: new Set(),
})

export const applyWindowTaskAttention = (
  window: NativeAttentionWindow,
  tasks: BackgroundTaskStatus[],
  state: NativeTaskAttentionState,
  platform: NodeJS.Platform = process.platform,
): void => {
  const nextErrorTaskIds = new Set(
    tasks.filter((task) => task.status === 'error').map((task) => task.id),
  )
  const hasNewError = [...nextErrorTaskIds].some((id) => !state.errorTaskIds.has(id))
  const hadErrors = state.errorTaskIds.size > 0
  state.errorTaskIds = nextErrorTaskIds

  if (window.isDestroyed()) return

  if (nextErrorTaskIds.size === 0) {
    if (hadErrors && platform !== 'darwin') window.flashFrame(false)
    return
  }

  if (!hasNewError || window.isFocused()) return

  if (platform === 'darwin' && window.requestUserAttention) {
    window.requestUserAttention('informational')
  } else {
    window.flashFrame(true)
  }
}

export const clearWindowTaskAttention = (
  window: Pick<BrowserWindow, 'flashFrame' | 'isDestroyed'>,
): void => {
  if (!window.isDestroyed()) window.flashFrame(false)
}
