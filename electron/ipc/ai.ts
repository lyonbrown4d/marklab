import { randomUUID } from 'node:crypto'
import type * as Electron from 'electron'

import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke'
import type { LocalAiDirectoryPicker } from '@electron/ipc/aiLocalDirectory'
import {
  localAiDirectoryConfigSchema,
  localAiDownloadTaskRequestSchema,
  localAiGenerationCancelSchema,
  localAiModelRequestSchema,
} from '@electron/services/ai/local/schemas'
import type { LocalAiServiceContract } from '@electron/services/ai/local/types'
import { generateTextRequestSchema, providerIdRequestSchema } from '@electron/services/ai/schemas'
import type { AiServiceContract } from '@electron/services/ai/types'
import type { Logger } from '@electron/services/logger'

export type AiIpcBridge = {
  commandHandlers: NativeCommandHandlers
  service: AiServiceContract
  localService?: LocalAiServiceContract
}

export const registerAiIpc = (
  ipcMain: Electron.IpcMain,
  service: AiServiceContract,
  logger: Logger,
  localService?: LocalAiServiceContract,
  selectDirectory?: LocalAiDirectoryPicker,
): AiIpcBridge => {
  const commandHandlers = createAiCommandHandlers(service, localService, selectDirectory)
  for (const [command, handler] of Object.entries(commandHandlers)) {
    ipcMain.handle(command, (event, payload: unknown) => handler(payload, event))
  }
  logger.info('AI IPC registered')
  return { commandHandlers, service, ...(localService ? { localService } : {}) }
}

export const createAiCommandHandlers = (
  service: AiServiceContract,
  localService?: LocalAiServiceContract,
  selectDirectory?: LocalAiDirectoryPicker,
): NativeCommandHandlers => {
  const subscribedSenders = new WeakSet<object>()
  const localSenders = new Map<number, Electron.WebContents>()
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
    ai_local_status: async (_payload, event) => {
      trackLocalSender(event, localSenders, subscribedSenders, localService, cloudRequests)
      return (
        localService?.status() ?? {
          runtime: 'unavailable' as const,
          activeModelId: null,
          customModelDirectoryEnabled: false,
          defaultModelDirectory: '',
          modelDirectory: '',
          models: [],
          error: 'Local AI runtime is unavailable',
        }
      )
    },
    ai_local_download: async (payload, event) => {
      const { modelId } = localAiModelRequestSchema.parse(payload)
      return requireLocalService(localService).download(modelId, (progress) =>
        safeSend(event, 'ai-local-progress', progress),
      )
    },
    ai_local_cancel_download: async (payload) => {
      const { taskId } = localAiDownloadTaskRequestSchema.parse(payload)
      return requireLocalService(localService).cancelDownload(taskId)
    },
    ai_local_delete_model: async (payload) => {
      const { modelId } = localAiModelRequestSchema.parse(payload)
      return requireLocalService(localService).deleteModel(modelId)
    },
    ai_local_set_active_model: async (payload) => {
      const { modelId } = localAiModelRequestSchema.parse(payload)
      return requireLocalService(localService).setActiveModel(modelId)
    },
    ai_local_select_model_directory: async (_payload, event) => {
      const local = requireLocalService(localService)
      if (!selectDirectory) throw new Error('Local AI directory picker is unavailable')
      const status = await local.status()
      return { path: await selectDirectory(event, status.modelDirectory) }
    },
    ai_local_set_model_directory: async (payload, event) => {
      const config = localAiDirectoryConfigSchema.parse(payload)
      trackLocalSender(event, localSenders, subscribedSenders, localService, cloudRequests)
      return requireLocalService(localService).setModelDirectory(config, (migration) => {
        broadcastLocalDirectoryProgress(localSenders, migration)
      })
    },
    ai_start_generation: async (payload, event) => {
      subscribeToSenderDestroyed(event, subscribedSenders, () => {
        void localService?.cancelOwner(event.sender.id)
        cancelCloudOwner(cloudRequests, event.sender.id)
      })
      const providerId = readProviderId(payload)
      if (providerId === 'marklab-local') {
        if (localService) {
          return localService.startGeneration(event.sender.id, payload, (generationEvent) =>
            safeSend(event, 'ai-generation-event', generationEvent),
          )
        }
        return startUnavailableLocalGeneration(event)
      }
      return startCloudGeneration(service, cloudRequests, event, payload)
    },
    ai_cancel_generation: async (payload, event) => {
      const { requestId } = localAiGenerationCancelSchema.parse(payload)
      const cloudRequest = cloudRequests.get(requestId)
      if (cloudRequest?.ownerId === event.sender.id) {
        cloudRequest.controller.abort()
        cloudRequests.delete(requestId)
        safeSend(event, 'ai-generation-event', { requestId, type: 'cancelled' })
      }
      if (localService) await localService.cancelGeneration(event.sender.id, requestId)
      return { ok: true }
    },
  }
}

const readId = (payload: unknown): string => providerIdRequestSchema.parse(payload).id

const readProviderId = (payload: unknown): string =>
  generateTextRequestSchema.parse(payload).providerId

const requireLocalService = (
  localService: LocalAiServiceContract | undefined,
): LocalAiServiceContract => {
  if (!localService) throw new Error('Local AI runtime is unavailable')
  return localService
}

const startUnavailableLocalGeneration = async (
  event: Electron.IpcMainInvokeEvent,
): Promise<{ requestId: string }> => {
  const requestId = randomUUID()
  setImmediate(() =>
    safeSend(event, 'ai-generation-event', {
      requestId,
      type: 'error',
      message: 'Local AI runtime is unavailable',
    }),
  )
  return { requestId }
}

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
  channel: 'ai-local-progress' | 'ai-local-directory-progress' | 'ai-generation-event',
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

const trackLocalSender = (
  event: Electron.IpcMainInvokeEvent,
  senders: Map<number, Electron.WebContents>,
  subscribedSenders: WeakSet<object>,
  localService: LocalAiServiceContract | undefined,
  cloudRequests: Map<string, { controller: AbortController; ownerId: number }>,
): void => {
  senders.set(event.sender.id, event.sender)
  subscribeToSenderDestroyed(event, subscribedSenders, () => {
    senders.delete(event.sender.id)
    void localService?.cancelOwner(event.sender.id)
    cancelCloudOwner(cloudRequests, event.sender.id)
  })
}

const broadcastLocalDirectoryProgress = (
  senders: Map<number, Electron.WebContents>,
  migration: unknown,
): void => {
  for (const [id, sender] of senders) {
    if (sender.isDestroyed()) {
      senders.delete(id)
      continue
    }
    try {
      sender.send('ai-local-directory-progress', migration)
    } catch {
      senders.delete(id)
    }
  }
}
