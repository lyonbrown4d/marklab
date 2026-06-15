import fs from 'node:fs'
import path from 'node:path'
import { nativeImage } from 'electron'

const WINDOW_ICON_CANDIDATES: Record<string, string[]> = {
  win32: [
    path.join('resources', 'icons', 'marklab.ico'),
    path.join('resources', 'icons', 'marklab.png'),
    path.join('public', 'marklab-dark.svg'),
    path.join('public', 'marklab.svg'),
  ],
  darwin: [
    path.join('resources', 'icons', 'marklab.png'),
    path.join('resources', 'icons', 'marklab.icns'),
    path.join('public', 'marklab-dark.svg'),
    path.join('public', 'marklab.svg'),
  ],
  linux: [
    path.join('resources', 'icons', 'marklab.png'),
    path.join('public', 'marklab-dark.svg'),
    path.join('public', 'marklab.svg'),
  ],
}

const FALLBACK_ICON_CANDIDATES = [
  path.join('public', 'marklab-dark.svg'),
  path.join('public', 'marklab.svg'),
]

const resolveWindowIconPath = (projectRoot: string): string | null => {
  const candidates = WINDOW_ICON_CANDIDATES[process.platform] ?? []
  for (const relativePath of [...candidates, ...FALLBACK_ICON_CANDIDATES]) {
    const candidate = path.join(projectRoot, relativePath)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

export const createWindowIcon = (projectRoot: string) => {
  const iconPath = resolveWindowIconPath(projectRoot)
  if (!iconPath) return undefined

  try {
    if (iconPath.endsWith('.svg')) {
      const source = fs.readFileSync(iconPath, 'utf8')
      return nativeImage.createFromDataURL(
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`,
      )
    }
    return nativeImage.createFromPath(iconPath)
  } catch {
    return undefined
  }
}
