import type * as Electron from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import { noopLogger, type Logger } from '@electron/services/logger'
import type { CommandInvokePayload } from '@electron/types'

export type NativeCommandHandler = (
  payload: unknown,
  event: Electron.IpcMainInvokeEvent,
) => unknown | Promise<unknown>
export type NativeCommandHandlers = Record<string, NativeCommandHandler>
const commandsWithDedicatedPerformanceLogs = new Set([
  'open_current_workspace_in_new_window',
  'open_path_in_new_window',
  'retry_window_open',
])
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
      if (durationMs > 500 && !commandsWithDedicatedPerformanceLogs.has(request.command)) {
        logger.info('slow command invoke completed', {
          command: request.command,
          durationMs,
        })
      }
      return result
    } catch (error) {
      if (isAbortError(error)) {
        logger.debug('command invoke cancelled', { command: request.command })
      } else {
        logger.error('command invoke failed', { command: request.command, error })
      }
      throw error
    }
  }
  ipcMain.handle(nativeIpcChannels.commandInvoke, invokeHandler)
}

const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  try {
    return 'name' in error && error.name === 'AbortError'
  } catch {
    return false
  }
}

const parseCommandInvokePayload = (payload: unknown, legacyArgs: unknown): CommandInvokePayload => {
  if (typeof payload === 'string') {
    return {
      command: payload,
      args: legacyArgs,
    }
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Command invoke payload must be an object')
  }
  const request = payload as Record<string, unknown>
  const command = request.command
  const args = request.args

  if (typeof command !== 'string' || !command.trim()) {
    throw new Error('Command name is required')
  }
  return {
    command,
    args,
  }
}
