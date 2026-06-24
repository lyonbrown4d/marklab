import { KeepAlive } from 'keepalive-for-react'
import {
  Group as ResizableGroup,
  Panel as ResizablePanel,
  Separator as ResizableSeparator,
  type useDefaultLayout,
  type usePanelRef,
} from 'react-resizable-panels'
import type { ReactNode, RefObject } from 'react'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import TabsBar from '@/components/TabsBar'
import type { useAppLayoutState } from '@/app/useAppLayoutState'
import type { FileViewKind } from '@/store/appTypes'
import type { GitDiffRequest } from '@/services/gitApi'
import type { FsSearchResult } from '@/services/fsApi'
import { getWorkspaceTabId } from '@/logic/tabs'
import { cn } from '@/lib/utils'

type AppLayoutState = ReturnType<typeof useAppLayoutState>

type AppWorkspacePanelsProps = {
  state: AppLayoutState
  workspacePanelLayout: ReturnType<typeof useDefaultLayout>
  workspaceGroupElementRef: RefObject<HTMLDivElement | null>
  leftSidebarPanelRef: ReturnType<typeof usePanelRef>
  rightSidebarPanelRef: ReturnType<typeof usePanelRef>
  outlet: ReactNode
  routeCacheKey: string
  routeCacheMax: number
  totalFiles: number
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  onOpenGitDiff: (request: GitDiffRequest) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  immersiveZenMode: boolean
}

export const AppWorkspacePanels = ({
  state,
  workspacePanelLayout,
  workspaceGroupElementRef,
  leftSidebarPanelRef,
  rightSidebarPanelRef,
  outlet,
  routeCacheKey,
  routeCacheMax,
  totalFiles,
  onOpenFile,
  onOpenFileView,
  onOpenGitDiff,
  onOpenSearchResult,
  immersiveZenMode,
}: AppWorkspacePanelsProps) => {
  const sidebarCollapsed = state.sidebarCollapsed || immersiveZenMode
  const rightSidebarCollapsed = state.rightSidebarCollapsed || immersiveZenMode
  const shouldAnimateRouteCache = state.viewMode !== 'wysiwyg'

  return (
    <ResizableGroup
      className="motion-panel-group min-h-0 flex-1"
      defaultLayout={workspacePanelLayout.defaultLayout}
      elementRef={workspaceGroupElementRef}
      id="marklab-workspace-panels"
      onLayoutChanged={workspacePanelLayout.onLayoutChanged}
      orientation="horizontal"
      resizeTargetMinimumSize={{ coarse: 28, fine: 8 }}
    >
      <ResizablePanel
        className={cn(
          'motion-panel motion-panel-left min-h-0',
          sidebarCollapsed && 'motion-panel-collapsed',
        )}
        collapsedSize="48px"
        collapsible
        defaultSize="320px"
        disabled={sidebarCollapsed}
        groupResizeBehavior="preserve-pixel-size"
        id="left-sidebar"
        maxSize="520px"
        minSize="240px"
        panelRef={leftSidebarPanelRef}
      >
        <Sidebar
          collapsed={sidebarCollapsed}
          recentProjects={state.recentProjects}
          files={state.files}
          fileTree={state.fileTree}
          activePath={state.activeResourcePath}
          onOpenFile={onOpenFile}
          onOpenFileView={onOpenFileView}
          onOpenProject={state.onOpenProject}
          onOpenWorkspaceGraph={state.onOpenWorkspaceGraph}
          onCreateFile={state.createFile}
          onCreateFolder={state.createFolder}
          onRenamePath={state.renamePath}
          onMovePath={state.movePath}
          onDeletePath={state.deletePath}
          onUseInternalRoot={state.onUseInternalRoot}
          rootKind={state.rootKind}
          rootPath={state.rootPath}
          onOpenGitDiff={onOpenGitDiff}
          onInspectPath={state.onInspectPath}
          onOpenSearchResult={onOpenSearchResult}
        />
      </ResizablePanel>
      <ResizableSeparator
        className="resize-handle resize-handle-vertical"
        disabled={sidebarCollapsed}
        id="left-sidebar-resize"
      />
      <ResizablePanel
        className="motion-panel motion-panel-main min-h-0"
        id="workspace-main"
        minSize="360px"
      >
        <section className="workspace-main motion-panel-surface flex h-full min-w-0 flex-1 flex-col overflow-hidden border-x border-border/80">
          {!immersiveZenMode && (
            <TabsBar
              tabs={state.tabs}
              dirtyPaths={state.dirtyPaths}
              saveStates={state.saveStates}
              activeTabId={state.activeTabId}
              onOpenTab={state.onOpenTab}
              onCloseTab={state.onCloseTab}
              viewMode={state.viewMode}
              onChangeView={state.setViewMode}
              silentSave={state.silentSave}
            />
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            <KeepAlive
              activeCacheKey={routeCacheKey}
              cacheNodeClassName={cn('h-full', shouldAnimateRouteCache && 'motion-view')}
              containerClassName={cn('h-full', shouldAnimateRouteCache && 'motion-view-stack')}
              max={routeCacheMax}
            >
              {outlet}
            </KeepAlive>
          </div>
        </section>
      </ResizablePanel>
      <ResizableSeparator
        className={cn('resize-handle resize-handle-vertical', rightSidebarCollapsed && 'hidden')}
        disabled={rightSidebarCollapsed}
        id="right-sidebar-resize"
      />
      <ResizablePanel
        className={cn(
          'motion-panel motion-panel-right min-h-0',
          rightSidebarCollapsed && 'motion-panel-collapsed',
        )}
        collapsedSize="0px"
        collapsible
        defaultSize="288px"
        disabled={rightSidebarCollapsed}
        groupResizeBehavior="preserve-pixel-size"
        id="right-sidebar"
        maxSize="460px"
        minSize="240px"
        panelRef={rightSidebarPanelRef}
      >
        <RightSidebar
          collapsed={rightSidebarCollapsed}
          activePath={state.activePath}
          editorValue={state.editorValue}
          files={state.files}
          fileContents={state.fileContents}
          dirtyPaths={state.dirtyPaths}
          workspaceIndex={state.workspaceIndex}
          tabs={state.tabs.map(getWorkspaceTabId)}
          totalFiles={totalFiles}
          onOpenFileView={onOpenFileView}
          viewMode={state.viewMode}
          inspectedPath={state.inspectedPath}
        />
      </ResizablePanel>
    </ResizableGroup>
  )
}
