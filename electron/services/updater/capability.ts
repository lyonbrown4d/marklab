import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type UpdateCapability = { supported: true } | { reason: string; supported: false }

type UpdateCapabilityInput = {
  appImagePath?: string
  isPackaged: boolean
  macAutoUpdateSupported?: boolean
  packageType?: string
  platform: NodeJS.Platform
}

type DetectUpdateCapabilityInput = {
  appImagePath?: string
  appPath: string
  isPackaged: boolean
  platform: NodeJS.Platform
  readTextFile?: (path: string) => string | undefined
  resourcesPath: string
}

const supportedLinuxPackageTypes = new Set(['deb', 'pacman', 'rpm'])

export const resolveUpdateCapability = ({
  appImagePath,
  isPackaged,
  macAutoUpdateSupported,
  packageType,
  platform,
}: UpdateCapabilityInput): UpdateCapability => {
  if (!isPackaged) {
    return { reason: 'Updates are only available in packaged desktop builds.', supported: false }
  }
  if (platform === 'win32') return { supported: true }
  if (platform === 'darwin') {
    return macAutoUpdateSupported
      ? { supported: true }
      : {
          reason: 'Automatic updates require a signed macOS build. Download updates manually.',
          supported: false,
        }
  }
  if (platform === 'linux') {
    if (appImagePath?.startsWith('/') || supportedLinuxPackageTypes.has(packageType ?? '')) {
      return { supported: true }
    }
    return {
      reason:
        'Automatic updates are unavailable for this Linux package. Use an AppImage, deb, rpm, or pacman package.',
      supported: false,
    }
  }
  return { reason: 'Automatic updates are unavailable on this platform.', supported: false }
}

const readText = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return undefined
  }
}

const readMacUpdateMetadata = (
  appPath: string,
  readTextFile: (path: string) => string | undefined,
): boolean => {
  const value = readTextFile(join(appPath, 'package.json'))
  if (!value) return false
  try {
    const metadata = JSON.parse(value) as { marklabMacAutoUpdateSupported?: unknown }
    return (
      metadata.marklabMacAutoUpdateSupported === true ||
      metadata.marklabMacAutoUpdateSupported === 'true'
    )
  } catch {
    return false
  }
}

export const detectUpdateCapability = ({
  appImagePath,
  appPath,
  isPackaged,
  platform,
  readTextFile = readText,
  resourcesPath,
}: DetectUpdateCapabilityInput): UpdateCapability =>
  resolveUpdateCapability({
    appImagePath,
    isPackaged,
    macAutoUpdateSupported: platform === 'darwin' && readMacUpdateMetadata(appPath, readTextFile),
    packageType:
      platform === 'linux' ? readTextFile(join(resourcesPath, 'package-type')) : undefined,
    platform,
  })
