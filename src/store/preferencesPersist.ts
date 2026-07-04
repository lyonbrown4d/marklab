import type { PreferencesState } from '@/store/usePreferencesStore'

export type PreferencesPersistedState = Pick<
  PreferencesState,
  | 'autoSystemThemeSync'
  | 'customThemeId'
  | 'defaultFileView'
  | 'graphContentMode'
  | 'graphMiniMapEnabled'
  | 'immersiveFocusMode'
  | 'immersiveTypewriterMode'
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
>

export const areStringArraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}
