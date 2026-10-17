import { getDesktopRuntime, isDesktopRuntime } from '@/runtime/desktop'
export type RuntimeWebviewDropEvent = {
  paths: string[]
  position: {
    x: number
    y: number
  }
}
export const onRuntimeWebviewFileDrop = async (
  handler: (event: RuntimeWebviewDropEvent) => void,
): Promise<(() => void) | null> => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  return desktop?.webview?.onFileDrop?.(handler) ?? null
}
