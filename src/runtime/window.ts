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
export const onWindowPresented = (handler: () => void): (() => void) => {
  if (isElectronRuntime()) {
    const onPresented = getElectronRuntime().window.onPresented
    if (typeof onPresented === 'function') return onPresented(handler)
    // A renderer can hot-reload while the old preload is still installed.
    // Keep that development session usable until Electron is restarted.
  }
  handler()
  return () => {}
}
export const getCurrentRuntimeWindow = async (): Promise<RuntimeWindowHandle | null> => {
  const electron = getElectronRuntime()
  if (electron) return electron.window
  return null
}
