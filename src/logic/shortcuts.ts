import {
  detectPlatform,
  formatForDisplay,
  normalizeHotkey,
  validateHotkey,
  type RegisterableHotkey,
} from '@tanstack/react-hotkeys'

export type ShortcutPlatform = 'mac' | 'windows' | 'linux'
export type ShortcutScope = 'app' | 'editor' | 'graph'

export const shortcutActions = [
  { id: 'app.commandPalette', scope: 'app', labelKey: 'shortcuts.commandPalette' },
  { id: 'app.settings', scope: 'app', labelKey: 'shortcuts.settings' },
  { id: 'file.new', scope: 'app', labelKey: 'shortcuts.newFile' },
  { id: 'file.openProject', scope: 'app', labelKey: 'shortcuts.openProject' },
  { id: 'file.openFile', scope: 'app', labelKey: 'shortcuts.openFile' },
  { id: 'tab.next', scope: 'app', labelKey: 'shortcuts.nextTab' },
  { id: 'tab.previous', scope: 'app', labelKey: 'shortcuts.previousTab' },
  { id: 'tab.close', scope: 'app', labelKey: 'shortcuts.closeTab' },
  { id: 'view.wysiwyg', scope: 'app', labelKey: 'shortcuts.viewWysiwyg' },
  { id: 'view.source', scope: 'app', labelKey: 'shortcuts.viewSource' },
  { id: 'view.graph', scope: 'app', labelKey: 'shortcuts.viewGraph' },
  { id: 'view.toggleSource', scope: 'app', labelKey: 'shortcuts.toggleSource' },
  { id: 'view.toggleSidebar', scope: 'app', labelKey: 'shortcuts.toggleSidebar' },
  { id: 'view.toggleRightSidebar', scope: 'app', labelKey: 'shortcuts.toggleRightSidebar' },
  { id: 'editor.paragraph', scope: 'editor', labelKey: 'shortcuts.paragraph' },
  { id: 'editor.heading1', scope: 'editor', labelKey: 'shortcuts.heading1' },
  { id: 'editor.heading2', scope: 'editor', labelKey: 'shortcuts.heading2' },
  { id: 'editor.heading3', scope: 'editor', labelKey: 'shortcuts.heading3' },
  { id: 'editor.heading4', scope: 'editor', labelKey: 'shortcuts.heading4' },
  { id: 'editor.heading5', scope: 'editor', labelKey: 'shortcuts.heading5' },
  { id: 'editor.heading6', scope: 'editor', labelKey: 'shortcuts.heading6' },
  { id: 'editor.bold', scope: 'editor', labelKey: 'shortcuts.bold' },
  { id: 'editor.italic', scope: 'editor', labelKey: 'shortcuts.italic' },
  { id: 'editor.inlineCode', scope: 'editor', labelKey: 'shortcuts.inlineCode' },
  { id: 'editor.strike', scope: 'editor', labelKey: 'shortcuts.strike' },
  { id: 'editor.link', scope: 'editor', labelKey: 'shortcuts.link' },
  { id: 'editor.image', scope: 'editor', labelKey: 'shortcuts.image' },
  { id: 'editor.codeBlock', scope: 'editor', labelKey: 'shortcuts.codeBlock' },
  { id: 'editor.quote', scope: 'editor', labelKey: 'shortcuts.quote' },
  { id: 'editor.orderedList', scope: 'editor', labelKey: 'shortcuts.orderedList' },
  { id: 'editor.bulletList', scope: 'editor', labelKey: 'shortcuts.bulletList' },
  { id: 'editor.table', scope: 'editor', labelKey: 'shortcuts.table' },
  { id: 'editor.clearFormat', scope: 'editor', labelKey: 'shortcuts.clearFormat' },
  { id: 'graph.addSibling', scope: 'graph', labelKey: 'shortcuts.graphAddSibling' },
  { id: 'graph.addSiblingBefore', scope: 'graph', labelKey: 'shortcuts.graphAddSiblingBefore' },
  { id: 'graph.addChild', scope: 'graph', labelKey: 'shortcuts.graphAddChild' },
  { id: 'graph.delete', scope: 'graph', labelKey: 'shortcuts.graphDelete' },
  { id: 'graph.editTitle', scope: 'graph', labelKey: 'shortcuts.graphEditTitle' },
  { id: 'graph.selectPrevious', scope: 'graph', labelKey: 'shortcuts.graphSelectPrevious' },
  { id: 'graph.selectNext', scope: 'graph', labelKey: 'shortcuts.graphSelectNext' },
  { id: 'graph.selectParent', scope: 'graph', labelKey: 'shortcuts.graphSelectParent' },
  { id: 'graph.selectChild', scope: 'graph', labelKey: 'shortcuts.graphSelectChild' },
  { id: 'graph.clearSelection', scope: 'graph', labelKey: 'shortcuts.graphClearSelection' },
  { id: 'graph.focusSelection', scope: 'graph', labelKey: 'shortcuts.graphFocusSelection' },
  { id: 'graph.fitView', scope: 'graph', labelKey: 'shortcuts.graphFitView' },
  { id: 'graph.zoomIn', scope: 'graph', labelKey: 'shortcuts.graphZoomIn' },
  { id: 'graph.zoomOut', scope: 'graph', labelKey: 'shortcuts.graphZoomOut' },
  { id: 'graph.collapse', scope: 'graph', labelKey: 'shortcuts.graphCollapse' },
  { id: 'graph.expand', scope: 'graph', labelKey: 'shortcuts.graphExpand' },
  {
    id: 'graph.collapseSubtree',
    scope: 'graph',
    labelKey: 'shortcuts.graphCollapseSubtree',
  },
  { id: 'graph.expandSubtree', scope: 'graph', labelKey: 'shortcuts.graphExpandSubtree' },
] as const

export type ShortcutActionId = (typeof shortcutActions)[number]['id']
export type ShortcutBindings = Partial<Record<ShortcutActionId, string[]>>

export const shortcutCategories = [
  {
    id: 'workspace',
    labelKey: 'shortcuts.workspaceCategory',
    actions: [
      'app.commandPalette',
      'app.settings',
      'file.new',
      'file.openProject',
      'file.openFile',
      'tab.next',
      'tab.previous',
      'tab.close',
      'view.wysiwyg',
      'view.source',
      'view.graph',
      'view.toggleSource',
      'view.toggleSidebar',
      'view.toggleRightSidebar',
    ],
  },
  {
    id: 'editor',
    labelKey: 'shortcuts.editorCategory',
    actions: [
      'editor.paragraph',
      'editor.heading1',
      'editor.heading2',
      'editor.heading3',
      'editor.heading4',
      'editor.heading5',
      'editor.heading6',
      'editor.bold',
      'editor.italic',
      'editor.inlineCode',
      'editor.strike',
      'editor.link',
      'editor.image',
      'editor.codeBlock',
      'editor.quote',
      'editor.orderedList',
      'editor.bulletList',
      'editor.table',
      'editor.clearFormat',
    ],
  },
  {
    id: 'graph',
    labelKey: 'shortcuts.graphCategory',
    actions: [
      'graph.addSibling',
      'graph.addSiblingBefore',
      'graph.addChild',
      'graph.delete',
      'graph.editTitle',
      'graph.selectPrevious',
      'graph.selectNext',
      'graph.selectParent',
      'graph.selectChild',
      'graph.clearSelection',
      'graph.focusSelection',
      'graph.fitView',
      'graph.zoomIn',
      'graph.zoomOut',
      'graph.collapse',
      'graph.expand',
      'graph.collapseSubtree',
      'graph.expandSubtree',
    ],
  },
] as const satisfies ReadonlyArray<{
  id: string
  labelKey: string
  actions: readonly ShortcutActionId[]
}>

export const defaultShortcutBindings: Record<ShortcutActionId, string[]> = {
  'app.commandPalette': ['Mod+P'],
  'app.settings': ['Mod+,'],
  'file.new': ['Mod+N'],
  'file.openProject': ['Mod+O'],
  'file.openFile': ['Mod+Shift+O'],
  'tab.next': ['Control+Tab', 'Meta+`'],
  'tab.previous': ['Control+Shift+Tab', 'Meta+Shift+`'],
  'tab.close': ['Mod+W'],
  'view.wysiwyg': ['Mod+Alt+E'],
  'view.source': ['Mod+Alt+S'],
  'view.graph': ['Mod+Alt+G'],
  'view.toggleSource': ['Mod+/'],
  'view.toggleSidebar': ['Mod+Shift+L'],
  'view.toggleRightSidebar': ['Mod+Shift+R'],
  'editor.paragraph': ['Mod+0'],
  'editor.heading1': ['Mod+1'],
  'editor.heading2': ['Mod+2'],
  'editor.heading3': ['Mod+3'],
  'editor.heading4': ['Mod+4'],
  'editor.heading5': ['Mod+5'],
  'editor.heading6': ['Mod+6'],
  'editor.bold': ['Mod+B'],
  'editor.italic': ['Mod+I'],
  'editor.inlineCode': ['Mod+Shift+`'],
  'editor.strike': ['Alt+Shift+5'],
  'editor.link': ['Mod+K'],
  'editor.image': ['Control+Shift+I', 'Meta+Alt+I'],
  'editor.codeBlock': ['Control+Shift+K', 'Meta+Alt+C'],
  'editor.quote': ['Control+Shift+Q', 'Meta+Alt+Q'],
  'editor.orderedList': ['Control+Shift+[', 'Meta+Alt+O'],
  'editor.bulletList': ['Control+Shift+]', 'Meta+Alt+U'],
  'editor.table': ['Control+T', 'Meta+Alt+T'],
  'editor.clearFormat': ['Mod+\\'],
  'graph.addSibling': ['Enter'],
  'graph.addSiblingBefore': ['Shift+Enter'],
  'graph.addChild': ['Tab'],
  'graph.delete': ['Delete', 'Backspace'],
  'graph.editTitle': ['F2'],
  'graph.selectPrevious': ['ArrowUp'],
  'graph.selectNext': ['ArrowDown'],
  'graph.selectParent': ['ArrowLeft'],
  'graph.selectChild': ['ArrowRight'],
  'graph.clearSelection': ['Escape'],
  'graph.focusSelection': ['Space'],
  'graph.fitView': ['Home', 'Mod+0'],
  'graph.zoomIn': ['=', 'NumpadAdd'],
  'graph.zoomOut': ['-', 'NumpadSubtract'],
  'graph.collapse': ['['],
  'graph.expand': [']'],
  'graph.collapseSubtree': ['Shift+['],
  'graph.expandSubtree': ['Shift+]'],
}

const shortcutActionIdSet = new Set<ShortcutActionId>(shortcutActions.map((action) => action.id))

export const resolveShortcutBindings = (
  overrides: ShortcutBindings,
): Record<ShortcutActionId, string[]> => {
  return shortcutActions.reduce(
    (bindings, action) => {
      bindings[action.id] = Object.prototype.hasOwnProperty.call(overrides, action.id)
        ? (overrides[action.id] ?? [])
        : defaultShortcutBindings[action.id]
      return bindings
    },
    {} as Record<ShortcutActionId, string[]>,
  )
}

export const detectShortcutConflicts = (
  bindings: Record<ShortcutActionId, string[]>,
): Partial<Record<ShortcutActionId, ShortcutActionId[]>> => {
  const byShortcut = new Map<string, ShortcutActionId[]>()
  const conflicts: Partial<Record<ShortcutActionId, ShortcutActionId[]>> = {}

  shortcutActions.forEach((action) => {
    bindings[action.id].forEach((binding) => {
      const normalized = normalizeShortcut(binding)
      if (!normalized) return
      const existing = byShortcut.get(normalized)
      if (existing) {
        existing.push(action.id)
      } else {
        byShortcut.set(normalized, [action.id])
      }
    })
  })

  byShortcut.forEach((actions) => {
    if (actions.length <= 1) return
    for (const action of actions) {
      const others = actions.filter((item) => item !== action)
      if (others.length > 0) {
        conflicts[action] = Array.from(new Set(others))
      }
    }
  })

  return conflicts
}

export const sanitizeShortcutOverrides = (input: unknown): ShortcutBindings => {
  if (!input || typeof input !== 'object') return {}
  const raw = input as Partial<Record<string, unknown>>
  const overrides: ShortcutBindings = {}

  shortcutActions.forEach((action) => {
    if (!Object.prototype.hasOwnProperty.call(raw, action.id)) return
    const value = raw[action.id]
    overrides[action.id] = normalizeShortcutList(Array.isArray(value) ? value : [])
  })

  return overrides
}

export const normalizeShortcutList = (bindings: unknown[]): string[] => {
  const normalized = bindings
    .map((binding) => (typeof binding === 'string' ? normalizeShortcut(binding) : null))
    .filter((binding): binding is string => Boolean(binding))
  return Array.from(new Set(normalized))
}

export const normalizeShortcut = (shortcut: string): string | null => {
  const value = shortcut.trim()
  if (!value) return null
  const validation = validateHotkey(value)
  if (!validation.valid) return null
  try {
    return normalizeHotkey(value)
  } catch {
    return null
  }
}

export const isShortcutActionId = (input: string): input is ShortcutActionId => {
  return shortcutActionIdSet.has(input as ShortcutActionId)
}

export const formatShortcut = (shortcut: string, platform: ShortcutPlatform = detectPlatform()) => {
  if (!shortcut) return ''
  return formatForDisplay(shortcut as RegisterableHotkey, { platform })
}

export const formatShortcutList = (
  bindings: string[],
  platform: ShortcutPlatform = detectPlatform(),
) => {
  if (bindings.length === 0) return '—'
  return bindings
    .map((binding) => formatShortcut(binding, platform))
    .filter(Boolean)
    .join(' / ')
}
