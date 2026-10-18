import { getDesktopRuntime, isDesktopRuntime } from '@/runtime/desktop'
import type { FocusedEditAction } from '@/types/editCommand'

export const queueFocusedEditCommand = (action: FocusedEditAction): boolean => {
  if (!isDesktopRuntime()) return false
  void getDesktopRuntime()
    .edit.execute(action)
    .catch(() => undefined)
  return true
}
