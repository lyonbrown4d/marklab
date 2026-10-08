import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveElectronProjectRoots,
  resolveWindowIconPath,
  resolveWindowIconPaths,
  resolveWindowsTaskbarIconPath,
} from '@electron/windowIconPaths'

const createIcon = async (root: string, relativePath: string): Promise<string> => {
  const target = path.join(root, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, 'icon')
  return target
}

const tempRoot = (): string =>
  path.resolve(process.env.TMPDIR || process.env.TEMP || process.env.TMP || '/tmp')

describe('window icon paths', () => {
  it('prefers the macOS icns asset before png fallbacks', async () => {
    const root = await mkdtemp(path.join(tempRoot(), 'marklab-window-icon-'))
    const pngPath = await createIcon(root, path.join('resources', 'icons', 'marklab.png'))
    const icnsPath = await createIcon(root, path.join('resources', 'icons', 'marklab.icns'))

    expect(resolveWindowIconPath(root, 'darwin')).toBe(icnsPath)
    expect(resolveWindowIconPaths(root, 'darwin')).toEqual([icnsPath, pngPath])
  })

  it('searches both dist-electron and repository roots for development builds', async () => {
    const root = await mkdtemp(path.join(tempRoot(), 'marklab-window-icon-'))
    const electronDir = path.join(root, 'dist-electron', 'chunks')
    const iconPath = await createIcon(root, path.join('resources', 'icons', 'marklab.png'))

    expect(
      resolveWindowIconPath(resolveElectronProjectRoots(electronDir, '/missing'), 'linux'),
    ).toBe(iconPath)
  })

  it('selects the matching Windows window icon for the current color mode', async () => {
    const root = await mkdtemp(path.join(tempRoot(), 'marklab-window-icon-'))
    const staticPath = await createIcon(root, path.join('resources', 'icons', 'marklab.ico'))
    const lightPath = await createIcon(root, path.join('resources', 'icons', 'marklab-light.ico'))
    const darkPath = await createIcon(root, path.join('resources', 'icons', 'marklab-dark.ico'))

    expect(resolveWindowIconPath(root, 'win32', 'light')).toBe(lightPath)
    expect(resolveWindowIconPath(root, 'win32', 'dark')).toBe(darkPath)
    expect(resolveWindowIconPath(root, 'win32')).toBe(staticPath)
  })

  it('uses the executable icon for packaged Windows taskbar relaunch entries', async () => {
    const root = await mkdtemp(path.join(tempRoot(), 'marklab-window-icon-'))
    await createIcon(root, path.join('resources', 'icons', 'marklab.ico'))
    const executablePath = 'C:\\Program Files\\Marklab\\Marklab.exe'

    expect(resolveWindowsTaskbarIconPath(root, true, executablePath)).toBe(executablePath)
  })

  it('uses the generated ico for development taskbar relaunch entries', async () => {
    const root = await mkdtemp(path.join(tempRoot(), 'marklab-window-icon-'))
    const iconPath = await createIcon(root, path.join('resources', 'icons', 'marklab.ico'))

    expect(resolveWindowsTaskbarIconPath(root, false, 'electron.exe')).toBe(iconPath)
  })

  it('selects themed PNGs on Linux while keeping the packaged macOS icon stable', async () => {
    const root = await mkdtemp(path.join(tempRoot(), 'marklab-window-icon-'))
    const staticPng = await createIcon(root, path.join('resources', 'icons', 'marklab.png'))
    const lightPng = await createIcon(root, path.join('resources', 'icons', 'marklab-light.png'))
    const darkPng = await createIcon(root, path.join('resources', 'icons', 'marklab-dark.png'))
    const icnsPath = await createIcon(root, path.join('resources', 'icons', 'marklab.icns'))

    expect(resolveWindowIconPath(root, 'linux', 'light')).toBe(lightPng)
    expect(resolveWindowIconPath(root, 'linux', 'dark')).toBe(darkPng)
    expect(resolveWindowIconPath(root, 'darwin', 'dark')).toBe(icnsPath)
    expect(resolveWindowIconPath(root, 'darwin', 'light')).toBe(icnsPath)
    expect(resolveWindowIconPath(root, 'linux')).toBe(staticPng)
  })
})
