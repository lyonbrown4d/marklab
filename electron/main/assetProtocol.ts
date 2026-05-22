import { app, net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { NativeIpcRegistration } from '@electron/ipc/index.js'

const ASSET_PROTOCOL = 'marko-asset'

let assetProtocolRegistered = false
let assetProtocolPrivilegesRegistered = false

export const registerAssetProtocolPrivileges = (): void => {
  if (assetProtocolPrivilegesRegistered) return
  assetProtocolPrivilegesRegistered = true

  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_PROTOCOL,
      privileges: {
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
    const assetPath = assetPathFromRequest(request.url)
    if (!assetPath) return new Response('Invalid asset URL', { status: 400 })
    if (!isAllowedAssetPath(assetPath, getNativeIpc())) {
      return new Response('Asset path is not allowed', { status: 403 })
    }
    return net.fetch(pathToFileURL(assetPath).toString())
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
