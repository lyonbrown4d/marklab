import { existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FsSearchResult } from '@electron/services/workspace/types.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'

type NativeSearchHighlight = {
  end?: number
  start?: number
}

type NativeSearchResult = {
  column?: number
  endColumn?: number
  end_column?: number
  line?: number
  path?: string
  score?: number
  snippet?: string
  snippetHighlights?: NativeSearchHighlight[]
  snippet_highlights?: NativeSearchHighlight[]
  title?: string
}

export type NativeSearchIndex = {
  close: () => void
  hasDocuments: () => boolean
  open: (indexPath: string) => void
  rebuild: (documents: WorkspaceSearchDocument[]) => void
  removeDocument: (pathValue: string) => void
  removePathPrefix: (prefix: string) => void
  search: (query: string, limit: number) => NativeSearchResult[]
  upsertDocument: (document: WorkspaceSearchDocument) => void
}

export type NativeSearchModule = {
  NativeSearchIndex: new () => NativeSearchIndex
}

const require = createRequire(import.meta.url)

export const loadNativeSearchModule = (): NativeSearchModule | null => {
  const candidate = resolveNativeSearchModulePath()
  if (!candidate) return null

  try {
    return require(candidate) as NativeSearchModule
  } catch {
    return null
  }
}

export const normalizeNativeSearchResult = (result: NativeSearchResult): FsSearchResult | null => {
  if (!result.path) return null
  const snippetHighlights = result.snippetHighlights ?? result.snippet_highlights ?? []
  return {
    path: result.path,
    title: result.title ?? path.basename(result.path),
    line: normalizePositiveInteger(result.line, 1),
    column: normalizePositiveInteger(result.column, 1),
    end_column: normalizePositiveInteger(result.endColumn ?? result.end_column, 1),
    snippet: result.snippet ?? result.title ?? result.path,
    snippet_highlights: snippetHighlights.flatMap((highlight) => {
      const start = normalizeInteger(highlight.start)
      const end = normalizeInteger(highlight.end)
      return end > start ? [{ start, end }] : []
    }),
    score: Number(result.score ?? 0),
  }
}

const resolveNativeSearchModulePath = (): string | null => {
  const explicit = process.env.MARKLAB_SEARCH_NATIVE_PATH
  if (explicit && existsSync(explicit)) return explicit

  return (
    resolveNativeSearchModuleDirs()
      .flatMap((dir) => findNativeModuleInDir(dir))
      .find(Boolean) ?? null
  )
}

const resolveNativeSearchModuleDirs = (): string[] => {
  const electronDir = path.dirname(fileURLToPath(import.meta.url))
  const appResources = typeof process.resourcesPath === 'string' ? process.resourcesPath : null
  return [
    path.resolve(process.cwd(), 'native/search'),
    path.resolve(process.cwd(), 'resources/native/search'),
    appResources ? path.resolve(appResources, 'app.asar.unpacked/native/search') : '',
    appResources ? path.resolve(appResources, 'native/search') : '',
    path.resolve(electronDir, '../../native/search'),
  ].filter(Boolean)
}

const findNativeModuleInDir = (dir: string): string[] => {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.node'))
    .sort()
    .map((file) => path.join(dir, file))
}

const normalizeInteger = (value: unknown): number => {
  return Number.isFinite(value) ? Math.trunc(Number(value)) : 0
}

const normalizePositiveInteger = (value: unknown, fallback: number): number => {
  const next = normalizeInteger(value)
  return next > 0 ? next : fallback
}
