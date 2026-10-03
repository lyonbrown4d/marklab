import type { IpcMain, IpcMainInvokeEvent } from 'electron'

import { nativeIpcChannels } from '@electron/channels.js'
import type { LinkPreviewServiceContract } from '@electron/services/linkPreview/service.js'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry.js'
import { linkPreviewRequestSchema } from '@/types/linkPreview.js'

export const registerLinkPreviewIpc = (
  ipcMain: Pick<IpcMain, 'handle'>,
  service: LinkPreviewServiceContract,
  workspaceRegistry: Pick<WindowWorkspaceRegistry, 'serviceForWebContents'>,
): void => {
  ipcMain.handle(nativeIpcChannels.linkPreviewFetch, (event, payload: unknown) => {
    validateSender(event, workspaceRegistry)
    const request = linkPreviewRequestSchema.parse(payload)
    return service.fetch(request)
  })
}

const validateSender = (
  event: IpcMainInvokeEvent,
  workspaceRegistry: Pick<WindowWorkspaceRegistry, 'serviceForWebContents'>,
): void => {
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Link preview requests are only allowed from the main frame')
  }
  workspaceRegistry.serviceForWebContents(event.sender)
}
