import { getElectronRuntime } from '@/runtime/electron'
import { emit } from '@/runtime/events'
import { inferPlatformFromUserAgent } from '@/runtime/environment'
import { invoke } from '@/runtime/ipc'
import type { AppPlatform } from '@/services/appApi'
import { requestMenuAction } from '@/utils/appEvents'

export type AppWindowOpenResult = {
  cancelled?: boolean
  ok: boolean
  windowId?: number
  requestedPath?: string
  workspacePath?: string
  rootKind?: 'internal' | 'external' | 'single'
  sharedWorkspaceSession: boolean
  error?: string
  startup?: {
    constructorCallsAvoided: 0 | 1
    openingShellLoadsAvoided: 0 | 1
    preparationDurationMs: number
    source: 'cold' | 'pool'
  }
}
const normalizePlatform = (raw: string): AppPlatform => {
  if (raw === 'windows' || raw === 'linux' || raw === 'macos') return raw
  return 'unknown'
}
export const getPlatform = async (): Promise<AppPlatform> => {
  const electron = getElectronRuntime()
  if (electron) {
    const result = await electron.platform.get()
    return normalizePlatform(result.platform)
  }
  return inferPlatformFromUserAgent()
}
export const dispatchMenuAction = async (id: string) => {
  const electron = getElectronRuntime()
  if (electron) return electron.menu.dispatch(id)
  requestMenuAction(id)
  return { ok: true }
}
export const setNativeMenuLocale = async (locale: string) => {
  const electron = getElectronRuntime()
  if (!electron?.commands?.invoke) return { locale, ok: true }
  return invoke<{ locale: string; ok: boolean }>('menu_set_locale', { locale })
}
export const signalAppReady = async () => {
  const electron = getElectronRuntime()
  if (electron) {
    await electron.appReady()
    return
  }
  await emit('app-ready')
}
export const getLaunchInfo = async () => {
  const electron = getElectronRuntime()
  return electron?.lifecycle?.getLaunchInfo?.() ?? { args: [], cwd: '', deepLinks: [] }
}
const unavailableWindowOpenResult = (error: string): AppWindowOpenResult => {
  return {
    ok: false,
    sharedWorkspaceSession: false,
    error,
  }
}
export const openCurrentWorkspaceInNewWindow = async (): Promise<AppWindowOpenResult> => {
  const electron = getElectronRuntime()
  if (!electron?.commands?.invoke) {
    return unavailableWindowOpenResult(
      'Electron command bridge is not available: open_current_workspace_in_new_window',
    )
  }
  return invoke<AppWindowOpenResult>('open_current_workspace_in_new_window')
}
export const openPathInNewWindow = async (path: string): Promise<AppWindowOpenResult> => {
  const electron = getElectronRuntime()
  if (!electron?.commands?.invoke) {
    return unavailableWindowOpenResult(
      'Electron command bridge is not available: open_path_in_new_window',
    )
  }
  return invoke<AppWindowOpenResult>('open_path_in_new_window', { path })
}
export const selectWorkspaceInNewWindow = async (title?: string): Promise<AppWindowOpenResult> => {
  const electron = getElectronRuntime()
  if (!electron) return unavailableWindowOpenResult('Electron runtime API is unavailable.')
  const selected = await electron.dialog.open({ directory: true, title })
  const path = Array.isArray(selected) ? selected[0] : selected
  if (!path) return { cancelled: true, ok: false, sharedWorkspaceSession: false }
  return openPathInNewWindow(path)
}
