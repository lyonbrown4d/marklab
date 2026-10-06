import { randomUUID } from 'node:crypto'
import type * as Electron from 'electron'

import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke'
import {
  generateTextRequestSchema,
  generationCancelSchema,
  providerIdRequestSchema,
} from '@electron/services/ai/schemas'
import type { AiServiceContract } from '@electron/services/ai/types'
import type { Logger } from '@electron/services/logger'

export type AiIpcBridge = {
  commandHandlers: NativeCommandHandlers
  service: AiServiceContract
}

export const registerAiIpc = (
  ipcMain: Electron.IpcMain,
  service: AiServiceContract,
  logger: Logger,
): AiIpcBridge => {
  const commandHandlers = createAiCommandHandlers(service)
  for (const [command, handler] of Object.entries(commandHandlers)) {
    ipcMain.handle(command, (event, payload: unknown) => handler(payload, event))
  }
  logger.info('AI IPC registered')
  return { commandHandlers, service }
}

export const createAiCommandHandlers = (service: AiServiceContract): NativeCommandHandlers => {
  const subscribedSenders = new WeakSet<object>()
  const cloudRequests = new Map<string, { controller: AbortController; ownerId: number }>()
  const handlers: NativeCommandHandlers = {
    ai_list_providers: async () => service.listProviders(),
    ai_get_provider: async (payload) => service.getProvider(readId(payload)),
    ai_update_provider: async (payload) => service.updateProvider(payload),
    ai_delete_provider: async (payload) => service.deleteProvider(readId(payload)),
    ai_test_provider: async (payload) => service.testProvider(readId(payload)),
    ai_generate_text: async (payload) => service.generateText(payload),
  }
  return {
    ...handlers,
    ai_start_generation: async (payload, event) => {
      subscribeToSenderDestroyed(event, subscribedSenders, () => {
        cancelCloudOwner(cloudRequests, event.sender.id)
      })
      return startCloudGeneration(service, cloudRequests, event, payload)
    },
    ai_cancel_generation: async (payload, event) => {
      const { requestId } = generationCancelSchema.parse(payload)
      const cloudRequest = cloudRequests.get(requestId)
      if (cloudRequest?.ownerId === event.sender.id) {
        cloudRequest.controller.abort()
        cloudRequests.delete(requestId)
        safeSend(event, 'ai-generation-event', { requestId, type: 'cancelled' })
      }
      return { ok: true }
    },
  }
}

const readId = (payload: unknown): string => providerIdRequestSchema.parse(payload).id

const startCloudGeneration = async (
  service: AiServiceContract,
  requests: Map<string, { controller: AbortController; ownerId: number }>,
  event: Electron.IpcMainInvokeEvent,
  payload: unknown,
): Promise<{ requestId: string }> => {
  const input = generateTextRequestSchema.parse(payload)
  const requestId = randomUUID()
  const controller = new AbortController()
  requests.set(requestId, { controller, ownerId: event.sender.id })
  setImmediate(() => {
    void service
      .generateText(input, controller.signal)
      .then((result) => {
        if (!requests.has(requestId)) return
        if (result.text) {
          safeSend(event, 'ai-generation-event', { requestId, type: 'delta', delta: result.text })
        }
        safeSend(event, 'ai-generation-event', {
          requestId,
          type: 'finish',
          finishReason: result.finishReason,
          usage: result.usage,
          warnings: result.warnings,
        })
      })
      .catch(() => {
        if (!requests.has(requestId)) return
        safeSend(event, 'ai-generation-event', {
          requestId,
          type: 'error',
          message: 'AI provider request failed',
        })
      })
      .finally(() => requests.delete(requestId))
  })
  return { requestId }
}

const safeSend = (
  event: Electron.IpcMainInvokeEvent,
  channel: 'ai-generation-event',
  payload: unknown,
): void => {
  if (event.sender.isDestroyed()) return
  try {
    event.sender.send(channel, payload)
  } catch {
    // The renderer can be destroyed between the state check and send.
  }
}

const subscribeToSenderDestroyed = (
  event: Electron.IpcMainInvokeEvent,
  subscribedSenders: WeakSet<object>,
  onDestroyed: () => void,
): void => {
  if (subscribedSenders.has(event.sender)) return
  subscribedSenders.add(event.sender)
  event.sender.once('destroyed', onDestroyed)
}

const cancelCloudOwner = (
  requests: Map<string, { controller: AbortController; ownerId: number }>,
  ownerId: number,
): void => {
  for (const [requestId, request] of requests) {
    if (request.ownerId !== ownerId) continue
    request.controller.abort()
    requests.delete(requestId)
  }
}
