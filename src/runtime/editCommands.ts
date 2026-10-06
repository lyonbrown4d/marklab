import { getElectronRuntime, isElectronRuntime } from '@/runtime/electron'
import type { FocusedEditAction } from '@/types/editCommand'

export const queueFocusedEditCommand = (action: FocusedEditAction): boolean => {
  if (!isElectronRuntime()) return false
  void getElectronRuntime()
    .edit.execute(action)
    .catch(() => undefined)
  return true
}
