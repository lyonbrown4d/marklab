import { useMemo, useRef, useState } from 'react'
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { useQueryClient } from '@tanstack/react-query'
import Titlebar, { type TitlebarHandle } from '@/components/Titlebar'
import { AppStatusBarProvider } from '@/components/EditorStatusBar'
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
import { useWorkspaceAnalysisInvalidation } from '@/app/useWorkspaceAnalysisInvalidation'
import { useRetryActiveFile } from '@/app/useRetryActiveFile'
import { useAppNavigationHistory } from '@/app/useAppNavigationHistory'
import { useAppChromeActions } from '@/app/useAppChromeActions'
export type { LayoutContext } from '@/app/AppLayoutContext'
const AppLayout = () => {
  const [commandOpen, setCommandOpen] = useState(false)
  const retryActiveFile = useRetryActiveFile()
  const state = useAppLayoutState()
  const stateRef = useLatest(state)
  const queryClient = useQueryClient()
  useWorkspaceAnalysisInvalidation(state.workspaceKey)
  const titlebarRef = useRef<TitlebarHandle | null>(null)
  const settingsDialogRef = useRef<SettingsDialogHostHandle | null>(null)
  const shellGroupElementRef = useRef<HTMLDivElement | null>(null)
  const terminalPanelRef = usePanelRef()
  const shellPanelLayout = useDefaultLayout({
    id: 'marklab-shell-panels',
    panelIds: ['workspace-area', 'terminal'],
  })
  const { openCommandPalette, openSettings, toggleReadOnly, toggleStatusBar } = useAppChromeActions(
    { titlebarRef, settingsDialogRef, stateRef },
  )
  const { immersiveZenMode } = useAppDocumentSync({ theme: state.theme })
  const editorChromeVisible = !immersiveZenMode && state.activeTab?.kind !== 'web'
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
  const handleMenuAction = useAppMenuAction({ stateRef, openSettings })
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
    workspaceKey: state.workspaceKey,
  })
  const navigationHistory = useAppNavigationHistory({
    activePath: state.activePath,
    viewMode: state.viewMode,
    workspaceView: state.workspaceView,
    workspaceKey: state.workspaceKey,
    openFileView: handleOpenFileView,
    openHeading,
    openSearchResult: handleOpenSearchResult,
    openWorkspaceGraph: state.onOpenWorkspaceGraph,
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
    onOpenTab: state.onOpenTab,
    onSetViewMode: state.setViewMode,
    onToggleRightSidebar: state.toggleRightSidebar,
    onToggleSidebar: state.toggleSidebar,
    onToggleTerminal: toggleTerminalArea,
    onToggleReadOnly: toggleReadOnly,
    onNavigateBack: navigationHistory.back,
    onNavigateForward: navigationHistory.forward,
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
      loadingPaths: state.loadingPaths,
      movePath: state.movePath,
      onCloseTab: state.onCloseTab,
      onPersistedContentChange: state.onPersistedContentChange,
      onInspectPath: state.onInspectPath,
      onOpenTab: state.onOpenTab,
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
      workspaceKey: state.workspaceKey,
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
      state.loadingPaths,
      state.movePath,
      state.onCloseTab,
      state.onPersistedContentChange,
      state.onInspectPath,
      state.onOpenTab,
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
      state.workspaceKey,
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
        onOpenSearchResult={navigationHistory.onOpenSearchResult}
        onRetryActiveFile={retryActiveFile}
        immersiveZenMode={immersiveZenMode}
      />
    ),
    [
      handleOpenFile,
      handleOpenFileView,
      handleOpenGitDiff,
      navigationHistory.onOpenSearchResult,
      immersiveZenMode,
      outlet,
      retryActiveFile,
      workspacePanelState,
      totalFiles,
    ],
  )
  return (
    <AppStatusBarProvider activePath={state.editorBufferPath} viewMode={state.viewMode}>
      <Titlebar
        ref={titlebarRef}
        commandOpen={commandOpen}
        onCommandOpenChange={setCommandOpen}
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
        onOpenHeading={navigationHistory.onOpenHeading}
        onOpenSearchResult={navigationHistory.onOpenSearchResult}
        recentNavigationLocations={navigationHistory.recentLocations}
        onOpenNavigationLocation={navigationHistory.onOpenLocation}
        onOpenWorkspaceGraph={state.onOpenWorkspaceGraph}
        onOpenWorkspaceFiles={state.onOpenWorkspaceFiles}
        onOpenAllPages={state.onOpenAllPages}
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
      <AppStatusBarDock open={state.showEditorStatusBar && editorChromeVisible}>
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
          onOpenSettings={openSettings}
          onRestoreSession={state.restoreSession}
          restoreStatusMessage={state.restoreStatusMessage}
          restoreStatusBusy={state.isRestoringSession}
          statusBarVisible={state.showEditorStatusBar && editorChromeVisible}
        />
      </AppStatusBarDock>
      {editorChromeVisible ? (
        <AppStatusBarEdgeHandle open={state.showEditorStatusBar} onToggle={toggleStatusBar} />
      ) : null}
    </AppStatusBarProvider>
  )
}

export default AppLayout
