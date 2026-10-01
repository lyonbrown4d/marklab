import type * as Electron from 'electron'

import { nativeIpcChannels } from '@electron/channels.js'
import type { LanguageIntelligenceServiceContract } from '@electron/services/languageIntelligence/service.js'
import type { Logger } from '@electron/services/logger.js'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry.js'
import {
  languageCompletionRequestSchema,
  languageDocumentChangeRequestSchema,
  languageDocumentCloseRequestSchema,
  languageDocumentOpenRequestSchema,
  languageDiagnosticsRequestSchema,
} from '@/types/languageIntelligence.js'

type WorkspaceRegistryContract = Pick<WindowWorkspaceRegistry, 'serviceForWebContents'>

export const registerLanguageIntelligenceIpc = (
  ipcMain: Electron.IpcMain,
  service: LanguageIntelligenceServiceContract,
  workspaceRegistry: WorkspaceRegistryContract,
  logger: Logger,
): void => {
  const handlers = createLanguageIntelligenceIpcHandlers(service, workspaceRegistry)
  ipcMain.handle(nativeIpcChannels.languageDocumentOpen, (event, payload: unknown) =>
    handlers.openDocument(payload, event),
  )
  ipcMain.handle(nativeIpcChannels.languageDocumentChange, (event, payload: unknown) =>
    handlers.changeDocument(payload, event),
  )
  ipcMain.handle(nativeIpcChannels.languageDocumentClose, (event, payload: unknown) =>
    handlers.closeDocument(payload, event),
  )
  ipcMain.handle(nativeIpcChannels.languageCompletion, (event, payload: unknown) =>
    handlers.completion(payload, event),
  )
  ipcMain.handle(nativeIpcChannels.languageDiagnostics, (event, payload: unknown) =>
    handlers.diagnostics(payload, event),
  )
  logger.info('language intelligence IPC registered')
}

export const createLanguageIntelligenceIpcHandlers = (
  service: LanguageIntelligenceServiceContract,
  workspaceRegistry: WorkspaceRegistryContract,
) => {
  const subscribedSenders = new WeakSet<object>()
  const subscribeToDestruction = (event: Electron.IpcMainInvokeEvent): void => {
    if (subscribedSenders.has(event.sender)) return
    subscribedSenders.add(event.sender)
    event.sender.once('destroyed', () => service.closeClient(event.sender.id))
  }

  return {
    openDocument: (payload: unknown, event: Electron.IpcMainInvokeEvent) => {
      const request = languageDocumentOpenRequestSchema.parse(payload)
      subscribeToDestruction(event)
      return service.openDocument(event.sender.id, request)
    },
    changeDocument: (payload: unknown, event: Electron.IpcMainInvokeEvent) => {
      const request = languageDocumentChangeRequestSchema.parse(payload)
      subscribeToDestruction(event)
      return service.changeDocument(event.sender.id, request)
    },
    closeDocument: (payload: unknown, event: Electron.IpcMainInvokeEvent) => {
      const request = languageDocumentCloseRequestSchema.parse(payload)
      return service.closeDocument(event.sender.id, request)
    },
    completion: (payload: unknown, event: Electron.IpcMainInvokeEvent) => {
      const request = languageCompletionRequestSchema.parse(payload)
      subscribeToDestruction(event)
      const workspace = workspaceRegistry.serviceForWebContents(event.sender)
      return service.completion(event.sender.id, workspace, request)
    },
    diagnostics: (payload: unknown, event: Electron.IpcMainInvokeEvent) => {
      const request = languageDiagnosticsRequestSchema.parse(payload)
      subscribeToDestruction(event)
      const workspace = workspaceRegistry.serviceForWebContents(event.sender)
      return service.diagnostics(event.sender.id, workspace, request)
    },
  }
}
