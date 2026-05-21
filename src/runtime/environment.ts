import { isElectronRuntime as hasElectronRuntime } from '@/runtime/electron'
import type { AppPlatform } from '@/services/appApi'

export function isElectronRuntime() {
  return hasElectronRuntime()
}

export function isDesktopRuntime() {
  return isElectronRuntime()
}

export async function runInDesktop<T>(callback: () => Promise<T> | T) {
  if (!isDesktopRuntime()) return null
  return callback()
}

export function inferPlatformFromUserAgent(): AppPlatform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('win')) return 'windows'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}
