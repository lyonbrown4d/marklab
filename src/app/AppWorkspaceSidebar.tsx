import { memo, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import type { FileTreeNode } from '@/logic/fileTree'
import type { FsSearchResult } from '@/services/fsApi'
import type { GitDiffRequest } from '@/services/gitApi'
import type { FileEntry, FileViewKind, RootKind } from '@/store/appTypes'

type AppWorkspaceSidebarProps = {
  activeEditorPath: string | null
  activeResourcePath: string | null
  recentProjects: string[]
  files: FileEntry[]
  fileTree: FileTreeNode[]
  rootKind: RootKind
  rootPath: string
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  onOpenProject: (path: string) => void
  onSelectProject: () => void
  onOpenWorkspaceGraph: () => void
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onRenamePath: (from: string, to: string) => void
  onMovePath: (from: string, to: string) => void
  onEditorChange: (content: string) => void
  onDeletePath: (path: string) => void
  onUseInternalRoot: () => void
  onOpenGitDiff: (request: GitDiffRequest) => void
  onInspectPath: (path: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
}

const AppWorkspaceSidebarComponent = ({
  activeEditorPath,
  activeResourcePath,
  recentProjects,
  files,
  fileTree,
  rootKind,
  rootPath,
  onOpenFile,
  onOpenFileView,
  onOpenProject,
  onSelectProject,
  onOpenWorkspaceGraph,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onMovePath,
  onEditorChange,
  onDeletePath,
  onUseInternalRoot,
  onOpenGitDiff,
  onInspectPath,
  onOpenSearchResult,
}: AppWorkspaceSidebarProps) => {
  const restoreHistoryContent = useCallback(
    (path: string, content: string) => {
      if (path === activeEditorPath) onEditorChange(content)
    },
    [activeEditorPath, onEditorChange],
  )

  return (
    <Sidebar
      collapsed={false}
      recentProjects={recentProjects}
      files={files}
      fileTree={fileTree}
      activePath={activeResourcePath}
      onOpenFile={onOpenFile}
      onOpenFileView={onOpenFileView}
      onOpenProject={onOpenProject}
      onSelectProject={onSelectProject}
      onOpenWorkspaceGraph={onOpenWorkspaceGraph}
      onCreateFile={onCreateFile}
      onCreateFolder={onCreateFolder}
      onRenamePath={onRenamePath}
      onMovePath={onMovePath}
      onRestoreHistoryContent={restoreHistoryContent}
      onDeletePath={onDeletePath}
      onUseInternalRoot={onUseInternalRoot}
      rootKind={rootKind}
      rootPath={rootPath}
      onOpenGitDiff={onOpenGitDiff}
      onInspectPath={onInspectPath}
      onOpenSearchResult={onOpenSearchResult}
    />
  )
}

export const AppWorkspaceSidebar = memo(AppWorkspaceSidebarComponent)
