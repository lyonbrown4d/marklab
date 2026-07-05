import isEqual from 'lodash-es/isEqual'
import { fsApi, type FsSnapshot } from '@/services/fsApi'
import { getWorkspaceTabId } from '@/logic/tabs'
import type { FileEntry, WorkspaceTab } from '@/store/appTypes'

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

export const fetchWorkspaceSnapshot = async (): Promise<FsSnapshot> => {
  return fsApi.getSnapshot()
}

export const projectLoaderErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const toEntryIdentity = (entry: FileEntry) => [entry.path, entry.kind]
