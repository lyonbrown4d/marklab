import type * as Electron from 'electron'

import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke.js'
import { providerIdRequestSchema } from '@electron/services/ai/schemas.js'
import type { AiServiceContract } from '@electron/services/ai/types.js'
import type { Logger } from '@electron/services/logger.js'

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

export const createAiCommandHandlers = (service: AiServiceContract): NativeCommandHandlers => ({
  ai_list_providers: async () => service.listProviders(),
  ai_get_provider: async (payload) => service.getProvider(readId(payload)),
  ai_update_provider: async (payload) => service.updateProvider(payload),
  ai_delete_provider: async (payload) => service.deleteProvider(readId(payload)),
  ai_test_provider: async (payload) => service.testProvider(readId(payload)),
  ai_generate_text: async (payload) => service.generateText(payload),
})

const readId = (payload: unknown): string => providerIdRequestSchema.parse(payload).id
