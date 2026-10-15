import type { Release } from '#site/lib/releases'

export const platforms = ['mac-arm64', 'win-x64', 'linux-x64'] as const
export type Platform = (typeof platforms)[number]
export type Download = {
  platform: Platform
  version: string
  url: string
  filename: string
  size: number
  releaseUrl: string
}

const suffixes: Record<Platform, readonly string[]> = {
  'mac-arm64': ['mac-arm64.dmg'],
  'win-x64': ['win-x64-setup.exe', 'win-x64.exe'],
  'linux-x64': ['linux-x64.AppImage', 'linux-x86_64.AppImage'],
}

// Resolve each platform separately: GitHub's global "Latest" can refer to an older Windows release.
export const getDownload = (releases: readonly Release[], platform: Platform): Download | null => {
  for (const release of releases) {
    const version = release.tag_name.slice(5)
    const asset = suffixes[platform]
      .map((suffix) =>
        release.assets.find((entry) => entry.name === `Marklab-${version}-${suffix}`),
      )
      .find(Boolean)
    if (asset)
      return {
        platform,
        version,
        url: asset.browser_download_url,
        filename: asset.name,
        size: asset.size,
        releaseUrl: release.html_url,
      }
  }
  return null
}

export const downloadSize = (bytes: number) => `${Math.ceil(bytes / 1024 / 1024)} MB`
