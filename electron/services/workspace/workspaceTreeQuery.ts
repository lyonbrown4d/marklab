import path from 'node:path'

import { normalizeRelativePath } from '@electron/services/workspace/path'
import type { FsEntry, FsRootInfo } from '@electron/services/workspace/types'
import {
  WORKSPACE_TREE_MAX_EXISTENCE_PATHS,
  WORKSPACE_TREE_MAX_PAGE_SIZE,
  WORKSPACE_TREE_MAX_SEARCH_RESULTS,
  type WorkspaceTreeChildrenRequest,
  type WorkspaceTreeChildrenResult,
  type WorkspaceTreeExistenceRequest,
  type WorkspaceTreeExistenceResult,
  type WorkspaceTreeInitialFileResult,
  type WorkspaceTreeSearchRequest,
  type WorkspaceTreeSearchResult,
} from '@/types/workspaceTree'

type WorkspaceTreeQueryOptions = {
  getEntries: () => Promise<FsEntry[]>
  getGeneration: () => number
  getRevision: () => number
  getRoot: () => FsRootInfo
}

type TreeIndex = {
  byParent: Map<string, WorkspaceTreeChildrenResult['entries']>
  files: FsEntry[]
  generation: number
  kindsByPath: Map<string, FsEntry['kind']>
  knownPaths: Set<string>
  revision: number
  root: FsRootInfo
  searchEntries: WorkspaceTreeChildrenResult['entries']
}

const validateRelativePath = (value: unknown, field: string, allowEmpty: boolean): string => {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  if (value.includes('\0') || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new Error(`${field} must be a workspace-relative path`)
  }
  const normalized = normalizeRelativePath(path.posix.normalize(value.replace(/\\/g, '/')))
  if ((!allowEmpty && (!normalized || normalized === '.')) || normalized === '..') {
    throw new Error(`${field} must be a workspace-relative path`)
  }
  if (normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`${field} must stay inside the workspace`)
  }
  return normalized === '.' ? '' : normalized.replace(/^\.\//, '').replace(/\/$/, '')
}

const parseLimit = (value: unknown): number => {
  const limit = value === undefined ? WORKSPACE_TREE_MAX_PAGE_SIZE : value
  if (
    !Number.isSafeInteger(limit) ||
    Number(limit) < 1 ||
    Number(limit) > WORKSPACE_TREE_MAX_PAGE_SIZE
  ) {
    throw new Error(`limit must be an integer from 1 to ${WORKSPACE_TREE_MAX_PAGE_SIZE}`)
  }
  return Number(limit)
}

const compareEntries = (left: FsEntry, right: FsEntry): number => {
  if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1
  return (
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
    left.path.localeCompare(right.path)
  )
}

export class WorkspaceTreeQueryService {
  private index: TreeIndex | null = null
  private queryEpoch = 0

  constructor(private readonly options: WorkspaceTreeQueryOptions) {}

  invalidate(): void {
    this.queryEpoch += 1
    this.index = null
  }

  async listChildren(value: WorkspaceTreeChildrenRequest): Promise<WorkspaceTreeChildrenResult> {
    if (!value || typeof value !== 'object') throw new Error('tree query must be an object')
    const parent = validateRelativePath(value.parent ?? '', 'parent', true)
    const limit = parseLimit(value.limit)
    const index = await this.getStableIndex()
    const offset = this.parseCursor(value.cursor, index.revision)
    const direct = index.byParent.get(parent) ?? []
    const page = direct.slice(offset, offset + limit)
    return {
      entries: page,
      nextCursor:
        offset + page.length < direct.length
          ? `${index.generation}:${index.revision}:${offset + page.length}`
          : null,
      parent,
      generation: index.generation,
      revision: index.revision,
      root: index.root,
    }
  }

  async pathsExist(value: WorkspaceTreeExistenceRequest): Promise<WorkspaceTreeExistenceResult> {
    if (
      !value ||
      !Array.isArray(value.paths) ||
      value.paths.length > WORKSPACE_TREE_MAX_EXISTENCE_PATHS
    ) {
      throw new Error(`paths must contain at most ${WORKSPACE_TREE_MAX_EXISTENCE_PATHS} items`)
    }
    const paths = value.paths.map((item) => validateRelativePath(item, 'paths', false))
    if (value.kind !== undefined && value.kind !== 'any' && value.kind !== 'file') {
      throw new Error('kind must be "any" or "file"')
    }
    const index = await this.getStableIndex()
    return {
      existing: paths.filter(
        (item, itemIndex) =>
          paths.indexOf(item) === itemIndex &&
          index.knownPaths.has(item) &&
          (value.kind !== 'file' || index.kindsByPath.get(item) === 'file'),
      ),
      generation: index.generation,
      revision: index.revision,
      root: index.root,
    }
  }

  async initialFile(): Promise<WorkspaceTreeInitialFileResult> {
    const index = await this.getStableIndex()
    const home = index.files.find((entry) => entry.path.toLowerCase() === 'home.md')
    return {
      generation: index.generation,
      path: (home ?? index.files[0])?.path ?? null,
      revision: index.revision,
      root: index.root,
    }
  }

  async search(value: WorkspaceTreeSearchRequest): Promise<WorkspaceTreeSearchResult> {
    if (!value || typeof value !== 'object') throw new Error('tree search must be an object')
    if (typeof value.query !== 'string') throw new Error('query must be a string')
    const query = value.query.trim().toLocaleLowerCase()
    if (!query || query.length > 256) throw new Error('query must contain 1 to 256 characters')
    const limit = value.limit === undefined ? WORKSPACE_TREE_MAX_SEARCH_RESULTS : value.limit
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > WORKSPACE_TREE_MAX_SEARCH_RESULTS) {
      throw new Error(`limit must be an integer from 1 to ${WORKSPACE_TREE_MAX_SEARCH_RESULTS}`)
    }
    const index = await this.getStableIndex()
    return {
      entries: index.searchEntries
        .filter((entry) => entry.path.toLocaleLowerCase().includes(query))
        .slice(0, limit),
      generation: index.generation,
      revision: index.revision,
      root: index.root,
    }
  }

  private async getStableIndex(): Promise<TreeIndex> {
    for (;;) {
      const revision = this.options.getRevision()
      const generation = this.options.getGeneration()
      const queryEpoch = this.queryEpoch
      const root = this.options.getRoot()
      const cached = this.index
      if (
        cached &&
        cached.generation === generation &&
        cached.revision === revision &&
        sameRoot(cached.root, root)
      )
        return cached
      const entries = await this.options.getEntries()
      const finalRevision = this.options.getRevision()
      const finalGeneration = this.options.getGeneration()
      const finalRoot = this.options.getRoot()
      if (
        generation !== finalGeneration ||
        queryEpoch !== this.queryEpoch ||
        revision !== finalRevision ||
        !sameRoot(root, finalRoot)
      )
        continue
      const next = buildIndex(entries, generation, revision, root)
      this.index = next
      return next
    }
  }

  private parseCursor(value: unknown, revision: number): number {
    if (value == null) return 0
    if (typeof value !== 'string') throw new Error('cursor must be a string')
    const match = /^(\d+):(\d+):(\d+)$/.exec(value)
    if (!match) throw new Error('cursor is invalid')
    const index = this.index
    if (!index || Number(match[1]) !== index.generation || Number(match[2]) !== revision) {
      throw new Error('cursor is stale')
    }
    const offset = Number(match[3])
    if (!Number.isSafeInteger(offset)) throw new Error('cursor is invalid')
    return offset
  }
}

const sameRoot = (left: FsRootInfo, right: FsRootInfo) =>
  left.kind === right.kind && left.path === right.path

const buildIndex = (
  entries: FsEntry[],
  generation: number,
  revision: number,
  root: FsRootInfo,
): TreeIndex => {
  const byParent = new Map<string, WorkspaceTreeChildrenResult['entries']>()
  const knownPaths = new Set(entries.map((entry) => entry.path))
  const kindsByPath = new Map(entries.map((entry) => [entry.path, entry.kind]))
  const foldersWithChildren = new Set<string>()
  for (const entry of entries) {
    const separator = entry.path.lastIndexOf('/')
    const parent = separator < 0 ? '' : entry.path.slice(0, separator)
    if (parent) foldersWithChildren.add(parent)
  }
  for (const entry of entries) {
    const separator = entry.path.lastIndexOf('/')
    const parent = separator < 0 ? '' : entry.path.slice(0, separator)
    const siblings = byParent.get(parent) ?? []
    siblings.push({ ...entry, hasChildren: foldersWithChildren.has(entry.path) })
    byParent.set(parent, siblings)
  }
  for (const siblings of byParent.values()) siblings.sort(compareEntries)
  return {
    byParent,
    files: entries.filter((entry) => entry.kind === 'file').sort(compareEntries),
    generation,
    knownPaths,
    kindsByPath,
    revision,
    root,
    searchEntries: entries
      .map((entry) => ({
        ...entry,
        hasChildren: foldersWithChildren.has(entry.path),
      }))
      .sort(compareEntries),
  }
}
