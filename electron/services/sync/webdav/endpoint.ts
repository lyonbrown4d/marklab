import path from 'node:path'

import { WebDavError } from '@electron/services/sync/webdav/errors'

export type ValidatedWebDavEndpoint = {
  endpoint: string
  basePath: string
}

export const validateWebDavEndpoint = (
  value: string,
  allowInsecureLocal: boolean,
  explicitBasePath?: string,
): ValidatedWebDavEndpoint => {
  if (typeof value !== 'string' || hasControlCharacters(value)) {
    throw new WebDavError('INVALID_ENDPOINT')
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new WebDavError('INVALID_ENDPOINT')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new WebDavError('INVALID_ENDPOINT')
  }
  if (url.protocol !== 'https:' && !isAllowedLocalHttp(url, allowInsecureLocal)) {
    throw new WebDavError('INVALID_ENDPOINT')
  }
  if (explicitBasePath !== undefined && url.pathname !== '/') {
    throw new WebDavError('INVALID_ENDPOINT')
  }
  return {
    endpoint: url.origin,
    basePath: normalizeBasePath(explicitBasePath ?? url.pathname),
  }
}

const normalizeBasePath = (value: string): string => {
  if (hasControlCharacters(value) || value.includes('\\')) {
    throw new WebDavError('INVALID_ENDPOINT')
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    throw new WebDavError('INVALID_ENDPOINT')
  }
  if (hasControlCharacters(decoded)) throw new WebDavError('INVALID_ENDPOINT')
  const segments = decoded.split('/').filter(Boolean)
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new WebDavError('INVALID_ENDPOINT')
  }
  const normalized = path.posix.normalize(`/${segments.join('/')}`)
  return normalized === '/' ? '/' : normalized.replace(/\/$/, '')
}

const isAllowedLocalHttp = (url: URL, enabled: boolean): boolean => {
  if (!enabled || url.protocol !== 'http:') return false
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname === '::1') return true
  if (/^(?:fc|fd)[0-9a-f]{2}:/i.test(hostname)) return true
  const octets = hostname.split('.').map(Number)
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  )
}

const hasControlCharacters = (value: string): boolean => /[\0\r\n]/.test(value)
