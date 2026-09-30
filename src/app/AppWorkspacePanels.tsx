import { useCallback, useMemo, type ReactNode } from 'react'
import RightSidebar from '@/components/RightSidebar'
import { ImmersiveWorkspaceShell } from '@/components/ImmersiveWorkspaceShell'
import { AppWorkspaceSidebar } from '@/app/AppWorkspaceSidebar'
import type { useAppLayoutState } from '@/app/useAppLayoutState'
import type { FileViewKind } from '@/store/appTypes'
import type { GitDiffRequest } from '@/services/gitApi'
import type { FsSearchResult } from '@/services/fsApi'
import { getWorkspaceTabId } from '@/logic/tabs'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type AppLayoutState = ReturnType<typeof useAppLayoutState>

type AppWorkspacePanelsState = Pick<
  AppLayoutState,
  | 'activePath'
  | 'activeResourcePath'
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
  | 'onInspectPath'
  | 'onEditorChange'
  | 'onOpenProject'
  | 'onOpenWorkspaceGraph'
  | 'onOpenWorkspaceOverview'
  | 'onSelectProject'
  | 'onUseInternalRoot'
  | 'recentProjects'
  | 'renamePath'
  | 'rightSidebarCollapsed'
  | 'rootKind'
  | 'rootPath'
  | 'sidebarCollapsed'
  | 'tabs'
  | 'viewMode'
  | 'workspaceIndex'
>

type AppWorkspacePanelsProps = {
  state: AppWorkspacePanelsState
  outlet: ReactNode
  totalFiles: number
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  onOpenGitDiff: (request: GitDiffRequest) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  immersiveZenMode: boolean
}

export const AppWorkspacePanels = ({
  state,
  outlet,
  totalFiles,
  onOpenFile,
  onOpenFileView,
  onOpenGitDiff,
  onOpenSearchResult,
  immersiveZenMode,
}: AppWorkspacePanelsProps) => {
  const { t } = useI18n()
  const tabIds = useMemo(() => state.tabs.map(getWorkspaceTabId), [state.tabs])
  const toggleSidebar = useCallback(() => {
    const { sidebarCollapsed } = usePreferencesStore.getState()
    usePreferencesStore.setState({ sidebarCollapsed: !sidebarCollapsed })
  }, [])
  const setSidebarOpen = useCallback((open: boolean) => {
    usePreferencesStore.setState((current) =>
      current.sidebarCollapsed === !open ? current : { sidebarCollapsed: !open },
    )
  }, [])
  const toggleInspector = useCallback(() => {
    const { rightSidebarCollapsed } = usePreferencesStore.getState()
    usePreferencesStore.setState({ rightSidebarCollapsed: !rightSidebarCollapsed })
  }, [])
  const sidebar = (
    <AppWorkspaceSidebar
      activeEditorPath={state.activePath}
      activeResourcePath={state.activeResourcePath}
      recentProjects={state.recentProjects}
      files={state.files}
      fileTree={state.fileTree}
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
      onEditorChange={state.onEditorChange}
      onDeletePath={state.deletePath}
      onUseInternalRoot={state.onUseInternalRoot}
      rootKind={state.rootKind}
      rootPath={state.rootPath}
      onOpenGitDiff={onOpenGitDiff}
      onInspectPath={state.onInspectPath}
      onOpenSearchResult={onOpenSearchResult}
    />
  )
  const inspector = (
    <RightSidebar
      collapsed={false}
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
    <ImmersiveWorkspaceShell
      sidebar={sidebar}
      inspector={inspector}
      sidebarOpen={!state.sidebarCollapsed && !immersiveZenMode}
      inspectorOpen={!state.rightSidebarCollapsed && !immersiveZenMode}
      sidebarLabel={t('actions.toggleSidebar')}
      inspectorLabel={t('titlebar.documentOutline')}
      onToggleSidebar={toggleSidebar}
      onSidebarOpenChange={setSidebarOpen}
      onToggleInspector={toggleInspector}
    >
      <section className="workspace-main flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">{outlet}</div>
      </section>
    </ImmersiveWorkspaceShell>
  )
}
