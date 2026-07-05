import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import SidebarActivityRail from '@/components/SidebarActivityRail'
import SidebarToolPanel from '@/components/SidebarToolPanel'
import type { FileTreeNode } from '@/logic/fileTree'
import { isSidebarActivity, SIDEBAR_ACTIVITY_PARAM, type SidebarActivityId } from '@/logic/routing'
import type { FsSearchResult } from '@/services/fsApi'
import type { GitDiffRequest } from '@/services/gitApi'
import type { FileEntry, FileViewKind } from '@/store/appTypes'
import { onFileSearchFocusRequest } from '@/utils/appEvents'

type SidebarProps = {
  collapsed: boolean
  recentProjects: string[]
  files: FileEntry[]
  fileTree: FileTreeNode[]
  activePath: string | null
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  onOpenProject: (path: string) => void
  onSelectProject: () => void
  onOpenWorkspaceOverview: () => void
  onOpenWorkspaceGraph: () => void
  onCreateFile: (path: string) => void
  onCreateFolder: (path: string) => void
  onRenamePath: (from: string, to: string) => void
  onMovePath: (from: string, to: string) => void
  onDeletePath: (path: string) => void
  onUseInternalRoot: () => void
  rootKind: 'internal' | 'external' | 'single'
  rootPath: string
  onOpenGitDiff: (request: GitDiffRequest) => void
  onInspectPath: (path: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
}

const SidebarComponent = ({
  collapsed,
  recentProjects,
  files,
  fileTree,
  activePath,
  onOpenFile,
  onOpenFileView,
  onOpenProject,
  onSelectProject,
  onOpenWorkspaceOverview,
  onOpenWorkspaceGraph,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onMovePath,
  onDeletePath,
  onUseInternalRoot,
  rootKind,
  rootPath,
  onOpenGitDiff,
  onInspectPath,
  onOpenSearchResult,
}: SidebarProps) => {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [focusFileFilterRequest, setFocusFileFilterRequest] = useState(0)
  const activeActivity = useMemo<SidebarActivityId>(() => {
    const value = searchParams.get(SIDEBAR_ACTIVITY_PARAM)
    return isSidebarActivity(value) ? value : 'explorer'
  }, [searchParams])
  const fileCount = useMemo(() => files.filter((entry) => entry.kind === 'file').length, [files])

  const selectActivity = useCallback(
    (activity: SidebarActivityId) => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params)
          if (activity === 'explorer') {
            next.delete(SIDEBAR_ACTIVITY_PARAM)
          } else {
            next.set(SIDEBAR_ACTIVITY_PARAM, activity)
          }
          return next
        },
        { replace: false },
      )
    },
    [setSearchParams],
  )

  useEffect(() => {
    return onFileSearchFocusRequest(() => {
      selectActivity('explorer')
      setFocusFileFilterRequest((request) => request + 1)
    })
  }, [selectActivity])

  return (
    <aside
      className="layout-rail workspace-rail flex h-full w-full overflow-hidden border-r border-sidebar-border text-sidebar-foreground"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <SidebarActivityRail
        activeActivity={activeActivity}
        homeActive={location.pathname === '/'}
        fileCount={fileCount}
        recentProjectCount={recentProjects.length}
        onOpenWorkspaceOverview={onOpenWorkspaceOverview}
        onSelectActivity={selectActivity}
      />
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <SidebarToolPanel
            activeActivity={activeActivity}
            activePath={activePath}
            fileCount={fileCount}
            fileTree={fileTree}
            focusFileFilterRequest={focusFileFilterRequest}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
            onDeletePath={onDeletePath}
            onInspectPath={onInspectPath}
            onOpenFile={onOpenFile}
            onOpenFileView={onOpenFileView}
            onOpenGitDiff={onOpenGitDiff}
            onOpenProject={onOpenProject}
            onSelectProject={onSelectProject}
            onOpenSearchResult={onOpenSearchResult}
            onOpenWorkspaceGraph={onOpenWorkspaceGraph}
            onRenamePath={onRenamePath}
            onMovePath={onMovePath}
            onUseInternalRoot={onUseInternalRoot}
            recentProjects={recentProjects}
            rootKind={rootKind}
            rootPath={rootPath}
          />
        </div>
      )}
    </aside>
  )
}

export default React.memo(SidebarComponent)
