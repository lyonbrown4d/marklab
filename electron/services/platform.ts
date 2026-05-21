import os from 'node:os'

import type { MarkoPlatform, PlatformInfo } from '../types.js'

function toMarkoPlatform(platform: string): MarkoPlatform {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  if (platform === 'linux') return 'linux'
  return 'unknown'
}

export function getPlatformInfo(): PlatformInfo {
  return {
    platform: toMarkoPlatform(process.platform),
    arch: os.arch(),
    nodePlatform: process.platform,
  }
}
