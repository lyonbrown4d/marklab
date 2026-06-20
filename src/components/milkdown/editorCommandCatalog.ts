import type { ShortcutActionId } from '@/logic/shortcuts'

export type MarkdownEditorCommandKind = 'block' | 'inline' | 'insert' | 'asset' | 'format'
export type SlashCommandGroupId = 'text' | 'list' | 'advanced'

export type SlashCommandLabelKey =
  | 'text'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'quote'
  | 'divider'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'image'
  | 'codeBlock'
  | 'table'

export type MarkdownEditorCommandId = ShortcutActionId | 'editor.divider' | 'editor.taskList'

export type MarkdownEditorSlashCommand = {
  group: SlashCommandGroupId
  key: string
  labelKey: SlashCommandLabelKey
  mode: 'native' | 'custom'
}

export type MarkdownEditorCommandSpec = {
  id: MarkdownEditorCommandId
  actionId?: ShortcutActionId
  kind: MarkdownEditorCommandKind
  slash?: MarkdownEditorSlashCommand
  headingLevel?: number
}

export type MarkdownEditorSlashCommandEntry = MarkdownEditorSlashCommand & {
  commandId: MarkdownEditorCommandId
  actionId?: ShortcutActionId
}

export const markdownEditorCommandCatalog: readonly MarkdownEditorCommandSpec[] = [
  {
    id: 'editor.paragraph',
    actionId: 'editor.paragraph',
    kind: 'block',
    slash: { group: 'text', key: 'text', labelKey: 'text', mode: 'native' },
  },
  {
    id: 'editor.heading1',
    actionId: 'editor.heading1',
    kind: 'block',
    headingLevel: 1,
    slash: { group: 'text', key: 'h1', labelKey: 'heading1', mode: 'native' },
  },
  {
    id: 'editor.heading2',
    actionId: 'editor.heading2',
    kind: 'block',
    headingLevel: 2,
    slash: { group: 'text', key: 'h2', labelKey: 'heading2', mode: 'native' },
  },
  {
    id: 'editor.heading3',
    actionId: 'editor.heading3',
    kind: 'block',
    headingLevel: 3,
    slash: { group: 'text', key: 'h3', labelKey: 'heading3', mode: 'native' },
  },
  {
    id: 'editor.heading4',
    actionId: 'editor.heading4',
    kind: 'block',
    headingLevel: 4,
    slash: { group: 'text', key: 'h4', labelKey: 'heading4', mode: 'native' },
  },
  {
    id: 'editor.heading5',
    actionId: 'editor.heading5',
    kind: 'block',
    headingLevel: 5,
    slash: { group: 'text', key: 'h5', labelKey: 'heading5', mode: 'native' },
  },
  {
    id: 'editor.heading6',
    actionId: 'editor.heading6',
    kind: 'block',
    headingLevel: 6,
    slash: { group: 'text', key: 'h6', labelKey: 'heading6', mode: 'native' },
  },
  {
    id: 'editor.quote',
    actionId: 'editor.quote',
    kind: 'block',
    slash: { group: 'text', key: 'quote', labelKey: 'quote', mode: 'native' },
  },
  {
    id: 'editor.divider',
    kind: 'insert',
    slash: { group: 'text', key: 'divider', labelKey: 'divider', mode: 'native' },
  },
  {
    id: 'editor.bulletList',
    actionId: 'editor.bulletList',
    kind: 'block',
    slash: { group: 'list', key: 'bulletList', labelKey: 'bulletList', mode: 'native' },
  },
  {
    id: 'editor.orderedList',
    actionId: 'editor.orderedList',
    kind: 'block',
    slash: { group: 'list', key: 'orderedList', labelKey: 'orderedList', mode: 'native' },
  },
  {
    id: 'editor.taskList',
    kind: 'block',
    slash: { group: 'list', key: 'taskList', labelKey: 'taskList', mode: 'native' },
  },
  {
    id: 'editor.image',
    actionId: 'editor.image',
    kind: 'asset',
    slash: { group: 'advanced', key: 'image-import', labelKey: 'image', mode: 'custom' },
  },
  {
    id: 'editor.codeBlock',
    actionId: 'editor.codeBlock',
    kind: 'block',
    slash: { group: 'advanced', key: 'codeBlock', labelKey: 'codeBlock', mode: 'native' },
  },
  {
    id: 'editor.table',
    actionId: 'editor.table',
    kind: 'insert',
    slash: { group: 'advanced', key: 'table', labelKey: 'table', mode: 'native' },
  },
  { id: 'editor.bold', actionId: 'editor.bold', kind: 'inline' },
  { id: 'editor.italic', actionId: 'editor.italic', kind: 'inline' },
  { id: 'editor.inlineCode', actionId: 'editor.inlineCode', kind: 'inline' },
  { id: 'editor.strike', actionId: 'editor.strike', kind: 'inline' },
  { id: 'editor.link', actionId: 'editor.link', kind: 'inline' },
  { id: 'editor.clearFormat', actionId: 'editor.clearFormat', kind: 'format' },
] as const

export const markdownEditorShortcutActionIds: readonly ShortcutActionId[] =
  markdownEditorCommandCatalog.flatMap((command) => (command.actionId ? [command.actionId] : []))

export const markdownEditorSlashCommands: readonly MarkdownEditorSlashCommandEntry[] =
  markdownEditorCommandCatalog.flatMap((command) =>
    command.slash ? [{ ...command.slash, commandId: command.id, actionId: command.actionId }] : [],
  )

export const markdownEditorHeadingShortcutLevels = markdownEditorCommandCatalog.reduce(
  (levels, command) => {
    if (command.actionId && command.headingLevel) {
      levels[command.actionId] = command.headingLevel
    }
    return levels
  },
  {} as Partial<Record<ShortcutActionId, number>>,
)
