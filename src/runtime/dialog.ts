import { getElectronRuntime } from '@/runtime/electron'

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

export async function openDialog(options?: OpenDialogOptions): Promise<string | string[] | null> {
  const electron = getElectronRuntime()
  if (electron) return electron.dialog.open(options)

  void options
  return null
}

export function saveDialog(options?: SaveDialogOptions): Promise<string | null> {
  const electron = getElectronRuntime()
  if (electron) return electron.dialog.save(options)

  void options
  return Promise.resolve(null)
}
