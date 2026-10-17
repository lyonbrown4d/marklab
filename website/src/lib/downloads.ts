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

const assetNames: Record<Platform, (version: string) => readonly string[]> = {
  'mac-arm64': (version) => [`Marklab_${version}_aarch64.dmg`, `Marklab-${version}-mac-arm64.dmg`],
  'win-x64': (version) => [
    `Marklab_${version}_x64-setup.exe`,
    `Marklab-${version}-win-x64-setup.exe`,
    `Marklab-${version}-win-x64.exe`,
  ],
  'linux-x64': (version) => [
    `Marklab_${version}_amd64.AppImage`,
    `marklab_${version}_amd64.AppImage`,
    `Marklab-${version}-linux-x64.AppImage`,
    `Marklab-${version}-linux-x86_64.AppImage`,
  ],
}

// Resolve each platform separately: GitHub's global "Latest" can refer to an older Windows release.
export const getDownload = (releases: readonly Release[], platform: Platform): Download | null => {
  for (const release of releases) {
    const version = release.tag_name.slice(5)
    const asset = assetNames[platform](version)
      .map((name) => release.assets.find((entry) => entry.name === name))
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
