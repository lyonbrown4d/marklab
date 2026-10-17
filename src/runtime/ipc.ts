import { getDesktopRuntime } from '@/runtime/desktop'
export type RuntimeCommandArgs = Record<string, unknown>
export const invoke = async <T = unknown>(command: string, args?: RuntimeCommandArgs): Promise<T> =>
  getDesktopRuntime().commands.invoke<T>(command, args)
