import type { ShortcutActionId } from '@/logic/shortcuts'
import type {
  MarkdownEditorCommandSpec,
  MarkdownEditorSlashCommand,
  MarkdownEditorSlashCommandEntry,
  SlashCommandGroupId,
  SlashCommandLabelKey,
} from '@/components/milkdown/editorCommandTypes'

export type {
  MarkdownEditorCommandId,
  MarkdownEditorCommandKind,
  MarkdownEditorCommandSpec,
  MarkdownEditorSlashCommand,
  MarkdownEditorSlashCommandEntry,
  SlashCommandGroupId,
  SlashCommandLabelKey,
} from '@/components/milkdown/editorCommandTypes'

const slashCommand = (
  mode: MarkdownEditorSlashCommand['mode'],
  group: SlashCommandGroupId,
  key: string,
  labelKey: SlashCommandLabelKey,
  aliases?: readonly string[],
): MarkdownEditorSlashCommand => ({
  ...(aliases?.length ? { aliases } : {}),
  group,
  key,
  labelKey,
  mode,
})

const nativeSlash = (
  group: SlashCommandGroupId,
  key: string,
  labelKey: SlashCommandLabelKey,
  aliases?: readonly string[],
) => slashCommand('native', group, key, labelKey, aliases)

const customSlash = (
  group: SlashCommandGroupId,
  key: string,
  labelKey: SlashCommandLabelKey,
  aliases?: readonly string[],
) => slashCommand('custom', group, key, labelKey, aliases)

export const markdownEditorCommandCatalog: readonly MarkdownEditorCommandSpec[] = [
  {
    id: 'editor.paragraph',
    actionId: 'editor.paragraph',
    kind: 'block',
    slash: nativeSlash('text', 'text', 'text'),
  },
  {
    id: 'editor.heading1',
    actionId: 'editor.heading1',
    kind: 'block',
    headingLevel: 1,
    slash: nativeSlash('text', 'h1', 'heading1'),
  },
  {
    id: 'editor.heading2',
    actionId: 'editor.heading2',
    kind: 'block',
    headingLevel: 2,
    slash: nativeSlash('text', 'h2', 'heading2'),
  },
  {
    id: 'editor.heading3',
    actionId: 'editor.heading3',
    kind: 'block',
    headingLevel: 3,
    slash: nativeSlash('text', 'h3', 'heading3'),
  },
  {
    id: 'editor.heading4',
    actionId: 'editor.heading4',
    kind: 'block',
    headingLevel: 4,
    slash: nativeSlash('text', 'h4', 'heading4'),
  },
  {
    id: 'editor.heading5',
    actionId: 'editor.heading5',
    kind: 'block',
    headingLevel: 5,
    slash: nativeSlash('text', 'h5', 'heading5'),
  },
  {
    id: 'editor.heading6',
    actionId: 'editor.heading6',
    kind: 'block',
    headingLevel: 6,
    slash: nativeSlash('text', 'h6', 'heading6'),
  },
  {
    id: 'editor.quote',
    actionId: 'editor.quote',
    kind: 'block',
    slash: nativeSlash('text', 'quote', 'quote', ['blockquote']),
  },
  {
    id: 'editor.divider',
    kind: 'insert',
    slash: nativeSlash('text', 'divider', 'divider', ['hr']),
  },
  {
    id: 'editor.bulletList',
    actionId: 'editor.bulletList',
    kind: 'block',
    slash: nativeSlash('list', 'bulletList', 'bulletList'),
  },
  {
    id: 'editor.orderedList',
    actionId: 'editor.orderedList',
    kind: 'block',
    slash: nativeSlash('list', 'orderedList', 'orderedList'),
  },
  {
    id: 'editor.taskList',
    kind: 'block',
    slash: nativeSlash('list', 'taskList', 'taskList'),
  },
  {
    id: 'editor.image',
    actionId: 'editor.image',
    kind: 'asset',
    slash: customSlash('advanced', 'image-import', 'image'),
  },
  {
    id: 'editor.imageUrl',
    kind: 'asset',
    slash: customSlash('advanced', 'image-url', 'imageUrl', ['url']),
  },
  {
    id: 'editor.calendarFile',
    kind: 'asset',
    slash: customSlash('advanced', 'calendar-file', 'calendarFile', ['ics', 'calendar']),
  },
  {
    id: 'editor.codeBlock',
    actionId: 'editor.codeBlock',
    kind: 'block',
    slash: nativeSlash('advanced', 'codeBlock', 'codeBlock', ['fence']),
  },
  {
    id: 'editor.codeTypeScript',
    kind: 'insert',
    slash: customSlash('advanced', 'code-typescript', 'codeTypeScript', ['ts']),
  },
  {
    id: 'editor.codeJavaScript',
    kind: 'insert',
    slash: customSlash('advanced', 'code-javascript', 'codeJavaScript', ['js']),
  },
  {
    id: 'editor.codeJson',
    kind: 'insert',
    slash: customSlash('advanced', 'code-json', 'codeJson', ['json']),
  },
  {
    id: 'editor.codeBash',
    kind: 'insert',
    slash: customSlash('advanced', 'code-bash', 'codeBash', ['sh']),
  },
  {
    id: 'editor.codeHtml',
    kind: 'insert',
    slash: customSlash('advanced', 'code-html', 'codeHtml', ['html']),
  },
  {
    id: 'editor.mermaid',
    kind: 'insert',
    slash: customSlash('advanced', 'mermaid', 'mermaid', ['diagram']),
  },
  {
    id: 'editor.table',
    actionId: 'editor.table',
    kind: 'insert',
    slash: nativeSlash('advanced', 'table', 'table'),
  },
  {
    id: 'editor.footnote',
    kind: 'insert',
    slash: customSlash('advanced', 'footnote', 'footnote', ['fn']),
  },
  {
    id: 'editor.frontmatter',
    kind: 'insert',
    slash: customSlash('advanced', 'frontmatter', 'frontmatter', ['yaml', 'meta']),
  },
  {
    id: 'editor.details',
    kind: 'insert',
    slash: customSlash('advanced', 'details', 'details', ['collapse']),
  },
  {
    id: 'editor.toc',
    kind: 'insert',
    slash: customSlash('advanced', 'toc', 'toc', ['contents']),
  },
  {
    id: 'editor.calloutNote',
    kind: 'insert',
    slash: customSlash('advanced', 'callout-note', 'calloutNote', ['note']),
  },
  {
    id: 'editor.calloutTip',
    kind: 'insert',
    slash: customSlash('advanced', 'callout-tip', 'calloutTip', ['tip']),
  },
  {
    id: 'editor.calloutImportant',
    kind: 'insert',
    slash: customSlash('advanced', 'callout-important', 'calloutImportant', ['important']),
  },
  {
    id: 'editor.calloutWarning',
    kind: 'insert',
    slash: customSlash('advanced', 'callout-warning', 'calloutWarning', ['warn']),
  },
  {
    id: 'editor.calloutCaution',
    kind: 'insert',
    slash: customSlash('advanced', 'callout-caution', 'calloutCaution', ['caution']),
  },
  {
    id: 'editor.bold',
    actionId: 'editor.bold',
    kind: 'inline',
    slash: customSlash('text', 'bold', 'bold', ['strong']),
  },
  {
    id: 'editor.italic',
    actionId: 'editor.italic',
    kind: 'inline',
    slash: customSlash('text', 'italic', 'italic', ['em']),
  },
  {
    id: 'editor.inlineCode',
    actionId: 'editor.inlineCode',
    kind: 'inline',
    slash: customSlash('text', 'inline-code', 'inlineCode', ['code']),
  },
  {
    id: 'editor.strike',
    actionId: 'editor.strike',
    kind: 'inline',
    slash: customSlash('text', 'strike', 'strike', ['del']),
  },
  {
    id: 'editor.link',
    actionId: 'editor.link',
    kind: 'inline',
    slash: customSlash('text', 'link', 'link', ['url']),
  },
  {
    id: 'editor.clearFormat',
    actionId: 'editor.clearFormat',
    kind: 'format',
    slash: customSlash('text', 'clear-format', 'clearFormat'),
  },
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
