import { fileViewTabId, normalizeWorkspaceTabId, normalizeWorkspaceTabs } from '@/logic/tabs'
import { sanitizeShortcutOverrides } from '@/logic/shortcuts'
import type { AppState, ThemeMode, ViewMode } from '@/store/useAppStore'

export const APP_STORE_VERSION = 13

export const migrateAppStoreState = (persistedState: unknown, version: number): AppState => {
  const state = (persistedState ?? {}) as Partial<AppState> & { theme?: string }
  const legacyTheme =
    version < 6 && state.theme === 'light'
      ? 'marko-light'
      : version < 6 && state.theme === 'dark'
        ? 'marko-dark'
        : state.theme
  const normalizedTheme: ThemeMode =
    legacyTheme === 'light' ||
    legacyTheme === 'dark' ||
    legacyTheme === 'marko-light' ||
    legacyTheme === 'marko-dark'
      ? (legacyTheme as ThemeMode)
      : 'marko-light'
  const normalizedViewMode: ViewMode =
    state.viewMode === 'graph' || state.viewMode === 'source' ? state.viewMode : 'wysiwyg'
  const normalizedTabs = normalizeWorkspaceTabs(state.tabs)
  const legacyActivePath =
    typeof (state as { activePath?: unknown }).activePath === 'string'
      ? ((state as { activePath?: string }).activePath ?? null)
      : null
  const persistedActiveTabId =
    typeof state.activeTabId === 'string'
      ? state.activeTabId
      : legacyActivePath
        ? fileViewTabId(legacyActivePath, 'edit')
        : null
  const normalizedActiveTabId = normalizeWorkspaceTabId(persistedActiveTabId, normalizedTabs)

  return {
    ...state,
    tabs: normalizedTabs,
    activeTabId: normalizedActiveTabId,
    theme: normalizedTheme,
    viewMode: normalizedViewMode,
    rightSidebarCollapsed: state.rightSidebarCollapsed ?? false,
    silentSave: state.silentSave ?? true,
    showEditorStatusBar: state.showEditorStatusBar ?? true,
    defaultFileView:
      state.defaultFileView === 'source' || state.defaultFileView === 'graph'
        ? state.defaultFileView
        : 'edit',
    graphMiniMapEnabled: state.graphMiniMapEnabled ?? true,
    graphContentMode:
      state.graphContentMode === 'none' || state.graphContentMode === 'full'
        ? state.graphContentMode
        : 'summary',
    customThemeId:
      typeof state.customThemeId === 'string' && state.customThemeId.trim()
        ? state.customThemeId
        : null,
    markdownAssetImportStrategy:
      state.markdownAssetImportStrategy === 'preserve-path'
        ? 'preserve-path'
        : 'copy-to-document-assets',
    motionSmoothScrolling: state.motionSmoothScrolling ?? true,
    motionAnimatedCursor: state.motionAnimatedCursor ?? true,
    motionAnimatedPanels: state.motionAnimatedPanels ?? true,
    immersiveZenMode: state.immersiveZenMode ?? false,
    immersiveFocusMode: state.immersiveFocusMode ?? false,
    immersiveTypewriterMode: state.immersiveTypewriterMode ?? false,
    shortcutOverrides: sanitizeShortcutOverrides(
      version < 10
        ? (state as { shortcutOverrides?: unknown }).shortcutOverrides
        : state.shortcutOverrides,
    ),
  } as AppState
}

export const partializeAppStoreState = (state: AppState) => ({
  rootPath: state.rootPath,
  rootKind: state.rootKind,
  recentProjects: state.recentProjects,
  tabs: state.tabs,
  activeTabId: state.activeTabId,
  viewMode: state.viewMode,
  theme: state.theme,
  customThemeId: state.customThemeId,
  locale: state.locale,
  sidebarCollapsed: state.sidebarCollapsed,
  rightSidebarCollapsed: state.rightSidebarCollapsed,
  silentSave: state.silentSave,
  showEditorStatusBar: state.showEditorStatusBar,
  defaultFileView: state.defaultFileView,
  graphMiniMapEnabled: state.graphMiniMapEnabled,
  graphContentMode: state.graphContentMode,
  markdownAssetImportStrategy: state.markdownAssetImportStrategy,
  motionSmoothScrolling: state.motionSmoothScrolling,
  motionAnimatedCursor: state.motionAnimatedCursor,
  motionAnimatedPanels: state.motionAnimatedPanels,
  immersiveZenMode: state.immersiveZenMode,
  immersiveFocusMode: state.immersiveFocusMode,
  immersiveTypewriterMode: state.immersiveTypewriterMode,
  shortcutOverrides: state.shortcutOverrides,
})
