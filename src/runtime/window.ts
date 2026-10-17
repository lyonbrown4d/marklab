import { getDesktopRuntime, isDesktopRuntime } from '@/runtime/desktop'
export type RuntimeWindowHandle = {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  unmaximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  close: () => Promise<void>
  startDragging: () => Promise<void>
}
export { isDesktopRuntime } from '@/runtime/desktop'

export const onWindowPresented = (handler: () => void): (() => void) => {
  if (isDesktopRuntime()) return getDesktopRuntime().window.onPresented(handler)
  handler()
  return () => {}
}
export const getCurrentRuntimeWindow = async (): Promise<RuntimeWindowHandle | null> =>
  isDesktopRuntime() ? getDesktopRuntime().window : null

export const setVimKeyboardOwnership = async (active: boolean): Promise<void> => {
  if (isDesktopRuntime()) await getDesktopRuntime().window.setVimKeyboardOwnership(active)
}

export const onWindowMaximizedChanged = async (
  handler: (maximized: boolean) => void,
): Promise<() => void> =>
  isDesktopRuntime() ? getDesktopRuntime().window.onMaximizedChanged(handler) : () => {}
