import {
  formatShortcutList,
  resolveShortcutBindings,
  type ShortcutActionId,
  type ShortcutBindings,
  type ShortcutPlatform,
} from '@/logic/shortcuts'

type AppActionDefinition = {
  keywords: string
  labelKey: string
  requiresWorkspaceWrite?: boolean
  shortcutId?: ShortcutActionId
}

const appActionDefinitions = {
  'app.command_palette': {
    keywords: 'command palette quick open search',
    labelKey: 'shortcuts.commandPalette',
    shortcutId: 'app.commandPalette',
  },
  'file.new': {
    keywords: 'new file create note markdown',
    labelKey: 'sidebar.newFile',
    requiresWorkspaceWrite: true,
    shortcutId: 'file.new',
  },
  'file.new_folder': {
    keywords: 'new folder create directory',
    labelKey: 'sidebar.newFolder',
    requiresWorkspaceWrite: true,
  },
  'window.open_current_workspace_in_new_window': {
    keywords: 'new window open current workspace',
    labelKey: 'actions.newWindow',
  },
  'file.open_project': {
    keywords: 'open project folder workspace',
    labelKey: 'actions.openProject',
    shortcutId: 'file.openProject',
  },
  'file.open_file': {
    keywords: 'open file select file',
    labelKey: 'actions.openFile',
    shortcutId: 'file.openFile',
  },
  'view.focus_file_search': {
    keywords: 'search files focus file search',
    labelKey: 'sidebar.searchAction',
  },
  'tab.close': {
    keywords: 'close tab close active file',
    labelKey: 'actions.closeTab',
    shortcutId: 'tab.close',
  },
  'file.export_pdf': { keywords: 'export pdf', labelKey: 'actions.exportPdf' },
  'file.export_docx': { keywords: 'export docx word', labelKey: 'actions.exportDocx' },
  'file.export_html': { keywords: 'export html', labelKey: 'actions.exportHtml' },
  'view.wysiwyg': {
    keywords: 'wysiwyg editor rich text visual editor',
    labelKey: 'editor.modeWysiwyg',
    shortcutId: 'view.wysiwyg',
  },
  'view.toggle_readonly': {
    keywords: 'readonly reading typewriter rendered preview',
    labelKey: 'titlebar.readOnly',
    shortcutId: 'view.toggleReadonly',
  },
  'view.toggle_status_bar': {
    keywords: 'status bar bottom footer hide show',
    labelKey: 'settings.statusBar',
    shortcutId: 'view.toggleStatusBar',
  },
  'view.source': {
    keywords: 'source editor markdown source code',
    labelKey: 'editor.modeSource',
    shortcutId: 'view.source',
  },
  'view.toggle_sidebar': {
    keywords: 'toggle left sidebar explorer',
    labelKey: 'actions.toggleSidebar',
    shortcutId: 'view.toggleSidebar',
  },
  'view.toggle_right_sidebar': {
    keywords: 'toggle right sidebar inspector details',
    labelKey: 'actions.toggleRightSidebar',
    shortcutId: 'view.toggleRightSidebar',
  },
  'settings.open': {
    keywords: 'settings preferences options',
    labelKey: 'menu.settings',
    shortcutId: 'app.settings',
  },
  'help.about': { keywords: 'help about version', labelKey: 'actions.about' },
} as const satisfies Record<string, AppActionDefinition>

export type AppActionId = keyof typeof appActionDefinitions
export const appActionCatalog: Readonly<Record<AppActionId, AppActionDefinition>> =
  appActionDefinitions
export const nonDispatchableAppActionIds = [
  'app.command_palette',
] as const satisfies readonly AppActionId[]
export type NonDispatchableAppActionId = (typeof nonDispatchableAppActionIds)[number]
export type DispatchableAppActionId = Exclude<AppActionId, NonDispatchableAppActionId>
export type AppActionHandlers = Record<DispatchableAppActionId, () => void>

export type AppActionPresentation = {
  enabled: boolean
  id: AppActionId
  label: string
  searchValue: string
  shortcut?: string
}

type PresentationOptions = {
  canCreateWorkspaceEntries: boolean
  platform?: ShortcutPlatform
  shortcutOverrides: ShortcutBindings
  translate: (key: string) => string
}

const appActionIds = Object.keys(appActionCatalog) as AppActionId[]
const appActionIdSet = new Set<string>(appActionIds)
const nonDispatchableAppActionIdSet = new Set<AppActionId>(nonDispatchableAppActionIds)

export const isAppActionId = (id: string): id is AppActionId => appActionIdSet.has(id)

export const isDispatchableAppActionId = (id: AppActionId): id is DispatchableAppActionId =>
  !nonDispatchableAppActionIdSet.has(id)

const formatActionShortcut = (
  definition: AppActionDefinition,
  shortcuts: Record<ShortcutActionId, string[]>,
  platform?: ShortcutPlatform,
) => {
  const actionShortcuts = definition.shortcutId ? shortcuts[definition.shortcutId] : []
  return actionShortcuts.length > 0 ? formatShortcutList(actionShortcuts, platform) : undefined
}

export const resolveAppActionShortcut = (
  id: AppActionId,
  shortcutOverrides: ShortcutBindings,
  platform?: ShortcutPlatform,
) =>
  formatActionShortcut(appActionCatalog[id], resolveShortcutBindings(shortcutOverrides), platform)

export const isAppActionEnabled = (
  id: AppActionId,
  canCreateWorkspaceEntries: boolean,
): boolean => {
  const definition = appActionCatalog[id]
  return !definition.requiresWorkspaceWrite || canCreateWorkspaceEntries
}

export const createAppActionPresentations = ({
  canCreateWorkspaceEntries,
  platform,
  shortcutOverrides,
  translate,
}: PresentationOptions): Record<AppActionId, AppActionPresentation> => {
  const shortcuts = resolveShortcutBindings(shortcutOverrides)
  return Object.fromEntries(
    appActionIds.map((id) => {
      const definition = appActionCatalog[id]
      const label = translate(definition.labelKey)
      const shortcut = formatActionShortcut(definition, shortcuts, platform)
      return [
        id,
        {
          enabled: isAppActionEnabled(id, canCreateWorkspaceEntries),
          id,
          label,
          searchValue: `${definition.keywords} ${label}`,
          shortcut,
        },
      ]
    }),
  ) as Record<AppActionId, AppActionPresentation>
}

export const runAppAction = (
  id: DispatchableAppActionId,
  handlers: AppActionHandlers,
  enabled: boolean,
): boolean => {
  if (!enabled) return false
  const handler = handlers[id]
  if (!handler) return false
  handler()
  return true
}
