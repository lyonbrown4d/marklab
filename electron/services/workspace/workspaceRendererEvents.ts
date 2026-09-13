import type { WebContents } from 'electron'
import type { Logger } from '@electron/services/logger.js'
import type { FsBufferStatus, FsSnapshot } from '@electron/services/workspace/types.js'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService.js'

type WorkspaceRendererEventPayloads = {
  'fs-changed': FsSnapshot
  'fs-buffer-status': FsBufferStatus
}

type WorkspaceRendererEventsOptions = {
  window: {
    isDestroyed: () => boolean
    webContents: Pick<WebContents, 'isDestroyed' | 'send'>
  }
  service: Pick<WorkspaceService, 'onSnapshotChanged' | 'onBufferStatus'>
  logger: Pick<Logger, 'warn'>
}

// Preserve the existing allowlisted renderer contract during the typed IPC migration.
export const bindWorkspaceRendererEvents = ({
  window,
  service,
  logger,
}: WorkspaceRendererEventsOptions) => {
  let disposed = false
  const send = <Event extends keyof WorkspaceRendererEventPayloads>(
    event: Event,
    payload: WorkspaceRendererEventPayloads[Event],
  ) => {
    if (disposed || window.isDestroyed() || window.webContents.isDestroyed()) return
    try {
      window.webContents.send(event, payload)
    } catch (error) {
      logger.warn('workspace renderer event could not be delivered', { event, error })
    }
  }
  const unsubscribers = [
    service.onSnapshotChanged((snapshot) => send('fs-changed', snapshot)),
    service.onBufferStatus((status) => send('fs-buffer-status', status)),
  ]
  return () => {
    if (disposed) return
    disposed = true
    for (const unsubscribe of unsubscribers) unsubscribe()
  }
}
