import { getElectronRuntime } from '@/runtime/electron'
import { emit } from '@/runtime/events'
import { inferPlatformFromUserAgent } from '@/runtime/environment'
import type { AppPlatform } from '@/services/appApi'

function normalizePlatform(raw: string): AppPlatform {
  if (raw === 'windows' || raw === 'linux' || raw === 'macos') return raw
  return 'unknown'
}

export async function getPlatform(): Promise<AppPlatform> {
  const electron = getElectronRuntime()
  if (electron) {
    const result = await electron.platform.get()
    return normalizePlatform(result.platform)
  }

  return inferPlatformFromUserAgent()
}

export async function dispatchMenuAction(id: string) {
  const electron = getElectronRuntime()
  if (electron) return electron.menu.dispatch(id)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('marko:menu-action', { detail: id }))
  }
  return { ok: true }
}

export async function signalAppReady() {
  const electron = getElectronRuntime()
  if (electron) {
    await electron.appReady()
    return
  }

  await emit('app-ready')
}

export async function getLaunchInfo() {
  const electron = getElectronRuntime()
  return electron?.lifecycle?.getLaunchInfo?.() ?? { args: [], cwd: '', deepLinks: [] }
}
