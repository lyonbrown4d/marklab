import { useCallback, useMemo, useState, type ReactNode } from 'react'
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
import TabsBar from '@/components/TabsBar'
import {
  EditorFocusHandoffProvider,
  useEditorFocusHandoffController,
} from '@/app/EditorFocusHandoff'

type AppLayoutState = ReturnType<typeof useAppLayoutState>

type AppWorkspacePanelsState = Pick<
  AppLayoutState,
  | 'activePath'
  | 'activeTabId'
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
  | 'onCloseTab'
  | 'onInspectPath'
  | 'onPersistedContentChange'
  | 'onOpenTab'
  | 'renamePath'
  | 'rightSidebarCollapsed'
  | 'rootKind'
  | 'rootPath'
  | 'saveStates'
  | 'sidebarCollapsed'
  | 'silentSave'
  | 'tabs'
  | 'viewMode'
  | 'workspaceView'
  | 'workspaceKey'
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
  const [sidebarDismissRequest, setSidebarDismissRequest] = useState(0)
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
  const closeSidebarAfterOpen = useCallback(() => {
    setSidebarOpen(false)
    setSidebarDismissRequest((request) => request + 1)
  }, [setSidebarOpen])
  const activeFileTab = useMemo(
    () =>
      state.tabs.find((tab) => tab.kind === 'file' && getWorkspaceTabId(tab) === state.activeTabId),
    [state.activeTabId, state.tabs],
  )
  const {
    begin: beginFocusHandoff,
    cancel: cancelFocusHandoff,
    value: focusHandoffValue,
  } = useEditorFocusHandoffController({
    activePath: activeFileTab?.kind === 'file' ? activeFileTab.path : null,
    activeView: activeFileTab?.kind === 'file' ? activeFileTab.view : null,
    onComplete: closeSidebarAfterOpen,
  })
  const openFileFromSidebar = useCallback(
    (path: string) => {
      const focusOrigin =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      cancelFocusHandoff()
      onOpenFile(path)
      beginFocusHandoff(path, undefined, focusOrigin)
    },
    [beginFocusHandoff, cancelFocusHandoff, onOpenFile],
  )
  const openFileViewFromSidebar = useCallback(
    (path: string, view: FileViewKind) => {
      const focusOrigin =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      cancelFocusHandoff()
      onOpenFileView(path, view)
      beginFocusHandoff(path, view, focusOrigin)
    },
    [beginFocusHandoff, cancelFocusHandoff, onOpenFileView],
  )
  const toggleInspector = useCallback(() => {
    const { rightSidebarCollapsed } = usePreferencesStore.getState()
    usePreferencesStore.setState({ rightSidebarCollapsed: !rightSidebarCollapsed })
  }, [])
  const sidebar = (
    <AppWorkspaceSidebar
      activeEditorPath={state.activePath}
      activeResourcePath={state.activeResourcePath}
      files={state.files}
      fileTree={state.fileTree}
      onOpenFile={openFileFromSidebar}
      onOpenFileView={openFileViewFromSidebar}
      onCreateFile={state.createFile}
      onCreateFolder={state.createFolder}
      onRenamePath={state.renamePath}
      onMovePath={state.movePath}
      onPersistedContentChange={state.onPersistedContentChange}
      onDeletePath={state.deletePath}
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
      fileContents={state.fileContents}
      workspaceKey={state.workspaceKey}
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
      sidebarDismissRequest={sidebarDismissRequest}
      inspectorLabel={t('titlebar.documentOutline')}
      onToggleSidebar={toggleSidebar}
      onSidebarOpenChange={setSidebarOpen}
      onToggleInspector={toggleInspector}
    >
      <section className="workspace-main relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {!immersiveZenMode && state.workspaceView !== 'map' ? (
          <TabsBar
            activeTabId={state.activeTabId}
            dirtyPaths={state.dirtyPaths}
            saveStates={state.saveStates}
            silentSave={state.silentSave}
            tabs={state.tabs}
            onCloseTab={state.onCloseTab}
            onOpenTab={state.onOpenTab}
          />
        ) : null}
        <EditorFocusHandoffProvider value={focusHandoffValue}>
          <div className="min-h-0 flex-1 overflow-hidden">{outlet}</div>
        </EditorFocusHandoffProvider>
      </section>
    </ImmersiveWorkspaceShell>
  )
}
