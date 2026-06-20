import fs from 'node:fs'
import path from 'node:path'

import {
  isMarkdownPath,
  isWorkspaceDocumentPath,
  normalizeRelativePath,
  toWorkspaceRelative,
} from '@electron/services/workspace/path.js'
import type { FsEntry, FsStateData } from '@electron/services/workspace/types.js'

export type WatchEventName = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
export type WorkspaceKnownPaths = { paths: string[]; assetPaths: string[] }
export type WorkspacePathSnapshot = { entries: FsEntry[]; knownPaths: WorkspaceKnownPaths }
type WorkspaceWalkOptions = { entries: boolean; knownPaths: boolean }

export const stringArg = (value: unknown, key: string): string => {
  const result =
    value && typeof value === 'object' && key in value
      ? (value as Record<string, unknown>)[key]
      : value
  if (typeof result !== 'string') throw new Error(`${key} must be a string`)
  return result
}

export const nullableStringArg = (value: unknown, key: string): string | null => {
  const result =
    value && typeof value === 'object' && key in value
      ? (value as Record<string, unknown>)[key]
      : null
  if (result == null) return null
  if (typeof result !== 'string') throw new Error(`${key} must be a string`)
  return result
}

export const pathExists = async (value: string): Promise<boolean> => {
  try {
    await fs.promises.access(value)
    return true
  } catch {
    return false
  }
}

export const safeStatSync = (value: string): ReturnType<typeof fs.statSync> | null => {
  try {
    return fs.statSync(value)
  } catch {
    return null
  }
}

export const isTempWritePath = (value: string): boolean => {
  return path.extname(value).toLowerCase() === '.tmp'
}

export const hasHiddenPathSegment = (value: string): boolean => {
  return normalizeRelativePath(value)
    .split('/')
    .some((segment) => segment.startsWith('.'))
}

export const isPathInsideOrEqual = (root: string, absolutePath: string): boolean => {
  const relative = normalizeRelativePath(
    path.relative(path.resolve(root), path.resolve(absolutePath)),
  )
  return (
    relative === '' ||
    relative === '.' ||
    (!relative.startsWith('../') && relative !== '..' && !path.isAbsolute(relative))
  )
}

export const normalizeAbsolutePath = (value: string): string => {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export const samePath = (left: string, right: string): boolean => {
  return normalizeAbsolutePath(left) === normalizeAbsolutePath(right)
}

export const isWorkspaceWatchEvent = (value: string): value is WatchEventName => {
  return (
    value === 'add' ||
    value === 'change' ||
    value === 'unlink' ||
    value === 'addDir' ||
    value === 'unlinkDir'
  )
}

export const sanitizeFileStem = (value: string): string => {
  return value
    .replace(/[\\/:"*?<>|\p{C}]/gu, '-')
    .split(/\s+/)
    .join(' ')
    .replace(/^[. ]+|[. ]+$/g, '')
}

export const decodeURIComponentSafe = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

export const ensureDefaultFile = (root: string): void => {
  const hasMarkdown = findMarkdownFile(root)
  if (!hasMarkdown) fs.writeFileSync(path.join(root, 'Untitled.md'), '')
}

export const listWorkspaceEntries = async (state: FsStateData): Promise<FsEntry[]> => {
  if (state.rootKind === 'single') return singleFilePathSnapshot(state.singleFile).entries
  return (await walkWorkspace(state.rootPath, { entries: true, knownPaths: false })).entries
}

export const listWorkspaceKnownPaths = async (state: FsStateData): Promise<WorkspaceKnownPaths> => {
  if (state.rootKind === 'single') return singleFilePathSnapshot(state.singleFile).knownPaths
  return (await walkWorkspace(state.rootPath, { entries: false, knownPaths: true })).knownPaths
}

export const listWorkspacePathSnapshot = async (
  state: FsStateData,
): Promise<WorkspacePathSnapshot> => {
  if (state.rootKind === 'single') return singleFilePathSnapshot(state.singleFile)

  return walkWorkspace(state.rootPath, { entries: true, knownPaths: true })
}

const singleFilePathSnapshot = (singleFile: string | null): WorkspacePathSnapshot => {
  if (!singleFile) return { entries: [], knownPaths: { paths: [], assetPaths: [] } }
  const name = path.basename(singleFile)
  return {
    entries: [{ path: name, name, kind: 'file' as const }],
    knownPaths: { paths: [name], assetPaths: [] },
  }
}

const walkWorkspace = async (
  root: string,
  options: WorkspaceWalkOptions,
): Promise<WorkspacePathSnapshot> => {
  const entries: FsEntry[] = []
  const paths: string[] = []
  const assetPaths: string[] = []
  const visit = async (directory: string) => {
    if (!(await pathExists(directory))) return
    for (const dirent of await fs.promises.readdir(directory, { withFileTypes: true })) {
      if (dirent.name.startsWith('.')) continue
      const absolutePath = path.join(directory, dirent.name)
      const relativePath = toWorkspaceRelative(root, absolutePath)
      if (!relativePath) continue
      if (options.knownPaths) paths.push(relativePath)
      if (dirent.isDirectory()) {
        if (options.entries) {
          entries.push({ path: relativePath, name: dirent.name, kind: 'folder' as const })
        }
        await visit(absolutePath)
      } else if (dirent.isFile() && isWorkspaceDocumentPath(dirent.name)) {
        if (options.entries) {
          entries.push({ path: relativePath, name: dirent.name, kind: 'file' as const })
        }
      } else if (dirent.isFile() && options.knownPaths) {
        assetPaths.push(relativePath)
      }
    }
  }

  await visit(root)
  return {
    entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
    knownPaths: {
      paths: paths.sort((a, b) => a.localeCompare(b)),
      assetPaths: assetPaths.sort((a, b) => a.localeCompare(b)),
    },
  }
}

const findMarkdownFile = (root: string): boolean => {
  if (!fs.existsSync(root)) return false
  for (const name of fs.readdirSync(root, { withFileTypes: true })) {
    if (name.name.startsWith('.')) continue
    const absolutePath = path.join(root, name.name)
    if (name.isDirectory() && findMarkdownFile(absolutePath)) return true
    if (name.isFile() && isMarkdownPath(name.name)) return true
  }
  return false
}
