import { getElectronRuntime } from '@/runtime/electron'

export function convertAssetFileSrc(path: string) {
  const electron = getElectronRuntime()
  return electron?.assets?.convertFileSrc?.(path) ?? pathToFileUrl(path)
}

export function convertAssetFileSrcSync(path: string) {
  return convertAssetFileSrc(path)
}

const pathToFileUrl = (path: string) => {
  if (path.startsWith('file://')) return path
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
