import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveElectronProjectRoots,
  resolveWindowIconPath,
  resolveWindowIconPaths,
} from '@electron/windowIconPaths.js'

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
})
