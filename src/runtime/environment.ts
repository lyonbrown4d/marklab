import { isElectronRuntime as hasElectronRuntime } from '@/runtime/electron'
import type { AppPlatform } from '@/services/appApi'
export const isElectronRuntime = () => {
  return hasElectronRuntime()
}
export const isDesktopRuntime = () => {
  return isElectronRuntime()
}
export const runInDesktop = async <T>(callback: () => Promise<T> | T) => {
  if (!isDesktopRuntime()) return null
  return callback()
}
export const inferPlatformFromUserAgent = (): AppPlatform => {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('win')) return 'windows'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}
