import { getDesktopRuntime, isDesktopRuntime, type DesktopFileDropEvent } from '@/runtime/desktop'
export type RuntimeWebviewDropEvent = DesktopFileDropEvent
export const onRuntimeWebviewFileDrop = async (
  handler: (event: RuntimeWebviewDropEvent) => void,
): Promise<(() => void) | null> => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  return desktop?.webview?.onFileDrop?.(handler) ?? null
}
