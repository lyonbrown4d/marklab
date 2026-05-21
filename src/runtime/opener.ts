import { getElectronRuntime } from '@/runtime/electron'
export const revealPathInSystem = async (path: string) => {
  const electron = getElectronRuntime()
  if (electron) {
    const result = await electron.shell.revealPath(path)
    if (!result.ok) throw new Error(result.error || 'Failed to reveal path')
    return
  }
  openBrowserPath(path)
}
export const openPathInSystemRuntime = async (path: string) => {
  const electron = getElectronRuntime()
  if (electron) {
    const result = await electron.shell.openPath(path)
    if (!result.ok) throw new Error(result.error || 'Failed to open path')
    return
  }
  openBrowserPath(path)
}
const openBrowserPath = (path: string) => {
  if (typeof window === 'undefined') return
  window.open(toOpenableUrl(path), '_blank', 'noopener,noreferrer')
}
const toOpenableUrl = (path: string) => {
  if (/^(https?:|file:)/i.test(path)) return path
  const normalized = path.replace(/\\/g, '/')
  const prefix = normalized.startsWith('/') ? 'file://' : 'file:///'
  return `${prefix}${encodePathSegments(normalized)}`
}
const encodePathSegments = (path: string) =>
  path
    .split('/')
    .map((segment, index) =>
      index === 0 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment),
    )
    .join('/')
