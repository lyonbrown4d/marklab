import { getDesktopRuntime, isDesktopRuntime } from '@/runtime/desktop'
import { emit } from '@/runtime/events'
import { inferPlatformFromUserAgent } from '@/runtime/environment'
import { invoke } from '@/runtime/ipc'
import type { AppPlatform } from '@/services/appApi'
import { requestMenuAction } from '@/utils/appEvents'
import type { RendererReadySignal } from '@/types/rendererReady'

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
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (desktop) {
    const result = await desktop.platform.get()
    return normalizePlatform(result.platform)
  }
  return inferPlatformFromUserAgent()
}
export const dispatchMenuAction = async (id: string) => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (desktop) return desktop.menu.dispatch(id)
  requestMenuAction(id)
  return { ok: true }
}
export const setNativeMenuLocale = async (locale: string) => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (!desktop) return { locale, ok: true }
  return invoke<{ locale: string; ok: boolean }>('menu_set_locale', { locale })
}
export const signalAppReady = async (signal: RendererReadySignal = { phase: 'shell' }) => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (desktop) {
    await desktop.appReady(signal)
    return
  }
  await emit('app-ready', signal)
}
export const getLaunchInfo = async () => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  return desktop ? desktop.lifecycle.getLaunchInfo() : { args: [], cwd: '', deepLinks: [] }
}
const unavailableWindowOpenResult = (error: string): AppWindowOpenResult => {
  return {
    ok: false,
    sharedWorkspaceSession: false,
    error,
  }
}
export const openCurrentWorkspaceInNewWindow = async (): Promise<AppWindowOpenResult> => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (!desktop) {
    return unavailableWindowOpenResult(
      'Desktop command bridge is not available: open_current_workspace_in_new_window',
    )
  }
  return invoke<AppWindowOpenResult>('open_current_workspace_in_new_window')
}
export const openPathInNewWindow = async (path: string): Promise<AppWindowOpenResult> => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (!desktop) {
    return unavailableWindowOpenResult(
      'Desktop command bridge is not available: open_path_in_new_window',
    )
  }
  return invoke<AppWindowOpenResult>('open_path_in_new_window', { path })
}
export const selectWorkspaceInNewWindow = async (title?: string): Promise<AppWindowOpenResult> => {
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (!desktop) return unavailableWindowOpenResult('Desktop runtime API is unavailable.')
  const selected = await desktop.dialog.open({ directory: true, title })
  const path = Array.isArray(selected) ? selected[0] : selected
  if (!path) return { cancelled: true, ok: false, sharedWorkspaceSession: false }
  return openPathInNewWindow(path)
}
