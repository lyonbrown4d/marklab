import type { App, IpcMain, IpcMainInvokeEvent } from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import { rendererReadyPhases, type RendererReadySignal } from '@/types/rendererReady'

export const parseRendererReadySignal = (value: unknown): RendererReadySignal => {
  if (value === undefined) return { phase: 'shell' }
  if (!value || typeof value !== 'object') {
    throw new Error('Renderer ready signal must be an object.')
  }
  const candidate = value as Record<string, unknown>
  if (!rendererReadyPhases.some((phase) => phase === candidate.phase)) {
    throw new Error('Unsupported renderer ready phase.')
  }
  if (candidate.error !== undefined && typeof candidate.error !== 'string') {
    throw new Error('Renderer ready error must be a string.')
  }
  return {
    ...(typeof candidate.error === 'string' ? { error: candidate.error } : {}),
    phase: candidate.phase as RendererReadySignal['phase'],
  }
}

export const registerAppReadyIpc = (
  ipcMain: IpcMain,
  app: App,
  onRendererReady?: (event: IpcMainInvokeEvent, signal: RendererReadySignal) => void,
): void => {
  ipcMain.handle(nativeIpcChannels.appReadySignal, (event, payload: unknown) => {
    onRendererReady?.(event, parseRendererReadySignal(payload))
    return { ok: true }
  })
  ipcMain.handle(nativeIpcChannels.appReadyIsReady, () => app.isReady())
  ipcMain.handle(nativeIpcChannels.appReadyWhenReady, async () => {
    await app.whenReady()
    return { ok: true }
  })
}
