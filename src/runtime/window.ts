import { getElectronRuntime, isElectronRuntime } from '@/runtime/electron'

export type RuntimeWindowHandle = {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  unmaximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  close: () => Promise<void>
  startDragging: () => Promise<void>
}

export function isDesktopRuntime() {
  return isElectronRuntime()
}

export async function getCurrentRuntimeWindow(): Promise<RuntimeWindowHandle | null> {
  const electron = getElectronRuntime()
  if (electron) return electron.window

  return null
}
