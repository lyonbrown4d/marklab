import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import { useQueryClient } from '@tanstack/react-query'
import Titlebar, { type TitlebarHandle } from '@/components/Titlebar'
import { AppStatusBarProvider } from '@/components/EditorStatusBar'
import SettingsDialogFallback from '@/components/SettingsDialogFallback'
import ExportStatusOverlay from '@/components/ExportStatusOverlay'
import AppStatusBar from '@/components/AppStatusBar'
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

export type { LayoutContext } from '@/app/AppLayoutContext'

const SettingsDialog = lazy(() => import('@/components/SettingsDialog'))

type SettingsDialogHostHandle = {
  openSettings: () => void
}

const SettingsDialogHost = forwardRef<SettingsDialogHostHandle>((_, ref) => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback(() => {
    setSettingsOpen(true)
  }, [])
  useImperativeHandle(
    ref,
    () => ({
      openSettings,
    }),
    [openSettings],
  )

  return settingsOpen ? (
    <Suspense
      fallback={<SettingsDialogFallback open={settingsOpen} onOpenChange={setSettingsOpen} />}
    >
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Suspense>
  ) : null
})

SettingsDialogHost.displayName = 'SettingsDialogHost'

const AppLayout = () => {
  const state = useAppLayoutState()
  const stateRef = useLatest(state)
  const queryClient = useQueryClient()
  const titlebarRef = useRef<TitlebarHandle | null>(null)
  const settingsDialogRef = useRef<SettingsDialogHostHandle | null>(null)
  const workspaceGroupElementRef = useRef<HTMLDivElement | null>(null)
  const shellGroupElementRef = useRef<HTMLDivElement | null>(null)
  const leftSidebarPanelRef = usePanelRef()
  const rightSidebarPanelRef = usePanelRef()
  const terminalPanelRef = usePanelRef()
  const workspacePanelLayout = useDefaultLayout({
    id: 'marklab-workspace-panels',
    panelIds: ['left-sidebar', 'workspace-main', 'right-sidebar'],
  })
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
    leftSidebarPanelRef,
    rightSidebarPanelRef,
    terminalPanelRef,
    workspaceGroupElementRef,
    shellGroupElementRef,
    sidebarCollapsed: state.sidebarCollapsed || immersiveZenMode,
    rightSidebarCollapsed: state.rightSidebarCollapsed || immersiveZenMode,
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
  const { outlet, routeCacheKey, routeCacheMax, totalFiles } = useAppLayoutOutlet({
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
      activeResourcePath: state.activeResourcePath,
      activeTabId: state.activeTabId,
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
      onOpenWorkspaceOverview: state.onOpenWorkspaceOverview,
      onSelectProject: state.onSelectProject,
      onUseInternalRoot: state.onUseInternalRoot,
      recentProjects: state.recentProjects,
      renamePath: state.renamePath,
      rightSidebarCollapsed: state.rightSidebarCollapsed,
      rootKind: state.rootKind,
      rootPath: state.rootPath,
      saveStates: state.saveStates,
      setViewMode: state.setViewMode,
      sidebarCollapsed: state.sidebarCollapsed,
      silentSave: state.silentSave,
      tabs: state.tabs,
      viewMode: state.viewMode,
      workspaceIndex: state.workspaceIndex,
    }),
    [
      state.activePath,
      state.activeResourcePath,
      state.activeTabId,
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
      state.onOpenWorkspaceOverview,
      state.onSelectProject,
      state.onUseInternalRoot,
      state.recentProjects,
      state.renamePath,
      state.rightSidebarCollapsed,
      state.rootKind,
      state.rootPath,
      state.saveStates,
      state.setViewMode,
      state.sidebarCollapsed,
      state.silentSave,
      state.tabs,
      state.viewMode,
      state.workspaceIndex,
    ],
  )
  const workspacePanels = useMemo(
    () => (
      <AppWorkspacePanels
        state={workspacePanelState}
        workspacePanelLayout={workspacePanelLayout}
        workspaceGroupElementRef={workspaceGroupElementRef}
        leftSidebarPanelRef={leftSidebarPanelRef}
        rightSidebarPanelRef={rightSidebarPanelRef}
        outlet={outlet}
        routeCacheKey={routeCacheKey}
        routeCacheMax={routeCacheMax}
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
      leftSidebarPanelRef,
      outlet,
      rightSidebarPanelRef,
      routeCacheKey,
      routeCacheMax,
      workspacePanelState,
      totalFiles,
      workspaceGroupElementRef,
      workspacePanelLayout,
    ],
  )

  return (
    <AppStatusBarProvider activePath={state.activePath} viewMode={state.viewMode}>
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
      {state.showEditorStatusBar && !immersiveZenMode ? (
        <AppStatusBar
          rootKind={state.rootKind}
          rootPath={state.rootPath}
          files={state.files}
          tabs={state.tabs}
          activeTab={state.activeTab}
          activePath={state.activePath}
          viewMode={state.viewMode}
          dirtyPaths={state.dirtyPaths}
          saveStates={state.saveStates}
          terminalOpen={effectiveTerminalOpen}
          readOnlyMode={state.editorReadOnlyMode}
          onToggleTerminal={toggleTerminalArea}
          onToggleReadOnly={toggleReadOnly}
          onHideStatusBar={() => state.setShowEditorStatusBar(false)}
          onRestoreSession={state.restoreSession}
          restoreStatusMessage={state.restoreStatusMessage}
          restoreStatusBusy={state.isRestoringSession}
        />
      ) : null}
    </AppStatusBarProvider>
  )
}

export default AppLayout
