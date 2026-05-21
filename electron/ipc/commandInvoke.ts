import type * as Electron from 'electron'
import { nativeIpcChannels } from '../channels.js'
import type { RuntimeCommandPayload } from '../types.js'
export type NativeCommandHandler = (
  payload: unknown,
  event: Electron.IpcMainInvokeEvent,
) => unknown | Promise<unknown>
export type NativeCommandHandlers = Record<string, NativeCommandHandler>
export const registerCommandInvokeIpc = (
  ipcMain: Electron.IpcMain,
  handlers: NativeCommandHandlers,
): void => {
  ipcMain.handle(nativeIpcChannels.commandInvoke, (event, payload: unknown) => {
    const request = parseCommandInvokePayload(payload)
    const handler = handlers[request.command]
    if (!handler) {
      throw new Error(`Unsupported command: ${request.command}`)
    }
    return handler(request.args, event)
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
