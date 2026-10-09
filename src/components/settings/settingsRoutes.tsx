import type { ReactElement } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  CloudCog,
  FileText,
  GitGraph,
  Keyboard,
  Palette,
  PenLine,
  SlidersHorizontal,
} from 'lucide-react'
import AiSettingsPage from '@/components/settings/AiSettingsPage'
import AppearanceSettingsPage from '@/components/settings/AppearanceSettingsPage'
import EditingSettingsPage from '@/components/settings/EditingSettingsPage'
import FileAndSavingSettingsPage from '@/components/settings/FileAndSavingSettingsPage'
import GeneralSettingsPage from '@/components/settings/GeneralSettingsPage'
import GraphSettingsPage from '@/components/settings/GraphSettingsPage'
import ShortcutsSettingsPage from '@/components/settings/ShortcutsSettingsPage'
import WorkspaceSyncSettingsPage from '@/components/settings/WorkspaceSyncSettingsPage'

export type SettingsRouteId =
  'general' | 'appearance' | 'editing' | 'files' | 'graph' | 'sync' | 'ai' | 'shortcuts'

export type SettingsGroupId = 'application' | 'workspace' | 'smart' | 'system'

export type SettingsSelection = {
  route: SettingsRouteId
  targetId: string
}

export type SettingsRoute = {
  value: SettingsRouteId
  group: SettingsGroupId
  labelKey: string
  descriptionKey: string
  pageTargetId: string
  icon: LucideIcon
  searchEntries: Array<{ labelKey: string; targetId: string }>
  render: () => ReactElement
}

export const settingsGroups: Array<{ value: SettingsGroupId; labelKey: string }> = [
  { value: 'application', labelKey: 'settings.group.application' },
  { value: 'workspace', labelKey: 'settings.group.workspace' },
  { value: 'smart', labelKey: 'settings.group.smart' },
  { value: 'system', labelKey: 'settings.group.system' },
]

export const settingsRoutes: SettingsRoute[] = [
  {
    value: 'general',
    group: 'application',
    labelKey: 'settings.general',
    descriptionKey: 'settings.generalDescription',
    pageTargetId: 'settings-page-general',
    icon: SlidersHorizontal,
    searchEntries: [
      { labelKey: 'settings.statusBar', targetId: 'settings-status-bar' },
      { labelKey: 'settings.terminal', targetId: 'settings-terminal' },
      { labelKey: 'settings.terminalShell', targetId: 'settings-terminal' },
    ],
    render: () => <GeneralSettingsPage />,
  },
  {
    value: 'appearance',
    group: 'application',
    labelKey: 'settings.appearance',
    descriptionKey: 'settings.appearanceDescription',
    pageTargetId: 'settings-page-appearance',
    icon: Palette,
    searchEntries: [
      { labelKey: 'settings.themePreset', targetId: 'settings-theme' },
      { labelKey: 'settings.lightTheme', targetId: 'settings-theme' },
      { labelKey: 'settings.darkTheme', targetId: 'settings-theme' },
      { labelKey: 'settings.customThemes', targetId: 'settings-custom-themes' },
      { labelKey: 'settings.languageDescription', targetId: 'settings-language' },
    ],
    render: () => <AppearanceSettingsPage />,
  },
  {
    value: 'editing',
    group: 'workspace',
    labelKey: 'settings.editing',
    descriptionKey: 'settings.editingDescription',
    pageTargetId: 'settings-page-editing',
    icon: PenLine,
    searchEntries: [
      { labelKey: 'settings.immersiveEditing', targetId: 'settings-immersive-editing' },
      { labelKey: 'settings.zenMode', targetId: 'settings-immersive-editing' },
      { labelKey: 'settings.focusMode', targetId: 'settings-immersive-editing' },
      { labelKey: 'settings.typewriterMode', targetId: 'settings-immersive-editing' },
      { labelKey: 'settings.sourceCodeMiniMap', targetId: 'settings-source-code' },
      { labelKey: 'settings.motionSmoothScrolling', targetId: 'settings-motion' },
      { labelKey: 'settings.motionAnimatedCursor', targetId: 'settings-motion' },
      { labelKey: 'settings.motionAnimatedPanels', targetId: 'settings-motion' },
    ],
    render: () => <EditingSettingsPage />,
  },
  {
    value: 'files',
    group: 'workspace',
    labelKey: 'settings.filesAndSaving',
    descriptionKey: 'settings.filesAndSavingDescription',
    pageTargetId: 'settings-page-files',
    icon: FileText,
    searchEntries: [
      { labelKey: 'settings.defaultFileView', targetId: 'settings-default-file-view' },
      { labelKey: 'settings.assetStrategy', targetId: 'settings-asset-strategy' },
      { labelKey: 'settings.drawio', targetId: 'settings-drawio' },
      { labelKey: 'settings.drawioEmbedUrl', targetId: 'settings-drawio' },
      { labelKey: 'settings.saveBehavior', targetId: 'settings-save-behavior' },
      { labelKey: 'settings.silentSave', targetId: 'settings-save-behavior' },
      { labelKey: 'settings.detailedSave', targetId: 'settings-save-behavior' },
    ],
    render: () => <FileAndSavingSettingsPage />,
  },
  {
    value: 'graph',
    group: 'workspace',
    labelKey: 'settings.graphEditor',
    descriptionKey: 'settings.graphDescription',
    pageTargetId: 'settings-page-graph',
    icon: GitGraph,
    searchEntries: [
      { labelKey: 'settings.graphMiniMap', targetId: 'settings-graph-minimap' },
      { labelKey: 'settings.graphMiniMapPosition', targetId: 'settings-graph-minimap' },
      { labelKey: 'settings.graphMiniMapSize', targetId: 'settings-graph-minimap' },
      { labelKey: 'settings.graphContentMode', targetId: 'settings-graph-content' },
    ],
    render: () => <GraphSettingsPage />,
  },
  {
    value: 'sync',
    group: 'workspace',
    labelKey: 'settings.syncAndStorage',
    descriptionKey: 'settings.syncDescription',
    pageTargetId: 'settings-page-sync',
    icon: CloudCog,
    searchEntries: [],
    render: () => <WorkspaceSyncSettingsPage />,
  },
  {
    value: 'ai',
    group: 'smart',
    labelKey: 'settings.ai',
    descriptionKey: 'settings.aiDescription',
    pageTargetId: 'settings-page-ai',
    icon: Bot,
    searchEntries: [
      { labelKey: 'settings.aiCompletion', targetId: 'settings-ai-completion' },
      { labelKey: 'settings.documentCompletionEnabled', targetId: 'settings-ai-completion' },
      { labelKey: 'settings.aiCompletionEnabled', targetId: 'settings-ai-completion' },
      { labelKey: 'settings.aiProviders', targetId: 'settings-ai-providers' },
    ],
    render: () => <AiSettingsPage />,
  },
  {
    value: 'shortcuts',
    group: 'system',
    labelKey: 'settings.shortcuts',
    descriptionKey: 'settings.shortcutsDescription',
    pageTargetId: 'settings-page-shortcuts',
    icon: Keyboard,
    searchEntries: [],
    render: () => <ShortcutsSettingsPage />,
  },
]
