import { describe, expect, it } from 'vitest'
import {
  detectUpdateCapability,
  resolveUpdateCapability,
} from '@electron/services/updater/capability'

describe('resolveUpdateCapability', () => {
  it('disables updater networking outside packaged builds', () => {
    expect(resolveUpdateCapability({ isPackaged: false, platform: 'win32' })).toEqual(
      expect.objectContaining({ supported: false }),
    )
  })

  it.each([
    { appImagePath: '/opt/Marklab.AppImage', platform: 'linux' as const },
    { packageType: 'deb', platform: 'linux' as const },
    { packageType: 'rpm', platform: 'linux' as const },
    { packageType: 'pacman', platform: 'linux' as const },
    { platform: 'win32' as const },
  ])('supports the updater runtime $platform $packageType', (runtime) => {
    expect(resolveUpdateCapability({ isPackaged: true, ...runtime })).toEqual({ supported: true })
  })

  it.each([undefined, '', 'tar.gz', 'unknown'])(
    'rejects Linux packages without a supported package identity: %s',
    (packageType) => {
      expect(resolveUpdateCapability({ isPackaged: true, packageType, platform: 'linux' })).toEqual(
        expect.objectContaining({ reason: expect.stringContaining('Linux package') }),
      )
    },
  )

  it('requires explicit signed-build metadata on macOS', () => {
    expect(
      resolveUpdateCapability({
        isPackaged: true,
        macAutoUpdateSupported: false,
        platform: 'darwin',
      }),
    ).toEqual(expect.objectContaining({ reason: expect.stringContaining('signed macOS') }))
    expect(
      resolveUpdateCapability({
        isPackaged: true,
        macAutoUpdateSupported: true,
        platform: 'darwin',
      }),
    ).toEqual({ supported: true })
  })

  it('reads packaged Linux and macOS identities from their runtime resources', () => {
    const readTextFile = (path: string): string | undefined => {
      if (path.endsWith('package-type')) return 'deb'
      if (path.endsWith('package.json')) return '{"marklabMacAutoUpdateSupported":true}'
      return undefined
    }

    expect(
      detectUpdateCapability({
        appPath: '/app',
        isPackaged: true,
        platform: 'linux',
        readTextFile,
        resourcesPath: '/resources',
      }),
    ).toEqual({ supported: true })
    expect(
      detectUpdateCapability({
        appPath: '/app',
        isPackaged: true,
        platform: 'darwin',
        readTextFile,
        resourcesPath: '/resources',
      }),
    ).toEqual({ supported: true })
  })

  it('accepts the CLI-serialized signed macOS metadata marker', () => {
    expect(
      detectUpdateCapability({
        appPath: '/app',
        isPackaged: true,
        platform: 'darwin',
        readTextFile: () => '{"marklabMacAutoUpdateSupported":"true"}',
        resourcesPath: '/resources',
      }),
    ).toEqual({ supported: true })
  })
})
