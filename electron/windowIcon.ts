import { nativeImage } from 'electron'
import fs from 'node:fs'
import { resolveWindowIconPaths, type WindowIconProjectRoots } from '@electron/windowIconPaths.js'

const createNativeImageFromPath = (iconPath: string): Electron.NativeImage | null => {
  try {
    if (iconPath.endsWith('.svg')) {
      const source = fs.readFileSync(iconPath, 'utf8')
      return nativeImage.createFromDataURL(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`,
      )
    }
    return nativeImage.createFromPath(iconPath)
  } catch {
    return null
  }
}

export const createWindowIcon = (projectRoots: WindowIconProjectRoots) => {
  for (const iconPath of resolveWindowIconPaths(projectRoots)) {
    const image = createNativeImageFromPath(iconPath)
    if (image && !image.isEmpty()) return image
  }
  return undefined
}
