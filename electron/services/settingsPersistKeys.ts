import type { RendererPersistKey } from '@electron/types.js'

export const rendererPersistKeys = new Set<RendererPersistKey>([
  'marklab.drawio',
  'marklab.preferences',
  'marklab.workspace',
])

export const drawioStateKeys = new Set(['drawioEditorMode', 'drawioEmbedUrl'])

export const preferenceStateKeys = new Set([
  'autoSystemThemeSync',
  'customThemeId',
  'defaultFileView',
  'graphContentMode',
  'graphMiniMapEnabled',
  'hideMarkdownDefaultAppPrompt',
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
  'sourceCodeMiniMapEnabled',
  'theme',
  'themeMode',
  'lightTheme',
  'darkTheme',
])

export const rendererSettingsStateKeys: Partial<Record<RendererPersistKey, Set<string>>> = {
  'marklab.drawio': drawioStateKeys,
  'marklab.preferences': preferenceStateKeys,
}

export const workspaceSessionStateKeys = new Set(['activeTabId', 'rootKind', 'rootPath', 'tabs'])

export const workspaceRecentProjectsStateKeys = new Set(['recentProjects'])
