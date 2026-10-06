import { memo, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import type { FileTreeNode } from '@/logic/fileTree'
import type { FsSearchResult } from '@/services/fsApi'
import type { GitDiffRequest } from '@/services/gitApi'
import type { FileEntry, FileViewKind, RootKind } from '@/store/appTypes'

type AppWorkspaceSidebarProps = {
  activeEditorPath: string | null
  activeResourcePath: string | null
  files: FileEntry[]
  fileTree: FileTreeNode[]
  rootKind: RootKind
  rootPath: string
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onRenamePath: (from: string, to: string) => void
  onMovePath: (from: string, to: string) => void
  onPersistedContentChange: (path: string, content: string) => void
  onDeletePath: (path: string) => void
  onOpenGitDiff: (request: GitDiffRequest) => void
  onInspectPath: (path: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
}

const AppWorkspaceSidebarComponent = ({
  activeEditorPath,
  activeResourcePath,
  files,
  fileTree,
  rootKind,
  rootPath,
  onOpenFile,
  onOpenFileView,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onMovePath,
  onPersistedContentChange,
  onDeletePath,
  onOpenGitDiff,
  onInspectPath,
  onOpenSearchResult,
}: AppWorkspaceSidebarProps) => {
  const restoreHistoryContent = useCallback(
    (path: string, content: string) => {
      if (path === activeEditorPath) onPersistedContentChange(path, content)
    },
    [activeEditorPath, onPersistedContentChange],
  )

  return (
    <Sidebar
      collapsed={false}
      files={files}
      fileTree={fileTree}
      activePath={activeResourcePath}
      onOpenFile={onOpenFile}
      onOpenFileView={onOpenFileView}
      onCreateFile={onCreateFile}
      onCreateFolder={onCreateFolder}
      onRenamePath={onRenamePath}
      onMovePath={onMovePath}
      onRestoreHistoryContent={restoreHistoryContent}
      onDeletePath={onDeletePath}
      rootKind={rootKind}
      rootPath={rootPath}
      onOpenGitDiff={onOpenGitDiff}
      onInspectPath={onInspectPath}
      onOpenSearchResult={onOpenSearchResult}
    />
  )
}

export const AppWorkspaceSidebar = memo(AppWorkspaceSidebarComponent)
