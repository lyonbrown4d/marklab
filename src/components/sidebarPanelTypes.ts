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
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onDeletePath: (path: string) => void
  onInspectPath: (path: string) => void
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  onOpenGitDiff: (request: GitDiffRequest) => void
  onOpenProject: (path: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  onOpenWorkspaceGraph: () => void
  onRenamePath: (from: string, to: string) => void
  onMovePath: (from: string, to: string) => void
  onUseInternalRoot: () => void
  recentProjects: string[]
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
  | 'rootKind'
>

export type SidebarSearchPanelProps = Pick<SidebarToolPanelProps, 'onOpenSearchResult'>

export type SidebarProjectsPanelProps = Pick<
  SidebarToolPanelProps,
  'onOpenProject' | 'onUseInternalRoot' | 'recentProjects'
>

export type SidebarWorkspaceGraphPanelProps = Pick<
  SidebarToolPanelProps,
  'fileCount' | 'onOpenWorkspaceGraph' | 'recentProjects' | 'rootPath'
>
