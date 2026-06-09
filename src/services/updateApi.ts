import { getElectronRuntime, type ElectronUpdateEvent } from '@/runtime/electron'

export type {
  ElectronUpdateEvent as AppUpdateEvent,
  ElectronUpdateInfo as AppUpdateInfo,
  ElectronUpdateProgress as AppUpdateProgress,
  ElectronUpdateResult as AppUpdateResult,
  ElectronUpdateState as AppUpdateState,
  ElectronUpdateStatus as AppUpdateStatus,
} from '@/runtime/electron'

const unavailableError = 'Electron update bridge is not available.'

export const getUpdateState = async () => {
  const updates = getElectronRuntime()?.updates
  if (!updates) return { status: 'unavailable' as const, error: unavailableError }
  return updates.getState()
}

export const checkForUpdates = async () => {
  const updates = getElectronRuntime()?.updates
  if (!updates) return { ok: false, status: 'unavailable' as const, error: unavailableError }
  return updates.check()
}

export const downloadUpdate = async () => {
  const updates = getElectronRuntime()?.updates
  if (!updates) return { ok: false, status: 'unavailable' as const, error: unavailableError }
  return updates.download()
}

export const installUpdate = async () => {
  const updates = getElectronRuntime()?.updates
  if (!updates) return { ok: false, status: 'unavailable' as const, error: unavailableError }
  return updates.install()
}

export const listenForUpdateEvents = (handler: (event: ElectronUpdateEvent) => void) => {
  const updates = getElectronRuntime()?.updates
  if (!updates) return () => undefined
  return updates.onEvent(handler)
}
