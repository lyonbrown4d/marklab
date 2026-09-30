import { SidebarContent } from '@/components/ui/sidebar'
import ScmPanel from '@/components/ScmPanel'
import SidebarExplorerPanel from '@/components/SidebarExplorerPanel'
import SidebarProjectsPanel from '@/components/SidebarProjectsPanel'
import SidebarSearchPanel from '@/components/SidebarSearchPanel'
import SidebarWorkspaceGraphPanel from '@/components/SidebarWorkspaceGraphPanel'
import type { SidebarToolPanelProps } from '@/components/sidebarPanelTypes'

const SidebarToolPanel = ({
  activeActivity,
  activePath,
  fileCount,
  fileTree,
  focusFileFilterRequest,
  focusWorkspaceSearchRequest,
  onCreateFile,
  onCreateFolder,
  onDeletePath,
  onInspectPath,
  onOpenFile,
  onOpenFileView,
  onOpenGitDiff,
  onOpenProject,
  onSelectProject,
  onOpenSearchResult,
  onOpenWorkspaceGraph,
  onRenamePath,
  onMovePath,
  onRestoreHistoryContent,
  onUseInternalRoot,
  recentProjects,
  rootKind,
  rootPath,
}: SidebarToolPanelProps) => {
  return (
    <SidebarContent className="h-full px-2 pb-2">
      {activeActivity === 'search' ? (
        <SidebarSearchPanel
          focusWorkspaceSearchRequest={focusWorkspaceSearchRequest}
          rootKind={rootKind}
          rootPath={rootPath}
          onOpenSearchResult={onOpenSearchResult}
        />
      ) : activeActivity === 'scm' ? (
        <ScmPanel
          collapsed={false}
          rootKind={rootKind}
          rootPath={rootPath}
          onOpenDiff={onOpenGitDiff}
        />
      ) : activeActivity === 'graph' ? (
        <SidebarWorkspaceGraphPanel
          fileCount={fileCount}
          recentProjects={recentProjects}
          rootPath={rootPath}
          onOpenWorkspaceGraph={onOpenWorkspaceGraph}
        />
      ) : activeActivity === 'projects' ? (
        <SidebarProjectsPanel
          recentProjects={recentProjects}
          onOpenProject={onOpenProject}
          onSelectProject={onSelectProject}
          onUseInternalRoot={onUseInternalRoot}
        />
      ) : (
        <SidebarExplorerPanel
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
          onRenamePath={onRenamePath}
          onMovePath={onMovePath}
          onRestoreHistoryContent={onRestoreHistoryContent}
          rootKind={rootKind}
        />
      )}
    </SidebarContent>
  )
}

export default SidebarToolPanel
