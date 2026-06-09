import type { RendererPersistKey } from '@electron/types.js'

export const rendererPersistKeys = new Set<RendererPersistKey>([
  'marklab.preferences',
  'marklab.workspace',
])

export const preferenceStateKeys = new Set([
  'customThemeId',
  'defaultFileView',
  'graphContentMode',
  'graphMiniMapEnabled',
  'immersiveFocusMode',
  'immersiveTypewriterMode',
  'immersiveZenMode',
  'locale',
  'markdownAssetImportStrategy',
  'motionAnimatedCursor',
  'motionAnimatedPanels',
  'motionSmoothScrolling',
  'rightSidebarCollapsed',
  'shortcutOverrides',
  'showEditorStatusBar',
  'sidebarCollapsed',
  'silentSave',
  'theme',
  'themeMode',
  'lightTheme',
  'darkTheme',
])

export const workspaceSessionStateKeys = new Set(['activeTabId', 'rootKind', 'rootPath', 'tabs'])

export const workspaceRecentProjectsStateKeys = new Set(['recentProjects'])
