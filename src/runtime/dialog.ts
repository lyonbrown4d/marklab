import type { DesktopCommandArgs } from '@/generated/desktop/bindings'
import { getDesktopRuntime, isDesktopRuntime } from '@/runtime/desktop'
export type SaveDialogOptions = DesktopCommandArgs['dialog_save']['request']
export type OpenDialogOptions = DesktopCommandArgs['dialog_open']['request']
export type DialogFilter = NonNullable<SaveDialogOptions['filters']>[number]
export const openDialog = async (
  options?: OpenDialogOptions,
): Promise<string | string[] | null> => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (desktop) return desktop.dialog.open(options)
  void options
  return null
}
export const saveDialog = (options?: SaveDialogOptions): Promise<string | null> => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (desktop) return desktop.dialog.save(options)
  void options
  return Promise.resolve(null)
}

export const createWorkspaceDialog = async (
  options: DesktopCommandArgs['dialog_create_workspace']['request'],
): Promise<string | null> => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (!desktop) return null
  return desktop.dialog.createWorkspace(options)
}
