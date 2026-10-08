import type { BrowserWindow } from 'electron'

import { nativeIpcChannels } from '@electron/channels'
import type { WindowOpeningProgress } from '@/types/windowOpening'

type WorkspaceSessionSeed = {
  state?: Record<string, unknown>
  version?: number
}

const canSend = (window: BrowserWindow): boolean =>
  !window.isDestroyed() && !window.webContents.isDestroyed()

export const createWindowOpeningProgressPublisher = (window: BrowserWindow) => {
  let latest: WindowOpeningProgress | null = null

  const send = (progress: WindowOpeningProgress): void => {
    latest = progress
    if (canSend(window)) {
      window.webContents.send(nativeIpcChannels.windowOpeningProgress, progress)
    }
  }

  const replay = (): void => {
    if (latest && canSend(window)) {
      window.webContents.send(nativeIpcChannels.windowOpeningProgress, latest)
    }
  }

  return { replay, send }
}

export const sendWorkspaceSessionSeed = (
  window: BrowserWindow,
  seed: WorkspaceSessionSeed | null,
): void => {
  if (!seed || !canSend(window)) return
  window.webContents.send(nativeIpcChannels.workspaceSessionSeed, seed)
  window.webContents.send('workspace-session-seed', seed)
}
