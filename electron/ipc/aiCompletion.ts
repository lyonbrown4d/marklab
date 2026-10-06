import type * as Electron from 'electron'

import { nativeIpcChannels } from '@electron/channels'
import { localAiGenerationCancelSchema } from '@electron/services/ai/local/schemas'
import type { AiInlineCompletionServiceContract } from '@electron/services/ai/completion/types'
import type { Logger } from '@electron/services/logger'
import { aiInlineCompletionRequestSchema } from '@/types/aiCompletion'

export type AiCompletionIpcBridge = {
  service: AiInlineCompletionServiceContract
}

export const registerAiCompletionIpc = (
  ipcMain: Electron.IpcMain,
  service: AiInlineCompletionServiceContract,
  logger: Logger,
): AiCompletionIpcBridge => {
  const handlers = createAiCompletionIpcHandlers(service)
  ipcMain.handle(nativeIpcChannels.aiCompletionStart, (event, payload: unknown) =>
    handlers.start(payload, event),
  )
  ipcMain.handle(nativeIpcChannels.aiCompletionCancel, (event, payload: unknown) =>
    handlers.cancel(payload, event),
  )
  logger.info('AI inline completion IPC registered')
  return { service }
}

export const createAiCompletionIpcHandlers = (
  service: AiInlineCompletionServiceContract,
): {
  cancel: (payload: unknown, event: Electron.IpcMainInvokeEvent) => Promise<{ ok: true }>
  start: (payload: unknown, event: Electron.IpcMainInvokeEvent) => Promise<{ requestId: string }>
} => {
  const subscribedSenders = new WeakSet<object>()
  return {
    cancel: async (payload, event) => {
      const { requestId } = localAiGenerationCancelSchema.parse({ requestId: payload })
      await service.cancelGeneration(event.sender.id, requestId)
      return { ok: true }
    },
    start: async (payload, event) => {
      const input = aiInlineCompletionRequestSchema.parse(payload)
      if (!subscribedSenders.has(event.sender)) {
        subscribedSenders.add(event.sender)
        event.sender.once('destroyed', () => void service.cancelOwner(event.sender.id))
      }
      return service.start(event.sender.id, input, (generationEvent) => {
        if (event.sender.isDestroyed()) return
        try {
          event.sender.send(nativeIpcChannels.aiCompletionEvent, generationEvent)
        } catch {
          // The renderer can be destroyed between the state check and send.
        }
      })
    },
  }
}
