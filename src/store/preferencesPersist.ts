import type { PreferencesState } from '@/store/usePreferencesStore'

export type PreferencesPersistedState = Pick<
  PreferencesState,
  | 'aiCompletionCloudContextConsent'
  | 'aiCompletionEnabled'
  | 'aiCompletionLength'
  | 'aiCompletionNearbyContextEnabled'
  | 'aiCompletionProviderId'
  | 'aiCompletionTriggerMode'
  | 'documentCompletionEnabled'
  | 'aiCustomModelDirectoryEnabled'
  | 'aiDefaultProviderId'
  | 'aiModelDirectory'
  | 'autoSystemThemeSync'
  | 'customThemeId'
  | 'defaultFileView'
  | 'graphContentMode'
  | 'graphMiniMapEnabled'
  | 'graphMiniMapPosition'
  | 'graphMiniMapSize'
  | 'hideMarkdownDefaultAppPrompt'
  | 'immersiveFocusMode'
  | 'immersiveTypewriterMode'
  | 'editorReadOnlyMode'
  | 'immersiveZenMode'
  | 'locale'
  | 'markdownAssetImportStrategy'
  | 'motionAnimatedCursor'
  | 'motionAnimatedPanels'
  | 'motionSmoothScrolling'
  | 'rightSidebarCollapsed'
  | 'shortcutOverrides'
  | 'showEditorStatusBar'
  | 'sidebarCollapsed'
  | 'silentSave'
  | 'sourceCodeMiniMapEnabled'
  | 'theme'
  | 'themeMode'
  | 'lightTheme'
  | 'darkTheme'
  | 'terminalShellPath'
>

export const areStringArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

export const selectPreferencesPersistedState = (
  state: PreferencesState,
): PreferencesPersistedState => ({
  theme: state.theme,
  themeMode: state.themeMode,
  lightTheme: state.lightTheme,
  darkTheme: state.darkTheme,
  autoSystemThemeSync: state.autoSystemThemeSync,
  customThemeId: state.customThemeId,
  aiCompletionCloudContextConsent: state.aiCompletionCloudContextConsent,
  aiCompletionEnabled: state.aiCompletionEnabled,
  aiCompletionLength: state.aiCompletionLength,
  aiCompletionNearbyContextEnabled: state.aiCompletionNearbyContextEnabled,
  aiCompletionProviderId: state.aiCompletionProviderId,
  aiCompletionTriggerMode: state.aiCompletionTriggerMode,
  documentCompletionEnabled: state.documentCompletionEnabled,
  aiCustomModelDirectoryEnabled: state.aiCustomModelDirectoryEnabled,
  aiDefaultProviderId: state.aiDefaultProviderId,
  aiModelDirectory: state.aiModelDirectory,
  locale: state.locale,
  sidebarCollapsed: state.sidebarCollapsed,
  rightSidebarCollapsed: state.rightSidebarCollapsed,
  silentSave: state.silentSave,
  showEditorStatusBar: state.showEditorStatusBar,
  sourceCodeMiniMapEnabled: state.sourceCodeMiniMapEnabled,
  defaultFileView: state.defaultFileView,
  graphMiniMapEnabled: state.graphMiniMapEnabled,
  graphMiniMapPosition: state.graphMiniMapPosition,
  graphMiniMapSize: state.graphMiniMapSize,
  graphContentMode: state.graphContentMode,
  hideMarkdownDefaultAppPrompt: state.hideMarkdownDefaultAppPrompt,
  markdownAssetImportStrategy: state.markdownAssetImportStrategy,
  motionSmoothScrolling: state.motionSmoothScrolling,
  motionAnimatedCursor: state.motionAnimatedCursor,
  motionAnimatedPanels: state.motionAnimatedPanels,
  immersiveZenMode: state.immersiveZenMode,
  immersiveFocusMode: state.immersiveFocusMode,
  immersiveTypewriterMode: state.immersiveTypewriterMode,
  editorReadOnlyMode: state.editorReadOnlyMode,
  terminalShellPath: state.terminalShellPath,
  shortcutOverrides: state.shortcutOverrides,
})
