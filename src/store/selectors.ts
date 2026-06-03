import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store/useAppStore'

export const useWorkspaceStoreSlice = () =>
  useAppStore(
    useShallow((state) => ({
      rootPath: state.rootPath,
      rootKind: state.rootKind,
      recentProjects: state.recentProjects,
      entries: state.entries,
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      hasHydrated: state.hasHydrated,
      setRootPath: state.setRootPath,
      setRootKind: state.setRootKind,
      setEntries: state.setEntries,
      setTabs: state.setTabs,
      setActiveTabId: state.setActiveTabId,
      touchRecentProject: state.touchRecentProject,
    })),
  )

export const useLayoutStoreSlice = () =>
  useAppStore(
    useShallow((state) => ({
      sidebarCollapsed: state.sidebarCollapsed,
      rightSidebarCollapsed: state.rightSidebarCollapsed,
      theme: state.theme,
      silentSave: state.silentSave,
      showEditorStatusBar: state.showEditorStatusBar,
      defaultFileView: state.defaultFileView,
      graphMiniMapEnabled: state.graphMiniMapEnabled,
      graphContentMode: state.graphContentMode,
      markdownAssetImportStrategy: state.markdownAssetImportStrategy,
      shortcutOverrides: state.shortcutOverrides,
      toggleSidebar: state.toggleSidebar,
      toggleRightSidebar: state.toggleRightSidebar,
      setTheme: state.setTheme,
    })),
  )
