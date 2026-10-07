import isEqual from 'lodash-es/isEqual'
import { fsApi, type FsSnapshot } from '@/services/fsApi'
import { getWorkspaceTabId } from '@/logic/tabs'
import type { FileEntry, WorkspaceTab } from '@/store/appTypes'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import {
  WORKSPACE_TREE_MAX_PAGE_SIZE,
  type WorkspaceTreeChildrenResult,
} from '@/types/workspaceTree'

export type LoadWorkspaceOptions = {
  activeTabId?: string | null
  preserveCurrentRoute?: boolean
  snapshot?: FsSnapshot
  tabs?: WorkspaceTab[]
}

export const isWorkspaceFileEntry = (entry: FileEntry) => {
  return entry.kind === 'file'
}

export const areWorkspaceTabListsEqual = (left: WorkspaceTab[], right: WorkspaceTab[]) => {
  return isEqual(left.map(getWorkspaceTabId), right.map(getWorkspaceTabId))
}

export const areWorkspaceEntriesEqual = (left: FileEntry[], right: FileEntry[]) => {
  return isEqual(left.map(toEntryIdentity), right.map(toEntryIdentity))
}

export const fetchWorkspaceTreeChildrenPage = async (
  parent: string | null,
  cursor: string | null = null,
): Promise<WorkspaceTreeChildrenResult> => {
  return workspaceTreeApi.listChildren({
    cursor,
    limit: WORKSPACE_TREE_MAX_PAGE_SIZE,
    parent,
  })
}

export const fetchWorkspaceTreeProjection = async (
  tabs: WorkspaceTab[],
): Promise<{
  entries: FileEntry[]
  nextCursor: string | null
  generation: number
  revision: number
  root: FsSnapshot['root']
}> => {
  const rootPage = await fetchWorkspaceTreeChildrenPage(null)
  const paths = tabs.flatMap((tab) => (tab.kind === 'web' ? [] : [tab.path]))
  const existing: string[] = []
  for (let offset = 0; offset < paths.length; offset += 256) {
    const result = await workspaceTreeApi.pathsExist({
      kind: 'file',
      paths: paths.slice(offset, offset + 256),
    })
    if (
      result.generation !== rootPage.generation ||
      result.revision !== rootPage.revision ||
      result.root.kind !== rootPage.root.kind ||
      result.root.path !== rootPage.root.path
    ) {
      throw new Error('Workspace tree changed while restoring tabs')
    }
    existing.push(...result.existing)
  }
  const initial = await workspaceTreeApi.initialFile()
  if (
    initial.generation !== rootPage.generation ||
    initial.revision !== rootPage.revision ||
    initial.root.kind !== rootPage.root.kind ||
    initial.root.path !== rootPage.root.path
  ) {
    throw new Error('Workspace tree changed while selecting an initial file')
  }
  const byPath = new Map<string, FileEntry>()
  for (const entry of rootPage.entries) {
    byPath.set(entry.path, {
      kind: entry.kind,
      path: entry.path,
      hasChildren: entry.hasChildren,
      childrenLoaded: entry.kind === 'folder' ? false : undefined,
    })
  }
  for (const existingPath of existing) {
    if (!byPath.has(existingPath)) {
      byPath.set(existingPath, { kind: 'file', path: existingPath, hasChildren: false })
    }
  }
  if (initial.path && !byPath.has(initial.path)) {
    byPath.set(initial.path, { kind: 'file', path: initial.path, hasChildren: false })
  }
  return {
    entries: [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path)),
    generation: rootPage.generation,
    nextCursor: rootPage.nextCursor,
    revision: rootPage.revision,
    root: rootPage.root,
  }
}

export const fetchWorkspaceLoadProjection = async (
  tabs: WorkspaceTab[],
): Promise<{
  generation: number
  snapshot: FsSnapshot
  revision: number
  nextCursor: string | null
}> => {
  let projection = await fetchWorkspaceTreeProjection(tabs)
  if (
    projection.root.kind !== 'single' &&
    !projection.entries.some((entry) => entry.kind === 'file')
  ) {
    await fsApi.createFile('Untitled.md')
    projection = await fetchWorkspaceTreeProjection(tabs)
  }
  return {
    generation: projection.generation,
    nextCursor: projection.nextCursor,
    revision: projection.revision,
    snapshot: { entries: projection.entries, root: projection.root },
  }
}

export const projectLoaderErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const toEntryIdentity = (entry: FileEntry) => [
  entry.path,
  entry.kind,
  entry.hasChildren,
  entry.childrenLoaded,
]
