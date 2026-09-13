import {
  Group as ResizableGroup,
  Panel as ResizablePanel,
  Separator as ResizableSeparator,
  type useDefaultLayout,
  type usePanelRef,
} from 'react-resizable-panels'
import { useMemo, useRef, type ReactNode, type RefObject } from 'react'
import Sidebar from '@/components/Sidebar'
import RightSidebar from '@/components/RightSidebar'
import TabsBar from '@/components/TabsBar'
import type { useAppLayoutState } from '@/app/useAppLayoutState'
import type { FileViewKind } from '@/store/appTypes'
import type { GitDiffRequest } from '@/services/gitApi'
import type { FsSearchResult } from '@/services/fsApi'
import { getWorkspaceTabId } from '@/logic/tabs'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useInspectorOverlay } from '@/app/useInspectorOverlay'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const RESIZE_TARGET_MINIMUM_SIZE = { coarse: 28, fine: 8 }

type AppLayoutState = ReturnType<typeof useAppLayoutState>

type AppWorkspacePanelsState = Pick<
  AppLayoutState,
  | 'activePath'
  | 'activeResourcePath'
  | 'activeTabId'
  | 'createFile'
  | 'createFolder'
  | 'deletePath'
  | 'dirtyPaths'
  | 'editorValue'
  | 'fileContents'
  | 'fileTree'
  | 'files'
  | 'inspectedPath'
  | 'movePath'
  | 'onCloseTab'
  | 'onInspectPath'
  | 'onOpenProject'
  | 'onOpenTab'
  | 'onOpenWorkspaceGraph'
  | 'onOpenWorkspaceOverview'
  | 'onSelectProject'
  | 'onUseInternalRoot'
  | 'recentProjects'
  | 'renamePath'
  | 'rightSidebarCollapsed'
  | 'rootKind'
  | 'rootPath'
  | 'saveStates'
  | 'setViewMode'
  | 'sidebarCollapsed'
  | 'silentSave'
  | 'tabs'
  | 'viewMode'
  | 'workspaceIndex'
>

type AppWorkspacePanelsProps = {
  state: AppWorkspacePanelsState
  workspacePanelLayout: ReturnType<typeof useDefaultLayout>
  workspaceGroupElementRef: RefObject<HTMLDivElement | null>
  leftSidebarPanelRef: ReturnType<typeof usePanelRef>
  rightSidebarPanelRef: ReturnType<typeof usePanelRef>
  outlet: ReactNode
  // Retained for caller compatibility; the supplied outlet owns its route cache.
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
  totalFiles,
  onOpenFile,
  onOpenFileView,
  onOpenGitDiff,
  onOpenSearchResult,
  immersiveZenMode,
}: AppWorkspacePanelsProps) => {
  const { t } = useI18n()
  const inspectorOverlay = useInspectorOverlay()
  const inspectorTriggerRef = useRef<HTMLElement | null>(null)
  const sidebarCollapsed = state.sidebarCollapsed || immersiveZenMode
  const rightSidebarCollapsed = state.rightSidebarCollapsed || immersiveZenMode
  const rightPanelCollapsed = rightSidebarCollapsed || inspectorOverlay
  const tabIds = useMemo(() => state.tabs.map(getWorkspaceTabId), [state.tabs])
  const inspector = (
    <RightSidebar
      collapsed={rightSidebarCollapsed}
      activePath={state.activePath}
      editorValue={state.editorValue}
      files={state.files}
      fileContents={state.fileContents}
      dirtyPaths={state.dirtyPaths}
      workspaceIndex={state.workspaceIndex}
      tabs={tabIds}
      totalFiles={totalFiles}
      onOpenFileView={onOpenFileView}
      viewMode={state.viewMode}
      inspectedPath={state.inspectedPath}
    />
  )

  return (
    <>
      <ResizableGroup
        className="workspace-reading-layout motion-panel-group min-h-0 flex-1"
        defaultLayout={workspacePanelLayout.defaultLayout}
        elementRef={workspaceGroupElementRef}
        id="marklab-workspace-panels"
        onLayoutChanged={workspacePanelLayout.onLayoutChanged}
        orientation="horizontal"
        resizeTargetMinimumSize={RESIZE_TARGET_MINIMUM_SIZE}
      >
        <ResizablePanel
          className={cn(
            'motion-panel motion-panel-left min-h-0',
            sidebarCollapsed && 'motion-panel-collapsed',
          )}
          collapsedSize="48px"
          collapsible
          defaultSize="264px"
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
            onSelectProject={state.onSelectProject}
            onOpenWorkspaceOverview={state.onOpenWorkspaceOverview}
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
          <section className="workspace-main flex h-full min-w-0 flex-1 flex-col overflow-hidden">
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
            <div className="min-h-0 flex-1 overflow-hidden">{outlet}</div>
          </section>
        </ResizablePanel>
        <ResizableSeparator
          className={cn('resize-handle resize-handle-vertical', rightPanelCollapsed && 'hidden')}
          disabled={rightPanelCollapsed}
          id="right-sidebar-resize"
        />
        <ResizablePanel
          className={cn(
            'motion-panel motion-panel-right min-h-0',
            rightPanelCollapsed && 'motion-panel-collapsed',
          )}
          collapsedSize="0px"
          collapsible
          defaultSize={rightPanelCollapsed ? '0px' : '272px'}
          disabled={rightPanelCollapsed}
          groupResizeBehavior="preserve-pixel-size"
          id="right-sidebar"
          maxSize={rightPanelCollapsed ? '0px' : '460px'}
          minSize={rightPanelCollapsed ? '0px' : '240px'}
          panelRef={rightSidebarPanelRef}
        >
          {!inspectorOverlay && inspector}
        </ResizablePanel>
      </ResizableGroup>
      <Sheet
        open={inspectorOverlay && !rightSidebarCollapsed}
        onOpenChange={(open) => {
          if (!open) usePreferencesStore.setState({ rightSidebarCollapsed: true })
        }}
      >
        <SheetContent
          side="right"
          aria-describedby={undefined}
          className="flex w-80 max-w-[calc(100vw-2rem)] flex-col border-0 p-0 pt-10 sm:max-w-80"
          onOpenAutoFocus={() => {
            inspectorTriggerRef.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null
          }}
          onCloseAutoFocus={(event) => {
            if (inspectorTriggerRef.current?.isConnected) {
              event.preventDefault()
              inspectorTriggerRef.current.focus()
            }
          }}
        >
          <SheetTitle className="sr-only">{t('inspector.title')}</SheetTitle>
          <div className="min-h-0 flex-1">{inspectorOverlay && inspector}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}
