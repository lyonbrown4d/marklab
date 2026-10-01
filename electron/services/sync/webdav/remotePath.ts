import path from 'node:path'

import { WebDavError } from '@electron/services/sync/webdav/errors.js'

export const normalizeRemotePath = (value: string): string => {
  if (typeof value !== 'string' || /[\0\r\n\\]/.test(value) || value.startsWith('/')) {
    throw new WebDavError('INVALID_PATH')
  }
  const segments = value.split('/').filter((segment) => segment !== '')
  if (segments.some(isUnsafeSegment)) {
    throw new WebDavError('INVALID_PATH')
  }
  const normalized = path.posix.normalize(segments.join('/'))
  if (normalized === '.') return '/'
  if (normalized.startsWith('../') || normalized === '..') throw new WebDavError('INVALID_PATH')
  return `/${normalized}`
}

const isUnsafeSegment = (segment: string): boolean => {
  let decoded = segment
  for (let pass = 0; pass < 3; pass += 1) {
    if (decoded === '.' || decoded === '..' || /[\\/\0\r\n]/.test(decoded)) return true
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) return false
      decoded = next
    } catch {
      return true
    }
  }
  return true
}

export const webDavServerUrl = (endpoint: string, basePath: string): string =>
  basePath === '/' ? endpoint : `${endpoint}${basePath}`
