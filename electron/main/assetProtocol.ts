import { app, net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { NativeIpcRegistration } from '@electron/ipc/index.js'

const ASSET_PROTOCOL = 'marklab-asset'

let assetProtocolRegistered = false
let assetProtocolPrivilegesRegistered = false

export const registerAssetProtocolPrivileges = (): void => {
  if (assetProtocolPrivilegesRegistered) return
  assetProtocolPrivilegesRegistered = true

  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_PROTOCOL,
      privileges: {
        corsEnabled: true,
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ])
}

export const registerAssetProtocol = (getNativeIpc: () => NativeIpcRegistration | null): void => {
  if (assetProtocolRegistered) return
  assetProtocolRegistered = true

  protocol.handle(ASSET_PROTOCOL, async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: createCorsHeaders(), status: 204 })
    }
    const assetPath = assetPathFromRequest(request.url)
    if (!assetPath) return new Response('Invalid asset URL', { status: 400 })
    if (!isAllowedAssetPath(assetPath, getNativeIpc())) {
      return new Response('Asset path is not allowed', { status: 403 })
    }
    const response = await net.fetch(pathToFileURL(assetPath).toString())
    return normalizeAssetResponse(response, assetPath, request.headers)
  })
}

const assetPathFromRequest = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${ASSET_PROTOCOL}:` || parsed.hostname !== 'local') return null
    const value = parsed.searchParams.get('path')
    if (!value || value.includes('\0')) return null
    if (!path.isAbsolute(value)) return null
    const resolved = path.resolve(value)
    return path.isAbsolute(resolved) ? resolved : null
  } catch {
    return null
  }
}

const isAllowedAssetPath = (
  assetPath: string,
  nativeIpc: NativeIpcRegistration | null,
): boolean => {
  if (nativeIpc?.commands.workspace.isAssetPathAllowed(assetPath)) return true

  return defaultAssetRoots().some((root) => isPathInsideOrEqual(root, assetPath))
}

const normalizeAssetResponse = (
  response: Response,
  assetPath: string,
  headers: Headers | undefined,
): Response => {
  const contentType = inferContentType(assetPath, headers, response.headers)
  const nextHeaders = createCorsHeaders()
  nextHeaders.set('accept-ranges', 'bytes')
  const contentLength = response.headers.get('content-length')
  if (contentLength) nextHeaders.set('content-length', contentLength)
  if (contentType) nextHeaders.set('content-type', contentType)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  })
}

const createCorsHeaders = (): Headers => {
  const headers = new Headers()
  headers.set('access-control-allow-origin', '*')
  headers.set('access-control-allow-methods', 'GET, HEAD, OPTIONS')
  headers.set('access-control-allow-headers', 'range, content-type')
  headers.set('access-control-expose-headers', 'accept-ranges, content-length, content-range')
  return headers
}

const inferContentType = (
  assetPath: string,
  headers: Headers | undefined,
  responseHeaders: Headers,
): string | null => {
  const requestDestination = fetchRequestDestination(headers)
  const extension = path.extname(assetPath).toLowerCase()
  if (requestDestination === 'script' && extension === '.ts') {
    return 'application/octet-stream'
  }
  if (extension === '.aac') return 'audio/aac'
  if (extension === '.apng') return 'image/apng'
  if (extension === '.avif') return 'image/avif'
  if (extension === '.bmp') return 'image/bmp'
  if (extension === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (extension === '.flac') return 'audio/flac'
  if (extension === '.gif') return 'image/gif'
  if (extension === '.ico') return 'image/x-icon'
  if (extension === '.jpeg' || extension === '.jpg') return 'image/jpeg'
  if (extension === '.m4a') return 'audio/mp4'
  if (extension === '.m4v') return 'video/mp4'
  if (extension === '.mov') return 'video/quicktime'
  if (extension === '.mp3') return 'audio/mpeg'
  if (extension === '.mp4') return 'video/mp4'
  if (extension === '.oga' || extension === '.ogg' || extension === '.opus') return 'audio/ogg'
  if (extension === '.ogv') return 'video/ogg'
  if (extension === '.pdf') return 'application/pdf'
  if (extension === '.png') return 'image/png'
  if (extension === '.svg') return 'image/svg+xml'
  if (extension === '.wav') return 'audio/wav'
  if (extension === '.webm') return 'video/webm'
  if (extension === '.webp') return 'image/webp'
  return responseContentType(responseHeaders)
}

const responseContentType = (headers: Headers | undefined): string | null => {
  const value = headers?.get('content-type')
  return value && value.includes('/') ? value : 'application/octet-stream'
}

const fetchRequestDestination = (headers: Headers | undefined): string | null => {
  if (!headers) return null
  const destination = headers.get('sec-fetch-dest')
  return destination ? destination.toLowerCase() : null
}

const defaultAssetRoots = (): string[] => {
  const roots = [
    safeAppPath('home'),
    safeAppPath('temp'),
    safeAppPath('appData'),
    safeAppPath('userData'),
    process.resourcesPath,
  ].filter((root): root is string => Boolean(root))
  return [...new Set(roots.map((root) => path.resolve(root)))]
}

const safeAppPath = (name: Parameters<typeof app.getPath>[0]): string | null => {
  try {
    return app.getPath(name)
  } catch {
    return null
  }
}

const isPathInsideOrEqual = (root: string, assetPath: string): boolean => {
  const relative = path.relative(path.resolve(root), path.resolve(assetPath)).replace(/\\/g, '/')
  return (
    relative === '' ||
    relative === '.' ||
    (!relative.startsWith('../') && relative !== '..' && !path.isAbsolute(relative))
  )
}
