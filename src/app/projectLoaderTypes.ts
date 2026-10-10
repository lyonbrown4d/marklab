import type { NavigateFunction } from 'react-router-dom'
import type { FileEntry, FileViewKind, WorkspaceTab } from '@/store/appTypes'

export type UseProjectLoaderArgs = {
  rootPath: string
  rootKind: 'internal' | 'external' | 'single'
  entries: FileEntry[]
  tabs: WorkspaceTab[]
  activeTabId: string | null
  locationPathname: string
  preserveCurrentRoute: boolean
  defaultFileView: FileViewKind
  navigate: NavigateFunction
  setEntries: (entries: FileEntry[]) => void
  setRootPath: (path: string) => void
  setRootKind: (kind: 'internal' | 'external' | 'single') => void
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  touchRecentProject: (path: string) => void
}
