import type { FileTreeNode } from '@/logic/fileTree'
import type { SidebarActivityId } from '@/logic/routing'
import type { FsSearchResult } from '@/services/fsApi'
import type { GitDiffRequest } from '@/services/gitApi'
import type { FileViewKind } from '@/store/appTypes'

export type SidebarToolPanelProps = {
  activeActivity: SidebarActivityId
  activePath: string | null
  fileCount: number
  fileTree: FileTreeNode[]
  focusFileFilterRequest: number
  focusWorkspaceSearchRequest: number
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onDeletePath: (path: string) => void
  onInspectPath: (path: string) => void
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  onOpenGitDiff: (request: GitDiffRequest) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  onRenamePath: (from: string, to: string) => void
  onMovePath: (from: string, to: string) => void
  onRestoreHistoryContent: (path: string, content: string) => void
  rootKind: 'internal' | 'external' | 'single'
  rootPath: string
}

export type SidebarExplorerPanelProps = Pick<
  SidebarToolPanelProps,
  | 'activePath'
  | 'fileCount'
  | 'fileTree'
  | 'focusFileFilterRequest'
  | 'onCreateFile'
  | 'onCreateFolder'
  | 'onDeletePath'
  | 'onInspectPath'
  | 'onOpenFile'
  | 'onOpenFileView'
  | 'onRenamePath'
  | 'onMovePath'
  | 'onRestoreHistoryContent'
  | 'rootKind'
>

export type SidebarSearchPanelProps = Pick<
  SidebarToolPanelProps,
  'focusWorkspaceSearchRequest' | 'onOpenSearchResult' | 'rootKind' | 'rootPath'
>
