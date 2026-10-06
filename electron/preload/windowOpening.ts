import type { IpcRenderer, IpcRendererEvent } from 'electron'

import { nativeIpcChannels } from '@electron/channels'
import {
  windowOpeningStages,
  type WindowOpeningProgress,
  type WindowOpeningRetryResult,
} from '@/types/windowOpening'

type OpeningIpcRenderer = Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>

export type WindowOpeningPreloadSurface = {
  onProgress: (handler: (progress: WindowOpeningProgress) => void) => () => void
  retry: () => Promise<WindowOpeningRetryResult>
}

const isWindowOpeningProgress = (value: unknown): value is WindowOpeningProgress => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.workspacePath === 'string' &&
    windowOpeningStages.some((stage) => stage === candidate.stage) &&
    (candidate.error === undefined || typeof candidate.error === 'string')
  )
}

export const createWindowOpeningPreloadSurface = (
  ipcRenderer: OpeningIpcRenderer,
): WindowOpeningPreloadSurface => ({
  onProgress: (handler) => {
    const listener = (_event: IpcRendererEvent, payload: unknown) => {
      if (isWindowOpeningProgress(payload)) handler(payload)
    }
    ipcRenderer.on(nativeIpcChannels.windowOpeningProgress, listener)
    return () => ipcRenderer.removeListener(nativeIpcChannels.windowOpeningProgress, listener)
  },
  retry: () =>
    ipcRenderer.invoke(nativeIpcChannels.commandInvoke, {
      command: 'retry_window_open',
    }) as Promise<WindowOpeningRetryResult>,
})
