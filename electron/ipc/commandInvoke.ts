import type * as Electron from 'electron'
import { nativeIpcChannels } from '@electron/channels.js'
import { noopLogger, type Logger } from '@electron/services/logger.js'
import type { RuntimeCommandPayload } from '@electron/types.js'
export type NativeCommandHandler = (
  payload: unknown,
  event: Electron.IpcMainInvokeEvent,
) => unknown | Promise<unknown>
export type NativeCommandHandlers = Record<string, NativeCommandHandler>
export const registerCommandInvokeIpc = (
  ipcMain: Electron.IpcMain,
  handlers: NativeCommandHandlers,
  logger: Logger = noopLogger,
): void => {
  ipcMain.handle(nativeIpcChannels.commandInvoke, async (event, payload: unknown) => {
    const request = parseCommandInvokePayload(payload)
    const handler = handlers[request.command]
    if (!handler) {
      logger.warn('unsupported command invoke', { command: request.command })
      throw new Error(`Unsupported command: ${request.command}`)
    }
    const startedAt = Date.now()
    try {
      const result = await handler(request.args, event)
      const durationMs = Date.now() - startedAt
      if (durationMs > 500) {
        logger.info('slow command invoke completed', {
          command: request.command,
          durationMs,
        })
      }
      return result
    } catch (error) {
      logger.error('command invoke failed', { command: request.command, error })
      throw error
    }
  })
}
const parseCommandInvokePayload = (payload: unknown): RuntimeCommandPayload => {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Command invoke payload must be an object')
  }
  const command = (payload as Record<string, unknown>).command
  if (typeof command !== 'string' || !command.trim()) {
    throw new Error('Command name is required')
  }
  return {
    command,
    args: (payload as Record<string, unknown>).args,
  }
}
