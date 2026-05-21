import { getElectronRuntime } from '@/runtime/electron'

export type RuntimeCommandArgs = Record<string, unknown>

export function invoke<T = unknown>(command: string, args?: RuntimeCommandArgs): Promise<T> {
  const electron = getElectronRuntime()
  if (!electron?.commands?.invoke) {
    return Promise.reject(new Error(`Electron command bridge is not available: ${command}`))
  }
  return electron.commands.invoke<T>(command, args)
}
