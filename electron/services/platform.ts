import os from 'node:os'
import type { MarklabPlatform, PlatformInfo } from '../types.js'
const toMarklabPlatform = (platform: string): MarklabPlatform => {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  if (platform === 'linux') return 'linux'
  return 'unknown'
}
export const getPlatformInfo = (): PlatformInfo => {
  return {
    platform: toMarklabPlatform(process.platform),
    arch: os.arch(),
    nodePlatform: process.platform,
  }
}
