import { getElectronRuntime } from '@/runtime/electron'
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
  const electron = getElectronRuntime()
  return electron?.webview?.onFileDrop?.(handler) ?? null
}
