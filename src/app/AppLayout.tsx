import { useCallback, useMemo, useRef } from 'react'
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { useQueryClient } from '@tanstack/react-query'
import Titlebar, { type TitlebarHandle } from '@/components/Titlebar'
import { AppStatusBarProvider } from '@/components/EditorStatusBar'
import ExportStatusOverlay from '@/components/ExportStatusOverlay'
import AppStatusBar from '@/components/AppStatusBar'
import { AppStatusBarDock } from '@/components/AppStatusBarDock'
import { AppStatusBarEdgeHandle } from '@/components/AppStatusBarEdgeHandle'
import { useAppLayoutState } from '@/app/useAppLayoutState'
import { useLatest } from 'ahooks'
import { useKeyboardShortcuts } from '@/app/useKeyboardShortcuts'
import { AppWorkspacePanels } from '@/app/AppWorkspacePanels'
import { AppShellPanels } from '@/app/AppShellPanels'
import { useAppMenuAction } from '@/app/useAppMenuAction'
import { useAppPanelLayoutSync } from '@/app/useAppPanelLayoutSync'
import { useAppDocumentSync } from '@/app/useAppDocumentSync'
import { useAppLayoutActions } from '@/app/useAppLayoutActions'
import { useAppLayoutOutlet } from '@/app/useAppLayoutOutlet'
import { useAppMenuEventSync } from '@/app/useAppMenuEventSync'
import { useNativeMenuLocaleSync } from '@/app/useNativeMenuLocaleSync'
import { useAppPendingHeading } from '@/app/useAppPendingHeading'
import { useAppTerminalArea } from '@/app/useAppTerminalArea'
import { SettingsDialogHost, type SettingsDialogHostHandle } from '@/app/SettingsDialogHost'
export type { LayoutContext } from '@/app/AppLayoutContext'
const AppLayout = () => {
  const state = useAppLayoutState()
  const stateRef = useLatest(state)
  const queryClient = useQueryClient()
  const titlebarRef = useRef<TitlebarHandle | null>(null)
  const settingsDialogRef = useRef<SettingsDialogHostHandle | null>(null)
  const shellGroupElementRef = useRef<HTMLDivElement | null>(null)
  const terminalPanelRef = usePanelRef()
  const shellPanelLayout = useDefaultLayout({
    id: 'marklab-shell-panels',
    panelIds: ['workspace-area', 'terminal'],
  })
  const openCommandPalette = useCallback(() => {
    titlebarRef.current?.openCommandPalette()
  }, [])
  const openSettings = useCallback(() => {
    settingsDialogRef.current?.openSettings()
  }, [])
  const toggleReadOnly = useCallback(() => {
    const current = stateRef.current
    const nextReadOnly = !current.editorReadOnlyMode
    current.setEditorReadOnlyMode(nextReadOnly)
    if (nextReadOnly && current.activePath) current.setViewMode('wysiwyg')
  }, [stateRef])
  const toggleStatusBar = useCallback(() => {
    const current = stateRef.current
    current.setShowEditorStatusBar(!current.showEditorStatusBar)
  }, [stateRef])
  const { immersiveZenMode } = useAppDocumentSync({ theme: state.theme })
  const {
    closeTerminalArea,
    effectiveTerminalOpen,
    openTerminalArea,
    terminalFocusRequest,
    terminalInitialized,
    toggleTerminalArea,
  } = useAppTerminalArea({
    disabled: immersiveZenMode,
  })
  useAppPanelLayoutSync({
    terminalPanelRef,
    shellGroupElementRef,
    terminalOpen: effectiveTerminalOpen,
  })
  const handleMenuAction = useAppMenuAction({
    stateRef,
    openSettings,
  })
  const {
    handleCreateFile,
    handleCreateFolder,
    handleOpenFile,
    handleOpenFileView,
    handleOpenGitDiff,
    handleOpenSearchResult,
    handleRebuildSearchIndex,
    searchIndexRebuilding,
  } = useAppLayoutActions({
    queryClient,
    state,
  })
  const openHeading = useAppPendingHeading({
    activePath: state.activePath,
    onOpenFileView: handleOpenFileView,
    viewMode: state.viewMode,
  })
  const { outlet, totalFiles } = useAppLayoutOutlet({
    immersiveZenMode,
    onOpenFile: handleOpenFile,
    onOpenFileView: handleOpenFileView,
    state,
  })
  useKeyboardShortcuts({
    activeTabId: state.activeTabId,
    shortcutOverrides: state.shortcutOverrides,
    tabs: state.tabs,
    viewMode: state.viewMode,
    onCloseActiveTab: state.onCloseActiveTab,
    onCreateFile: () => handleMenuAction('file.new'),
    onOpenCommandPalette: openCommandPalette,
    onOpenFile: () => handleMenuAction('file.open_file'),
    onOpenProject: () => handleMenuAction('file.open_project'),
    onOpenSettings: openSettings,
    onOpenHistory: state.onOpenWorkspaceHistory,
    onOpenTab: state.onOpenTab,
    onSetViewMode: state.setViewMode,
    onToggleRightSidebar: state.toggleRightSidebar,
    onToggleSidebar: state.toggleSidebar,
    onToggleTerminal: toggleTerminalArea,
    onToggleReadOnly: toggleReadOnly,
  })
  useAppMenuEventSync(handleMenuAction)
  useNativeMenuLocaleSync()
  const workspacePanelState = useMemo(
    () => ({
      activePath: state.activePath,
      activeTabId: state.activeTabId,
      activeResourcePath: state.activeResourcePath,
      createFile: state.createFile,
      createFolder: state.createFolder,
      deletePath: state.deletePath,
      dirtyPaths: state.dirtyPaths,
      editorValue: state.editorValue,
      fileContents: state.fileContents,
      fileTree: state.fileTree,
      files: state.files,
      inspectedPath: state.inspectedPath,
      movePath: state.movePath,
      onCloseTab: state.onCloseTab,
      onEditorChange: state.onEditorChange,
      onInspectPath: state.onInspectPath,
      onOpenProject: state.onOpenProject,
      onOpenTab: state.onOpenTab,
      onOpenWorkspaceGraph: state.onOpenWorkspaceGraph,
      onSelectProject: state.onSelectProject,
      onUseInternalRoot: state.onUseInternalRoot,
      recentProjects: state.recentProjects,
      renamePath: state.renamePath,
      rightSidebarCollapsed: state.rightSidebarCollapsed,
      rootKind: state.rootKind,
      rootPath: state.rootPath,
      saveStates: state.saveStates,
      sidebarCollapsed: state.sidebarCollapsed,
      silentSave: state.silentSave,
      tabs: state.tabs,
      viewMode: state.viewMode,
      workspaceView: state.workspaceView,
      workspaceIndex: state.workspaceIndex,
    }),
    [
      state.activePath,
      state.activeTabId,
      state.activeResourcePath,
      state.createFile,
      state.createFolder,
      state.deletePath,
      state.dirtyPaths,
      state.editorValue,
      state.fileContents,
      state.fileTree,
      state.files,
      state.inspectedPath,
      state.movePath,
      state.onCloseTab,
      state.onEditorChange,
      state.onInspectPath,
      state.onOpenProject,
      state.onOpenTab,
      state.onOpenWorkspaceGraph,
      state.onSelectProject,
      state.onUseInternalRoot,
      state.recentProjects,
      state.renamePath,
      state.rightSidebarCollapsed,
      state.rootKind,
      state.rootPath,
      state.saveStates,
      state.sidebarCollapsed,
      state.silentSave,
      state.tabs,
      state.viewMode,
      state.workspaceView,
      state.workspaceIndex,
    ],
  )
  const workspacePanels = useMemo(
    () => (
      <AppWorkspacePanels
        state={workspacePanelState}
        outlet={outlet}
        totalFiles={totalFiles}
        onOpenFile={handleOpenFile}
        onOpenFileView={handleOpenFileView}
        onOpenGitDiff={handleOpenGitDiff}
        onOpenSearchResult={handleOpenSearchResult}
        immersiveZenMode={immersiveZenMode}
      />
    ),
    [
      handleOpenFile,
      handleOpenFileView,
      handleOpenGitDiff,
      handleOpenSearchResult,
      immersiveZenMode,
      outlet,
      workspacePanelState,
      totalFiles,
    ],
  )
  return (
    <AppStatusBarProvider activePath={state.editorBufferPath} viewMode={state.viewMode}>
      <ExportStatusOverlay />
      <Titlebar
        ref={titlebarRef}
        activePath={state.activePath}
        activeTab={state.activeTab}
        tabs={state.tabs}
        onToggleSidebar={state.toggleSidebar}
        onToggleRightSidebar={state.toggleRightSidebar}
        onSelectProject={state.onSelectProject}
        onSelectSingleFile={state.onSelectSingleFile}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onOpenFile={handleOpenFile}
        onOpenHeading={openHeading}
        onOpenSearchResult={handleOpenSearchResult}
        onOpenWorkspaceGraph={state.onOpenWorkspaceGraph}
        onOpenWorkspaceFiles={state.onOpenWorkspaceFiles}
        onOpenAllPages={state.onOpenAllPages}
        onOpenHistory={state.onOpenWorkspaceHistory}
        onOpenProject={state.onOpenProject}
        onOpenCurrentWorkspaceInNewWindow={state.onOpenCurrentWorkspaceInNewWindow}
        onSelectWorkspaceInNewWindow={state.onSelectWorkspaceInNewWindow}
        onToggleReadOnly={toggleReadOnly}
        onCloseActiveTab={state.onCloseActiveTab}
        onOpenTerminal={openTerminalArea}
        onRebuildSearchIndex={handleRebuildSearchIndex}
        onChangeView={state.setViewMode}
        viewMode={state.viewMode}
        files={state.files}
        workspaceIndex={state.workspaceIndex}
        workspaceKey={state.workspaceKey}
        canCreateWorkspaceEntries={state.rootKind !== 'single'}
        searchIndexRebuilding={searchIndexRebuilding}
        isMaximized={state.isMaximized}
        setIsMaximized={state.setIsMaximized}
        theme={state.theme}
        setTheme={state.setTheme}
        onOpenSettings={openSettings}
        recentProjects={state.recentProjects}
        rootKind={state.rootKind}
        rootPath={state.rootPath}
        workspaceWindowOpening={state.workspaceWindowOpening}
        workspaceView={state.workspaceView}
      />
      <SettingsDialogHost ref={settingsDialogRef} />
      <AppShellPanels
        shellPanelLayout={shellPanelLayout}
        shellGroupElementRef={shellGroupElementRef}
        terminalPanelRef={terminalPanelRef}
        workspacePanels={workspacePanels}
        terminalOpen={effectiveTerminalOpen}
        terminalInitialized={terminalInitialized}
        terminalFocusRequest={terminalFocusRequest}
        theme={state.theme}
        onCloseTerminalArea={closeTerminalArea}
      />
      <AppStatusBarDock open={state.showEditorStatusBar && !immersiveZenMode}>
        <AppStatusBar
          rootKind={state.rootKind}
          rootPath={state.rootPath}
          files={state.files}
          tabs={state.tabs}
          activeTab={state.activeTab}
          activePath={state.editorBufferPath}
          viewMode={state.viewMode}
          dirtyPaths={state.dirtyPaths}
          saveStates={state.saveStates}
          terminalOpen={effectiveTerminalOpen}
          readOnlyMode={state.editorReadOnlyMode}
          onToggleTerminal={toggleTerminalArea}
          onToggleReadOnly={toggleReadOnly}
          onRestoreSession={state.restoreSession}
          restoreStatusMessage={state.restoreStatusMessage}
          restoreStatusBusy={state.isRestoringSession}
        />
      </AppStatusBarDock>
      {!immersiveZenMode ? (
        <AppStatusBarEdgeHandle open={state.showEditorStatusBar} onToggle={toggleStatusBar} />
      ) : null}
    </AppStatusBarProvider>
  )
}

export default AppLayout
