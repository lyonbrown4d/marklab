import { getDesktopRuntime, isDesktopRuntime } from '@/runtime/desktop'
export type DialogFilter = {
  name: string
  extensions: string[]
}
export type SaveDialogOptions = {
  defaultPath?: string
  filters?: DialogFilter[]
  title?: string
  canCreateDirectories?: boolean
}
export type OpenDialogOptions = SaveDialogOptions & {
  directory?: boolean
  file?: boolean
  multiple?: boolean
}
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

export const createWorkspaceDialog = async (options: {
  name: string
  title?: string
}): Promise<string | null> => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (!desktop) return null
  return desktop.dialog.createWorkspace(options)
}
