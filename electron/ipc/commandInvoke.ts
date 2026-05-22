import type * as Electron from 'electron'
import { nativeIpcChannels } from '@electron/channels.js'
import { noopLogger, type Logger } from '@electron/services/logger.js'
import type { RuntimeCommandPayload } from '@electron/types.js'

const LEGACY_COMMAND_INVOKE_CHANNEL = 'marko:command:invoke'
const MARKLAB_COMMAND_PREFIX = 'marklab:'
const LEGACY_COMMAND_PREFIX = 'marko:'
const LEGACY_COMMAND_PREFIX_LENGTH = LEGACY_COMMAND_PREFIX.length
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
  const invokeHandler = async (
    event: Electron.IpcMainInvokeEvent,
    payload: unknown,
    args: unknown,
  ) => {
    const request = parseCommandInvokePayload(payload, args)
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
  }
  ipcMain.handle(nativeIpcChannels.commandInvoke, invokeHandler)
  ipcMain.handle(LEGACY_COMMAND_INVOKE_CHANNEL, invokeHandler)
}
const parseCommandInvokePayload = (
  payload: unknown,
  legacyArgs: unknown,
): RuntimeCommandPayload => {
  if (typeof payload === 'string') {
    const command = normalizeLegacyCommand(payload)
    return {
      command,
      args: legacyArgs,
    }
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Command invoke payload must be an object')
  }
  const request = payload as Record<string, unknown>
  const command = request.command
  const args = request.args

  if (
    typeof command === 'string' &&
    command === LEGACY_COMMAND_INVOKE_CHANNEL &&
    args &&
    typeof args === 'object'
  ) {
    const nested = args as Record<string, unknown>
    if (typeof nested.command === 'string') {
      return {
        command: normalizeLegacyCommand(nested.command),
        args: nested.args,
      }
    }
  }

  if (typeof command === 'string' && command.startsWith(LEGACY_COMMAND_PREFIX)) {
    return {
      command: normalizeLegacyCommand(command),
      args,
    }
  }

  if (typeof command !== 'string' || !command.trim()) {
    throw new Error('Command name is required')
  }
  return {
    command,
    args,
  }
}

const normalizeLegacyCommand = (command: string): string => {
  if (!command.startsWith(LEGACY_COMMAND_PREFIX)) return command
  return `${MARKLAB_COMMAND_PREFIX}${command.slice(LEGACY_COMMAND_PREFIX_LENGTH)}`
}
