import { getDesktopRuntime } from '@/runtime/desktop'
import type {
  RuntimeCommandName,
  RuntimeCommandParameters,
  RuntimeCommandResult,
} from '@/runtime/tauri/contract'

export const invoke = <C extends RuntimeCommandName>(
  command: C,
  ...args: RuntimeCommandParameters<C>
): Promise<RuntimeCommandResult<C>> => getDesktopRuntime().commands.invoke(command, ...args)
