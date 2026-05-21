import { getElectronRuntime, isElectronRuntime } from '@/runtime/electron'
export type RuntimeWindowHandle = {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  unmaximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  close: () => Promise<void>
  startDragging: () => Promise<void>
}
export const isDesktopRuntime = () => {
  return isElectronRuntime()
}
export const getCurrentRuntimeWindow = async (): Promise<RuntimeWindowHandle | null> => {
  const electron = getElectronRuntime()
  if (electron) return electron.window
  return null
}
