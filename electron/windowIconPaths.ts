import fs from 'node:fs'
import path from 'node:path'

export type WindowIconPlatform = NodeJS.Platform | string

export type WindowIconProjectRoots = string | string[]

const WINDOW_ICON_CANDIDATES: Record<string, string[]> = {
  win32: [
    path.join('resources', 'icons', 'marklab.ico'),
    path.join('resources', 'icons', 'marklab.png'),
    path.join('public', 'marklab-dark.svg'),
    path.join('public', 'marklab.svg'),
  ],
  darwin: [
    path.join('resources', 'icons', 'marklab.icns'),
    path.join('resources', 'icons', 'marklab.png'),
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
  path.join('resources', 'icons', 'marklab.png'),
  path.join('public', 'marklab-dark.svg'),
  path.join('public', 'marklab.svg'),
]

export const resolveElectronProjectRoots = (electronDir: string, cwd = process.cwd()): string[] => {
  return uniquePaths([
    path.resolve(electronDir, '..'),
    path.resolve(electronDir, '..', '..'),
    path.resolve(cwd),
  ])
}

export const resolveWindowIconPaths = (
  projectRoots: WindowIconProjectRoots,
  platform: WindowIconPlatform = process.platform,
): string[] => {
  const roots = uniquePaths(Array.isArray(projectRoots) ? projectRoots : [projectRoots])
  const candidates = [...(WINDOW_ICON_CANDIDATES[platform] ?? []), ...FALLBACK_ICON_CANDIDATES]
  const paths: string[] = []

  for (const root of roots) {
    for (const relativePath of candidates) {
      const candidate = path.join(root, relativePath)
      if (fs.existsSync(candidate)) paths.push(candidate)
    }
  }

  return uniquePaths(paths)
}

export const resolveWindowIconPath = (
  projectRoots: WindowIconProjectRoots,
  platform: WindowIconPlatform = process.platform,
): string | null => {
  return resolveWindowIconPaths(projectRoots, platform)[0] ?? null
}

const uniquePaths = (paths: string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of paths) {
    const normalized = path.resolve(value)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}
